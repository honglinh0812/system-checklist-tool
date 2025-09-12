import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';

export interface CommandValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface CommandRunRequest {
  commands: string[];
  servers: string[];
  execution_type: 'risk_assessment' | 'handover_assessment';
  mop_id?: number;
}

export interface CommandRunResponse {
  success: boolean;
  job_id: string;
  message: string;
}

export interface CommandStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  results?: Record<string, unknown>;
}

export interface CommandResult {
  command_id_ref: string;
  title: string;
  command: string;
  expected_output?: string;
  actual_output?: string;
  validation_type?: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  score?: number;
  details?: string;
  server_ip?: string;
  skip_condition?: {
    condition_id: string;
    condition_type: 'empty' | 'not_empty' | 'ok' | 'not_ok';
  };
  skipped?: boolean;
  skip_reason?: string;
}

export interface CommandResults {
  job_id: string;
  status: string;
  results: CommandResult[];
  summary: {
    total_servers: number;
    total_commands: number;
    success_count: number;
    failure_count: number;
    skipped_count?: number;
  };
}

class CommandService {
  async validateCommands(commands: string[]): Promise<CommandValidationResult> {
    try {
      return await apiService.post<CommandValidationResult>(
        API_ENDPOINTS.COMMANDS.VALIDATE,
        { commands }
      );
    } catch (error) {
      console.error('Error validating commands:', error);
      throw error;
    }
  }

  async runCommands(request: CommandRunRequest): Promise<CommandRunResponse> {
    try {
      return await apiService.post<CommandRunResponse>(
        API_ENDPOINTS.COMMANDS.RUN,
        request
      );
    } catch (error) {
      console.error('Error running commands:', error);
      throw error;
    }
  }

  async getCommandStatus(jobId: string): Promise<CommandStatus> {
    try {
      return await apiService.get<CommandStatus>(
        API_ENDPOINTS.COMMANDS.STATUS(jobId)
      );
    } catch (error) {
      console.error('Error getting command status:', error);
      throw error;
    }
  }

  async getCommandResults(jobId: string): Promise<CommandResults> {
    try {
      return await apiService.get<CommandResults>(
        API_ENDPOINTS.COMMANDS.RESULTS(jobId)
      );
    } catch (error) {
      console.error('Error getting command results:', error);
      throw error;
    }
  }

  // Helper method to poll command status
  async pollCommandStatus(
    jobId: string,
    onUpdate: (status: CommandStatus) => void,
    interval: number = 2000
  ): Promise<CommandStatus> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getCommandStatus(jobId);
          onUpdate(status);
          
          if (status.status === 'completed' || status.status === 'failed') {
            resolve(status);
          } else {
            setTimeout(poll, interval);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      poll();
    });
  }
}

export const commandService = new CommandService();
export default commandService;