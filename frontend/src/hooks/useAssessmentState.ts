import { useState, useEffect, useCallback } from 'react';

interface AssessmentState {
  selectedMOP: string;
  servers: {
    name?: string;
    ip?: string;
    serverIP: string;
    sshPort: string;
    sshUser: string;
    sshPassword: string;
    sudoUser: string;
    sudoPassword: string;
  }[];
  selectedServers: boolean[];
  currentStep: string;
  assessmentType: 'emergency' | 'periodic';
  assessmentStarted: boolean;
  assessmentCompleted: boolean;
  hasResults: boolean;
  assessmentResults?: any;
  assessmentProgress?: {
    currentCommand: string;
    currentServer: string;
    completedCommands: number;
    totalCommands: number;
    completedServers: number;
    totalServers: number;
    logs: string[];
    startTime?: Date;
    estimatedTimeRemaining?: string;
  } | null;
  assessmentJobId?: string;
}

interface UseAssessmentStateReturn {
  state: AssessmentState;
  updateState: (updates: Partial<AssessmentState>) => void;
  clearState: () => void;
  saveState: () => void;
}

type VolatileFields = 'assessmentResults' | 'assessmentProgress';

const STORAGE_KEY_PREFIX = 'assessment_state_';

const getStorageKey = (type: 'risk' | 'handover'): string => `${STORAGE_KEY_PREFIX}${type}`;

const VOLATILE_FIELDS: VolatileFields[] = ['assessmentResults', 'assessmentProgress'];

// Default state with all required fields
const defaultState: AssessmentState = {
  selectedMOP: '',
  servers: [],
  selectedServers: [],
  currentStep: 'select-mop',
  assessmentType: 'emergency',
  assessmentStarted: false,
  assessmentCompleted: false,
  hasResults: false,
  assessmentResults: undefined,
  assessmentProgress: null,
  assessmentJobId: undefined
};

// Normalize state to ensure consistency, especially array lengths
const normalizeState = (state: Partial<AssessmentState>): AssessmentState => {
  const normalized = {
    ...defaultState,
    ...state,
    servers: Array.isArray(state.servers) ? state.servers : defaultState.servers,
    selectedServers: Array.isArray(state.selectedServers) ? state.selectedServers : defaultState.selectedServers
  };

  // Ensure selectedServers length matches servers length
  const serverCount = normalized.servers.length;
  let selServers = normalized.selectedServers;
  if (selServers.length > serverCount) {
    selServers = selServers.slice(0, serverCount);
  } else if (selServers.length < serverCount) {
    selServers = [...selServers, ...Array(serverCount - selServers.length).fill(false)];
  }

  // Only reset volatiles if they are not already set in the incoming state
  VOLATILE_FIELDS.forEach(field => {
    if (!(field in state)) {
      (normalized as any)[field] = defaultState[field as keyof AssessmentState];
    }
  });

  return {
    ...normalized,
    selectedServers: selServers
  };
};

// Load state from localStorage with validation
const loadStateFromStorage = (storageKey: string): AssessmentState | null => {
  if (typeof localStorage === 'undefined') {
    return null; // Handle SSR or non-browser environments
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object') {
      // Clear invalid storage if parsing succeeds but structure is wrong
      if (!Array.isArray(parsed.servers) || !Array.isArray(parsed.selectedServers)) {
        localStorage.removeItem(storageKey);
        console.warn('Invalid state structure in localStorage; cleared.');
        return null;
      }
      return normalizeState(parsed);
    }
    return null;
  } catch (error) {
    console.error('Failed to parse assessment state from localStorage:', error);
    // Clear corrupted storage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(storageKey);
    }
    return null;
  }
};

// Save persistable state to localStorage (debounced)
let saveTimeout: number | null = null;
const saveToStorage = (storageKey: string, persistableState: any) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(persistableState));
      }
    } catch (error) {
      console.error('Failed to save assessment state to localStorage:', error);
      // Handle quota exceeded or other errors
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded; consider clearing old data.');
      }
    }
    saveTimeout = null;
  }, 500); // Debounce saves by 500ms
};

const getPersistableState = (state: AssessmentState): Omit<AssessmentState, VolatileFields> => {
  const { assessmentResults, assessmentProgress, ...persistable } = state;
  return persistable;
};

export const useAssessmentState = (type: 'risk' | 'handover'): UseAssessmentStateReturn => {
  const storageKey = getStorageKey(type);
  
  // Initialize state from localStorage or default
  const [state, setState] = useState<AssessmentState>(() => {
    const loaded = loadStateFromStorage(storageKey);
    return loaded || defaultState;
  });

  // Auto-save persistable state to localStorage (debounced)
  useEffect(() => {
    const persistable = getPersistableState(state);
    saveToStorage(storageKey, persistable);

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [state, storageKey]);

  const updateState = useCallback((updates: Partial<AssessmentState>) => {
    setState(prevState => {
      const merged = { ...prevState, ...updates };
      return normalizeState(merged);
    });
  }, []);

  const clearState = useCallback(() => {
    setState(defaultState);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        console.error('Failed to clear assessment state from localStorage:', error);
      }
    }
  }, [storageKey]);

  const saveState = useCallback(() => {
    const persistable = getPersistableState(state);
    saveToStorage(storageKey, persistable); // Use same debounced save
  }, [state, storageKey]);

  return {
    state,
    updateState,
    clearState,
    saveState
  };
};

// Helper function to get assessment steps
export const getAssessmentSteps = (type: 'risk' | 'handover') => {
  const baseSteps = [
    {
      id: 'select-mop',
      title: 'Chọn MOP',
      description: 'Chọn MOP để đánh giá'
    },
    {
      id: 'configure-servers',
      title: 'Cấu hình Server',
      description: 'Thêm và cấu hình servers'
    },
    {
      id: 'test-connection',
      title: 'Kiểm tra kết nối',
      description: 'Test kết nối đến servers'
    },
    {
      id: 'run-assessment',
      title: 'Chạy đánh giá',
      description: `Thực hiện ${type === 'risk' ? 'Risk Assessment' : 'Handover Assessment'}`
    },
    {
      id: 'view-results',
      title: 'Xem kết quả',
      description: 'Xem và tải xuống kết quả'
    }
  ];

  return baseSteps;
};

// Helper function to determine if a step is completed
export const isStepCompleted = (stepId: string, state: AssessmentState): boolean => {
  switch (stepId) {
    case 'select-mop':
      return !!state.selectedMOP;
    case 'configure-servers':
      return state.servers.length > 0 && state.selectedServers.length === state.servers.length;
    case 'test-connection':
      return state.selectedServers.some(selected => selected);
    case 'run-assessment':
      return state.assessmentStarted;
    case 'view-results':
      return state.hasResults;
    default:
      return false;
  }
};

// Helper function to determine if a step is accessible
export const isStepAccessible = (stepId: string, state: AssessmentState): boolean => {
  const steps = ['select-mop', 'configure-servers', 'test-connection', 'run-assessment', 'view-results'] as const;
  const currentIndex = steps.indexOf(stepId as typeof steps[number]);
  
  if (currentIndex === 0) return true;
  
  // Check if all previous steps are completed
  for (let i = 0; i < currentIndex; i++) {
    if (!isStepCompleted(steps[i], state)) {
      return false;
    }
  }
  
  return true;
};