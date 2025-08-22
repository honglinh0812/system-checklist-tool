import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type { MOP, MOPSubmission, MOPExecution, MOPFilter } from '../types/mop';

class MOPService {
  // MOP Management
  async getMOPs(filter?: MOPFilter): Promise<MOP[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.append('status', filter.status);
    if (filter?.created_by) params.append('created_by', filter.created_by.toString());
    if (filter?.search) params.append('search', filter.search);
    
    const queryString = params.toString();
    const url = queryString ? `${API_ENDPOINTS.MOPS.LIST}?${queryString}` : API_ENDPOINTS.MOPS.LIST;
    
    return await apiService.get<MOP[]>(url);
  }

  async getMOP(id: number): Promise<MOP> {
    return await apiService.get<MOP>(`${API_ENDPOINTS.MOPS.LIST}/${id}`);
  }

  async createMOP(mop: Partial<MOP>): Promise<MOP> {
    return await apiService.post<MOP>(API_ENDPOINTS.MOPS.CREATE, mop);
  }

  async updateMOP(id: number, mop: Partial<MOP>): Promise<MOP> {
    return await apiService.put<MOP>(`${API_ENDPOINTS.MOPS.LIST}/${id}`, mop);
  }

  async deleteMOP(id: number): Promise<void> {
    await apiService.delete(`${API_ENDPOINTS.MOPS.LIST}/${id}`);
  }

  // MOP Submission
  async submitMOP(submission: MOPSubmission): Promise<MOP> {
    if (submission.file) {
      const formData = new FormData();
      formData.append('title', submission.title);
      formData.append('description', submission.description);
      formData.append('file', submission.file);
      
      return await apiService.upload<MOP>(API_ENDPOINTS.MOPS.SUBMIT, formData);
    } else {
      return await apiService.post<MOP>(API_ENDPOINTS.MOPS.SUBMIT, {
        title: submission.title,
        description: submission.description
      });
    }
  }

  // MOP Review (Admin only)
  async approveMOP(id: number, comments?: string): Promise<MOP> {
    return await apiService.post<MOP>(`${API_ENDPOINTS.MOPS.LIST}/${id}/approve`, { comments });
  }

  async rejectMOP(id: number, reason: string): Promise<MOP> {
    return await apiService.post<MOP>(`${API_ENDPOINTS.MOPS.LIST}/${id}/reject`, { comments: reason });
  }

  // MOP Execution
  async executeRiskAssessment(mopId: number, serverList: string[]): Promise<MOPExecution> {
    return await apiService.post<MOPExecution>(API_ENDPOINTS.ASSESSMENTS.RISK, {
      mop_id: mopId,
      server_list: serverList
    });
  }

  async executeHandoverAssessment(mopId: number, serverList: string[]): Promise<MOPExecution> {
    return await apiService.post<MOPExecution>(API_ENDPOINTS.ASSESSMENTS.HANDOVER, {
      mop_id: mopId,
      server_list: serverList
    });
  }

  async getExecution(id: number): Promise<MOPExecution> {
    return await apiService.get<MOPExecution>(API_ENDPOINTS.EXECUTIONS.DETAIL(id));
  }

  async getExecutions(): Promise<MOPExecution[]> {
    return await apiService.get<MOPExecution[]>(API_ENDPOINTS.EXECUTIONS.HISTORY);
  }

  async exportExecution(id: number): Promise<Blob> {
    return await apiService.get<Blob>(API_ENDPOINTS.EXECUTIONS.EXPORT_BY_ID(id));
  }

  async cancelExecution(id: number): Promise<void> {
    await apiService.post(API_ENDPOINTS.EXECUTIONS.CANCEL(id));
  }

  // Utility functions
  async getServerList(): Promise<string[]> {
    return await apiService.get<string[]>(API_ENDPOINTS.SERVERS.LIST);
  }

  async validateCommands(commands: string[]): Promise<{ valid: boolean; errors: string[] }> {
    return await apiService.post(API_ENDPOINTS.MOPS.VALIDATE, { commands });
  }
}

export const mopService = new MOPService();
export default mopService;