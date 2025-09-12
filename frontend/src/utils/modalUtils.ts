import { usePageState } from '../contexts/StateContext';
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

/**
 * Utility để clear tất cả modal states khi chuyển trang
 */
export const useClearModalsOnPageChange = () => {
  const { getPageState, setPageState } = usePageState();
  const location = useLocation();

  useEffect(() => {
    // Clear tất cả modal states từ trang trước
    const currentPageKey = location.pathname;
    const pageState = getPageState(currentPageKey);
    
    if (pageState) {
      const updatedState = { ...pageState };
      let hasModalStates = false;
      
      // Tìm và reset tất cả modal states
      Object.keys(updatedState).forEach(key => {
        if (key.toLowerCase().includes('modal') || 
            key.toLowerCase().includes('show') ||
            key.toLowerCase().startsWith('show')) {
          if (typeof updatedState[key] === 'boolean' && updatedState[key] === true) {
            updatedState[key] = false;
            hasModalStates = true;
          }
        }
      });
      
      // Chỉ update nếu có modal states cần reset
      if (hasModalStates) {
        setPageState(currentPageKey, updatedState);
      }
    }
  }, [location.pathname, getPageState, setPageState]); // Chạy khi pathname thay đổi
};

/**
 * Utility để clear tất cả modal states từ tất cả các trang
 */
export const clearAllModalStates = () => {
  try {
    // Lấy tất cả keys từ localStorage và filter những key liên quan đến app states
    const allKeys = Object.keys(localStorage);
    const appStateKeys = allKeys.filter(key => 
      key.startsWith('app_page_states') || key.includes('_state')
    );
    
    appStateKeys.forEach(key => {
      try {
        const stateData = localStorage.getItem(key);
        if (stateData) {
          const parsedState = JSON.parse(stateData);
          let hasChanges = false;
          
          // Nếu là object, tìm và reset modal states
          if (typeof parsedState === 'object' && parsedState !== null) {
            Object.keys(parsedState).forEach(stateKey => {
              if (stateKey.toLowerCase().includes('modal') || 
                  stateKey.toLowerCase().includes('show') ||
                  stateKey.toLowerCase().startsWith('show')) {
                if (typeof parsedState[stateKey] === 'boolean' && parsedState[stateKey] === true) {
                  parsedState[stateKey] = false;
                  hasChanges = true;
                }
              }
            });
            
            if (hasChanges) {
              localStorage.setItem(key, JSON.stringify(parsedState));
            }
          }
        }
      } catch (error) {
        console.warn(`Error processing localStorage key ${key}:`, error);
      }
    });
  } catch (error) {
    console.error('Error clearing modal states:', error);
  }
};

export default {
  useClearModalsOnPageChange,
  clearAllModalStates
};