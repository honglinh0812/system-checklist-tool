// Server management utility functions ported from backend/static/js/custom.js

import { storage } from './storage';
import { validation } from './validation';

export interface Server {
  ip: string;
  hostname: string;
  description?: string;
  status?: 'online' | 'offline' | 'unknown';
}

export const serverUtils = {
  // Load servers from storage
  loadServers: function(): Server[] {
    return storage.loadServerList() as Server[];
  },

  // Display servers in UI (returns formatted data for React components)
  getServersForDisplay: function(): Server[] {
    const servers = this.loadServers();
    
    if (servers.length === 0) {
      return [];
    }
    
    return servers.map(server => ({
      ...server,
      status: server.status || 'unknown'
    }));
  },

  // Add server to list
  addServer: function(server: Omit<Server, 'status'>): { success: boolean; error?: string } {
    // Validate IP address
    if (!validation.validateIPAddress(server.ip)) {
      return { success: false, error: 'Invalid IP address format' };
    }

    // Check if server already exists
    const existingServers = this.loadServers();
    const exists = existingServers.some(s => s.ip === server.ip);
    
    if (exists) {
      return { success: false, error: 'Server with this IP already exists' };
    }

    // Add server
    const newServer: Server = {
      ...server,
      status: 'unknown'
    };
    
    const success = storage.addServer(newServer);
    return { success, error: success ? undefined : 'Failed to save server' };
  },

  // Remove server from list
  removeServer: function(ip: string): { success: boolean; error?: string } {
    const success = storage.removeServer(ip);
    return { success, error: success ? undefined : 'Failed to remove server' };
  },

  // Update server status
  updateServerStatus: function(ip: string, status: 'online' | 'offline' | 'unknown'): { success: boolean; error?: string } {
    const servers = this.loadServers();
    const serverIndex = servers.findIndex(s => s.ip === ip);
    
    if (serverIndex === -1) {
      return { success: false, error: 'Server not found' };
    }
    
    servers[serverIndex].status = status;
    const success = storage.saveServerList(servers);
    return { success, error: success ? undefined : 'Failed to update server status' };
  },

  // Get selected servers (for execution)
  getSelectedServers: function(selectedIPs: string[]): Server[] {
    const allServers = this.loadServers();
    return allServers.filter(server => selectedIPs.includes(server.ip));
  },

  // Validate server list for execution
  validateServersForExecution: function(selectedIPs: string[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!selectedIPs || selectedIPs.length === 0) {
      errors.push('No servers selected for execution');
      return { valid: false, errors };
    }
    
    const selectedServers = this.getSelectedServers(selectedIPs);
    
    if (selectedServers.length !== selectedIPs.length) {
      errors.push('Some selected servers are not found in the server list');
    }
    
    // Check if servers are online (if status is available)
    const offlineServers = selectedServers.filter(s => s.status === 'offline');
    if (offlineServers.length > 0) {
      errors.push(`Warning: ${offlineServers.length} server(s) appear to be offline`);
    }
    
    return { valid: errors.length === 0, errors };
  },

  // Import servers from file data
  importServersFromData: function(data: any[]): { success: boolean; imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;
    
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, imported: 0, errors: ['No valid data found in file'] };
    }
    
    const existingServers = this.loadServers();
    const newServers: Server[] = [];
    
    data.forEach((row, index) => {
      try {
        // Expect columns: IP, Hostname, Description (optional)
        const ip = row.ip || row.IP || row[0];
        const hostname = row.hostname || row.Hostname || row[1];
        const description = row.description || row.Description || row[2] || '';
        
        if (!ip || !hostname) {
          errors.push(`Row ${index + 1}: Missing IP or hostname`);
          return;
        }
        
        if (!validation.validateIPAddress(ip)) {
          errors.push(`Row ${index + 1}: Invalid IP address format`);
          return;
        }
        
        // Check for duplicates
        const exists = existingServers.some(s => s.ip === ip) || newServers.some(s => s.ip === ip);
        if (exists) {
          errors.push(`Row ${index + 1}: Server with IP ${ip} already exists`);
          return;
        }
        
        newServers.push({
          ip: ip.trim(),
          hostname: hostname.trim(),
          description: description.trim(),
          status: 'unknown'
        });
        
        imported++;
      } catch (error) {
        errors.push(`Row ${index + 1}: Error processing data`);
      }
    });
    
    if (newServers.length > 0) {
      const allServers = [...existingServers, ...newServers];
      const success = storage.saveServerList(allServers);
      
      if (!success) {
        return { success: false, imported: 0, errors: ['Failed to save imported servers'] };
      }
    }
    
    return { success: imported > 0, imported, errors };
  },

  // Export servers to downloadable format
  exportServers: function(): { data: any[]; filename: string } {
    const servers = this.loadServers();
    const data = servers.map(server => ({
      IP: server.ip,
      Hostname: server.hostname,
      Description: server.description || '',
      Status: server.status || 'unknown'
    }));
    
    return {
      data,
      filename: `server_list_${new Date().toISOString().split('T')[0]}.csv`
    };
  }
};

export default serverUtils;