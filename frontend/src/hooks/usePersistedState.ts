import { useState, useEffect, useCallback, useRef } from 'react';
import { usePageState } from '../contexts/StateContext';
import { useLocation } from 'react-router-dom';

interface UsePersistedStateOptions {
  // Tự động lưu state khi component unmount
  autoSave?: boolean;
  // Interval để tự động lưu state (ms)
  autoSaveInterval?: number;
  // Các keys cần exclude khỏi persistence
  excludeKeys?: string[];
  // Custom serializer/deserializer
  serialize?: (state: unknown) => unknown;
  deserialize?: (state: unknown) => unknown;
  // Có lưu scroll position không
  saveScrollPosition?: boolean;
  // Debounce delay cho auto-save
  debounceDelay?: number;
}

// Overloaded function signatures
export function usePersistedState<T>(
  key: string,
  initialState: T,
  options?: UsePersistedStateOptions
): [T, (value: T | ((prev: T) => T)) => void, () => void];

export function usePersistedState<T>(
  initialState: T,
  options?: UsePersistedStateOptions
): [T, (value: T | ((prev: T) => T)) => void, () => void];

export function usePersistedState<T>(
  keyOrInitialState: string | T,
  initialStateOrOptions?: T | UsePersistedStateOptions,
  options?: UsePersistedStateOptions
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const location = useLocation();
  const { getPageState, setPageState } = usePageState();
  
  // Determine parameters based on overload
  const key = typeof keyOrInitialState === 'string' ? keyOrInitialState : `${location.pathname}_${Date.now()}`;
  const initialState = typeof keyOrInitialState === 'string' ? (initialStateOrOptions as T) : keyOrInitialState;
  const finalOptions = typeof keyOrInitialState === 'string' ? options : (initialStateOrOptions as UsePersistedStateOptions);
  
  const {
    autoSave = false, // Tắt auto-save mặc định để tránh vòng lặp
    excludeKeys = [],
    serialize = (state: any) => state,
    deserialize = (state: any) => state,
    saveScrollPosition = false, // Tắt scroll position để tránh complexity
    debounceDelay = 1000 // Tăng debounce delay
  } = finalOptions || {};

  // Generate unique page key based on pathname and state key
  const pageKey = `${location.pathname}_${key}`;
  
  // Load persisted state on mount
  const [state, setState] = useState<T>(() => {
    const persistedState = getPageState(pageKey);
    if (persistedState && persistedState[key]) {
      try {
        const deserializedState = deserialize(persistedState[key]);
        return deserializedState;
      } catch (error) {
        console.error('Failed to deserialize persisted state:', error);
        return initialState;
      }
    }
    return initialState;
  });
  const stateRef = useRef(state);
  const debounceTimeoutRef = useRef<number | null>(null);

  // Update ref when state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Save state function
  const saveState = useCallback(() => {
    let stateToSave = stateRef.current;
    
    // Remove excluded keys if state is an object
    if (typeof stateToSave === 'object' && stateToSave !== null) {
      stateToSave = { ...stateToSave };
      excludeKeys.forEach(key => {
        delete (stateToSave as any)[key];
      });
    }
    
    try {
      const serializedState = serialize(stateToSave);
      const currentPageState = getPageState(pageKey) || {};
      setPageState(pageKey, {
        ...currentPageState,
        [key]: serializedState,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Failed to serialize state:', error);
    }
  }, [pageKey, key, setPageState, getPageState, excludeKeys, serialize]);

  // Remove debouncedSave callback to avoid dependency issues

  // Save state when it changes (with debounce)
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      // Direct save without callback dependencies
      let stateToSave = stateRef.current;
      
      if (typeof stateToSave === 'object' && stateToSave !== null) {
        stateToSave = { ...stateToSave };
        excludeKeys.forEach(key => {
          delete (stateToSave as any)[key];
        });
      }
      
      try {
        const serializedState = serialize(stateToSave);
        const currentPageState = getPageState(pageKey) || {};
        setPageState(pageKey, {
          ...currentPageState,
          [key]: serializedState,
          lastUpdated: Date.now()
        });
      } catch (error) {
        console.error('Failed to serialize state:', error);
      }
    }, debounceDelay);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [state]); // Only depend on state

  // Save state on unmount
  useEffect(() => {
    return () => {
      if (autoSave) {
        // Save directly without using the callback to avoid dependency issues
        let stateToSave = stateRef.current;
        
        // Chỉ reset modal states nếu key thực sự là modal state
        // Không reset các state quan trọng như selectedMOP, activeTab, assessmentType, servers, etc.
        const isModalState = (key.toLowerCase().includes('showmodal') || 
                             key.toLowerCase().includes('showexecution') ||
                             key.toLowerCase().includes('showfileupload') ||
                             key.toLowerCase().includes('showmanualinput') ||
                             key.toLowerCase().includes('showviewmop') ||
                             key.toLowerCase().includes('showdelete')) &&
                            !key.toLowerCase().includes('activetab') &&
                            !key.toLowerCase().includes('selected') &&
                            !key.toLowerCase().includes('assessment') &&
                            !key.toLowerCase().includes('servers');
        
        if (isModalState && typeof stateToSave === 'boolean') {
          // Reset boolean modal states về false
          const currentPageState = getPageState(pageKey) || {};
          setPageState(pageKey, {
            ...currentPageState,
            [key]: false,
            lastUpdated: Date.now()
          });
          return;
        }
        
        if (typeof stateToSave === 'object' && stateToSave !== null) {
          stateToSave = { ...stateToSave };
          excludeKeys.forEach(key => {
            delete (stateToSave as any)[key];
          });
        }
        
        try {
          const serializedState = serialize(stateToSave);
          const currentPageState = getPageState(pageKey) || {};
          setPageState(pageKey, {
            ...currentPageState,
            [key]: serializedState,
            lastUpdated: Date.now()
          });
        } catch (error) {
          console.error('Failed to serialize state on unmount:', error);
        }
      }
    };
  }, []); // Empty dependency array

  // Enhanced setState that preserves scroll position
  const setPersistedState = useCallback((newState: T | ((prevState: T) => T)) => {
    setState(prevState => {
      const updatedState = typeof newState === 'function' 
        ? (newState as (prevState: T) => T)(prevState) 
        : newState;
      
      // Save scroll position if enabled and state is an object
      if (saveScrollPosition && typeof updatedState === 'object' && updatedState !== null) {
        const scrollPosition = {
          scrollTop: window.pageYOffset || document.documentElement.scrollTop,
          scrollLeft: window.pageXOffset || document.documentElement.scrollLeft
        };
        
        return {
          ...updatedState,
          _scrollPosition: scrollPosition
        } as T;
      }
      
      return updatedState;
    });
  }, [saveScrollPosition]);

  // Restore scroll position - only on initial mount
  useEffect(() => {
    if (saveScrollPosition && typeof state === 'object' && state !== null) {
      const scrollPosition = (state as any)._scrollPosition;
      if (scrollPosition) {
        // Delay scroll restoration to ensure DOM is ready
        const timer = setTimeout(() => {
          window.scrollTo(scrollPosition.scrollLeft, scrollPosition.scrollTop);
        }, 100);
        
        return () => clearTimeout(timer);
      }
    }
  }, []); // Empty dependency - only run on mount

  // Manual save function
  const manualSave = useCallback(() => {
    saveState();
  }, [saveState]);

  return [state, setPersistedState, manualSave];
}

export default usePersistedState;