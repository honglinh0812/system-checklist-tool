import { useState, useEffect } from 'react';

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
}

interface UseAssessmentStateReturn {
  state: AssessmentState;
  updateState: (updates: Partial<AssessmentState>) => void;
  clearState: () => void;
  saveState: () => void;
}

const STORAGE_KEY_PREFIX = 'assessment_state_';

const getStorageKey = (type: 'risk' | 'handover') => `${STORAGE_KEY_PREFIX}${type}`;

const defaultState: AssessmentState = {
  selectedMOP: '',
  servers: [],
  selectedServers: [],
  currentStep: 'select-mop',
  assessmentType: 'emergency'
};

export const useAssessmentState = (type: 'risk' | 'handover'): UseAssessmentStateReturn => {
  const storageKey = getStorageKey(type);
  
  // Initialize state from localStorage or default
  const [state, setState] = useState<AssessmentState>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate the parsed state has required properties
        if (parsed && typeof parsed === 'object') {
          return {
            ...defaultState,
            ...parsed,
            // Ensure arrays are properly initialized
            servers: Array.isArray(parsed.servers) ? parsed.servers : [],
            selectedServers: Array.isArray(parsed.selectedServers) ? parsed.selectedServers : []
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load assessment state from localStorage:', error);
    }
    return defaultState;
  });

  // Auto-save state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save assessment state to localStorage:', error);
    }
  }, [state, storageKey]);

  const updateState = (updates: Partial<AssessmentState>) => {
    setState(prevState => ({
      ...prevState,
      ...updates
    }));
  };

  const clearState = () => {
    setState(defaultState);
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Failed to clear assessment state from localStorage:', error);
    }
  };

  const saveState = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to manually save assessment state:', error);
    }
  };

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
      return state.servers.length > 0;
    case 'test-connection':
      return state.selectedServers.some(selected => selected);
    case 'run-assessment':
    case 'view-results':
      return false; // These are determined by actual assessment status
    default:
      return false;
  }
};

// Helper function to determine if a step is accessible
export const isStepAccessible = (stepId: string, state: AssessmentState): boolean => {
  const steps = ['select-mop', 'configure-servers', 'test-connection', 'run-assessment', 'view-results'];
  const currentIndex = steps.indexOf(stepId);
  
  if (currentIndex === 0) return true;
  
  // Check if all previous steps are completed
  for (let i = 0; i < currentIndex; i++) {
    if (!isStepCompleted(steps[i], state)) {
      return false;
    }
  }
  
  return true;
};