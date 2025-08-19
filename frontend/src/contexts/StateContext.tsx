import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';

// Types cho page states
interface PageState {
  [key: string]: unknown;
  lastUpdated?: number;
}

interface StateContextType {
  getPageState: (pageKey: string) => PageState | null;
  setPageState: (pageKey: string, state: PageState) => void;
  clearPageState: (pageKey: string) => void;
  clearAllStates: () => void;
  getStateSize: () => number;
  cleanupExpiredStates: () => void;
}

interface StateAction {
  type: 'SET_PAGE_STATE' | 'CLEAR_PAGE_STATE' | 'CLEAR_ALL_STATES' | 'LOAD_FROM_STORAGE' | 'CLEANUP_EXPIRED';
  payload?: {
    pageKey?: string;
    state?: PageState;
    allStates?: { [pageKey: string]: PageState };
  };
}

interface AppState {
  pageStates: { [pageKey: string]: PageState };
}

const initialState: AppState = {
  pageStates: {}
};

function stateReducer(state: AppState, action: StateAction): AppState {
  switch (action.type) {
    case 'SET_PAGE_STATE':
      if (!action.payload?.pageKey || !action.payload?.state) return state;
      return {
        ...state,
        pageStates: {
          ...state.pageStates,
          [action.payload.pageKey]: {
            ...state.pageStates[action.payload.pageKey],
            ...action.payload.state,
            lastUpdated: Date.now()
          }
        }
      };
    
    case 'CLEAR_PAGE_STATE': {
      if (!action.payload?.pageKey) return state;
      const { [action.payload.pageKey]: _, ...remainingStates } = state.pageStates;
      return {
        ...state,
        pageStates: remainingStates
      };
    }
    
    case 'CLEAR_ALL_STATES':
      return {
        ...state,
        pageStates: {}
      };
    
    case 'LOAD_FROM_STORAGE':
      return {
        ...state,
        pageStates: action.payload?.allStates || {}
      };
    
    case 'CLEANUP_EXPIRED': {
      const now = Date.now();
      const validStates: { [pageKey: string]: PageState } = {};
      Object.entries(state.pageStates).forEach(([pageKey, pageState]) => {
        if (pageState.lastUpdated && (now - pageState.lastUpdated) < MAX_STORAGE_AGE) {
          validStates[pageKey] = pageState;
        }
      });
      return {
        ...state,
        pageStates: validStates
      };
    }
    
    default:
      return state;
  }
}

const StateContext = createContext<StateContextType | undefined>(undefined);

const STORAGE_KEY = 'app_page_states';
const MAX_STORAGE_AGE = 24 * 60 * 60 * 1000; // 24 hours
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// Compression utilities
const compress = (data: unknown): string => {
  try {
    const jsonString = JSON.stringify(data);
    // Simple compression: remove unnecessary whitespace
    return jsonString.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('Compression failed:', error);
    return JSON.stringify(data);
  }
};

const decompress = (compressedData: string): unknown => {
  try {
    return JSON.parse(compressedData);
  } catch (error) {
    console.error('Decompression failed:', error);
    return null;
  }
};

// Storage size calculation
const getStorageSize = (data: unknown): number => {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch (error) {
    return 0;
  }
};

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(stateReducer, initialState);

  // Load states from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const decompressedData = decompress(stored);
        if (decompressedData) {
          const now = Date.now();
          
          // Filter out expired states
          const validStates: { [pageKey: string]: PageState } = {};
          Object.entries(decompressedData).forEach(([pageKey, pageState]: [string, any]) => {
            if (pageState.lastUpdated && (now - pageState.lastUpdated) < MAX_STORAGE_AGE) {
              validStates[pageKey] = pageState;
            }
          });
          
          dispatch({ type: 'LOAD_FROM_STORAGE', payload: { allStates: validStates } });
        }
      }
    } catch (error) {
      console.error('Failed to load states from localStorage:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Save states to localStorage whenever state changes
  useEffect(() => {
    try {
      const compressedData = compress(state.pageStates);
      const storageSize = getStorageSize(state.pageStates);
      
      // Check if storage size exceeds limit
      if (storageSize > MAX_STORAGE_SIZE) {
        console.warn('Storage size exceeded limit, cleaning up old states');
        dispatch({ type: 'CLEANUP_EXPIRED' });
        return;
      }
      
      localStorage.setItem(STORAGE_KEY, compressedData);
    } catch (error) {
      console.error('Failed to save states to localStorage:', error);
    }
  }, [state.pageStates]);

  // Periodic cleanup
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      dispatch({ type: 'CLEANUP_EXPIRED' });
    }, CLEANUP_INTERVAL);

    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);

  const getPageState = useCallback((pageKey: string): PageState | null => {
    return state.pageStates[pageKey] || null;
  }, [state.pageStates]);

  const setPageState = useCallback((pageKey: string, pageState: PageState) => {
    dispatch({ 
      type: 'SET_PAGE_STATE', 
      payload: { pageKey, state: pageState } 
    });
  }, []);

  const clearPageState = useCallback((pageKey: string) => {
    dispatch({ 
      type: 'CLEAR_PAGE_STATE', 
      payload: { pageKey } 
    });
  }, []);

  const clearAllStates = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_STATES' });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getStateSize = useCallback(() => {
    return getStorageSize(state.pageStates);
  }, [state.pageStates]);

  const cleanupExpiredStates = useCallback(() => {
    dispatch({ type: 'CLEANUP_EXPIRED' });
  }, []);

  const value: StateContextType = {
    getPageState,
    setPageState,
    clearPageState,
    clearAllStates,
    getStateSize,
    cleanupExpiredStates
  };

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function usePageState() {
  const context = useContext(StateContext);
  if (context === undefined) {
    throw new Error('usePageState must be used within a StateProvider');
  }
  return context;
}

export default StateContext;