import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';

interface SubmissionStatus {
  type: 'success' | 'error' | null;
  message: string;
  mopId?: string;
  status?: string;
}

const MOPSubmission: React.FC = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>({ type: null, message: '' });
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [formData, setFormData] = useState({
    mopName: '',
    assessmentType: 'handover_assessment' as 'handover_assessment' | 'risk_assessment',
    pdfFile: null as File | null,
    appendixFile: null as File | null,
    description: ''
  });
  const [fileNames, setFileNames] = useState({
    pdfFile: 'Choose PDF file',
    appendixFile: 'Choose Excel/CSV/TXT file'
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'pdfFile' | 'appendixFile') => {
    const file = e.target.files?.[0] || null;
    const fileName = file?.name || (fileType === 'pdfFile' ? 'Choose PDF file' : 'Choose Excel/CSV/TXT file');
    
    setFormData(prev => ({ ...prev, [fileType]: file }));
    setFileNames(prev => ({ ...prev, [fileType]: fileName }));
  };

  const handleMopNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, mopName: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, description: e.target.value }));
  };

  const handleAssessmentTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, assessmentType: e.target.value as 'handover_assessment' | 'risk_assessment' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.mopName.trim()) {
      setSubmissionStatus({
        type: 'error',
        message: 'Please enter MOP name.'
      });
      setShowStatusModal(true);
      return;
    }
    
    if (!formData.pdfFile || !formData.appendixFile) {
      setSubmissionStatus({
        type: 'error',
        message: 'Please select both PDF and appendix files.'
      });
      setShowStatusModal(true);
      return;
    }

    setIsSubmitting(true);
    
    const submitFormData = new FormData();
    submitFormData.append('mop_name', formData.mopName);
    submitFormData.append('assessment_type', formData.assessmentType);
    submitFormData.append('pdf_file', formData.pdfFile);
    submitFormData.append('appendix_file', formData.appendixFile);
    submitFormData.append('description', formData.description);

    try {
      const response = await apiService.upload<any>(API_ENDPOINTS.MOPS.UPLOAD, submitFormData);
      
      // Backend returns success response with data field containing message
      if (response && response.success && response.data) {
        setSubmissionStatus({
          type: 'success',
          message: 'MOP submitted successfully.',
          mopId: response.data.mop_id,
          status: response.data.status
        });
        // Reset form
        setFormData({ mopName: '', assessmentType: 'handover_assessment', pdfFile: null, appendixFile: null, description: '' });
        setFileNames({ pdfFile: 'Choose PDF file', appendixFile: 'Choose Excel/CSV/TXT file' });
      } else {
        setSubmissionStatus({
          type: 'error',
          message: response.message || 'Failed to submit MOP'
        });
      }
    } catch (error) {
      console.error('Error submitting MOP:', error);
      setSubmissionStatus({
        type: 'error',
        message: 'Failed to submit MOP. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
      setShowStatusModal(true);
    }
  };

  const downloadTemplate = () => {
    window.open('/api/template/mop-appendix', '_blank');
  };

  const closeModal = () => {
    setShowStatusModal(false);
    setSubmissionStatus({ type: null, message: '' });
  };

  return (
    <>
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">MOP Submission</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>Home</a>
                </li>
                <li className="breadcrumb-item active">MOP Submission</li>
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
                    <i className="fas fa-upload mr-2"></i>
                    Submit New MOP
                  </h3>
                </div>
                <div className="card-body">
                  <form onSubmit={handleSubmit}>
                    {/* MOP Name Field */}
                    <div className="row">
                      <div className="col-md-12">
                        <div className="form-group">
                          <label htmlFor="mopName"><strong>MOP Name:</strong></label>
                          <input 
                            type="text" 
                            className="form-control" 
                            id="mopName" 
                            placeholder="Enter MOP name"
                            value={formData.mopName}
                            onChange={handleMopNameChange}
                            required
                          />
                          <small className="form-text text-muted">Enter a descriptive name for this MOP</small>
                        </div>
                      </div>
                    </div>

                    {/* Assessment Type Field */}
                    <div className="row">
                      <div className="col-md-12">
                        <div className="form-group">
                          <label><strong>Loại đánh giá:</strong></label>
                          <div className="mt-2">
                            <div className="form-check form-check-inline">
                              <input 
                                className="form-check-input" 
                                type="radio" 
                                name="assessmentType" 
                                id="risk_assessment" 
                                value="risk_assessment"
                                checked={formData.assessmentType === 'risk_assessment'}
                                onChange={handleAssessmentTypeChange}
                              />
                              <label className="form-check-label" htmlFor="risk_assessment">
                                Đánh giá rủi ro
                              </label>
                            </div>
                            <div className="form-check form-check-inline">
                              <input 
                                className="form-check-input" 
                                type="radio" 
                                name="assessmentType" 
                                id="handover_assessment" 
                                value="handover_assessment"
                                checked={formData.assessmentType === 'handover_assessment'}
                                onChange={handleAssessmentTypeChange}
                              />
                              <label className="form-check-label" htmlFor="handover_assessment">
                                Đánh giá bàn giao
                              </label>
                            </div>
                          </div>
                          <small className="form-text text-muted">Chọn loại đánh giá cho MOP này</small>
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <label htmlFor="pdfFile"><strong>PDF File:</strong></label>
                          <div className="input-group">
                            <div className="custom-file">
                              <input 
                                type="file" 
                                className="custom-file-input" 
                                id="pdfFile" 
                                accept=".pdf" 
                                required
                                onChange={(e) => handleFileChange(e, 'pdfFile')}
                              />
                              <label className="custom-file-label" htmlFor="pdfFile">
                                {fileNames.pdfFile}
                              </label>
                            </div>
                          </div>
                          <small className="form-text text-muted">Upload the MOP PDF document</small>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <label htmlFor="appendixFile"><strong>Appendix File:</strong></label>
                          <div className="input-group">
                            <div className="custom-file">
                              <input 
                                type="file" 
                                className="custom-file-input" 
                                id="appendixFile" 
                                accept=".xlsx,.xls,.csv,.txt" 
                                required
                                onChange={(e) => handleFileChange(e, 'appendixFile')}
                              />
                              <label className="custom-file-label" htmlFor="appendixFile">
                                {fileNames.appendixFile}
                              </label>
                            </div>
                          </div>
                          <small className="form-text text-muted">
                            Upload appendix file (Excel/CSV/TXT) with 3 columns: Command Name, Command, Reference Value
                          </small>
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-12">
                        <div className="form-group">
                          <label htmlFor="mopDescription"><strong>MOP Description:</strong></label>
                          <textarea 
                            className="form-control" 
                            id="mopDescription" 
                            rows={3} 
                            placeholder="Brief description of the MOP..."
                            value={formData.description}
                            onChange={handleDescriptionChange}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-12">
                        <div className="alert alert-info">
                          <h5><i className="fas fa-info-circle mr-2"></i>File Requirements:</h5>
                          <ul className="mb-0">
                            <li><strong>PDF File:</strong> Must contain the complete MOP documentation</li>
                            <li><strong>Appendix File:</strong> Excel/CSV/TXT with exactly 3 columns:
                              <ul>
                                <li>Column 1: Command Name (e.g., "SSH1 - Check root login")</li>
                                <li>Column 2: Command (e.g., "grep -i '^PermitRootLogin' /etc/ssh/sshd_config")</li>
                                <li>Column 3: Reference Value (e.g., "no")</li>
                              </ul>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-12">
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? (
                            <><i className="fas fa-spinner fa-spin mr-2"></i>Submitting...</>
                          ) : (
                            <><i className="fas fa-upload mr-2"></i>Submit MOP</>
                          )}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary ml-2" 
                          onClick={downloadTemplate}
                        >
                          <i className="fas fa-download mr-2"></i>Download Template
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Submission Status Modal */}
      {showStatusModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Submission Status</h5>
                <button type="button" className="close" onClick={closeModal}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {submissionStatus.type === 'success' ? (
                  <div className="alert alert-success">
                    <i className="fas fa-check-circle mr-2"></i>
                    <strong>Success!</strong> {submissionStatus.message}
                    {submissionStatus.mopId && (
                      <><br /><small>MOP ID: {submissionStatus.mopId}</small></>
                    )}
                    {submissionStatus.status && (
                      <><br /><small>Status: {submissionStatus.status}</small></>
                    )}
                  </div>
                ) : (
                  <div className="alert alert-danger">
                    <i className="fas fa-times-circle mr-2"></i>
                    <strong>Error!</strong> {submissionStatus.message}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MOPSubmission;