import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface AuditLog {
  id: number;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: number;
  resource_name?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface AuditStats {
  period_days: number;
  total_logs: number;
  action_breakdown: Array<{
    action: string;
    count: number;
  }>;
  resource_breakdown: Array<{
    resource_type: string;
    count: number;
  }>;
  top_users: Array<{
    username: string;
    activity_count: number;
  }>;
}

export interface AuditLogFilters {
  page?: number;
  per_page?: number;
  user_id?: number;
  username?: string;
  action?: string;
  resource_type?: string;
  resource_id?: number;
  start_date?: string;
  end_date?: string;
  mop_name?: string;
  status?: string;
}

export const auditService = {
  async getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const queryString = params.toString();
    const url = `${API_ENDPOINTS.AUDIT.LOGS}${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiService.get<{data: AuditLogResponse, success: boolean}>(url);
    return response.data;
  },

  async getUserActions(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const queryString = params.toString();
    const url = `${API_ENDPOINTS.AUDIT.USER_ACTIONS}${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiService.get<{data: AuditLogResponse, success: boolean}>(url);
    return response.data;
  },

  async getAuditStats(days: number = 30): Promise<AuditStats> {
    const response = await apiService.get<{data: AuditStats, success: boolean}>(`${API_ENDPOINTS.AUDIT.STATS}?days=${days}`);
    return response.data;
  },

  async cleanupOldLogs(retentionDays: number = 365): Promise<{ message: string; deleted_count: number }> {
    const response = await apiService.post<{data: { message: string; deleted_count: number }, success: boolean}>(
      API_ENDPOINTS.AUDIT.CLEANUP,
      { retention_days: retentionDays }
    );
    return response.data;
  }
};