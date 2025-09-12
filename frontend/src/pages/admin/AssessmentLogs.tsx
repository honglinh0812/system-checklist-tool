import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { logService, type AssessmentLogDirectory, type AssessmentLogContent } from '../../services/logService';
import { Modal, LoadingSpinner, ErrorMessage } from '../../components/common';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useTranslation } from '../../i18n/useTranslation';

const AssessmentLogs: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  // Persisted state management
  const [assessmentDirs, setAssessmentDirs] = usePersistedState<AssessmentLogDirectory[]>('assessment_dirs', [], { autoSave: true });
  const [selectedDir, setSelectedDir] = usePersistedState<string | null>('selected_assessment_dir', null);
  const [selectedFile, setSelectedFile] = usePersistedState<string | null>('selected_assessment_file', null);
  const [logContent, setLogContent] = usePersistedState<AssessmentLogContent | null>('assessment_log_content', null);
  
  // Non-persisted states
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showContentModal, setShowContentModal] = useState(false);

  // Check if user has access
  if (!user || !['admin', 'user', 'viewer'].includes(user.role)) {
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
    fetchAssessmentDirs();
  }, []);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const fetchAssessmentDirs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await logService.getAssessmentLogs();
      setAssessmentDirs(response);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load assessment logs');
    } finally {
      setLoading(false);
    }
  };

  const handleViewContent = async (dirName: string, fileName: string) => {
    try {
      setContentLoading(true);
      setSelectedDir(dirName);
      setSelectedFile(fileName);
      const content = await logService.getAssessmentLogContent(dirName, fileName);
      setLogContent(content);
      setShowContentModal(true);
    } catch (err: any) {
      showAlert('error', err.response?.data?.message || 'Failed to load log content');
    } finally {
      setContentLoading(false);
    }
  };

  const handleDownloadFile = async (dirName: string, fileName: string) => {
    try {
      await logService.downloadAssessmentLog(dirName, fileName);
      showAlert('success', 'File downloaded successfully');
    } catch (err: any) {
      showAlert('error', err.response?.data?.message || 'Failed to download file');
    }
  };

  const handleDownloadAll = async (dirName: string) => {
    try {
      await logService.downloadAllAssessmentLogs(dirName);
      showAlert('success', 'All files downloaded successfully');
    } catch (err: any) {
      showAlert('error', err.response?.data?.message || 'Failed to download files');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Parse assessment results from log content
  const parseAssessmentResults = (content: string) => {
    try {
      // Try to find JSON data in the log content
      const jsonMatch = content.match(/\{[\s\S]*"test_results"[\s\S]*\}/g);
      if (jsonMatch) {
        const lastMatch = jsonMatch[jsonMatch.length - 1];
        return JSON.parse(lastMatch);
      }
      return null;
    } catch (error) {
      console.error('Error parsing assessment results:', error);
      return null;
    }
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <LoadingSpinner text="Loading assessment logs..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid">
        <ErrorMessage message={error} />
        <button className="btn btn-primary mt-2" onClick={fetchAssessmentDirs}>
          <i className="fas fa-retry me-2"></i>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">
            <i className="fas fa-file-alt me-2"></i>
            Assessment Logs
          </h2>
          <p className="text-muted mb-0">View and manage assessment execution logs</p>
        </div>
        <button 
          className="btn btn-outline-primary"
          onClick={fetchAssessmentDirs}
          disabled={loading}
        >
          <i className="fas fa-sync-alt me-2"></i>
          Refresh
        </button>
      </div>

      {/* Alert */}
      {alert && (
        <div className={`alert alert-${alert.type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`}>
          {alert.message}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setAlert(null)}
          ></button>
        </div>
      )}

      {/* Assessment Directories */}
      <div className="row">
        {assessmentDirs.length === 0 ? (
          <div className="col-12">
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              No assessment logs found.
            </div>
          </div>
        ) : (
          assessmentDirs.map((dir) => (
            <div key={dir.name} className="col-lg-6 col-xl-4 mb-4">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="card-title mb-0">
                    <i className="fas fa-folder me-2"></i>
                    {dir.name}
                  </h5>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => handleDownloadAll(dir.name)}
                    title="Download all files as ZIP"
                  >
                    <i className="fas fa-download"></i>
                  </button>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <small className="text-muted">
                      <i className="fas fa-calendar me-1"></i>
                      Created: {formatDate(dir.created_at)}
                    </small>
                    <br />
                    <small className="text-muted">
                      <i className="fas fa-file me-1"></i>
                      {dir.files.length} file(s)
                    </small>
                  </div>
                  
                  {/* Files List */}
                  <div className="list-group list-group-flush">
                    {dir.files.map((fileName) => (
                      <div key={fileName} className="list-group-item px-0 py-2">
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="flex-grow-1">
                            <div className="fw-medium">{fileName}</div>
                          </div>
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-outline-info"
                              onClick={() => handleViewContent(dir.name, fileName)}
                              disabled={contentLoading}
                              title="View content"
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                            <button
                              className="btn btn-outline-primary"
                              onClick={() => handleDownloadFile(dir.name, fileName)}
                              title="Download file"
                            >
                              <i className="fas fa-download"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Content Modal */}
      <Modal
        show={showContentModal}
        onHide={() => setShowContentModal(false)}
        size="xl"
        title={`Log Content: ${selectedFile}`}
      >
        <div className="modal-body">
          {contentLoading ? (
            <LoadingSpinner text="Loading content..." />
          ) : logContent ? (
            <div>
              <div className="mb-3">
                <small className="text-muted">
                  <strong>File:</strong> {logContent.filename} • 
                  <strong>Size:</strong> {formatFileSize(logContent.size)} • 
                  <strong>Modified:</strong> {formatDate(logContent.modified_at)}
                </small>
              </div>
              
              {/* Assessment Summary if parseable */}
              {(() => {
                const assessmentResults = parseAssessmentResults(logContent.content);
                return assessmentResults ? (
                  <div className="mb-4">
                    <h6 className="mb-3">
                      <i className="fas fa-chart-line me-2"></i>
                      Assessment Summary
                    </h6>
                    
                  </div>
                ) : null;
              })()}
              
              <h6 className="mb-3">
                <i className="fas fa-file-alt me-2"></i>
                Raw Log Content
              </h6>
              <pre className="bg-light p-3 rounded" style={{ maxHeight: '500px', overflow: 'auto' }}>
                {logContent.content}
              </pre>
            </div>
          ) : (
            <div className="alert alert-warning">
              No content available
            </div>
          )}
        </div>
        <div className="modal-footer">
          {selectedDir && selectedFile && (
            <button
              className="btn btn-primary"
              onClick={() => handleDownloadFile(selectedDir, selectedFile)}
            >
              <i className="fas fa-download me-2"></i>
              Download File
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => setShowContentModal(false)}
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AssessmentLogs;