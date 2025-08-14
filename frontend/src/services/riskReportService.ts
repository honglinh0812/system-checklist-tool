import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface RiskReport {
  id: number;
  title: string;
  description: string;
  created_at: string;
  created_by: {
    id: number;
    username: string;
  };
  status: string;
  file_path?: string;
  excel_path?: string;
}

export interface RiskReportListResponse {
  success: boolean;
  reports: RiskReport[];
  total: number;
}

class RiskReportService {
  async getRiskReports(): Promise<RiskReport[]> {
    try {
      const response = await apiService.get<RiskReportListResponse>(API_ENDPOINTS.RISK_REPORTS.LIST);
      return response.reports || [];
    } catch (error) {
      console.error('Error fetching risk reports:', error);
      throw error;
    }
  }

  async downloadRiskReport(reportId: number, fileType: 'pdf' | 'excel'): Promise<Blob> {
    try {
      const response = await fetch(API_ENDPOINTS.RISK_REPORTS.DOWNLOAD(reportId, fileType), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download ${fileType} report`);
      }
      
      return await response.blob();
    } catch (error) {
      console.error(`Error downloading ${fileType} risk report:`, error);
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

  // Helper method to get file extension based on type
  getFileExtension(fileType: 'pdf' | 'excel'): string {
    return fileType === 'pdf' ? '.pdf' : '.xlsx';
  }

  // Helper method to generate filename
  generateFilename(report: RiskReport, fileType: 'pdf' | 'excel'): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const extension = this.getFileExtension(fileType);
    return `risk_report_${report.id}_${timestamp}${extension}`;
  }
}

export const riskReportService = new RiskReportService();
export default riskReportService;