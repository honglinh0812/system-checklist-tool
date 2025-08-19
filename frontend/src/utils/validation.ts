// Validation utility functions ported from backend/static/js/custom.js and utils.js

export const validation = {
  // File upload validation
  validateFileUpload: function(file: File, allowedTypes: string[] = ['xlsx', 'xls', 'csv']): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 10MB limit' };
    }

    // Check file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return { valid: false, error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}` };
    }

    return { valid: true };
  },

  // IP address validation
  validateIPAddress: function(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  },

  // Server list validation
  validateServerList: function(servers: unknown[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(servers) || servers.length === 0) {
      errors.push('Server list is empty or invalid');
      return { valid: false, errors };
    }

    servers.forEach((server, index) => {
      if (!server || typeof server !== 'object') {
        errors.push(`Server ${index + 1}: Invalid server object`);
        return;
      }

      const serverObj = server as { ip?: unknown; hostname?: unknown };

      if (!serverObj.ip || typeof serverObj.ip !== 'string') {
        errors.push(`Server ${index + 1}: IP address is required`);
      } else if (!this.validateIPAddress(serverObj.ip)) {
        errors.push(`Server ${index + 1}: Invalid IP address format`);
      }
      
      if (!serverObj.hostname || typeof serverObj.hostname !== 'string') {
        errors.push(`Server ${index + 1}: Hostname is required`);
      }
    });

    return { valid: errors.length === 0, errors };
  },

  // Command validation
  validateCommand: function(command: string): { valid: boolean; error?: string } {
    if (!command || command.trim().length === 0) {
      return { valid: false, error: 'Command cannot be empty' };
    }

    // Check for dangerous commands
    const dangerousCommands = [
      'rm -rf /',
      'format',
      'del /f /s /q',
      'shutdown',
      'reboot',
      'halt',
      'poweroff'
    ];

    const lowerCommand = command.toLowerCase();
    for (const dangerous of dangerousCommands) {
      if (lowerCommand.includes(dangerous.toLowerCase())) {
        return { valid: false, error: `Dangerous command detected: ${dangerous}` };
      }
    }

    return { valid: true };
  },

  // Form validation
  validateUserForm: function(formData: { username: string; password: string; confirm_password: string; role: string }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!formData.username || formData.username.trim().length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (!formData.password || formData.password.length < 1) {
      errors.push('Password must be at least 1 character long');
    }

    if (formData.password !== formData.confirm_password) {
      errors.push('Passwords do not match');
    }

    if (!formData.role || !['user', 'admin'].includes(formData.role)) {
      errors.push('Please select a valid role');
    }

    return { valid: errors.length === 0, errors };
  },

  // MOP validation
  validateMOP: function(mop: { title: string; description: string; commands: string[] }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!mop.title || mop.title.trim().length < 3) {
      errors.push('MOP title must be at least 3 characters long');
    }

    if (!mop.description || mop.description.trim().length < 10) {
      errors.push('MOP description must be at least 10 characters long');
    }

    if (!mop.commands || mop.commands.length === 0) {
      errors.push('MOP must contain at least one command');
    } else {
      mop.commands.forEach((command, index) => {
        const commandValidation = this.validateCommand(command);
        if (!commandValidation.valid) {
          errors.push(`Command ${index + 1}: ${commandValidation.error}`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }
};

export default validation;