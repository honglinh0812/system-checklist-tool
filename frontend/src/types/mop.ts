export interface MOP {
  id: number;
  title: string;
  description: string;
  commands: string[];
  status: 'pending' | 'approved';
  created_by: number;
  created_at: string;
  updated_at: string;
  approved_by?: number;
  approved_at?: string;
  rejection_reason?: string;
}

export interface MOPSubmission {
  title: string;
  description: string;
  file?: File;
}

export interface MOPExecution {
  id: number;
  mop_id: number;
  executed_by: number;
  execution_type: 'risk_assessment' | 'handover_assessment';
  server_list: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  results: ExecutionResult[];
  started_at: string;
  completed_at?: string;
}

export interface ExecutionResult {
  server: string;
  command: string;
  output: string;
  status: 'success' | 'failed' | 'skipped';
  execution_time: number;
}

export interface MOPFilter {
  status?: string;
  created_by?: number;
  search?: string;
}