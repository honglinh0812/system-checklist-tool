export interface Server {
  ip: string;
  admin_username: string;
  admin_password: string;
  root_username: string;
  root_password: string;
}

export interface Command {
  id: string;
  title: string;
  command: string;
}

export interface CommandTemplate {
  id: string;
  title: string;
  command: string;
}

export interface CommandResult {
  title: string;
  command: string;
  output: string;
  error: string;
  return_code: number;
  success: boolean;
}

export interface ServerResult {
  ip: string;
  admin_username: string;
  root_username: string;
  commands: CommandResult[];
  status: 'success' | 'failed' | 'unknown';
  error?: string;
}

export interface JobSummary {
  total_servers: number;
  successful_servers: number;
  failed_servers: number;
  total_commands: number;
  return_code: number;
}

export interface JobResults {
  job_id: string;
  timestamp: string;
  summary: JobSummary;
  servers: { [ip: string]: ServerResult };
  log_file: string;
}

export interface JobStatus {
  status: 'running' | 'completed' | 'failed';
  job_id: string;
  start_time: string;
  end_time?: string;
  commands_count: number;
  servers_count: number;
  error?: string;
} 