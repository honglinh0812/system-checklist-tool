import React from 'react';

interface ModalProps {
  show: boolean;
  onHide: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ 
  show, 
  onHide, 
  title, 
  children, 
  size = 'md',
  footer 
}) => {
  if (!show) return null;

  const getSizeClass = () => {
    switch (size) {
      case 'sm': return 'modal-sm';
      case 'lg': return 'modal-lg';
      case 'xl': return 'modal-xl';
      default: return '';
    }
  };

  return (
    <>
      <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
        <div className={`modal-dialog ${getSizeClass()}`} role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button 
                type="button" 
                className="close" 
                onClick={onHide}
                aria-label="Close"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              {children}
            </div>
            {footer && (
              <div className="modal-footer">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
};

export default Modal;