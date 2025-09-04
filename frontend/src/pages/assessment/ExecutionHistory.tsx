import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS, USER_ROLES } from '../../utils/constants';
import { usePersistedState } from '../../hooks/usePersistedState';
import { ErrorMessage } from '../../components/common';
import { useTranslation } from '../../i18n/useTranslation';

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
  skipped_commands?: number;
  server_count: number;
  duration?: number;
  type: string;
  details?: string;
}

const ExecutionHistory: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  // Persisted state management with unique keys for Execution History
  const [executions, setExecutions] = usePersistedState<Execution[]>('history_executions', [], { autoSave: true, autoSaveInterval: 30000 });
  const [selectedExecution, setSelectedExecution] = usePersistedState<Execution | null>('history_selectedExecution', null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Non-persisted states - loading
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Permission checks
  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isUser = user?.role === USER_ROLES.USER;
  const isViewer = user?.role === USER_ROLES.VIEWER;
  const canExport = isAdmin || isUser; // Viewer chỉ có thể xem, không export

  useEffect(() => {
    fetchExecutions();
  }, []);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

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

  const getAssessmentBadges = (execution: Execution) => {
    const badges = [];
    if (execution.risk_assessment) {
      badges.push(
        <span key="risk" className="badge badge-warning mr-1">
          {t('riskAssessment')}
        </span>
      );
    }
    if (execution.handover_assessment) {
      badges.push(
        <span key="handover" className="badge badge-info">
          {t('handoverAssessment')}
        </span>
      );
    }
    return badges;
  };

  const getResultBadge = (status: string | undefined) => {
    if (!status) {
      return <span className="badge badge-secondary">{t('unknown')}</span>;
    }
    switch (status.toLowerCase()) {
      case 'completed':
        return <span className="badge badge-success">{t('success')}</span>;
      case 'failed':
        return <span className="badge badge-danger">{t('failed')}</span>;
      case 'running':
        return <span className="badge badge-warning">{t('running')}</span>;
      case 'pending':
        return <span className="badge badge-info">{t('pending')}</span>;
      default:
        return <span className="badge badge-secondary">{t('unknown')}</span>;
    }
  };

  const handleViewDetails = async (executionId: number) => {
    try {
      const execution = executions.find(e => e.id === executionId);
      if (execution) {
        // Fetch detailed execution data if needed
        const detailData = await apiService.get<any>(`${API_ENDPOINTS.EXECUTIONS.DETAIL}/${executionId}`);
        if (detailData.success) {
          setSelectedExecution({ ...execution, ...detailData.data });
        } else {
          setSelectedExecution(execution);
        }
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('Error fetching execution details:', error);
      // Fallback to basic execution data
      const execution = executions.find(e => e.id === executionId);
      if (execution) {
        setSelectedExecution(execution);
        setShowDetailModal(true);
      }
    }
  };

  const handleExportAll = () => {
    if (!canExport) {
      showAlert('error', t('noExportPermission'));
      return;
    }
    // Logic để export tất cả kết quả
    console.log('Exporting all results...');
  };

  const handleExportSingle = (executionId: number) => {
    if (!canExport) {
      showAlert('error', t('noExportPermission'));
      return;
    }
    // Logic để export một execution
    console.log('Exporting execution:', executionId);
  };

  const getPageTitle = () => {
    return canExport ? t('executionHistory') : t('executionHistoryViewOnly');
  };

  const getPageDescription = () => {
    if (isViewer) {
      return 'View execution history and results (read-only access)';
    }
    return 'Execution History - Tổng hợp tất cả lịch sử';
  };

  return (
    <div>
      {/* Content Header */}
      <section className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1>{getPageTitle()}</h1>
              {isViewer && (
                <small className="text-muted">
                  <i className="fas fa-info-circle mr-1"></i>
                  You have read-only access to execution history
                </small>
              )}
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <Link to="/dashboard">Home</Link>
                </li>
                <li className="breadcrumb-item active">Execution History</li>
              </ol>
            </div>
          </div>
        </div>
      </section>
      {alert && (
        <ErrorMessage 
          message={alert.message} 
          type={alert.type === 'error' ? 'danger' : alert.type === 'success' ? 'info' : 'warning'}
          dismissible={true}
          onDismiss={() => setAlert(null)}
        />
      )}
      {/* Main content */}
      <section className="content">
        <div className="container-fluid">
          {/* Navigation Info */}
          <div className="row mb-3">
            <div className="col-12">
              <div className="alert alert-info">
                <h5><i className="fas fa-info-circle mr-2"></i>{t('executionHistoryDescription')}</h5>
                <div className="row">
                  <div className="col-md-6">
                    <div className="card border-primary">
                      <div className="card-body text-center">
                        <i className="fas fa-play-circle fa-2x text-primary mb-2"></i>
                        <h6>{t('mopExecutionHistory')}</h6>
                        <p className="text-muted small">{t('assessmentHistoryDesc')}</p>
                        <a href="/execution-history/mop-executions" className="btn btn-primary btn-sm">
                          <i className="fas fa-arrow-right mr-1"></i>{t('viewDetails')}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="card border-success">
                      <div className="card-body text-center">
                        <i className="fas fa-clipboard-list fa-2x text-success mb-2"></i>
                        <h6>{t('mopActionHistory')}</h6>
                        <p className="text-muted small">{t('mopActionHistoryFullDesc')}</p>
                        <a href="/execution-history/mop-actions" className="btn btn-success btn-sm">
                          <i className="fas fa-arrow-right mr-1"></i>{t('viewDetails')}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-history mr-2"></i>
                    {getPageDescription()}
                  </h3>
                  {canExport && (
                    <div className="card-tools">
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
                      <p className="mt-2 text-muted">Loading execution history...</p>
                    </div>
                  ) : executions.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped">
                        <thead>
                          <tr>
                            <th>{t('executionTimeColumn')}</th>
                            <th>{t('assessmentTypeColumn')}</th>
                            <th>{t('mopUsedColumn')}</th>
                            <th>{t('assessmentResultColumn')}</th>
                            <th>{t('executorColumn')}</th>
                            <th>{t('statisticsColumn')}</th>
                            <th>{t('actionsColumn')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {executions.map(execution => (
                            <tr key={execution.id}>
                              <td>
                                <strong>{execution.execution_time_formatted}</strong>
                                {execution.duration && (
                                  <>
                                    <br />
                                    <small className="text-muted">
                                      Duration: {execution.duration.toFixed(2)}s
                                    </small>
                                  </>
                                )}
                              </td>
                              <td>
                                {getAssessmentBadges(execution)}
                              </td>
                              <td>
                                <span className="text-primary font-weight-bold">
                                  {execution.mop_name}
                                </span>
                              </td>
                              <td>
                                {getResultBadge(execution.status)}
                              </td>
                              <td>
                                <i className="fas fa-user mr-1"></i>
                                {execution.user_name}
                              </td>
                              <td>
                                {execution.total_commands > 0 && (
                                  <div>
                                    <small className="text-success">
                                      <i className="fas fa-check mr-1"></i>
                                      {execution.passed_commands}
                                    </small>
                                    {execution.failed_commands > 0 && (
                                      <>
                                        {' | '}
                                        <small className="text-danger">
                                          <i className="fas fa-times mr-1"></i>
                                          {execution.failed_commands}
                                        </small>
                                      </>
                                    )}
                                    {execution.skipped_commands && execution.skipped_commands > 0 && (
                                      <>
                                        {' | '}
                                        <small className="text-warning">
                                          <i className="fas fa-forward mr-1"></i>
                                          {execution.skipped_commands}
                                        </small>
                                      </>
                                    )}
                                    <br />
                                    <small className="text-muted">
                                      Total: {execution.total_commands} | Success: {execution.success_rate.toFixed(1)}%
                                    </small>
                                  </div>
                                )}
                                {execution.server_count > 0 && (
                                  <div>
                                    <small className="text-info">
                                      <i className="fas fa-server mr-1"></i>
                                      {execution.server_count} servers
                                    </small>
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="btn-group" role="group">
                                  <button 
                                    className="btn btn-sm btn-info"
                                    onClick={() => handleViewDetails(execution.id)}
                                    title="View Details"
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                  {canExport && (
                                    <button 
                                      className="btn btn-sm btn-success"
                                      onClick={() => handleExportSingle(execution.id)}
                                      title="Export"
                                    >
                                      <i className="fas fa-download"></i>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <i className="fas fa-info-circle fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">{t('noExecutionHistory')}</h5>
                      <p className="text-muted">
                        {t('noExecutionsLast7Days')}
                      </p>
                      {(isAdmin || isUser) && (
                        <div className="mt-3">
                          <Link to="/risk-assessment" className="btn btn-primary mr-2">
                            <i className="fas fa-shield-alt mr-2"></i>
                            {t('startRiskAssessmentButton')}
                          </Link>
                          <Link to="/handover-assessment" className="btn btn-success">
                            <i className="fas fa-exchange-alt mr-2"></i>
                            {t('startHandoverAssessmentButton')}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Execution Detail Modal */}
      {selectedExecution && (
        <div className={`modal fade ${showDetailModal ? 'show' : ''}`} 
             style={{ display: showDetailModal ? 'block' : 'none' }}
             tabIndex={-1}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">
                  <i className="fas fa-info-circle mr-2"></i>
                  {t('executionDetailsModal')}
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
                    <div className="info-box">
                      <span className="info-box-icon bg-info">
                        <i className="fas fa-tasks"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">{t('mopNameLabel')}</span>
                        <span className="info-box-number">{selectedExecution.mop_name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="info-box">
                      <span className="info-box-icon bg-success">
                        <i className="fas fa-user"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">{t('executedByLabel')}</span>
                        <span className="info-box-number">{selectedExecution.user_name}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="row">
                  <div className="col-md-6">
                    <div className="info-box">
                      <span className="info-box-icon bg-warning">
                        <i className="fas fa-clock"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">{t('executionTimeLabel')}</span>
                        <span className="info-box-number">{selectedExecution.execution_time_formatted}</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="info-box">
                      <span className="info-box-icon bg-primary">
                        <i className="fas fa-stopwatch"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">{t('duration')}</span>
                        <span className="info-box-number">
                          {selectedExecution.duration ? `${selectedExecution.duration.toFixed(2)}s` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-12">
                    <h5>{t('assessmentTypesLabel')}</h5>
                    <div className="mb-3">
                      {getAssessmentBadges(selectedExecution)}
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-12">
                    <h5>{t('executionStatusLabel')}</h5>
                    <div className="mb-3">
                      {getResultBadge(selectedExecution.status)}
                    </div>
                  </div>
                </div>

                {selectedExecution.total_commands > 0 && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>{t('commandStatisticsLabel')}</h5>
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
                          {t('passedLabel')} {selectedExecution.passed_commands}
                        </span>
                        {' | '}
                        <span className="text-danger">
                          <i className="fas fa-times mr-1"></i>
                          {t('failedLabel')} {selectedExecution.failed_commands}
                        </span>
                        {selectedExecution.skipped_commands && selectedExecution.skipped_commands > 0 && (
                          <>
                            {' | '}
                            <span className="text-warning">
                              <i className="fas fa-forward mr-1"></i>
                              Skipped {selectedExecution.skipped_commands}
                            </span>
                          </>
                        )}
                        {' | '}
                        <span className="text-info">
                          <i className="fas fa-list mr-1"></i>
                          {t('totalLabel')} {selectedExecution.total_commands}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {selectedExecution.details && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>{t('detailsLabel')}</h5>
                      <pre className="bg-light p-3 rounded" style={{ maxHeight: '200px', overflow: 'auto' }}>
                        {selectedExecution.details}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {canExport && (
                  <button 
                    type="button" 
                    className="btn btn-success"
                    onClick={() => handleExportSingle(selectedExecution.id)}
                  >
                    <i className="fas fa-download mr-2"></i>
                    {t('exportButton')}
                  </button>
                )}
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
      
      {/* Modal backdrop */}
      {showDetailModal && <div className="modal-backdrop fade show"></div>}
    </div>
  );
};

export default ExecutionHistory;