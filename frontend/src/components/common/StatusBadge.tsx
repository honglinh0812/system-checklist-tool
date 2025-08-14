import React from 'react';
import { getMOPStatusColor, getExecutionStatusColor, getMOPStatusText, getExecutionStatusText } from '../../utils/helpers';

interface StatusBadgeProps {
  status: string;
  type: 'mop' | 'execution';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type,
  size = 'md',
  className = '',
}) => {
  const getColor = () => {
    return type === 'mop' ? getMOPStatusColor(status) : getExecutionStatusColor(status);
  };

  const getText = () => {
    return type === 'mop' ? getMOPStatusText(status) : getExecutionStatusText(status);
  };

  const sizeClass = size === 'sm' ? 'badge-sm' : size === 'lg' ? 'badge-lg' : '';

  return (
    <span className={`badge badge-${getColor()} ${sizeClass} ${className}`}>
      {getText()}
    </span>
  );
};

export default StatusBadge;