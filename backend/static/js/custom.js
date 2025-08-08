// Custom JavaScript functions for System Checklist Tool

// Global variables
let currentExecutionId = null;
let currentMopId = null;

// Common functions
function showLoading(container = 'body') {
    const loadingHtml = `
        <div class="loading-overlay">
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Loading...</span>
            </div>
        </div>
    `;
    $(container).append(loadingHtml);
}

function hideLoading() {
    $('.loading-overlay').remove();
}

function showConfirmDialog(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// Server management functions
function loadServers() {
    const servers = loadState('servers') || [];
    displayServers(servers);
}

function displayServers(servers) {
    const serverList = $('#serverList');
    if (!serverList.length) return;
    
    serverList.empty();
    
    if (servers.length === 0) {
        serverList.html('<p class="text-muted">No servers available. Please upload a server list or add servers manually.</p>');
        return;
    }
    
    servers.forEach(server => {
        const serverHtml = `
            <div class="custom-control custom-checkbox">
                <input type="checkbox" class="custom-control-input server-checkbox" 
                       id="server_${server.ip}" value="${server.ip}" checked>
                <label class="custom-control-label" for="server_${server.ip}">
                    ${server.ip}
                </label>
            </div>
        `;
        serverList.append(serverHtml);
    });
}

function addServer(ip) {
    if (!utils.validateIPAddress(ip)) {
        showAlert('error', 'Invalid IP address format');
        return false;
    }
    
    const server = { ip: ip };
    utils.addServer(server);
    loadServers();
    return true;
}

function removeServer(ip) {
    utils.removeServer(ip);
    loadServers();
}

// MOP execution functions
function executeMOP(mopId, serverIPs, executionType) {
    if (!mopId || !serverIPs || serverIPs.length === 0) {
        showAlert('error', 'Please select a MOP and at least one server');
        return;
    }
    
    showLoading();
    
    const executionData = {
        mop_id: mopId,
        servers: serverIPs,
        execution_type: executionType
    };
    
    $.ajax({
        url: '/api/commands/run',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(executionData),
        success: function(response) {
            hideLoading();
            if (response.job_id) {
                showAlert('success', 'Execution started successfully');
                // Store execution data for history
                utils.saveMOPHistory(mopId, {
                    execution_type: executionType,
                    servers: serverIPs,
                    timestamp: new Date().toISOString()
                });
                // Redirect to execution history or show results
                setTimeout(() => {
                    window.location.href = '/execution-history';
                }, 2000);
            } else {
                showAlert('error', 'Failed to start execution');
            }
        },
        error: function(xhr, status, error) {
            hideLoading();
            showAlert('error', 'Failed to start execution: ' + error);
        }
    });
}

// File upload functions
function handleFileUpload(file, allowedTypes = ['xlsx', 'xls', 'csv']) {
    const validation = utils.validateFileUpload(file, allowedTypes);
    if (!validation.valid) {
        showAlert('error', validation.message);
        return false;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showLoading();
    
    $.ajax({
        url: '/api/upload/servers',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            hideLoading();
            if (response.servers) {
                // Save servers to localStorage
                utils.saveServerList(response.servers);
                loadServers();
                showAlert('success', `Successfully uploaded ${response.servers.length} servers`);
            } else {
                showAlert('error', 'Failed to process uploaded file');
            }
        },
        error: function(xhr, status, error) {
            hideLoading();
            showAlert('error', 'Failed to upload file: ' + error);
        }
    });
    
    return true;
}

// Export functions
function exportExecutionResults(executionId) {
    if (!executionId) {
        showAlert('error', 'No execution selected');
        return;
    }
    
    showLoading();
    
    $.get(`/api/export/execution/${executionId}`, function(response) {
        hideLoading();
        // Handle file download
        const link = document.createElement('a');
        link.href = `/api/export/execution/${executionId}`;
        link.download = `execution_${executionId}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).fail(function(xhr, status, error) {
        hideLoading();
        showAlert('error', 'Failed to export results: ' + error);
    });
}

function exportSystemLogs(logType, startDate = null, endDate = null) {
    let url = `/api/logs/system/${logType}/export`;
    const params = [];
    
    if (startDate) params.push(`start_date=${startDate}`);
    if (endDate) params.push(`end_date=${endDate}`);
    
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    showLoading();
    
    $.get(url, function(response) {
        hideLoading();
        // Handle file download
        const link = document.createElement('a');
        link.href = url;
        link.download = `${logType}_export.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).fail(function(xhr, status, error) {
        hideLoading();
        showAlert('error', 'Failed to export logs: ' + error);
    });
}

// Validation functions
function validateCommand(command) {
    if (!command || command.trim() === '') {
        showAlert('error', 'Command cannot be empty');
        return false;
    }
    
    // Check for dangerous commands
    const dangerousCommands = ['rm -rf', 'dd if=', 'mkfs', 'fdisk'];
    for (const dangerous of dangerousCommands) {
        if (command.toLowerCase().includes(dangerous)) {
            showAlert('error', 'Dangerous command detected. Please review before execution.');
            return false;
        }
    }
    
    return true;
}

function validateServerList(servers) {
    const validation = utils.validateServerList(servers);
    if (!validation.valid) {
        showAlert('error', validation.errors.join('\n'));
        return false;
    }
    return true;
}

// UI enhancement functions
function initializeTooltips() {
    $('[data-toggle="tooltip"]').tooltip();
}

function initializePopovers() {
    $('[data-toggle="popover"]').popover();
}

function refreshData() {
    // Refresh current page data
    if (typeof loadPageData === 'function') {
        loadPageData();
    } else {
        location.reload();
    }
}

// Document ready function
$(document).ready(function() {
    // Initialize UI components
    initializeTooltips();
    initializePopovers();
    
    // Load saved state
    loadServers();
    
    // Setup global AJAX error handler
    $(document).ajaxError(function(event, xhr, settings, error) {
        if (xhr.status === 401) {
            // Unauthorized - redirect to login
            window.location.href = '/login';
        } else if (xhr.status === 403) {
            showAlert('error', 'Access denied. You do not have permission to perform this action.');
        } else if (xhr.status >= 500) {
            showAlert('error', 'Server error. Please try again later.');
        }
    });
    
    // Setup file upload handlers
    $('input[type="file"]').on('change', function() {
        const file = this.files[0];
        if (file) {
            const allowedTypes = $(this).data('allowed-types') || ['xlsx', 'xls', 'csv'];
            handleFileUpload(file, allowedTypes.split(','));
        }
    });
    
    // Setup form validation
    $('form').on('submit', function(e) {
        const requiredFields = $(this).find('[required]');
        let isValid = true;
        
        requiredFields.each(function() {
            if (!$(this).val()) {
                $(this).addClass('is-invalid');
                isValid = false;
            } else {
                $(this).removeClass('is-invalid');
            }
        });
        
        if (!isValid) {
            e.preventDefault();
            showAlert('error', 'Please fill in all required fields');
        }
    });
    
    // Auto-hide alerts after 5 seconds
    setTimeout(function() {
        $('.alert').fadeOut();
    }, 5000);
});

// CSS for loading overlay
const loadingCSS = `
<style>
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
}
</style>
`;

// Add loading CSS to head
$('head').append(loadingCSS);
