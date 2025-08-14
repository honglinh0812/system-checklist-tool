import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface CommandTemplate {
  id: string;
  name: string;
  category: string;
  command: string;
  description: string;
  validation_type: string;
  reference_value: string;
}

export interface TemplateResponse {
  templates: CommandTemplate[];
}

class TemplateService {
  async downloadServerTemplate(): Promise<Blob> {
    try {
      const response = await fetch(API_ENDPOINTS.TEMPLATES.DOWNLOAD, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error downloading server template:', error);
      throw error;
    }
  }

  async downloadMOPAppendixTemplate(): Promise<Blob> {
    try {
      const response = await fetch(API_ENDPOINTS.TEMPLATES.MOP_APPENDIX, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download MOP appendix template');
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error downloading MOP appendix template:', error);
      throw error;
    }
  }

  async getCommandTemplates(): Promise<CommandTemplate[]> {
    try {
      const response = await apiService.get<TemplateResponse>(API_ENDPOINTS.TEMPLATES.COMMANDS);
      return response.templates || [];
    } catch (error) {
      console.error('Error fetching command templates:', error);
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
}

export const templateService = new TemplateService();
export default templateService;