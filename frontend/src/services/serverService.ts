import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface Server {
  ip: string;
  admin_username: string;
  admin_password: string;
  root_username: string;
  root_password: string;
}

export interface ServerValidationResult {
  valid: boolean;
  message: string;
  details?: any;
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
      const response = await apiService.get<any>(API_ENDPOINTS.SERVERS.LIST);
      return response.servers || [];
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
}

export const serverService = new ServerService();
export default serverService;