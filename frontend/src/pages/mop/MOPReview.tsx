import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import { useTranslation } from '../../i18n/useTranslation'

interface Command {
  id?: number;
  command_id_ref?: string; // ID column
  title: string; // Name column
  command: string; // Command column
  command_text?: string;
  description?: string;
  extract_method?: string; // Extract column
  comparator_method?: string; // Comparator column
  reference_value?: string; // Reference Value column
  expected_output?: string;
  is_critical?: boolean;
  order_index?: number;
  rollback_command?: string | null;
  timeout_seconds?: number;
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
    xlsx?: boolean;
    xls?: boolean;
    csv?: boolean;
    txt?: boolean;
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  // Persisted state management with unique keys for MOP Review
  const [pendingMops, setPendingMops] = usePersistedState<MOP[]>('review_pendingMops', [], { autoSave: true, autoSaveInterval: 30000 });
  const [currentMop, setCurrentMop] = usePersistedState<MOP | null>('review_currentMop', null);
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
  
  // Non-persisted modal states - should not be saved to localStorage
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showSingleApproveModal, setShowSingleApproveModal] = useState(false);
  const [currentMopId, setCurrentMopId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectReasonError, setRejectReasonError] = useState<string>('');
  const [fileViewerTitle, setFileViewerTitle] = useState<string>('');
  const [fileViewerContent, setFileViewerContent] = useState<string>('');
  
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
    
    // Clear old persisted modal states that might cause conflicts
    localStorage.removeItem('review_currentMopId');
    localStorage.removeItem('review_rejectReason');
    localStorage.removeItem('review_fileViewerTitle');
    localStorage.removeItem('review_fileViewerContent');
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
    // Reset all other modals
    setShowFileModal(false);
    setShowApproveModal(false);
    setShowRejectModal(false);
    setShowSingleApproveModal(false);
    
    try {
      const data = await apiService.get<ApiResponse>(API_ENDPOINTS.MOPS.DETAIL(mopId));
      if (data.success && data.data && typeof data.data === 'object' && 'id' in data.data) {
        setCurrentMop(data.data as MOP);
        setShowDetailsModal(true);
      } else {
        showNotification('error', 'Error loading MOP details');
      }
    } catch (error) {
      console.error('Error loading MOP details:', error);
      showNotification('error', 'Error loading MOP details');
    }
  };

  const viewMOPFile = async (mopId: string, fileType: string) => {
    // Reset all modals first
    setShowDetailsModal(false);
    setShowApproveModal(false);
    setShowRejectModal(false);
    setShowSingleApproveModal(false);
    
    const title = (fileType?.toUpperCase() || 'Unknown') + ' File';
    
    let content = '';
    
    if (fileType === 'pdf') {
      // Show loading first
      content = `
        <div class="text-center py-5" style="height: 70vh;">
            <div class="spinner-border text-primary" role="status">
              <span class="sr-only">${t('loading')}</span>
            </div>
            <p class="mt-2 text-muted">${t('loadingPDF')}</p>
          </div>
      `;
      
      setFileViewerTitle(title);
      setFileViewerContent(content);
      setShowFileModal(true);
      
      try {
        // Use direct URL with authentication token as query parameter
        const token = localStorage.getItem('token');
        const pdfUrl = `/api/mops/${mopId}/files/${fileType}?token=${encodeURIComponent(token || '')}`;
        
        // Test if the URL is accessible
        const testResponse = await fetch(pdfUrl, {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (testResponse.ok) {
          content = `
            <div style="height: 70vh; width: 100%;">
              <object 
                data="${pdfUrl}" 
                type="application/pdf" 
                width="100%" 
                height="100%"
                style="border: none;"
              >
                <div class="text-center py-5">
                  <i class="fas fa-file-pdf fa-4x text-danger mb-3"></i>
                  <h5>${t('pdfPreviewNotAvailable')}</h5>
                  <p class="text-muted">${t('browserNotSupportPDF')}</p>
                  <a href="${pdfUrl}" class="btn btn-primary" target="_blank">
                    <i class="fas fa-external-link-alt mr-2"></i>${t('openInNewTab')}
                  </a>
                </div>
              </object>
            </div>
          `;
        } else {
          content = `
            <div class="text-center py-5">
              <i class="fas fa-exclamation-triangle fa-4x text-danger mb-3"></i>
              <h5>${t('failedToLoadPDF')}</h5>
            <p class="text-muted">${t('error')}: ${testResponse.status} ${testResponse.statusText}</p>
            <a href="${pdfUrl}" class="btn btn-primary" target="_blank">
              <i class="fas fa-download mr-2"></i>${t('tryDownload')}
            </a>
            </div>
          `;
        }
      } catch (error) {
        console.error('Error loading PDF:', error);
        const token = localStorage.getItem('token');
        const pdfUrl = `/api/mops/${mopId}/files/${fileType}?token=${encodeURIComponent(token || '')}`;
        content = `
          <div class="text-center py-5">
            <i class="fas fa-exclamation-triangle fa-4x text-danger mb-3"></i>
            <h5>${t('failedToLoadPDF')}</h5>
            <p class="text-muted">${t('networkErrorOccurred')}</p>
            <a href="${pdfUrl}" class="btn btn-primary" target="_blank">
              <i class="fas fa-download mr-2"></i>${t('tryDownload')}
            </a>
          </div>
        `;
      }
      
      setFileViewerContent(content);
    } else if (['appendix', 'xlsx', 'xls', 'csv', 'txt'].includes(fileType)) {
      let icon = 'fas fa-file fa-4x text-primary mb-3';
      let description = 'This file cannot be previewed directly';
      
      if (fileType === 'xlsx' || fileType === 'xls') {
        icon = 'fas fa-file-excel fa-4x text-success mb-3';
        description = t('excelCannotPreview');
      } else if (fileType === 'csv') {
        icon = 'fas fa-file-csv fa-4x text-info mb-3';
        description = t('csvCannotPreview');
      } else if (fileType === 'txt') {
        icon = 'fas fa-file-alt fa-4x text-secondary mb-3';
        description = t('textCannotPreview');
      } else if (fileType === 'appendix') {
        icon = 'fas fa-file-excel fa-4x text-success mb-3';
        description = t('appendixCannotPreview');
      }
      
      content = `
        <div class="text-center py-5">
          <i class="${icon}"></i>
          <h5>${description}</h5>
          <p class="text-muted">${t('pleaseDownloadToView')}</p>
          <a href="/api/mops/${mopId}/files/${fileType}?token=${encodeURIComponent(localStorage.getItem('token') || '')}" class="btn btn-primary" target="_blank">
            <i class="fas fa-download mr-2"></i>${t('downloadFile')}
          </a>
        </div>
      `;
      
      setFileViewerTitle(title);
      setFileViewerContent(content);
      setShowFileModal(true);
    } else {
      content = `
        <div class="text-center py-5">
          <i class="fas fa-exclamation-triangle fa-4x text-warning mb-3"></i>
          <h5>${t('unsupportedFileType')}</h5>
          <p class="text-muted">${t('cannotPreviewFileType')}</p>
          <a href="/api/mops/${mopId}/files/${fileType}?token=${encodeURIComponent(localStorage.getItem('token') || '')}" class="btn btn-primary" target="_blank">
            <i class="fas fa-download mr-2"></i>${t('downloadFile')}
          </a>
        </div>
      `;
      
      setFileViewerTitle(title);
      setFileViewerContent(content);
      setShowFileModal(true);
    }
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
      showNotification('error', t('pleaseSelectAtLeastOneMOPToApprove'));
      return;
    }
    setShowApproveModal(true);
  };

  const bulkReject = () => {
    if (selectedMops.size === 0) {
      showNotification('error', t('pleaseSelectAtLeastOneMOPToReject'));
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
        
        if (result.data && result.data.failed_mops && result.data.failed_mops.length > 0) {
          showNotification('success', t('bulkApproveCompleteWithFailures', { approved: result.data.approved_mops.length, failed: result.data.failed_mops.length }));
        } else if (result.data && result.data.approved_mops) {
          showNotification('success', t('bulkApproveSuccess', { count: result.data.approved_mops.length }));
        } else {
          showNotification('success', t('mopApprovedSuccessfully'));
        }
      } else {
        const errorMessage = typeof result.message === 'string' ? result.message : t('errorApprovingMOPs');
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error bulk approving MOPs:', error);
      const errorMessage = error instanceof Error ? error.message : t('errorApprovingMOPs');
      showNotification('error', errorMessage);
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
        showNotification('success', t('mopApprovedSuccessfully'));
        fetchPendingMOPs();
      } else {
        const errorMessage = typeof data.error === 'string' ? data.error : t('cannotApproveMOP');
        showNotification('error', errorMessage);
      }
    } catch (error) {
      console.error('Error approving MOP:', error);
      const errorMessage = error instanceof Error ? error.message : t('errorApprovingMOP');
      showNotification('error', errorMessage);
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
      setRejectReasonError(t('pleaseEnterRejectReason'));
      return;
    }
    
    setRejectReasonError('');
    
    try {
      const mopsToReject = selectedMops.size > 0 ? Array.from(selectedMops) : (currentMopId ? [currentMopId] : []);
      
      if (mopsToReject.length === 0) {
        showNotification('error', t('noMOPSelectedToReject'));
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
        showNotification('success', t('rejectSuccess', { success: successCount, fail: failCount }));
        setSelectedMops(new Set());
        fetchPendingMOPs();
      } else {
        showNotification('error', t('cannotRejectAnyMOP'));
      }
    } catch (error) {
      console.error('Error rejecting MOP:', error);
      showNotification('error', t('errorRejectingMOP'));
    } finally {
      setShowRejectModal(false);
      setRejectReason('');
      setRejectReasonError('');
      setCurrentMopId(null);
    }
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setFileViewerTitle('');
    setFileViewerContent('');
    // Reopen details modal if we have a current MOP
    if (currentMop) {
      setShowDetailsModal(true);
    }
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
              <h1 className="m-0">{t('mopReview')}</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item active">{t('mopReview')}</li>
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
                    {t('pendingMOPReviews')}
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
                          {t('bulkApprove')} ({selectedMops.size})
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          onClick={bulkReject}
                          disabled={selectedMops.size === 0}
                        >
                          <i className="fas fa-times mr-1"></i>
                          {t('bulkReject')} ({selectedMops.size})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-4">
                      <i className="fas fa-spinner fa-spin fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">{t('loadingPendingMOPs')}</h5>
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
                            <th>{t('mopID')}</th>
                            <th>{t('name')}</th>
                            <th>{t('type')}</th>
                            <th>{t('submittedBy')}</th>
                            <th>{t('submittedDate')}</th>
                            <th>{t('files')}</th>
                            <th>{t('actions')}</th>
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
                                    <i className="fas fa-eye mr-1"></i>{t('view')}
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-success" 
                                    onClick={() => approveMOPForEdit(mop.id)}
                                  >
                                    <i className="fas fa-edit mr-1"></i>{t('approveForEdit')}
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-danger" 
                                    onClick={() => rejectMOP(mop.id)}
                                  >
                                    <i className="fas fa-times mr-1"></i>{t('reject')}
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
                      <h5 className="text-muted">{t('noPendingMOPs')}</h5>
                      <p className="text-muted">{t('allMOPsReviewed')}</p>
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
                <h5 className="modal-title">{t('mopDetails')}</h5>
                <button type="button" className="close" onClick={() => setShowDetailsModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="row">
                  <div className="col-md-6">
                    <h6><strong>{t('mopInformation')}:</strong></h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr><td><strong>{t('id')}:</strong></td><td>{currentMop.id}</td></tr>
                        <tr><td><strong>{t('name')}:</strong></td><td>{currentMop.name}</td></tr>
                        <tr><td><strong>{t('status')}:</strong></td><td><span className="badge badge-warning">{currentMop.status}</span></td></tr>
                        <tr><td><strong>{t('created')}:</strong></td><td>{new Date(currentMop.created_at).toLocaleString()}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="col-md-6">
                    <h6><strong>{t('files')}:</strong></h6>
                    <ul className="list-unstyled">
                      {currentMop.files && (currentMop.files.pdf || currentMop.files.appendix || currentMop.files.xlsx || currentMop.files.xls || currentMop.files.csv || currentMop.files.txt) ? (
                        <>
                          {currentMop.files.pdf && (
                            <li className="mb-2">
                              <i className="fas fa-file-pdf mr-2"></i>
                              {t('pdfFile')}
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'pdf')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>{t('view')}
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/pdf?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
                                    className="btn btn-sm btn-outline-secondary" 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <i className="fas fa-download mr-1"></i>{t('download')}
                                  </a>
                                </div>
                              )}
                              {!isAdmin && (
                                <a 
                                  href={`/api/mops/${currentMop.id}/files/pdf?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                              {t('appendixFile')}
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'appendix')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/appendix?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                                  href={`/api/mops/${currentMop.id}/files/appendix?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>Download
                                </a>
                              )}
                            </li>
                          )}
                          {currentMop.files.xlsx && (
                            <li className="mb-2">
                              <i className="fas fa-file-excel mr-2"></i>
                              Excel File (XLSX)
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'xlsx')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/xlsx?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                                  href={`/api/mops/${currentMop.id}/files/xlsx?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>Download
                                </a>
                              )}
                            </li>
                          )}
                          {currentMop.files.xls && (
                            <li className="mb-2">
                              <i className="fas fa-file-excel mr-2"></i>
                              Excel File (XLS)
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'xls')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/xls?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                                  href={`/api/mops/${currentMop.id}/files/xls?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>Download
                                </a>
                              )}
                            </li>
                          )}
                          {currentMop.files.csv && (
                            <li className="mb-2">
                              <i className="fas fa-file-csv mr-2"></i>
                              CSV File
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'csv')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/csv?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                                  href={`/api/mops/${currentMop.id}/files/csv?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>Download
                                </a>
                              )}
                            </li>
                          )}
                          {currentMop.files.txt && (
                            <li className="mb-2">
                              <i className="fas fa-file-alt mr-2"></i>
                              Text File
                              {isAdmin && (
                                <div className="btn-group btn-group-sm ml-2">
                                  <button 
                                    className="btn btn-sm btn-outline-primary" 
                                    onClick={() => viewMOPFile(currentMop.id, 'txt')}
                                  >
                                    <i className="fas fa-eye mr-1"></i>View
                                  </button>
                                  <a 
                                    href={`/api/mops/${currentMop.id}/files/txt?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                                  href={`/api/mops/${currentMop.id}/files/txt?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} 
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
                        <li>{t('noFiles')}</li>
                      )}
                    </ul>
                  </div>
                </div>
                
                {currentMop.commands && currentMop.commands.length > 0 && (
                  <div className="row mt-3">
                    <div className="col-md-12">
                      <h6><strong>{t('commands')}:</strong></h6>
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead className="thead-dark">
                            <tr>
                              <th style={{ width: '5%' }}>STT</th>
                              <th style={{ width: '10%' }}>ID Ref</th>
                              <th style={{ width: '25%' }}>Command name</th>
                              <th style={{ width: '30%' }}>Command</th>
                              <th style={{ width: '15%' }}>Comparator</th>
                              <th style={{ width: '15%' }}>Reference Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentMop.commands.map((cmd, index) => (
                              <tr key={index}>
                                <td className="text-center">{index + 1}</td>
                                <td><small className="text-muted">{cmd.command_id_ref || '-'}</small></td>
                                <td><strong>{cmd.title}</strong></td>
                                <td><code className="text-wrap">{cmd.command}</code></td>
                                <td><small className="text-muted">{cmd.comparator_method || '-'}</small></td>
                                <td><small className="text-muted">{cmd.reference_value || '-'}</small></td>
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
                <button type="button" className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>{t('close')}</button>
                <button type="button" className="btn btn-success" onClick={approveCurrentMOPForEdit}>
                  <i className="fas fa-edit mr-2"></i>{t('approveForEdit')}
                </button>
                <button type="button" className="btn btn-danger" onClick={rejectCurrentMOP}>
                  <i className="fas fa-times mr-2"></i>{t('reject')}
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
                <h5 className="modal-title">{t('confirmMOPApproval')}</h5>
                <button type="button" className="close" onClick={() => setShowSingleApproveModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>{t('confirmApprovalQuestion')}</p>
                <p className="text-muted">{t('mopWillBeApproved')}</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSingleApproveModal(false)}>{t('cancel')}</button>
                <button type="button" className="btn btn-success" onClick={confirmSingleApprove}>
                  <i className="fas fa-check mr-2"></i>{t('approveMOP')}
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
                <h5 className="modal-title">{t('confirmBulkApproval')}</h5>
                <button type="button" className="close" onClick={() => setShowApproveModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>{t('confirmBulkApprovalQuestion', { count: selectedMops.size })}</p>
                <p className="text-muted">{t('mopsWillBeApproved')}</p>
                <p className="text-warning"><strong>{t('note')}:</strong> {t('bulkApproveNote')}</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowApproveModal(false)}>{t('cancel')}</button>
                <button type="button" className="btn btn-success" onClick={confirmBulkApprove}>
                  <i className="fas fa-check mr-2"></i>{t('approve')}
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
                  {selectedMops.size > 0 ? t('rejectMOPs', { count: selectedMops.size }) : t('rejectMOP')}
                </h5>
                <button type="button" className="close" onClick={() => setShowRejectModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="rejectReason"><strong>{t('rejectionReason')}:</strong></label>
                  <textarea 
                    className={`form-control ${rejectReasonError ? 'is-invalid' : ''}`}
                    id="rejectReason" 
                    rows={4} 
                    placeholder={t('pleaseProvideRejectReason')}
                    value={rejectReason}
                    onChange={(e) => {
                      setRejectReason(e.target.value);
                      if (rejectReasonError) setRejectReasonError('');
                    }}
                  />
                  {rejectReasonError && (
                    <div className="invalid-feedback">
                      {rejectReasonError}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>{t('cancel')}</button>
                <button type="button" className="btn btn-danger" onClick={confirmReject}>
                  <i className="fas fa-times mr-2"></i>{selectedMops.size > 1 ? t('rejectMOPs', { count: selectedMops.size }) : t('rejectMOP')}
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
                <button type="button" className="btn btn-secondary" onClick={closeFileModal}>{t('close')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MOPReview;