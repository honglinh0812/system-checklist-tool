import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS, USER_ROLES } from '../../utils/constants';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useModalState } from '../../utils/stateUtils';

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

const ExecutionHistory: React.FC = () => {
  const { user } = useAuth();
  
  // Persisted state management with unique keys for Execution History
  const [executions, setExecutions] = usePersistedState<Execution[]>('history_executions', [], { autoSave: true, autoSaveInterval: 30000 });
  const [selectedExecution, setSelectedExecution] = usePersistedState<Execution | null>('history_selectedExecution', null);
  const [showDetailModal, setShowDetailModal] = useModalState(false);
  
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

  const getAssessmentBadges = (execution: Execution) => {
    const badges = [];
    if (execution.risk_assessment) {
      badges.push(
        <span key="risk" className="badge badge-warning mr-1">
          Đánh giá rủi ro
        </span>
      );
    }
    if (execution.handover_assessment) {
      badges.push(
        <span key="handover" className="badge badge-info">
          Đánh giá bàn giao
        </span>
      );
    }
    return badges;
  };

  const getResultBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <span className="badge badge-success">Thành công</span>;
      case 'failed':
        return <span className="badge badge-danger">Thất bại</span>;
      case 'running':
        return <span className="badge badge-warning">Đang chạy</span>;
      case 'pending':
        return <span className="badge badge-info">Chờ xử lý</span>;
      default:
        return <span className="badge badge-secondary">Không xác định</span>;
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
      alert('You do not have permission to export data.');
      return;
    }
    // Logic để export tất cả kết quả
    console.log('Exporting all results...');
  };

  const handleExportSingle = (executionId: number) => {
    if (!canExport) {
      alert('You do not have permission to export data.');
      return;
    }
    // Logic để export một execution
    console.log('Exporting execution:', executionId);
  };

  const getPageTitle = () => {
    if (isViewer) {
      return 'Execution History (View Only)';
    }
    return 'Execution History';
  };

  const getPageDescription = () => {
    if (isViewer) {
      return 'View execution history and results (read-only access)';
    }
    return 'Execution History (Last 7 Days)';
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

      {/* Main content */}
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
                    <div className="card-tools">
                      <button 
                        type="button" 
                        className="btn btn-success"
                        onClick={handleExportAll}
                      >
                        <i className="fas fa-download mr-2"></i>
                        Export All
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
                            <th>Thời gian chạy</th>
                            <th>Loại đánh giá</th>
                            <th>MOP được sử dụng</th>
                            <th>Kết quả đánh giá</th>
                            <th>Người thực thi</th>
                            <th>Thống kê</th>
                            <th>Actions</th>
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
                                      {execution.passed_commands}/{execution.total_commands}
                                    </small>
                                    <br />
                                    <small className="text-muted">
                                      Success: {execution.success_rate.toFixed(1)}%
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
                      <h5 className="text-muted">No Execution History</h5>
                      <p className="text-muted">
                        No executions have been performed in the last 7 days.
                      </p>
                      {(isAdmin || isUser) && (
                        <div className="mt-3">
                          <Link to="/risk-assessment" className="btn btn-primary mr-2">
                            <i className="fas fa-shield-alt mr-2"></i>
                            Start Risk Assessment
                          </Link>
                          <Link to="/handover-assessment" className="btn btn-success">
                            <i className="fas fa-exchange-alt mr-2"></i>
                            Start Handover Assessment
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
                  Execution Details
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
                        <span className="info-box-text">MOP Name</span>
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
                        <span className="info-box-text">Executed By</span>
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
                        <span className="info-box-text">Execution Time</span>
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
                        <span className="info-box-text">Duration</span>
                        <span className="info-box-number">
                          {selectedExecution.duration ? `${selectedExecution.duration.toFixed(2)}s` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-12">
                    <h5>Assessment Types</h5>
                    <div className="mb-3">
                      {getAssessmentBadges(selectedExecution)}
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-12">
                    <h5>Execution Status</h5>
                    <div className="mb-3">
                      {getResultBadge(selectedExecution.status)}
                    </div>
                  </div>
                </div>

                {selectedExecution.total_commands > 0 && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>Command Statistics</h5>
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
                          Passed: {selectedExecution.passed_commands}
                        </span>
                        {' | '}
                        <span className="text-danger">
                          <i className="fas fa-times mr-1"></i>
                          Failed: {selectedExecution.failed_commands}
                        </span>
                        {' | '}
                        <span className="text-info">
                          <i className="fas fa-list mr-1"></i>
                          Total: {selectedExecution.total_commands}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {selectedExecution.details && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>Details</h5>
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
                    Export
                  </button>
                )}
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowDetailModal(false)}
                >
                  Close
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