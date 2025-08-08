// Utility functions for frontend state management
const utils = {
    // State persistence functions
    saveState: function(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving state:', error);
            return false;
        }
    },

    loadState: function(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error('Error loading state:', error);
            return defaultValue;
        }
    },

    clearState: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error clearing state:', error);
            return false;
        }
    },

    // Date formatting
    formatDate: function(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Alert system
    showAlert: function(type, message, duration = 5000) {
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="close" data-dismiss="alert">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
        `;
        
        // Remove existing alerts
        $('.alert').remove();
        
        // Add new alert
        $('body').prepend(alertHtml);
        
        // Auto dismiss after duration
        setTimeout(() => {
            $('.alert').fadeOut();
        }, duration);
    },

    // Server list management
    saveServerList: function(servers) {
        return this.saveState('serverList', servers);
    },

    loadServerList: function() {
        return this.loadState('serverList', []);
    },

    addServer: function(server) {
        const servers = this.loadServerList();
        if (!servers.find(s => s.ip === server.ip)) {
            servers.push(server);
            this.saveServerList(servers);
        }
    },

    removeServer: function(ip) {
        const servers = this.loadServerList();
        const filtered = servers.filter(s => s.ip !== ip);
        this.saveServerList(filtered);
    },

    // MOP history management
    saveMOPHistory: function(mopId, executionData) {
        const history = this.loadState('mopHistory', {});
        if (!history[mopId]) {
            history[mopId] = [];
        }
        
        // Keep only last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        history[mopId] = history[mopId].filter(item => {
            return new Date(item.timestamp) > sevenDaysAgo;
        });
        
        history[mopId].push({
            ...executionData,
            timestamp: new Date().toISOString()
        });
        
        this.saveState('mopHistory', history);
    },

    loadMOPHistory: function(mopId) {
        const history = this.loadState('mopHistory', {});
        return history[mopId] || [];
    },

    // Execution settings
    saveExecutionSettings: function(settings) {
        return this.saveState('executionSettings', settings);
    },

    loadExecutionSettings: function() {
        return this.loadState('executionSettings', {
            autoValidate: true,
            showDetails: true,
            exportFormat: 'excel'
        });
    },

    // File upload helpers
    validateFileUpload: function(file, allowedTypes = ['xlsx', 'xls', 'csv']) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (!allowedTypes.includes(extension)) {
            return {
                valid: false,
                message: `File type not supported. Allowed types: ${allowedTypes.join(', ')}`
            };
        }
        
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            return {
                valid: false,
                message: 'File size too large. Maximum size: 5MB'
            };
        }
        
        return { valid: true };
    },

    // Data validation
    validateIPAddress: function(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    },

    validateServerList: function(servers) {
        const errors = [];
        const validServers = [];
        
        servers.forEach((server, index) => {
            if (!server.ip) {
                errors.push(`Server ${index + 1}: IP address is required`);
                return;
            }
            
            if (!this.validateIPAddress(server.ip)) {
                errors.push(`Server ${index + 1}: Invalid IP address format`);
                return;
            }
            
            validServers.push(server);
        });
        
        return {
            valid: errors.length === 0,
            errors: errors,
            servers: validServers
        };
    },

    // Export helpers
    formatDataForExport: function(data, format = 'excel') {
        if (format === 'excel') {
            return this.formatForExcel(data);
        } else if (format === 'csv') {
            return this.formatForCSV(data);
        }
        return data;
    },

    formatForExcel: function(data) {
        // Transform data for Excel export
        return {
            headers: Object.keys(data[0] || {}),
            rows: data.map(row => Object.values(row))
        };
    },

    formatForCSV: function(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        
        data.forEach(row => {
            const values = headers.map(header => {
                const value = row[header] || '';
                return `"${value.toString().replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });
        
        return csvRows.join('\n');
    }
};

// Global alert function for easy access
function showAlert(type, message, duration) {
    utils.showAlert(type, message, duration);
}

// Global state functions for easy access
function saveState(key, data) {
    return utils.saveState(key, data);
}

function loadState(key, defaultValue) {
    return utils.loadState(key, defaultValue);
}

function clearState(key) {
    return utils.clearState(key);
}
