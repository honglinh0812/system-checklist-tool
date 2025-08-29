import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface PeriodicAssessment {
  id: number;
  mop_id: number;
  mop_name: string;
  assessment_type: 'risk' | 'handover';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  execution_time: string;
  server_info: any[];
  status: 'active' | 'paused' | 'inactive' | 'completed';
  created_by: number;
  created_at: string;
  updated_at: string;
  last_execution?: string;
  next_execution?: string;
  execution_count: number;
}

export interface PeriodicAssessmentExecution {
  id: number;
  periodic_assessment_id: number;
  assessment_result_id?: number;
  status: 'pending' | 'running' | 'success' | 'fail';
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  execution_logs?: string;
  created_at: string;
  duration?: number;
  assessment_result?: any;
}

export interface CreatePeriodicAssessmentRequest {
  mop_id: number;
  assessment_type: 'risk' | 'handover';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  execution_time: string;
  servers: any[];
}

export interface UpdatePeriodicAssessmentRequest {
  status: 'active' | 'paused' | 'inactive' | 'completed';
}

export interface PeriodicAssessmentListResponse {
  periodic_assessments: PeriodicAssessment[];
}

export interface PeriodicAssessmentExecutionsResponse {
  executions: PeriodicAssessmentExecution[];
  periodic_assessment: PeriodicAssessment;
}

export const periodicAssessmentService = {
  // Get list of periodic assessments
  async getPeriodicAssessments(filters?: {
    assessment_type?: string;
    status?: string;
  }): Promise<PeriodicAssessment[]> {
    const params = new URLSearchParams();
    
    if (filters?.assessment_type) {
      params.append('assessment_type', filters.assessment_type);
    }
    if (filters?.status) {
      params.append('status', filters.status);
    }
    
    const queryString = params.toString();
    const url = queryString ? `${API_ENDPOINTS.ASSESSMENTS.PERIODIC}?${queryString}` : API_ENDPOINTS.ASSESSMENTS.PERIODIC;
    
    const response = await apiService.get<PeriodicAssessmentListResponse>(url);
    return response.periodic_assessments;
  },

  // Create new periodic assessment
  async createPeriodicAssessment(data: CreatePeriodicAssessmentRequest): Promise<PeriodicAssessment> {
    const response = await apiService.post<{
      periodic_assessment: PeriodicAssessment;
      message: string;
    }>(API_ENDPOINTS.ASSESSMENTS.PERIODIC, data);
    return response.periodic_assessment;
  },

  // Update periodic assessment
  async updatePeriodicAssessment(periodicId: number, data: UpdatePeriodicAssessmentRequest): Promise<PeriodicAssessment> {
    const response = await apiService.put<{
      periodic_assessment: PeriodicAssessment;
      message: string;
    }>(API_ENDPOINTS.ASSESSMENTS.PERIODIC_DETAIL(periodicId), data);
    return response.periodic_assessment;
  },

  // Delete periodic assessment
  async deletePeriodicAssessment(periodicId: number): Promise<void> {
    await apiService.delete(API_ENDPOINTS.ASSESSMENTS.PERIODIC_DETAIL(periodicId));
  },

  // Get execution history for a periodic assessment
  async getPeriodicAssessmentExecutions(periodicId: number, limit: number = 5): Promise<PeriodicAssessmentExecutionsResponse> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    
    const url = `${API_ENDPOINTS.ASSESSMENTS.PERIODIC_EXECUTIONS(periodicId)}?${params.toString()}`;
    return await apiService.get<PeriodicAssessmentExecutionsResponse>(url);
  },

  // Start periodic assessment
  async startPeriodicAssessment(periodicId: number): Promise<PeriodicAssessment> {
    const response = await apiService.post<{
      periodic_assessment: PeriodicAssessment;
      message: string;
    }>(`${API_ENDPOINTS.ASSESSMENTS.PERIODIC_DETAIL(periodicId)}/start`);
    return response.periodic_assessment;
  },

  // Pause periodic assessment
  async pausePeriodicAssessment(periodicId: number): Promise<PeriodicAssessment> {
    const response = await apiService.post<{
      periodic_assessment: PeriodicAssessment;
      message: string;
    }>(`${API_ENDPOINTS.ASSESSMENTS.PERIODIC_DETAIL(periodicId)}/pause`);
    return response.periodic_assessment;
  },

  // Stop periodic assessment
  async stopPeriodicAssessment(periodicId: number): Promise<PeriodicAssessment> {
    const response = await apiService.post<{
      periodic_assessment: PeriodicAssessment;
      message: string;
    }>(`${API_ENDPOINTS.ASSESSMENTS.PERIODIC_DETAIL(periodicId)}/stop`);
    return response.periodic_assessment;
  }
};