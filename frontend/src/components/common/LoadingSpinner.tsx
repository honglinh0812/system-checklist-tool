import React from 'react';
import { useTranslation } from '../../i18n/useTranslation';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';
  text?: string;
  overlay?: boolean;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  text,
  overlay = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const sizeClasses = {
    sm: 'spinner-border-sm',
    md: '',
    lg: 'spinner-border-lg',
  };

  const spinner = (
    <div className={`d-flex align-items-center ${className}`}>
      <div
        className={`spinner-border text-${color} ${sizeClasses[size]}`}
        role="status"
        aria-hidden="true"
      >
        <span className="sr-only">{t('loading')}</span>
      </div>
      {text && (
        <span className="ml-2">{text}</span>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div className="loading-overlay">
        <div className="loading-content">
          {spinner}
        </div>
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;