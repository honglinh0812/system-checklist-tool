import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { auditService, type AuditLog, type AuditLogFilters, type AuditStats } from '../../services/auditService';
import { Modal, LoadingSpinner, ErrorMessage } from '../../components/common';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useModalState } from '../../utils/stateUtils';

const AuditLogs: React.FC = () => {
  const { user } = useAuth();
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
  const [showStats, setShowStats] = useModalState(false);
  const [showCleanupModal, setShowCleanupModal] = useModalState(false);
  const [retentionDays, setRetentionDays] = usePersistedState<number>('audit_retentionDays', 365);
  
  // Non-persisted states - loading và error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // Check if user is admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="container-fluid">
        <div className="alert alert-danger">
          <h4>Truy cập bị từ chối</h4>
          <p>Bạn không có quyền truy cập trang này. Chỉ admin mới có thể xem audit logs.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await auditService.getAuditLogs(filters);
      setLogs(response.logs);
      setPagination(response.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tải audit logs');
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
      alert('Đã dọn dẹp audit logs cũ thành công!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi dọn dẹp audit logs');
    } finally {
      setCleanupLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const getActionBadgeClass = (action: string) => {
    switch (action.toLowerCase()) {
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
    switch (resourceType.toLowerCase()) {
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
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title mb-0">
                <i className="fas fa-history me-2"></i>
                Audit Logs
              </h3>
              <div className="btn-group">
                <button 
                  className="btn btn-outline-info btn-sm"
                  onClick={() => setShowStats(!showStats)}
                >
                  <i className="fas fa-chart-bar me-1"></i>
                  {showStats ? 'Ẩn thống kê' : 'Hiện thống kê'}
                </button>
                <button 
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => setShowCleanupModal(true)}
                >
                  <i className="fas fa-trash me-1"></i>
                  Dọn dẹp logs cũ
                </button>
              </div>
            </div>

            {/* Stats Section */}
            {showStats && stats && (
              <div className="card-body border-bottom">
                <div className="row">
                  <div className="col-md-3">
                    <div className="text-center">
                      <h4 className="text-primary">{stats.total_logs}</h4>
                      <small className="text-muted">Tổng số logs (30 ngày qua)</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <h6>Top hành động:</h6>
                    {stats.action_breakdown?.slice(0, 3).map((item, index) => (
                      <div key={index} className="d-flex justify-content-between">
                        <span className={getActionBadgeClass(item.action)}>{item.action}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="col-md-3">
                    <h6>Top tài nguyên:</h6>
                    {stats.resource_breakdown?.slice(0, 3).map((item, index) => (
                      <div key={index} className="d-flex justify-content-between">
                        <span className={getResourceTypeBadgeClass(item.resource_type)}>{item.resource_type}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="col-md-3">
                    <h6>Top người dùng:</h6>
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
                  <label className="form-label">Tên người dùng:</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Tìm theo username"
                    value={filters.username || ''}
                    onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Hành động:</label>
                  <select
                    className="form-select form-select-sm"
                    value={filters.action || ''}
                    onChange={(e) => handleFilterChange('action', e.target.value || undefined)}
                  >
                    <option value="">Tất cả</option>
                    <option value="CREATE">Tạo</option>
                    <option value="UPDATE">Cập nhật</option>
                    <option value="DELETE">Xóa</option>
                    <option value="APPROVE">Phê duyệt</option>
                    <option value="REJECT">Từ chối</option>
                    <option value="LOGIN">Đăng nhập</option>
                    <option value="LOGOUT">Đăng xuất</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label">Loại tài nguyên:</label>
                  <select
                    className="form-select form-select-sm"
                    value={filters.resource_type || ''}
                    onChange={(e) => handleFilterChange('resource_type', e.target.value || undefined)}
                  >
                    <option value="">Tất cả</option>
                    <option value="MOP">MOP</option>
                    <option value="USER">Người dùng</option>
                    <option value="EXECUTION">Thực thi</option>
                    <option value="FILE">File</option>
                    <option value="AUTH">Xác thực</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label">Từ ngày:</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={filters.start_date || ''}
                    onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Đến ngày:</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={filters.end_date || ''}
                    onChange={(e) => handleFilterChange('end_date', e.target.value || undefined)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Số bản ghi/trang:</label>
                  <select
                    className="form-select form-select-sm"
                    value={filters.per_page || 20}
                    onChange={(e) => handleFilterChange('per_page', parseInt(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card-body">
              {error && <ErrorMessage message={error} />}
              
              {loading ? (
                <div className="text-center py-4">
                  <LoadingSpinner size="lg" />
                  <p className="mt-2 mb-0">Đang tải audit logs...</p>
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table table-striped table-hover">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Người dùng</th>
                          <th>Hành động</th>
                          <th>Tài nguyên</th>
                          <th>Chi tiết</th>
                          <th>IP Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!logs || logs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-4">
                              <i className="fas fa-inbox fa-2x text-muted mb-2"></i>
                              <p className="text-muted mb-0">Không có audit logs nào</p>
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
                            Trước
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
                            Sau
                          </button>
                        </li>
                      </ul>
                      
                      <div className="text-center mt-2">
                        <small className="text-muted">
                          Hiển thị {(((pagination?.page || 1) - 1) * (pagination?.per_page || 20)) + 1} - {Math.min((pagination?.page || 1) * (pagination?.per_page || 20), pagination?.total || 0)} 
                          trong tổng số {pagination?.total || 0} bản ghi
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
        title="Dọn dẹp Audit Logs cũ"
        size="md"
      >
        <div className="modal-body">
          <div className="alert alert-warning">
            <i className="fas fa-exclamation-triangle me-2"></i>
            <strong>Cảnh báo:</strong> Hành động này sẽ xóa vĩnh viễn tất cả audit logs cũ hơn số ngày được chỉ định.
          </div>
          
          <div className="mb-3">
            <label className="form-label">Số ngày giữ lại:</label>
            <input
              type="number"
              className="form-control"
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value) || 365)}
              min="1"
              max="3650"
            />
            <div className="form-text">
              Logs cũ hơn {retentionDays} ngày sẽ bị xóa vĩnh viễn.
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
            Hủy
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
                Đang dọn dẹp...
              </>
            ) : (
              <>
                <i className="fas fa-trash me-2"></i>
                Xác nhận dọn dẹp
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AuditLogs;