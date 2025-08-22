import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { API_ENDPOINTS, USER_ROLES } from '../utils/constants';
import { useAuth } from '../contexts/AuthContext';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTranslation } from '../i18n/useTranslation';

import { Modal } from '../components/common';

interface DashboardStats {
  totalMops: number;
  approvedMops: number;
  pendingMops: number;
  totalExecutions: number;
  userExecutions: number;
}

interface RecentMOP {
  id: number;
  name: string;
  status: string;
  created_at: string;
  approved_at?: string;
  created_by: {
    id: number;
    username: string;
  };
}

interface RecentExecution {
  id: number;
  execution_time: string;
  started_at?: string;
  completed_at?: string;
  status?: string;
  duration?: number;
  dry_run?: boolean;
  executed_by?: {
    id: number;
    username: string;
  };
  mop: {
    id?: number;
    name: string;
  };
  risk_assessment: boolean;
  handover_assessment: boolean;
  output?: string;
  error_output?: string;
}

const Dashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Thêm các biến kiểm tra quyền
  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isUser = user?.role === USER_ROLES.USER;
  const isViewer = user?.role === USER_ROLES.VIEWER;
  const canPerformAssessments = isAdmin || isUser;
  const canViewMOPManagement = isAdmin;
  
  // Persisted state management with unique keys for Dashboard
  const [stats, setStats] = usePersistedState<DashboardStats>('dashboard_stats', {
    totalMops: 0,
    approvedMops: 0,
    pendingMops: 0,
    totalExecutions: 0,
    userExecutions: 0
  }, { autoSave: true, autoSaveInterval: 30000 });
  const [recentMops, setRecentMops] = usePersistedState<RecentMOP[]>('dashboard_recentMops', [], { autoSave: true });
  const [recentExecutions, setRecentExecutions] = usePersistedState<RecentExecution[]>('dashboard_recentExecutions', [], { autoSave: true });
  const [selectedExecution, setSelectedExecution] = usePersistedState<RecentExecution | null>('dashboard_selectedExecution', null);
  
  // Non-persisted states
  const [showExecutionDetailModal, setShowExecutionDetailModal] = useState<boolean>(false);
  
  // Non-persisted states - loading states
  const [loading, setLoading] = useState(true);
  //const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    if (isAuthenticated) {
      fetchDashboardStats();
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleExecutionClick = (execution: RecentExecution) => {
    setSelectedExecution(execution);
    setShowExecutionDetailModal(true);
  };

  const handleCloseExecutionModal = () => {
    setShowExecutionDetailModal(false);
    setSelectedExecution(null);
  };

  const fetchDashboardStats = async () => {
    try {
      console.log('[Dashboard] Fetching dashboard stats...');
      
      // Fetch dashboard stats
      const statsData = await apiService.get<any>(API_ENDPOINTS.DASHBOARD.STATS);
      console.log('[Dashboard] Dashboard stats response:', statsData);
      
      if (statsData.success && statsData.data.overview) {
        // Map backend data structure to frontend interface
        const overview = statsData.data.overview;
        
        setStats({
          totalMops: overview.total_mops || 0,
          approvedMops: overview.approved_mops || 0,
          pendingMops: overview.pending_mops || 0,
          totalExecutions: overview.total_executions || 0,
          userExecutions: overview.user_executions || 0
        });
      }
      
      // Fetch recent MOPs
      try {
        const mopsData = await apiService.get<any>(`${API_ENDPOINTS.DASHBOARD.RECENT_MOPS}?limit=5`);
        if (mopsData.success && mopsData.data.mops) {
          setRecentMops(mopsData.data.mops);
        }
      } catch (mopsError) {
        console.error('[Dashboard] Error fetching recent MOPs:', mopsError);
      }
      
      // Fetch recent executions
      try {
        const executionsData = await apiService.get<any>(`${API_ENDPOINTS.DASHBOARD.RECENT_EXECUTIONS}?limit=5`);
        if (executionsData.success && executionsData.data.executions) {
          setRecentExecutions(executionsData.data.executions);
        }
      } catch (executionsError) {
        console.error('[Dashboard] Error fetching recent executions:', executionsError);
      }
      
    } catch (error: any) {
      console.error('[Dashboard] Error fetching dashboard stats:', error);
      // If it's an authentication error, the API interceptor will handle logout
      // and redirect will happen via useEffect
      if (error.response?.status === 401) {
        console.log('[Dashboard] Authentication error, will redirect to login');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="sr-only">{t('loading')}</span>
          </div>
          <p className="mt-2">{t('loadingDashboard')}</p>
        </div>
      </div>
    );
  }

  // Safety check for data integrity
  if (!stats || !Array.isArray(recentMops) || !Array.isArray(recentExecutions)) {
    return (
      <div className="alert alert-warning">
        <h4>{t('dashboardLoadingIssue')}</h4>
        <p>{t('unableToLoadDashboard')}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('refreshPage')}
        </button>
      </div>
    );
  }



  return (
    <div>
      {/* Content Header */}
      <section className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1>{t('dashboard')}</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item active">{t('dashboard')}</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="content">
        <div className="container-fluid">
          {/* Info boxes */}
          <div className="row">
            {/* Total MOPs - Hiển thị cho tất cả */}
            <div className="col-lg-3 col-6">
              <div className="small-box bg-info">
                <div className="inner">
                  <h3>{stats.totalMops}</h3>
                  <p>{t('totalMops')}</p>
                </div>
                <div className="icon">
                  <i className="fas fa-tasks"></i>
                </div>
                {canViewMOPManagement ? (
                  <Link to="/mop-management" className="small-box-footer">
                    {t('moreInfo')} <i className="fas fa-arrow-circle-right"></i>
                  </Link>
                ) : (
                  <Link to="/mop-review" className="small-box-footer">
                    {t('viewMops')} <i className="fas fa-arrow-circle-right"></i>
                  </Link>
                )}
              </div>
            </div>

            {/* Approved MOPs - Chỉ cho admin */}
            {isAdmin && (
              <div className="col-lg-3 col-6">
                <div className="small-box bg-success">
                  <div className="inner">
                    <h3>{stats.approvedMops}</h3>
                    <p>{t('approvedMops')}</p>
                  </div>
                  <div className="icon">
                    <i className="fas fa-check-circle"></i>
                  </div>
                  <Link to="/mop-management" className="small-box-footer">
                    {t('moreInfo')} <i className="fas fa-arrow-circle-right"></i>
                  </Link>
                </div>
              </div>
            )}

            {/* Pending MOPs - Chỉ cho admin */}
            {isAdmin && (
              <div className="col-lg-3 col-6">
                <div className="small-box bg-warning">
                  <div className="inner">
                    <h3>{stats.pendingMops}</h3>
                    <p>{t('pendingMops')}</p>
                  </div>
                  <div className="icon">
                    <i className="fas fa-clock"></i>
                  </div>
                  <Link to="/mop-management" className="small-box-footer">
                    {t('moreInfo')} <i className="fas fa-arrow-circle-right"></i>
                  </Link>
                </div>
              </div>
            )}

            {/* Recent Executions - Hiển thị cho tất cả */}
            <div className="col-lg-3 col-6">
              <div className="small-box bg-danger">
                <div className="inner">
                  <h3>{stats.userExecutions}</h3>
                  <p>{t('recentExecutions')}</p>
                </div>
                <div className="icon">
                  <i className="fas fa-history"></i>
                </div>
                <Link to="/execution-history" className="small-box-footer">
                    {t('moreInfo')} <i className="fas fa-arrow-circle-right"></i>
                  </Link>
              </div>
            </div>
          </div>

          {/* Assessment Cards - Chỉ cho admin và user */}
          {canPerformAssessments && (
            <div className="row">
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <i className="fas fa-shield-alt mr-2"></i>
                      {t('riskAssessment')}
                    </h3>
                  </div>
                  <div className="card-body">
                    <p>{t('performSystemRiskAssessments')}</p>
                    <Link to="/risk-assessment" className="btn btn-primary">
                      <i className="fas fa-play mr-2"></i>
                      {t('startAssessment')}
                    </Link>
                  </div>
                </div>
              </div>
              
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <i className="fas fa-exchange-alt mr-2"></i>
                      {t('handoverAssessment')}
                    </h3>
                  </div>
                  <div className="card-body">
                    <p>{t('performSystemHandoverAssessments')}</p>
                    <Link to="/handover-assessment" className="btn btn-success">
                      <i className="fas fa-play mr-2"></i>
                      {t('startAssessment')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Viewer Info Card - Chỉ cho viewer */}
          {isViewer && (
            <div className="row">
              <div className="col-md-12">
                <div className="card card-info">
                  <div className="card-header">
                    <h3 className="card-title">
                      <i className="fas fa-info-circle mr-2"></i>
                      {t('viewerAccess')}
                    </h3>
                  </div>
                  <div className="card-body">
                    <p>{t('viewerAccessDescription')}</p>
                    <ul>
                      <li><i className="fas fa-eye mr-2"></i>{t('viewMopsDetails')}</li>
                      <li><i className="fas fa-history mr-2"></i>{t('viewExecutionHistory')}</li>
                      <li><i className="fas fa-chart-line mr-2"></i>{t('viewDashboardStats')}</li>
                    </ul>
                    <div className="mt-3">
                      <Link to="/mop-review" className="btn btn-info mr-2">
                        <i className="fas fa-eye mr-2"></i>{t('viewMops')}
                      </Link>
                      <Link to="/execution-history" className="btn btn-secondary">
                        <i className="fas fa-history mr-2"></i>{t('viewExecutions')}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent MOPs - Chỉ cho admin */}
          {isAdmin && (
            <div className="row">
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <i className="fas fa-tasks mr-2"></i>
                      {t('recentMops')}
                    </h3>
                  </div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table m-0">
                        <thead>
                          <tr>
                            <th>{t('name')}</th>
                            <th>{t('status')}</th>
                            <th>{t('createdBy')}</th>
                            <th>{t('time')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentMops.length > 0 ? (
                            recentMops.map((mop) => (
                              <tr key={mop.id}>
                                <td>{mop.name}</td>
                                <td>
                                  <span className={`badge ${
                                    mop.status === 'approved' ? 'badge-success' :
                                    mop.status === 'pending' ? 'badge-warning' :
                                    'badge-secondary'
                                  }`}>
                                    {mop.status ? (mop.status.charAt(0).toUpperCase() + mop.status.slice(1)) : 'Unknown'}
                                  </span>
                                </td>
                                <td>{mop.created_by?.username || t('unknownUser')}</td>
                                <td>
                                  {mop.status === 'approved' && mop.approved_at 
                                    ? new Date(mop.approved_at).toLocaleDateString()
                                    : mop.status === 'pending' 
                                    ? ''
                                    : new Date(mop.created_at).toLocaleDateString()
                                  }
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="text-center text-muted">
                                {t('noRecentMopsFound')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Executions - Cho tất cả users */}
          <div className="row">
            <div className="col-md-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-history mr-2"></i>
                    {t('recentExecutions')}
                  </h3>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table m-0">
                      <thead>
                        <tr>
                          <th>{t('time')}</th>
                          <th>{t('mop')}</th>
                          <th>{t('details')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentExecutions.length > 0 ? (
                          recentExecutions.map((execution) => (
                            <tr key={execution.id}>
                              <td>
                                {execution.started_at 
                                  ? new Date(execution.started_at).toLocaleString()
                                  : new Date(execution.execution_time).toLocaleString()
                                }
                              </td>
                              <td>{execution.mop?.name || t('unknownMop')}</td>
                              <td>
                                <a 
                                  href="#" 
                                  className="text-primary" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleExecutionClick(execution);
                                  }}
                                >
                                  {t('viewDetails')}
                                </a>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="text-center text-muted">
                              {t('noRecentExecutionsFound')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Execution Detail Modal */}
      {selectedExecution && (
        <Modal
          show={showExecutionDetailModal}
          onHide={handleCloseExecutionModal}
          title={t('executionDetails')}
          size="lg"
        >
          <div className="row">
            <div className="col-md-12">
              <div className="row mb-3">
                <div className="col-sm-3"><strong>{t('mopName')}:</strong></div>
                <div className="col-sm-9">{selectedExecution.mop?.name || t('unknownMop')}</div>
              </div>
              <div className="row mb-3">
                <div className="col-sm-3"><strong>{t('executionTime')}:</strong></div>
                <div className="col-sm-9">
                  {selectedExecution.started_at 
                    ? new Date(selectedExecution.started_at).toLocaleString()
                    : new Date(selectedExecution.execution_time).toLocaleString()
                  }
                </div>
              </div>
              <div className="row mb-3">
                <div className="col-sm-3"><strong>{t('status')}:</strong></div>
                <div className="col-sm-9">
                  <span className={`badge ${
                    selectedExecution.status === 'completed' ? 'badge-success' :
                    selectedExecution.status === 'failed' ? 'badge-danger' :
                    selectedExecution.status === 'running' ? 'badge-warning' :
                    'badge-secondary'
                  }`}>
                    {selectedExecution.status === 'completed' ? t('completed') :
                     selectedExecution.status === 'failed' ? t('failed') :
                     selectedExecution.status === 'running' ? t('running') :
                     selectedExecution.status || t('unknown')}
                  </span>
                </div>
              </div>
              {selectedExecution.output && (
                <div className="row mb-3">
                  <div className="col-sm-3"><strong>{t('executionResult')}:</strong></div>
                  <div className="col-sm-9">
                    <pre className="bg-light p-2 rounded" style={{maxHeight: '200px', overflow: 'auto'}}>
                      {selectedExecution.output}
                    </pre>
                  </div>
                </div>
              )}
              {selectedExecution.error_output && (
                <div className="row mb-3">
                  <div className="col-sm-3"><strong>{t('error')}:</strong></div>
                  <div className="col-sm-9">
                    <pre className="bg-danger text-white p-2 rounded" style={{maxHeight: '200px', overflow: 'auto'}}>
                      {selectedExecution.error_output}
                    </pre>
                  </div>
                </div>
              )}
              <div className="row mb-3">
                <div className="col-sm-3"><strong>{t('duration')}:</strong></div>
                <div className="col-sm-9">
                  {selectedExecution.duration 
                    ? `${selectedExecution.duration.toFixed(2)} ${t('seconds')}`
                    : 'N/A'
                  }
                </div>
              </div>
              <div className="row mb-3">
                <div className="col-sm-3"><strong>{t('executedBy')}:</strong></div>
                <div className="col-sm-9">{selectedExecution.executed_by?.username || t('unknownUser')}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Dashboard;