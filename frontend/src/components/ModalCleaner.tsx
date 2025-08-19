import { useEffect } from 'react';
import { useClearModalsOnPageChange, clearAllModalStates } from '../utils/modalUtils';

/**
 * Component để tự động clear modal states khi chuyển trang
 */
const ModalCleaner: React.FC = () => {
  useClearModalsOnPageChange();
  
  // Clear tất cả modal states khi app khởi động và khi tắt trang
  useEffect(() => {
    // Clear khi khởi động
    clearAllModalStates();
    
    // Clear khi tắt trang/tab
    const handleBeforeUnload = () => {
      clearAllModalStates();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearAllModalStates(); // Clear khi component unmount
    };
  }, []); // Chỉ chạy một lần khi component mount
  
  return null; // Component này không render gì
};

export default ModalCleaner;