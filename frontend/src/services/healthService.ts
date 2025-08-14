import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version?: string;
  database?: {
    status: string;
    connection: boolean;
  };
  services?: {
    [key: string]: {
      status: string;
      message?: string;
    };
  };
}

class HealthService {
  async checkHealth(): Promise<HealthStatus> {
    try {
      return await apiService.get<HealthStatus>(API_ENDPOINTS.HEALTH);
    } catch (error) {
      console.error('Error checking health:', error);
      // Return unhealthy status if API call fails
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          api: {
            status: 'error',
            message: 'Failed to connect to API'
          }
        }
      };
    }
  }

  // Helper method to check if system is healthy
  isHealthy(health: HealthStatus): boolean {
    return health.status === 'healthy';
  }

  // Helper method to get status color for UI
  getStatusColor(status: string): string {
    switch (status) {
      case 'healthy':
      case 'ok':
        return 'success';
      case 'unhealthy':
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'secondary';
    }
  }

  // Helper method to format timestamp
  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }
}

export const healthService = new HealthService();
export default healthService;