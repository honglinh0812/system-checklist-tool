import { MOP_STATUS_COLORS, EXECUTION_STATUS_COLORS } from './constants';
import type { MOP } from '../types/mop';
import type { User } from '../types/auth';

// Import all utility modules
export { storage } from './storage';
export { validation } from './validation';
export { serverUtils } from './serverUtils';
export { executionUtils } from './executionUtils';
export { formatUtils } from './formatUtils';

// Date formatting
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// Status helpers
export function getMOPStatusColor(status: string): string {
  return MOP_STATUS_COLORS[status as keyof typeof MOP_STATUS_COLORS] || 'secondary';
}

export function getExecutionStatusColor(status: string): string {
  return EXECUTION_STATUS_COLORS[status as keyof typeof EXECUTION_STATUS_COLORS] || 'secondary';
}

export function getMOPStatusText(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending Review';
    case 'approved':
      return 'Approved';
    default:
      return status;
  }
}

export function getExecutionStatusText(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

// User helpers
export function getUserRoleText(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'user':
      return 'User';
    default:
      return role;
  }
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}

export function canEditMOP(mop: MOP, user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || (mop.created_by === user.id && mop.status === 'approved');
}

export function canDeleteMOP(mop: MOP, user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || (mop.created_by === user.id && mop.status === 'pending');
}

// File helpers
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function isValidFileType(fileName: string, allowedTypes: string[]): boolean {
  const extension = '.' + fileName.split('.').pop()?.toLowerCase();
  return allowedTypes.includes(extension);
}

// Progress helpers
export function getProgressColor(progress: number): string {
  if (progress < 30) return 'danger';
  if (progress < 70) return 'warning';
  return 'success';
}

// Validation helpers
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

// Array helpers
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const group = String(item[key]);
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

// Error helpers
export function getErrorMessage(error: any): string {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

// Local storage helpers
export function safeJsonParse<T>(jsonString: string | null, defaultValue: T): T {
  if (!jsonString) return defaultValue;
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return defaultValue;
  }
}

// Debounce helper
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}