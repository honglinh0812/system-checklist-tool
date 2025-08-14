// Storage utility functions ported from backend/static/js/utils.js

export const storage = {
  // State persistence functions
  saveState: function(key: string, data: any): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Error saving state:', error);
      return false;
    }
  },

  loadState: function<T>(key: string, defaultValue: T | null = null): T | null {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
      console.error('Error loading state:', error);
      return defaultValue;
    }
  },

  clearState: function(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error clearing state:', error);
      return false;
    }
  },

  // Server list management
  saveServerList: function(servers: any[]): boolean {
    return this.saveState('servers', servers);
  },

  loadServerList: function(): any[] {
    return this.loadState('servers', []) || [];
  },

  addServer: function(server: any): boolean {
    const servers = this.loadServerList();
    servers.push(server);
    return this.saveServerList(servers);
  },

  removeServer: function(ip: string): boolean {
    const servers = this.loadServerList().filter((s: any) => s.ip !== ip);
    return this.saveServerList(servers);
  },

  // MOP execution history
  saveMOPHistory: function(mopId: number, executionData: any): boolean {
    const history: Record<number, any[]> = this.loadState('mop_history', {}) || {};
    if (!history[mopId]) {
      history[mopId] = [];
    }
    history[mopId].push({
      ...executionData,
      timestamp: new Date().toISOString()
    });
    return this.saveState('mop_history', history);
  },

  loadMOPHistory: function(mopId: number): any[] {
    const history: Record<number, any[]> = this.loadState('mop_history', {}) || {};
    return history[mopId] || [];
  },

  // Execution settings
  saveExecutionSettings: function(settings: any): boolean {
    return this.saveState('execution_settings', settings);
  },

  loadExecutionSettings: function(): any {
    return this.loadState('execution_settings', {
      timeout: 300,
      retries: 3,
      parallel: false
    });
  }
};

export default storage;