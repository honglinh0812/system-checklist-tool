// Format utility functions ported from backend/static/js/utils.js

export const formatUtils = {
  // Date formatting
  formatDate: function(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  },

  // Format date for display (short format)
  formatDateShort: function(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  },

  // Format time duration
  formatDuration: function(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else if (milliseconds < 3600000) {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(milliseconds / 3600000);
      const minutes = Math.floor((milliseconds % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  },

  // Format file size
  formatFileSize: function(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Format percentage
  formatPercentage: function(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)}%`;
  },

  // Format number with thousand separators
  formatNumber: function(num: number): string {
    return num.toLocaleString('vi-VN');
  },

  // Format data for export
  formatDataForExport: function(data: any[], format: 'excel' | 'csv' = 'csv'): string {
    if (format === 'excel') {
      return this.formatForExcel(data);
    } else {
      return this.formatForCSV(data);
    }
  },

  // Format data for Excel export
  formatForExcel: function(data: any[]): string {
    // For Excel, we'll return CSV format that Excel can import
    return this.formatForCSV(data);
  },

  // Format data for CSV export
  formatForCSV: function(data: any[]): string {
    if (!data || data.length === 0) {
      return '';
    }

    // Get headers from first object
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    const csvContent = [
      // Header row
      headers.map(header => this.escapeCsvValue(header)).join(','),
      // Data rows
      ...data.map(row => 
        headers.map(header => this.escapeCsvValue(row[header])).join(',')
      )
    ].join('\n');

    return csvContent;
  },

  // Escape CSV values
  escapeCsvValue: function(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // If value contains comma, newline, or quote, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  },

  // Format command output for display
  formatCommandOutput: function(output: string, maxLength: number = 500): string {
    if (!output) return 'No output';
    
    // Remove ANSI color codes
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Truncate if too long
    if (cleanOutput.length > maxLength) {
      return cleanOutput.substring(0, maxLength) + '...';
    }
    
    return cleanOutput;
  },

  // Format status badge class
  getStatusBadgeClass: function(status: string): string {
    const statusClasses: Record<string, string> = {
      'success': 'badge-success',
      'completed': 'badge-success',
      'approved': 'badge-success',
      'online': 'badge-success',
      
      'pending': 'badge-warning',
      'running': 'badge-info',
      'unknown': 'badge-secondary',
      
      'failed': 'badge-danger',
      'rejected': 'badge-danger',
      'offline': 'badge-danger',
      'error': 'badge-danger',
      
      'draft': 'badge-secondary',
      'cancelled': 'badge-secondary',
      'skipped': 'badge-secondary'
    };
    
    // Đảm bảo status luôn là string để tránh lỗi toLowerCase
    const safeStatus = typeof status === 'string' ? status : '';
    return statusClasses[safeStatus.toLowerCase()] || 'badge-secondary';
  },

  // Format MOP title for display
  formatMOPTitle: function(title: string, maxLength: number = 50): string {
    if (!title) return 'Untitled MOP';
    
    if (title.length > maxLength) {
      return title.substring(0, maxLength) + '...';
    }
    
    return title;
  },

  // Format username for display
  formatUsername: function(username: string): string {
    if (!username) return 'Unknown User';
    return username;
  },

  // Format execution type for display
  formatExecutionType: function(type: string): string {
    const typeMap: Record<string, string> = {
      'risk_assessment': 'Risk Assessment',
      'handover_assessment': 'Handover Assessment'
    };
    
    return typeMap[type] || type;
  },

  // Format role for display
  formatRole: function(role: string): string {
    const roleMap: Record<string, string> = {
      'admin': 'Administrator',
      'user': 'User'
    };
    
    return roleMap[role] || role;
  },

  // Truncate text with ellipsis
  truncateText: function(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text || '';
    }
    
    return text.substring(0, maxLength) + '...';
  },

  // Format IP address for display
  formatIPAddress: function(ip: string): string {
    if (!ip) return 'Unknown IP';
    return ip;
  },

  // Format server name for display
  formatServerName: function(hostname: string, ip: string): string {
    if (hostname && ip) {
      return `${hostname} (${ip})`;
    } else if (hostname) {
      return hostname;
    } else if (ip) {
      return ip;
    } else {
      return 'Unknown Server';
    }
  }
};

export default formatUtils;