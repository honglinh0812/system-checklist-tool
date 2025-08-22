import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS, USER_ROLES } from '../../utils/constants';
import { usePersistedState } from '../../hooks/usePersistedState';

import { useTranslation } from '../../i18n/useTranslation'

interface Execution {
  id: number;
  execution_time: string;
  execution_time_formatted: string;
  risk_assessment: boolean;
  handover_assessment: boolean;
  mop_name: string;
  status: string;
  user_name: string;
  assessment_type?: string;
  success_rate: number;
  total_commands: number;
  passed_commands: number;
  failed_commands: number;
  server_count: number;
  duration?: number;
  type: string;
  details?: string;
}

const MOPExecutionHistory: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  // Persisted state management with unique keys for MOP Execution History
  const [executions, setExecutions] = usePersistedState<Execution[]>('mop_execution_history', [], { autoSave: true, autoSaveInterval: 30000 });
  const [selectedExecution, setSelectedExecution] = usePersistedState<Execution | null>('mop_execution_selectedExecution', null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Non-persisted states - loading
  const [loading, setLoading] = useState(true);

  // Permission checks
  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isUser = user?.role === USER_ROLES.USER;
  const isViewer = user?.role === USER_ROLES.VIEWER;
  const canExport = isAdmin || isUser; // Viewer chỉ có thể xem, không export

  useEffect(() => {
    fetchExecutions();
  }, []);

  const fetchExecutions = async () => {
    try {
      const data = await apiService.get<any>(API_ENDPOINTS.EXECUTIONS.HISTORY);
      if (data.success) {
        setExecutions(data.data.executions || []);
      }
    } catch (error) {
      console.error('Error fetching executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewExecution = (execution: Execution) => {
    setSelectedExecution(execution);
    setShowDetailModal(true);
  };

  const handleExportAll = async () => {
    try {
      const response = await apiService.get(API_ENDPOINTS.EXECUTIONS.EXPORT, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response as BlobPart], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `execution_history_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting executions:', error);
    }
  };

  const getAssessmentBadges = (execution: Execution) => {
    const badges = [];
    if (execution.risk_assessment) {
      badges.push(
        <span key="risk" className="badge badge-warning mr-1">
          <i className="fas fa-shield-alt mr-1"></i>
          {t('riskAssessment')}
        </span>
      );
    }
    if (execution.handover_assessment) {
      badges.push(
        <span key="handover" className="badge badge-info mr-1">
          <i className="fas fa-exchange-alt mr-1"></i>
          {t('handoverAssessment')}
        </span>
      );
    }
    return badges.length > 0 ? badges : <span className="text-muted">{t('noAssessment')}</span>;
  };

  const getResultBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'success':
        return <span className="badge badge-success"><i className="fas fa-check mr-1"></i>{t('completed')}</span>;
      case 'failed':
      case 'error':
        return <span className="badge badge-danger"><i className="fas fa-times mr-1"></i>{t('failed')}</span>;
      case 'running':
      case 'in_progress':
        return <span className="badge badge-warning"><i className="fas fa-spinner fa-spin mr-1"></i>{t('running')}</span>;
      case 'pending':
        return <span className="badge badge-secondary"><i className="fas fa-clock mr-1"></i>{t('pending')}</span>;
      default:
        return <span className="badge badge-secondary">{t('unknown')}</span>;
    }
  };

  const getPageTitle = () => {
    if (isViewer) {
      return t('executionHistoryViewOnly');
    }
    return t('executionHistory');
  };

  const getPageDescription = () => {
    if (isViewer) {
      return t('executionHistoryViewOnlyDescription');
    }
    return t('executionHistoryDescription');
  };

  return (
    <div className="content-wrapper">
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">{getPageTitle()}</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item"><a href="#">{t('home')}</a></li>
                <li className="breadcrumb-item">{t('executionHistory')}</li>
                <li className="breadcrumb-item active">{t('mopExecutions')}</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-history mr-2"></i>
                    {getPageDescription()}
                  </h3>
                  {canExport && (
                    <div className="float-right">
                      <button 
                        type="button" 
                        className="btn btn-success"
                        onClick={handleExportAll}
                      >
                        <i className="fas fa-download mr-2"></i>
                        {t('exportAll')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-4">
                      <i className="fas fa-spinner fa-spin fa-2x text-muted"></i>
                      <p className="mt-2 text-muted">{t('loadingExecutionHistory')}</p>
                    </div>
                  ) : executions.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped">
                        <thead>
                          <tr>
                            <th>{t('executionTime')}</th>
                            <th>{t('assessmentType')}</th>
                            <th>{t('mopUsed')}</th>
                            <th>{t('evaluationResult')}</th>
                            <th>{t('executor')}</th>
                            <th>{t('statistics')}</th>
                            <th>{t('actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {executions.map(execution => (
                            <tr key={execution.id}>
                              <td>
                                <div>
                                  <strong>{execution.execution_time_formatted || new Date(execution.execution_time).toLocaleString()}</strong>
                                </div>
                                {execution.duration && (
                                  <small className="text-muted">
                                    <i className="fas fa-clock mr-1"></i>
                                    {t('duration')}: {execution.duration.toFixed(2)}s
                                  </small>
                                )}
                              </td>
                              <td>{getAssessmentBadges(execution)}</td>
                              <td>
                                <strong>{execution.mop_name}</strong>
                                {execution.type && (
                                  <div>
                                    <small className="text-muted">
                                      {t('type')}: {execution.type}
                                    </small>
                                  </div>
                                )}
                              </td>
                              <td>{getResultBadge(execution.status)}</td>
                              <td>
                                <i className="fas fa-user mr-1"></i>
                                {execution.user_name}
                              </td>
                              <td>
                                {execution.total_commands > 0 && (
                                  <div>
                                    <small className="text-success">
                                      <i className="fas fa-check mr-1"></i>
                                      {execution.passed_commands}/{execution.total_commands}
                                    </small>
                                    <br />
                                    <small className="text-muted">
                                      {t('success')}: {execution.success_rate.toFixed(1)}%
                                    </small>
                                  </div>
                                )}
                                {execution.server_count > 0 && (
                                  <div>
                                    <small className="text-info">
                                      <i className="fas fa-server mr-1"></i>
                                      {execution.server_count} {t('servers')}
                                    </small>
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="btn-group" role="group">
                                  <button 
                                    type="button" 
                                    className="btn btn-sm btn-info"
                                    onClick={() => viewExecution(execution)}
                                    title={t('viewDetails')}
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <i className="fas fa-inbox fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">{t('noExecutionHistoryFound')}</h5>
                      <p className="text-muted">{t('noMOPExecutionsRecorded')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Detail Modal */}
      {showDetailModal && selectedExecution && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">
                  <i className="fas fa-info-circle mr-2"></i>
                  {t('executionDetails')}
                </h4>
                <button 
                  type="button" 
                  className="close" 
                  onClick={() => setShowDetailModal(false)}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6">
                    <h5>{t('basicInformation')}</h5>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>{t('executionID')}:</strong></td>
                          <td>{selectedExecution.id}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('mopName')}:</strong></td>
                          <td>{selectedExecution.mop_name}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('executedBy')}:</strong></td>
                          <td>{selectedExecution.user_name}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('executionTime')}:</strong></td>
                          <td>{selectedExecution.execution_time_formatted || new Date(selectedExecution.execution_time).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="col-md-6">
                    <h5>{t('performanceMetrics')}</h5>
                    <div className="mb-3">
                      <span className="text-muted">{t('duration')}: </span>
                      <span className="font-weight-bold">
                        {selectedExecution.duration ? `${selectedExecution.duration.toFixed(2)}s` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-12">
                    <h5>{t('assessmentTypes')}</h5>
                    <div className="mb-3">
                      {getAssessmentBadges(selectedExecution)}
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-12">
                    <h5>{t('executionStatus')}</h5>
                    <div className="mb-3">
                      {getResultBadge(selectedExecution.status)}
                    </div>
                  </div>
                </div>

                {selectedExecution.total_commands > 0 && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>{t('commandStatistics')}</h5>
                      <div className="progress mb-2">
                        <div 
                          className="progress-bar bg-success" 
                          style={{ width: `${selectedExecution.success_rate}%` }}
                        >
                          {selectedExecution.success_rate.toFixed(1)}%
                        </div>
                      </div>
                      <p>
                        <span className="text-success">
                          <i className="fas fa-check mr-1"></i>
                          {t('passed')}: {selectedExecution.passed_commands}
                        </span>
                        {' | '}
                        <span className="text-danger">
                          <i className="fas fa-times mr-1"></i>
                          {t('failed')}: {selectedExecution.failed_commands}
                        </span>
                        {' | '}
                        <span className="text-info">
                          <i className="fas fa-list mr-1"></i>
                          {t('total')}: {selectedExecution.total_commands}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {selectedExecution.details && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>{t('details')}</h5>
                      <pre className="bg-light p-3 rounded" style={{ maxHeight: '200px', overflow: 'auto' }}>
                        {selectedExecution.details}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowDetailModal(false)}
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MOPExecutionHistory;