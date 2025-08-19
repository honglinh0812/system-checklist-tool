import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useModalState } from '../../utils/stateUtils';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';

interface Command {
  title: string;
  command: string;
  reference_value?: string;
}

interface MOP {
  id: string;
  name: string;
  status: 'pending' | 'approved';
  type: string[];
  created_at: string;
  creator?: { username: string };
  files?: {
    pdf?: boolean;
    appendix?: boolean;
  };
  commands?: Command[];
}

interface ApiResponse {
  success: boolean;
  data?: MOP | {
    mops?: MOP[];
    [key: string]: unknown;
  };
  error?: string;
}

const MOPReview: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  // Persisted state management with unique keys for MOP Review
  const [pendingMops, setPendingMops] = usePersistedState<MOP[]>('review_pendingMops', [], { autoSave: true, autoSaveInterval: 30000 });
  const [showDetailsModal, setShowDetailsModal] = useModalState(false);
  const [showRejectModal, setShowRejectModal] = useModalState(false);
  const [showFileModal, setShowFileModal] = useModalState(false);
  const [showApproveModal, setShowApproveModal] = useModalState(false);
  const [showSingleApproveModal, setShowSingleApproveModal] = useModalState(false);
  const [currentMop, setCurrentMop] = usePersistedState<MOP | null>('review_currentMop', null);
  const [currentMopId, setCurrentMopId] = usePersistedState<string | null>('review_currentMopId', null);
  const [rejectReason, setRejectReason] = usePersistedState<string>('review_rejectReason', '', { autoSave: true, debounceDelay: 1000 });
  const [fileViewerTitle, setFileViewerTitle] = usePersistedState<string>('review_fileViewerTitle', '');
  const [fileViewerContent, setFileViewerContent] = usePersistedState<string>('review_fileViewerContent', '');
  const [selectedMops, setSelectedMops] = usePersistedState<Set<string>>('review_selectedMops', new Set(), {
    serialize: (state: unknown) => {
      if (state instanceof Set) {
        return JSON.stringify(Array.from(state));
      }
      return JSON.stringify([]);
    },
    deserialize: (state: unknown) => {
      try {
        if (typeof state === 'string') {
          const parsed = JSON.parse(state);
          return new Set(Array.isArray(parsed) ? parsed : []);
        }
        return new Set();
      } catch {
        return new Set();
      }
    }
  });
  
  // Non-persisted states - loading và notifications
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  const fetchPendingMOPs = useCallback(async () => {
    try {
      const data = await apiService.get<ApiResponse>(API_ENDPOINTS.MOPS.REVIEW);
      if (data.success && data.data && typeof data.data === 'object' && 'mops' in data.data) {
        setPendingMops((data.data as { mops?: MOP[] }).mops || []);
      }
    } catch (error) {
      console.error('Error fetching review MOPs:', error);
    } finally {
      setLoading(false);
    }
  }, [setPendingMops]);

  useEffect(() => {
    fetchPendingMOPs();
  }, [fetchPendingMOPs]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const viewMOPDetails = async (mopId: string) => {
    setCurrentMopId(mopId);
    setShowFileModal(false);
    
    try {
      const data = await apiService.get<ApiResponse>(API_ENDPOINTS.MOPS.DETAIL(mopId));
      if (data.success && data.data && typeof data.data === 'object' && 'id' in data.data) {
        setCurrentMop(data.data as MOP);
        setShowDetailsModal(true);
      } else {
        alert('Error loading MOP details');
      }
    } catch (error) {
      console.error('Error loading MOP details:', error);
      alert('Error loading MOP details');
    }
  };

  const viewMOPFile = (mopId: string, fileType: string) => {
    setShowDetailsModal(false);
    
    const fileUrl = `/api/mops/${mopId}/files/${fileType}`;
    const title = (fileType?.toUpperCase() || 'Unknown') + ' File';
    
    let content = '';
    
    if (fileType === 'pdf') {
      content = `
        <div class="embed-responsive embed-responsive-16by9" style="height: 70vh;">
          <iframe class="embed-responsive-item" src="${fileUrl}" allowfullscreen></iframe>
        </div>
      `;
    } else if (fileType === 'appendix') {
      content = `
        <div class="text-center py-5">
          <i class="fas fa-file-excel fa-4x text-success mb-3"></i>
          <h5>Excel/CSV files cannot be previewed directly</h5>
          <p>Please download the file to view its contents</p>
          <a href="${fileUrl}" class="btn btn-primary" target="_blank">
            <i class="fas fa-download mr-2"></i>Download File
          </a>
        </div>
      `;
    }
    
    setFileViewerTitle(title);
    setFileViewerContent(content);
    setShowFileModal(true);
  };

  const handleSelectMop = (mopId: string, checked: boolean) => {
    const newSelected = new Set(selectedMops);
    if (checked) {
      newSelected.add(mopId);
    } else {
      newSelected.delete(mopId);
    }
    setSelectedMops(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMops(new Set(pendingMops.map(mop => mop.id)));
    } else {
      setSelectedMops(new Set());
    }
  };

  const bulkApprove = () => {
    if (selectedMops.size === 0) {
      showNotification('error', 'Vui lòng chọn ít nhất một MOP để phê duyệt');
      return;
    }
    setShowApproveModal(true);
  };

  const bulkReject = () => {
    if (selectedMops.size === 0) {
      showNotification('error', 'Vui lòng chọn ít nhất một MOP để từ chối');
      return;
    }
    setShowRejectModal(true);
  };

  const confirmBulkApprove = async () => {
    try {
      const mopIds = Array.from(selectedMops);
      
      const response = await fetch('/api/mops/bulk-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          mop_ids: mopIds
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setSelectedMops(new Set());
        fetchPendingMOPs();
        
        if (result.data.failed_mops && result.data.failed_mops.length > 0) {
          showNotification('success', `Phê duyệt hoàn tất! ${result.data.approved_mops.length} MOP thành công, ${result.data.failed_mops.length} MOP thất bại.`);
        } else {
          showNotification('success', `Đã phê duyệt thành công ${result.data.approved_mops.length} MOP!`);
        }
      } else {
        throw new Error(result.message || 'Bulk approve failed');
      }
    } catch (error) {
      console.error('Error bulk approving MOPs:', error);
      showNotification('error', 'Có lỗi xảy ra khi phê duyệt MOPs!');
    } finally {
      setShowApproveModal(false);
    }
  };

  const approveMOPForEdit = async (mopId: string) => {
    setCurrentMopId(mopId);
    setShowSingleApproveModal(true);
  };

  const confirmSingleApprove = async () => {
    if (!currentMopId) return;
    
    try {
      const data = await apiService.post<ApiResponse>(`/api/mops/${currentMopId}/approve`, {});
      if (data.success) {
        showNotification('success', 'MOP đã được phê duyệt thành công');
        fetchPendingMOPs();
      } else {
        showNotification('error', data.error || 'Không thể phê duyệt MOP');
      }
    } catch (error) {
      console.error('Error approving MOP:', error);
      showNotification('error', 'Lỗi khi phê duyệt MOP');
    } finally {
      setShowSingleApproveModal(false);
      setCurrentMopId(null);
    }
  };

  const rejectMOP = (mopId: string) => {
    setCurrentMopId(mopId);
    setShowRejectModal(true);
  };

  const approveCurrentMOPForEdit = () => {
    if (currentMopId) {
      setShowDetailsModal(false);
      approveMOPForEdit(currentMopId);
    }
  };

  const rejectCurrentMOP = () => {
    setShowDetailsModal(false);
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      showNotification('error', 'Vui lòng nhập lý do từ chối');
      return;
    }
    
    try {
      const mopsToReject = selectedMops.size > 0 ? Array.from(selectedMops) : (currentMopId ? [currentMopId] : []);
      
      if (mopsToReject.length === 0) {
        showNotification('error', 'Không có MOP nào được chọn để từ chối');
        return;
      }
      
      const promises = mopsToReject.map(mopId => 
        apiService.post<ApiResponse>(`/api/mops/${mopId}/reject`, {
          comments: rejectReason
        })
      );
      
      const results = await Promise.all(promises);
      const successCount = results.filter(result => result.success).length;
      const failCount = results.length - successCount;
      
      if (successCount > 0) {
        showNotification('success', `Đã từ chối thành công ${successCount} MOP${failCount > 0 ? `, ${failCount} MOP thất bại` : ''}`);
        setSelectedMops(new Set());
        fetchPendingMOPs();
      } else {
        showNotification('error', 'Không thể từ chối MOP nào');
      }
    } catch (error) {
      console.error('Error rejecting MOP:', error);
      showNotification('error', 'Lỗi khi từ chối MOP');
    } finally {
      setShowRejectModal(false);
      setRejectReason('');
      setCurrentMopId(null);
    }
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setShowDetailsModal(true);
  };



  const getMOPTypeBadges = (type: string[]) => {
    const typeMap: { [key: string]: { label: string; class: string } } = {
      'risk': { label: 'Risk Assessment', class: 'badge-warning' },
      'handover': { label: 'Handover Assessment', class: 'badge-info' },
      'risk_handover': { label: 'Risk & Handover Assessment', class: 'badge-primary' }
    };
    
    if (type.includes('risk') && type.includes('handover')) {
      return <span className={`badge ${typeMap['risk_handover'].class} mr-1`}>{typeMap['risk_handover'].label}</span>;
    }
    
    return type.map((t, index) => {
      const typeInfo = typeMap[t] || { label: t, class: 'badge-secondary' };
      return (
        <span key={index} className={`badge ${typeInfo.class} mr-1`}>
          {typeInfo.label}
        </span>
      );
    });
  };

  return (
    <>
      {/* Notification */}
      {notification && (
        <div className={`alert alert-${notification.type} alert-dismissible fade show`} role="alert" style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          minWidth: '300px'
        }}>
          {notification.message}
          <button type="button" className="close" onClick={() => setNotification(null)}>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}
      
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">MOP Review</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item active">MOP Review</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-eye mr-2"></i>
                    Pending MOP Reviews
                  </h3>
                  {pendingMops.length > 0 && (
                    <div className="card-tools">
                      <div className="btn-group">
                        <button 
                          className="btn btn-success btn-sm" 
                          onClick={bulkApprove}
                          disabled={selectedMops.size === 0}
                        >
                          <i className="fas fa-check mr-1"></i>
                          Bulk Approve ({selectedMops.size})
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          onClick={bulkReject}
                          disabled={selectedMops.size === 0}
                        >
                          <i className="fas fa-times mr-1"></i>
                          Bulk Reject ({selectedMops.size})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-4">
                      <i className="fas fa-spinner fa-spin fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">Loading pending MOPs...</h5>
                    </div>
                  ) : pendingMops.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped">
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}>
                              <div className="custom-control custom-checkbox">
                                <input 
                                  type="checkbox" 
                                  className="custom-control-input" 
                                  id="selectAll"
                                  checked={selectedMops.size === pendingMops.length && pendingMops.length > 0}
                                  onChange={(e) => handleSelectAll(e.target.checked)}
                                />
                                <label className="custom-control-label" htmlFor="selectAll"></label>
                              </div>
                            </th>
                            <th>MOP ID</th>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Submitted By</th>
                            <th>Submitted Date</th>
                            <th>Files</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingMops.map((mop) => (
                            <tr key={mop.id}>
                              <td>
                                <div className="custom-control custom-checkbox">
                                  <input 
                                    type="checkbox" 
                                    className="custom-control-input" 
                                    id={`mop-${mop.id}`}
                                    checked={selectedMops.has(mop.id)}
                                    onChange={(e) => handleSelectMop(mop.id, e.target.checked)}
                                  />
                                  <label className="custom-control-label" htmlFor={`mop-${mop.id}`}></label>
                                </div>
                              </td>
                              <td><strong>#{mop.id}</strong></td>
                              <td>{mop.name}</td>
                              <td>{getMOPTypeBadges(mop.type)}</td>
                              <td>{mop.creator?.username || 'Unknown'}</td>
                              <td>{new Date(mop.created_at).toLocaleString()}</td>
                              <td>
                                {mop.files?.pdf && <span className="badge badge-info mr-1">PDF</span>}
                                {mop.files?.appendix && <span className="badge badge-info mr-1">CSV</span>}
                              </td>
                              <td>
                                <div className="btn-group">
                                  <button 
                                    className="btn btn-sm btn-info" 
                                    onClick={() => viewMOPDetails(mop.id)}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-success" 
                                    onClick={() => approveMOPForEdit(mop.id)}
                                  >
                                    <i className="fas fa-edit mr-1"></i>Approve for Edit
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-danger" 
                                    onClick={() => rejectMOP(mop.id)}
                                  >
                                    <i className="fas fa-times mr-1"></i>Reject
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
                      <h5 className="text-muted">No Pending MOPs</h5>
                      <p className="text-muted">All submitted MOPs have been reviewed.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MOP Details Modal */}
      {showDetailsModal && currentMop && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">MOP Details</h5>
                <button type="button" className="close" onClick={() => setShowDetailsModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6">
                    <h6><strong>MOP Information:</strong></h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr><td><strong>ID:</strong></td><td>{currentMop.id}</td></tr>
                        <tr><td><strong>Name:</strong></td><td>{currentMop.name}</td></tr>
                        <tr><td><strong>Status:</strong></td><td><span className="badge badge-warning">{currentMop.status}</span></td></tr>
                        <tr><td><strong>Created:</strong></td><td>{new Date(currentMop.created_at).toLocaleString()}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="col-md-6">
                    <h6><strong>Files:</strong></h6>
                    <ul className="list-unstyled">
                      {currentMop.files && (currentMop.files.pdf || currentMop.files.appendix) ? (
                        <>
                          {currentMop.files.pdf && (
                            <li className="mb-2">
                              <i className="fas fa-file-pdf mr-2"></i>
                              PDF File
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'pdf')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/pdf`} 
                                    className="btn btn-sm btn-outline-secondary" 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <i className="fas fa-download mr-1"></i>Download
                                  </a>
                                </div>
                              )}
                              {!isAdmin && (
                                <a 
                                  href={`/api/mops/${currentMop.id}/files/pdf`} 
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>Download
                                </a>
                              )}
                            </li>
                          )}
                          {currentMop.files.appendix && (
                            <li className="mb-2">
                              <i className="fas fa-file-csv mr-2"></i>
                              Appendix File (CSV)
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'appendix')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/appendix`} 
                                    className="btn btn-sm btn-outline-secondary" 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <i className="fas fa-download mr-1"></i>Download
                                  </a>
                                </div>
                              )}
                              {!isAdmin && (
                                <a 
                                  href={`/api/mops/${currentMop.id}/files/appendix`} 
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>Download
                                </a>
                              )}
                            </li>
                          )}
                        </>
                      ) : (
                        <li>No files</li>
                      )}
                    </ul>
                  </div>
                </div>
                
                {currentMop.commands && currentMop.commands.length > 0 && (
                  <div className="row mt-3">
                    <div className="col-md-12">
                      <h6><strong>Commands:</strong></h6>
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead className="thead-dark">
                            <tr>
                              <th style={{ width: '8%' }}>STT</th>
                              <th style={{ width: '25%' }}>Tên Command</th>
                              <th style={{ width: '35%' }}>Câu lệnh</th>
                              <th style={{ width: '32%' }}>Giá trị đối chiếu</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentMop.commands.map((cmd, index) => (
                              <tr key={index}>
                                <td className="text-center">{index + 1}</td>
                                <td><strong>{cmd.title}</strong></td>
                                <td><code className="text-wrap">{cmd.command}</code></td>
                                <td><small className="text-muted">{cmd.reference_value || 'N/A'}</small></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>Close</button>
                <button type="button" className="btn btn-success" onClick={approveCurrentMOPForEdit}>
                  <i className="fas fa-edit mr-2"></i>Approve for Edit
                </button>
                <button type="button" className="btn btn-danger" onClick={rejectCurrentMOP}>
                  <i className="fas fa-times mr-2"></i>Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single MOP Approve Modal */}
      {showSingleApproveModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Xác nhận phê duyệt MOP</h5>
                <button type="button" className="close" onClick={() => setShowSingleApproveModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>Bạn có chắc chắn muốn phê duyệt MOP này không?</p>
                <p className="text-muted">MOP sẽ được chuyển sang trạng thái "approved" và có thể chỉnh sửa.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSingleApproveModal(false)}>Hủy</button>
                <button type="button" className="btn btn-success" onClick={confirmSingleApprove}>
                  <i className="fas fa-check mr-2"></i>Phê duyệt MOP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Approve Confirmation Modal */}
      {showApproveModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm Bulk Approval</h5>
                <button type="button" className="close" onClick={() => setShowApproveModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>Bạn có chắc chắn muốn phê duyệt <strong>{selectedMops.size}</strong> MOP đã chọn?</p>
                <p className="text-muted">Các MOP này sẽ được chuyển sang trạng thái "approved" và có thể chỉnh sửa.</p>
                <p className="text-warning"><strong>Lưu ý:</strong> Bulk approve sẽ sử dụng thông tin mặc định. Để thiết lập thông tin chi tiết, vui lòng phê duyệt từng MOP riêng lẻ.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowApproveModal(false)}>Hủy</button>
                <button type="button" className="btn btn-success" onClick={confirmBulkApprove}>
                  <i className="fas fa-check mr-2"></i>Phê duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {selectedMops.size > 0 ? `Reject ${selectedMops.size} MOPs` : 'Reject MOP'}
                </h5>
                <button type="button" className="close" onClick={() => setShowRejectModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="rejectReason"><strong>Rejection Reason:</strong></label>
                  <textarea 
                    className="form-control" 
                    id="rejectReason" 
                    rows={4} 
                    placeholder="Please provide a reason for rejection..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={confirmReject}>
                  <i className="fas fa-times mr-2"></i>Reject MOP{selectedMops.size > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {showFileModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{fileViewerTitle}</h5>
                <button type="button" className="close" onClick={closeFileModal}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body p-0">
                <div dangerouslySetInnerHTML={{ __html: fileViewerContent }} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeFileModal}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MOPReview;