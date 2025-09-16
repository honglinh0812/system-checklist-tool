import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface Server {
  id?: number;
  ip: string;
  ssh_port?: number;
  admin_username: string;
  admin_password: string;
  root_username: string;
  root_password: string;
  name?: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ServerValidationResult {
  valid: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface ServerConnectionResult {
  success: boolean;
  message: string;
  ssh_test?: boolean;
  sudo_test?: boolean;
}

export interface ServerUploadResult {
  success: boolean;
  message: string;
  servers: Server[];
  count: number;
}

class ServerService {
  async getServers(): Promise<Server[]> {
    try {
      const response = await apiService.get<{ data: { servers: Server[] } }>(API_ENDPOINTS.SERVERS.LIST);
      return response.data?.servers || [];
    } catch (error) {
      console.error('Error fetching servers:', error);
      throw error;
    }
  }

  async testConnection(server: Server): Promise<ServerConnectionResult> {
    try {
      return await apiService.post<ServerConnectionResult>(
        API_ENDPOINTS.SERVERS.TEST_CONNECTION,
        server
      );
    } catch (error) {
      console.error('Error testing server connection:', error);
      throw error;
    }
  }

  async validateServer(server: Server): Promise<ServerValidationResult> {
    try {
      return await apiService.post<ServerValidationResult>(
        API_ENDPOINTS.SERVERS.VALIDATE,
        server
      );
    } catch (error) {
      console.error('Error validating server:', error);
      throw error;
    }
  }

  async addServer(server: Server): Promise<{ success: boolean; message: string; server: Server; total_servers: number }> {
    try {
      return await apiService.post(
        API_ENDPOINTS.SERVERS.ADD,
        server
      );
    } catch (error) {
      console.error('Error adding server:', error);
      throw error;
    }
  }

  async uploadServers(file: File): Promise<ServerUploadResult> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      return await apiService.upload<ServerUploadResult>(
        API_ENDPOINTS.SERVERS.UPLOAD,
        formData
      );
    } catch (error) {
      console.error('Error uploading servers:', error);
      throw error;
    }
  }

  // New server management methods
  async getSavedServers(): Promise<{ servers: Server[]; total: number }> {
    try {
      const response = await apiService.get<{ data: { servers: Server[]; pagination: { total: number } } }>('/api/servers');
      return {
        servers: response.data?.servers || [],
        total: response.data?.pagination?.total || 0
      };
    } catch (error) {
      console.error('Error fetching saved servers:', error);
      throw error;
    }
  }

  async saveServer(server: Omit<Server, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; message: string; server: Server }> {
    try {
      return await apiService.post<{ success: boolean; message: string; server: Server }>(
        '/api/servers',
        server
      );
    } catch (error) {
      console.error('Error saving server:', error);
      throw error;
    }
  }

  async updateServer(id: number, server: Partial<Server>): Promise<{ success: boolean; message: string; server: Server }> {
    try {
      return await apiService.put<{ success: boolean; message: string; server: Server }>(
        `/api/servers/${id}`,
        server
      );
    } catch (error) {
      console.error('Error updating server:', error);
      throw error;
    }
  }

  async deleteServer(id: number): Promise<{ success: boolean; message: string }> {
    try {
      return await apiService.delete<{ success: boolean; message: string }>(
        `/api/servers/${id}`
      );
    } catch (error) {
      console.error('Error deleting server:', error);
      throw error;
    }
  }

  async bulkSaveServers(servers: Omit<Server, 'id' | 'created_at' | 'updated_at'>[]): Promise<{ success: boolean; message: string; saved_count: number; error_count?: number; errors?: string[]; servers: Server[] }> {
    try {
      const response = await apiService.post<{ success: boolean; message: string; saved_count: number; error_count?: number; errors?: string[]; servers: Server[] }>(
        '/api/servers/bulk-save',
        { servers }
      );
      
      // Ensure we have the success field
      if (typeof response.success === 'undefined') {
        response.success = true;
      }
      
      return response;
    } catch (error) {
      console.error('Error bulk saving servers:', error);
      throw error;
    }
  }

  // ===== Saved servers sources for Assessment (Risk/Handover) =====
  async getRiskRecentServers(includeDetail: boolean = false, limit: number = 20): Promise<{ entries: any[]; total: number }> {
    try {
      const qs = new URLSearchParams();
      if (includeDetail) qs.set('include', 'detail');
      if (limit) qs.set('limit', String(limit));
      const url = `${API_ENDPOINTS.ASSESSMENTS.RISK_RECENT_SERVERS}?${qs.toString()}`;
      return await apiService.get<{ entries: any[]; total: number }>(url);
    } catch (error) {
      console.error('Error fetching risk recent servers:', error);
      throw error;
    }
  }

  async getHandoverRecentServers(includeDetail: boolean = false, limit: number = 20): Promise<{ entries: any[]; total: number }> {
    try {
      const qs = new URLSearchParams();
      if (includeDetail) qs.set('include', 'detail');
      if (limit) qs.set('limit', String(limit));
      const url = `${API_ENDPOINTS.ASSESSMENTS.HANDOVER_RECENT_SERVERS}?${qs.toString()}`;
      return await apiService.get<{ entries: any[]; total: number }>(url);
    } catch (error) {
      console.error('Error fetching handover recent servers:', error);
      throw error;
    }
  }

  async getServerUploads(): Promise<{ entries: any[]; total: number }> {
    try {
      return await apiService.get<{ entries: any[]; total: number }>(API_ENDPOINTS.ASSESSMENTS.SERVER_UPLOADS);
    } catch (error) {
      console.error('Error fetching server uploads:', error);
      throw error;
    }
  }
}

export const serverService = new ServerService();
export default serverService;