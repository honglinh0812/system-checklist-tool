// MOP execution utility functions ported from backend/static/js/custom.js

import { storage } from './storage';
import { serverUtils } from './serverUtils';
import { mopService } from '../services/mopService';

export interface ExecutionProgress {
  executionId: string;
  mopId: number;
  totalServers: number;
  completedServers: number;
  currentServer?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  results: ExecutionResult[];
}

export interface ExecutionResult {
  server: string;
  command: string;
  output: string;
  status: 'success' | 'failed' | 'skipped';
  executionTime: number;
  timestamp: string;
}

export interface ExecutionSettings {
  timeout: number; // seconds
  retries: number;
  parallel: boolean;
  continueOnError: boolean;
}

export const executionUtils = {
  // Execute MOP on selected servers
  executeMOP: async function(
    mopId: number, 
    serverIPs: string[], 
    executionType: 'risk_assessment' | 'handover_assessment',
    settings?: Partial<ExecutionSettings>
  ): Promise<{ success: boolean; executionId?: string; error?: string }> {
    try {
      // Validate inputs
      if (!mopId || !serverIPs || serverIPs.length === 0) {
        return { success: false, error: 'Invalid MOP ID or server list' };
      }

      // Validate servers
      const serverValidation = serverUtils.validateServersForExecution(serverIPs);
      if (!serverValidation.valid) {
        return { success: false, error: serverValidation.errors.join(', ') };
      }

      // Get execution settings
      const execSettings: ExecutionSettings = {
        timeout: 300,
        retries: 3,
        parallel: false,
        continueOnError: true,
        ...storage.loadExecutionSettings(),
        ...settings
      };

      // Save execution settings
      storage.saveExecutionSettings(execSettings);

      // Start execution via API
      let execution;
      if (executionType === 'risk_assessment') {
        execution = await mopService.executeRiskAssessment(mopId, serverIPs);
      } else {
        execution = await mopService.executeHandoverAssessment(mopId, serverIPs);
      }

      // Save execution to history
      const executionData = {
        executionId: execution.id.toString(),
        mopId,
        serverIPs,
        executionType,
        settings: execSettings,
        startTime: new Date().toISOString()
      };
      
      storage.saveMOPHistory(mopId, executionData);

      return { success: true, executionId: execution.id.toString() };
    } catch (error) {
      console.error('Execution error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },

  // Get execution progress
  getExecutionProgress: async function(executionId: string): Promise<ExecutionProgress | null> {
    try {
      const execution = await mopService.getExecution(parseInt(executionId));
      
      return {
        executionId: execution.id.toString(),
        mopId: execution.mop_id,
        totalServers: execution.server_list.length,
        completedServers: execution.results.length,
        currentServer: execution.status === 'running' ? execution.server_list[execution.results.length] : undefined,
        status: execution.status,
        startTime: execution.started_at,
        endTime: execution.completed_at,
        results: execution.results.map(result => ({
          server: result.server,
          command: result.command,
          output: result.output,
          status: result.status,
          executionTime: result.execution_time,
          timestamp: new Date().toISOString()
        }))
      };
    } catch (error) {
      console.error('Error getting execution progress:', error);
      return null;
    }
  },

  // Cancel execution
  cancelExecution: async function(executionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await mopService.cancelExecution(parseInt(executionId));
      return { success: true };
    } catch (error) {
      console.error('Error cancelling execution:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel execution' };
    }
  },

  // Export execution results
  exportExecutionResults: function(execution: ExecutionProgress): { data: any[]; filename: string } {
    const data = execution.results.map(result => ({
      Server: result.server,
      Command: result.command,
      Status: result.status,
      'Execution Time (ms)': result.executionTime,
      Output: result.output.substring(0, 1000), // Limit output length for export
      Timestamp: result.timestamp
    }));

    const filename = `execution_results_${execution.executionId}_${new Date().toISOString().split('T')[0]}.csv`;
    
    return { data, filename };
  },

  // Get execution history for a MOP
  getMOPExecutionHistory: function(mopId: number): any[] {
    return storage.loadMOPHistory(mopId);
  },

  // Get all execution history
  getAllExecutionHistory: function(): any[] {
    const allHistory: Record<number, any[]> = storage.loadState('mop_history', {}) || {};
    const executions: any[] = [];
    
    Object.keys(allHistory).forEach(mopId => {
      const mopExecutions = allHistory[parseInt(mopId)] || [];
      executions.push(...mopExecutions.map((exec: any) => ({
        ...exec,
        mopId: parseInt(mopId)
      })));
    });
    
    // Sort by timestamp (newest first)
    return executions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  },

  // Format execution time
  formatExecutionTime: function(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  },

  // Calculate execution statistics
  getExecutionStats: function(execution: ExecutionProgress): {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    skippedCommands: number;
    successRate: number;
    totalTime: number;
    averageTimePerCommand: number;
  } {
    const results = execution.results;
    const totalCommands = results.length;
    const successfulCommands = results.filter(r => r.status === 'success').length;
    const failedCommands = results.filter(r => r.status === 'failed').length;
    const skippedCommands = results.filter(r => r.status === 'skipped').length;
    const successRate = totalCommands > 0 ? (successfulCommands / totalCommands) * 100 : 0;
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    const averageTimePerCommand = totalCommands > 0 ? totalTime / totalCommands : 0;

    return {
      totalCommands,
      successfulCommands,
      failedCommands,
      skippedCommands,
      successRate,
      totalTime,
      averageTimePerCommand
    };
  },

  // Get execution settings
  getExecutionSettings: function(): ExecutionSettings {
    return storage.loadExecutionSettings();
  },

  // Save execution settings
  saveExecutionSettings: function(settings: Partial<ExecutionSettings>): boolean {
    const currentSettings = this.getExecutionSettings();
    const newSettings = { ...currentSettings, ...settings };
    return storage.saveExecutionSettings(newSettings);
  }
};

export default executionUtils;