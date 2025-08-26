import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { auditService, type AuditLog, type AuditLogFilters, type AuditStats } from '../../services/auditService';
import { Modal, LoadingSpinner, ErrorMessage } from '../../components/common';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useTranslation } from '../../i18n/useTranslation';

const AuditLogs: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  // Persisted state management with unique keys for Audit Logs
  const [logs, setLogs] = usePersistedState<AuditLog[]>('audit_logs', [], { autoSave: true, autoSaveInterval: 30000 });
  const [stats, setStats] = usePersistedState<AuditStats | null>('audit_stats', null);
  const [filters, setFilters] = usePersistedState<AuditLogFilters>('audit_filters', {
    page: 1,
    per_page: 20
  }, { autoSave: true });
  const [pagination, setPagination] = usePersistedState('audit_pagination', {
    page: 1,
    pages: 1,
    per_page: 20,
    total: 0,
    has_next: false,
    has_prev: false
  });
  const [showStats, setShowStats] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [retentionDays, setRetentionDays] = usePersistedState<number>('audit_retentionDays', 365);
  const [activeTab, setActiveTab] = usePersistedState<'all' | 'user_management'>('audit_active_tab', 'all');
  
  // Non-persisted states - loading và error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check if user is admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="container-fluid">
        <div className="alert alert-danger">
          <h4>{t('accessDenied')}</h4>
          <p>{t('accessDeniedMessage')}</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetchLogs();
  }, [filters, activeTab]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleTabChange = (tab: 'all' | 'user_management') => {
    setActiveTab(tab);
    setFilters({ page: 1, per_page: 20 }); // Reset filters when switching tabs
  };

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = activeTab === 'user_management' 
        ? await auditService.getUserActions(filters)
        : await auditService.getAuditLogs(filters);
      setLogs(response.logs);
      setPagination(response.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message || t('loadingAuditLogs'));
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await auditService.getAuditStats(30); // Last 30 days
      setStats(statsData);
    } catch (err: any) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleFilterChange = (key: keyof AuditLogFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value // Reset to page 1 when changing other filters
    }));
  };

  const handleCleanup = async () => {
    try {
      setCleanupLoading(true);
      await auditService.cleanupOldLogs(retentionDays);
      setShowCleanupModal(false);
      fetchLogs(); // Refresh logs
      fetchStats(); // Refresh stats
      showAlert('success', t('cleanupSuccess'));
    } catch (err: any) {
      showAlert('error', err.response?.data?.message || t('cleanupError'));
    } finally {
      setCleanupLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const getActionBadgeClass = (action: string) => {
    // Đảm bảo action luôn là string để tránh lỗi toLowerCase
    const safeAction = typeof action === 'string' ? action : '';
    switch (safeAction.toLowerCase()) {
      case 'create': return 'badge bg-success';
      case 'update': return 'badge bg-warning';
      case 'delete': return 'badge bg-danger';
      case 'approve': return 'badge bg-info';
      case 'reject': return 'badge bg-secondary';
      case 'login': return 'badge bg-primary';
      case 'logout': return 'badge bg-dark';
      default: return 'badge bg-light text-dark';
    }
  };

  const getResourceTypeBadgeClass = (resourceType: string) => {
    // Đảm bảo resourceType luôn là string để tránh lỗi toLowerCase
    const safeResourceType = typeof resourceType === 'string' ? resourceType : '';
    switch (safeResourceType.toLowerCase()) {
      case 'mop': return 'badge bg-primary';
      case 'user': return 'badge bg-info';
      case 'execution': return 'badge bg-success';
      case 'file': return 'badge bg-warning';
      case 'auth': return 'badge bg-secondary';
      default: return 'badge bg-light text-dark';
    }
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            {alert && (
                <ErrorMessage 
                  message={alert.message} 
                  type={alert.type === 'error' ? 'danger' : alert.type === 'success' ? 'info' : 'warning'}
                  dismissible={true}
                  onDismiss={() => setAlert(null)}
                />
            )}
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h3 className="card-title mb-0">
                  <i className="fas fa-history me-2"></i>
                  {t('auditLogsTitle')}
                </h3>
                <div className="btn-group">
                  <button 
                    className="btn btn-outline-info btn-sm"
                    onClick={() => setShowStats(!showStats)}
                  >
                    <i className="fas fa-chart-bar me-1"></i>
                    {showStats ? t('hideStats') : t('showStats')}
                  </button>
                  <button 
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => setShowCleanupModal(true)}
                  >
                    <i className="fas fa-trash me-1"></i>
                    {t('cleanupOldLogs')}
                  </button>
                </div>
              </div>
              
              {/* Tabs */}
              <ul className="nav nav-tabs card-header-tabs">
                <li className="nav-item">
                  <button 
                    className={`nav-link ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => handleTabChange('all')}
                  >
                    <i className="fas fa-list me-1"></i>
                    Tất cả Logs
                  </button>
                </li>
                <li className="nav-item">
                  <button 
                    className={`nav-link ${activeTab === 'user_management' ? 'active' : ''}`}
                    onClick={() => handleTabChange('user_management')}
                  >
                    <i className="fas fa-users me-1"></i>
                    Quản lý Người dùng
                  </button>
                </li>
              </ul>
            </div>

            {/* Stats Section */}
            {showStats && stats && (
              <div className="card-body border-bottom">
                <div className="row">
                  <div className="col-md-3">
                    <div className="text-center">
                      <h4 className="text-primary">{stats.total_logs}</h4>
                      <small className="text-muted">{t('totalLogsLast30Days')}</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <h6>{t('topActions')}</h6>
                    {stats.action_breakdown?.slice(0, 3).map((item, index) => (
                      <div key={index} className="d-flex justify-content-between">
                        <span className={getActionBadgeClass(item.action)}>{item.action}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="col-md-3">
                    <h6>{t('topResources')}</h6>
                    {stats.resource_breakdown?.slice(0, 3).map((item, index) => (
                      <div key={index} className="d-flex justify-content-between">
                        <span className={getResourceTypeBadgeClass(item.resource_type)}>{item.resource_type}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="col-md-3">
                    <h6>{t('topUsers')}</h6>
                    {stats.top_users?.slice(0, 3).map((item, index) => (
                      <div key={index} className="d-flex justify-content-between">
                        <span>{item.username}</span>
                        <span>{item.activity_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="card-body border-bottom">
              <div className="row g-3">
                <div className="col-md-2">
                  <label className="form-label">{t('usernameFilter')}</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder={t('searchByUsername')}
                    value={filters.username || ''}
                    onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">
                    {activeTab === 'user_management' ? 'Người dùng đích' : t('mopNameFilter')}
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder={activeTab === 'user_management' ? 'Tìm theo tên người dùng đích' : t('searchByMopName')}
                    value={filters.mop_name || ''}
                    onChange={(e) => handleFilterChange('mop_name', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">{t('actionFilter')}</label>
                  <select
                    className="form-select form-select-sm"
                    value={filters.action || ''}
                    onChange={(e) => handleFilterChange('action', e.target.value || undefined)}
                  >
                    <option value="">{t('allActions')}</option>
                    <option value="CREATE">{t('createAction')}</option>
                    <option value="UPDATE">{t('updateAction')}</option>
                    <option value="DELETE">{t('deleteAction')}</option>
                    <option value="APPROVE">{t('approveActionAudit')}</option>
                    <option value="REJECT">{t('rejectActionAudit')}</option>
                    <option value="LOGIN">{t('loginAction')}</option>
                    <option value="LOGOUT">{t('logoutAction')}</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label">{t('statusFilter')}</label>
                  <select
                    className="form-select form-select-sm"
                    value={filters.status || ''}
                    onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
                  >
                    <option value="">{t('allStatuses')}</option>
                    <option value="pending">{t('pendingStatus')}</option>
                    <option value="approved">{t('approvedStatus')}</option>
                    <option value="rejected">{t('rejectedStatus')}</option>
                    <option value="completed">{t('completedStatus')}</option>
                    <option value="failed">{t('failedStatus')}</option>
                    <option value="running">{t('runningStatus')}</option>
                  </select>
                </div>
                {activeTab !== 'user_management' && (
                  <div className="col-md-2">
                    <label className="form-label">{t('resourceTypeFilter')}</label>
                    <select
                      className="form-select form-select-sm"
                      value={filters.resource_type || ''}
                      onChange={(e) => handleFilterChange('resource_type', e.target.value || undefined)}
                    >
                      <option value="">{t('allResourceTypes')}</option>
                      <option value="MOP">{t('mopResourceType')}</option>
                      <option value="USER">{t('userResourceType')}</option>
                      <option value="EXECUTION">{t('executionResourceType')}</option>
                      <option value="FILE">{t('fileResourceType')}</option>
                      <option value="AUTH">{t('authResourceType')}</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="row g-3 mt-2">
                <div className="col-md-2">
                  <label className="form-label">{t('fromDate')}</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={filters.start_date || ''}
                    onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">{t('toDate')}</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={filters.end_date || ''}
                    onChange={(e) => handleFilterChange('end_date', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">{t('recordsPerPage')}</label>
                  <select
                    className="form-select form-select-sm"
                    value={filters.per_page || 10}
                    onChange={(e) => handleFilterChange('per_page', parseInt(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">&nbsp;</label>
                  <div className="d-flex gap-2">
                    <button 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setFilters({ page: 1, per_page: 20 });
                        fetchLogs();
                      }}
                    >
                      <i className="fas fa-undo me-1"></i>
                      {t('resetFilters')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-body">
              {error && <ErrorMessage message={error} />}
              
              {loading ? (
                <div className="text-center py-4">
                  <LoadingSpinner size="lg" />
                  <p className="mt-2 mb-0">{t('loadingAuditLogs')}</p>
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table table-striped table-hover">
                      <thead>
                        <tr>
                          <th>{t('timeColumn')}</th>
                          <th>{t('userColumn')}</th>
                          <th>{t('actionColumn')}</th>
                          {activeTab === 'user_management' ? (
                            <th>Người dùng đích</th>
                          ) : (
                            <th>{t('resourceColumn')}</th>
                          )}
                          <th>{t('detailsColumn')}</th>
                          <th>{t('ipAddressColumn')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!logs || logs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-4">
                              <i className="fas fa-inbox fa-2x text-muted mb-2"></i>
                              <p className="text-muted mb-0">{t('noAuditLogs')}</p>
                            </td>
                          </tr>
                        ) : (
                          logs?.map((log) => (
                            <tr key={log.id}>
                              <td>
                                <small>{formatDate(log.created_at)}</small>
                              </td>
                              <td>
                                <strong>{log.username}</strong>
                                <br />
                                <small className="text-muted">ID: {log.user_id}</small>
                              </td>
                              <td>
                                <span className={getActionBadgeClass(log.action)}>
                                  {log.action}
                                </span>
                              </td>
                              <td>
                                {activeTab === 'user_management' ? (
                                  <>
                                    <strong>{log.resource_name || 'N/A'}</strong>
                                    {log.resource_id && (
                                      <>
                                        <br />
                                        <small className="text-muted">ID: {log.resource_id}</small>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className={getResourceTypeBadgeClass(log.resource_type)}>
                                      {log.resource_type}
                                    </span>
                                    {log.resource_name && (
                                      <>
                                        <br />
                                        <small className="text-muted">{log.resource_name}</small>
                                      </>
                                    )}
                                    {log.resource_id && (
                                      <>
                                        <br />
                                        <small className="text-muted">ID: {log.resource_id}</small>
                                      </>
                                    )}
                                  </>
                                )}
                              </td>
                              <td>
                                {log.details && (
                                  <small>
                                    {typeof log.details === 'string' 
                                      ? log.details 
                                      : JSON.stringify(log.details, null, 2)
                                    }
                                  </small>
                                )}
                              </td>
                              <td>
                                <small>{log.ip_address || 'N/A'}</small>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {pagination && pagination.pages > 1 && (
                    <nav aria-label="Audit logs pagination">
                      <ul className="pagination justify-content-center">
                        <li className={`page-item ${!pagination?.has_prev ? 'disabled' : ''}`}>
                          <button
                            className="page-link"
                            onClick={() => handleFilterChange('page', (pagination?.page || 1) - 1)}
                            disabled={!pagination?.has_prev}
                          >
                            {t('previousPage')}
                          </button>
                        </li>
                        
                        {Array.from({ length: Math.min(5, pagination?.pages || 0) }, (_, i) => {
                          const pageNum = Math.max(1, (pagination?.page || 1) - 2) + i;
                          if (pageNum > (pagination?.pages || 0)) return null;
                          
                          return (
                            <li key={pageNum} className={`page-item ${pageNum === pagination?.page ? 'active' : ''}`}>
                              <button
                                className="page-link"
                                onClick={() => handleFilterChange('page', pageNum)}
                              >
                                {pageNum}
                              </button>
                            </li>
                          );
                        })}
                        
                        <li className={`page-item ${!pagination?.has_next ? 'disabled' : ''}`}>
                          <button
                            className="page-link"
                            onClick={() => handleFilterChange('page', (pagination?.page || 1) + 1)}
                            disabled={!pagination?.has_next}
                          >
                            {t('nextPage')}
                          </button>
                        </li>
                      </ul>
                      
                      <div className="text-center mt-2">
                        <small className="text-muted">
                           {t('showingRecords')
                             .replace('{start}', String((((pagination?.page || 1) - 1) * (pagination?.per_page || 20)) + 1))
                             .replace('{end}', String(Math.min((pagination?.page || 1) * (pagination?.per_page || 20), pagination?.total || 0)))
                             .replace('{total}', String(pagination?.total || 0))}
                         </small>
                      </div>
                    </nav>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cleanup Modal */}
      <Modal
        show={showCleanupModal}
        onHide={() => setShowCleanupModal(false)}
        title={t('cleanupAuditLogsTitle')}
        size="md"
      >
        <div className="modal-body">
          <div className="alert alert-warning">
            <i className="fas fa-exclamation-triangle me-2"></i>
            <strong>Cảnh báo:</strong> {t('cleanupWarning')}
          </div>
          
          <div className="mb-3">
            <label className="form-label">{t('retentionDays')}</label>
            <input
              type="number"
              className="form-control"
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value) || 365)}
              min="1"
              max="3650"
            />
            <div className="form-text">
              {t('retentionDaysHelp').replace('{days}', String(retentionDays))}
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCleanupModal(false)}
            disabled={cleanupLoading}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleCleanup}
            disabled={cleanupLoading}
          >
            {cleanupLoading ? (
              <>
                <LoadingSpinner size="sm" className="me-2" />
                {t('cleanupInProgress')}
              </>
            ) : (
              <>
                <i className="fas fa-trash me-2"></i>
                {t('confirmCleanup')}
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AuditLogs;