import React from 'react';

interface ErrorMessageProps {
  message: string;
  type?: 'danger' | 'warning' | 'info';
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  type = 'danger',
  dismissible = false,
  onDismiss,
  className = '',
}) => {
  return (
    <div className={`alert alert-${type} ${dismissible ? 'alert-dismissible' : ''} ${className}`} role="alert">
      <i className={`fas ${
        type === 'danger' ? 'fa-exclamation-triangle' :
        type === 'warning' ? 'fa-exclamation-circle' :
        'fa-info-circle'
      } mr-2`}></i>
      {message}
      {dismissible && (
        <button
          type="button"
          className="close"
          data-dismiss="alert"
          aria-label="Close"
          onClick={onDismiss}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;