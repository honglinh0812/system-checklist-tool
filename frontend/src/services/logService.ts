import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface LogFile {
  name: string;
  size: number;
  modified: string;
  type: string;
}

export interface LogContent {
  content: string;
  lines: number;
  size: number;
}

export interface SystemLogsResponse {
  log_files: LogFile[];
}

export interface AssessmentLogDirectory {
  name: string;
  type: 'Risk' | 'Handover';
  created_at: string;
  file_count: number;
  files: string[];
}

export interface AssessmentLogsResponse {
  log_directories: AssessmentLogDirectory[];
}

export interface AssessmentLogContent {
  content: string;
  filename: string;
  size: number;
  modified_at: string;
  lines: number;
}

class LogService {
  async downloadJobLogs(jobId: string): Promise<Blob> {
    try {
      const response = await fetch(API_ENDPOINTS.LOGS.DOWNLOAD(jobId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download job logs');
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error downloading job logs:', error);
      throw error;
    }
  }

  async getSystemLogs(): Promise<LogFile[]> {
    try {
      const response = await apiService.get<SystemLogsResponse>(API_ENDPOINTS.LOGS.SYSTEM);
      return response.log_files || [];
    } catch (error) {
      console.error('Error fetching system logs:', error);
      throw error;
    }
  }

  async getLogContent(logType: string, lines: number = 100): Promise<LogContent> {
    try {
      const url = `${API_ENDPOINTS.LOGS.SYSTEM_CONTENT(logType)}?lines=${lines}`;
      return await apiService.get<LogContent>(url);
    } catch (error) {
      console.error('Error fetching log content:', error);
      throw error;
    }
  }

  async exportSystemLogs(
    logType: string,
    startDate?: string,
    endDate?: string
  ): Promise<Blob> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const queryString = params.toString();
      const url = queryString 
        ? `${API_ENDPOINTS.LOGS.SYSTEM_EXPORT(logType)}?${queryString}`
        : API_ENDPOINTS.LOGS.SYSTEM_EXPORT(logType);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to export system logs');
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error exporting system logs:', error);
      throw error;
    }
  }

  // Helper method to trigger download
  downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Assessment Logs Methods
  async getAssessmentLogs(): Promise<AssessmentLogDirectory[]> {
    try {
      const response = await apiService.get<AssessmentLogsResponse>(API_ENDPOINTS.LOGS.ASSESSMENTS);
      return response.log_directories || [];
    } catch (error) {
      console.error('Error fetching assessment logs:', error);
      throw error;
    }
  }

  async getAssessmentLogContent(logDir: string, filename: string): Promise<AssessmentLogContent> {
    try {
      return await apiService.get<AssessmentLogContent>(API_ENDPOINTS.LOGS.ASSESSMENT_CONTENT(logDir, filename));
    } catch (error) {
      console.error('Error fetching assessment log content:', error);
      throw error;
    }
  }

  async downloadAssessmentLog(logDir: string, filename: string): Promise<Blob> {
    try {
      const response = await fetch(API_ENDPOINTS.LOGS.ASSESSMENT_DOWNLOAD(logDir, filename), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download assessment log');
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error downloading assessment log:', error);
      throw error;
    }
  }

  async downloadAllAssessmentLogs(logDir: string): Promise<Blob> {
    try {
      const response = await fetch(API_ENDPOINTS.LOGS.ASSESSMENT_DOWNLOAD_ALL(logDir), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download assessment logs');
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error downloading assessment logs:', error);
      throw error;
    }
  }

  // Helper method to format log content for display
  formatLogContent(content: string): string[] {
    return content.split('\n').filter(line => line.trim() !== '');
  }
}

export const logService = new LogService();
export default logService;