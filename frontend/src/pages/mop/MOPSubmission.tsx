import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useModalState } from '../../utils/stateUtils';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import { useTranslation } from '../../i18n/useTranslation';

interface SubmissionStatus {
  type: 'success' | 'error' | null;
  message: string;
  mopId?: string;
  status?: string;
  commandsCount?: number;
  sanitizedCommands?: number;
  sanitizeWarnings?: number;
}

const MOPSubmission: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Persisted state management with unique keys for MOP Submission
  const [formData, setFormData] = usePersistedState('submission_formData', {
    mopName: '',
    assessmentType: 'handover_assessment' as 'handover_assessment' | 'risk_assessment',
    pdfFile: null as File | null,
    appendixFile: null as File | null,
    description: ''
  }, {
    excludeKeys: ['pdfFile', 'appendixFile'],
    autoSave: true,
    autoSaveInterval: 5000
  });
  const [fileNames, setFileNames] = usePersistedState('submission_fileNames', {
    pdfFile: 'Choose PDF file',
    appendixFile: 'Choose Excel/CSV/TXT file'
  });
  const [submissionStatus, setSubmissionStatus] = usePersistedState<SubmissionStatus>('submission_submissionStatus', { type: null, message: '' });
  const [showStatusModal, setShowStatusModal] = useModalState(false);
  
  // Non-persisted states - loading states
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        message: t('pleaseEnterMOPNameError')
      });
      setShowStatusModal(true);
      return;
    }
    
    if (!formData.pdfFile || !formData.appendixFile) {
      setSubmissionStatus({
        type: 'error',
        message: t('pleaseSelectBothFilesError')
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
          message: t('mopSubmittedSuccessfully'),
          mopId: response.data.mop_id,
          status: response.data.status,
          commandsCount: response.data.commands_count,
          sanitizedCommands: response.data.sanitized_commands,
          sanitizeWarnings: response.data.sanitize_warnings
        });
        // Reset form
        setFormData({ mopName: '', assessmentType: 'handover_assessment', pdfFile: null, appendixFile: null, description: '' });
        setFileNames({ pdfFile: 'Choose PDF file', appendixFile: 'Choose Excel/CSV/TXT file' });
      } else {
        setSubmissionStatus({
          type: 'error',
          message: response.message || t('failedToSubmitMOP')
        });
      }
    } catch (error: any) {
      console.error('Error submitting MOP:', error);
      
      let errorMessage = t('failedToSubmitMOPTryAgain');
      
      // Extract detailed error message from backend response
      if (error.response && error.response.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setSubmissionStatus({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setIsSubmitting(false);
      setShowStatusModal(true);
    }
  };

  const downloadTemplate = () => {
    const token = localStorage.getItem('token');
    const templateUrl = `/api/template/mop-appendix?token=${encodeURIComponent(token || '')}`;
    window.open(templateUrl, '_blank');
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
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>{t('home')}</a>
                </li>
                <li className="breadcrumb-item active">{t('mopSubmissionTitle')}</li>
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

              <div className="row">
                <div className="col-md-12">
                  <div className="alert alert-info">
                    <h5><i className="fas fa-info-circle mr-2"></i>{t('fileRequirements')}:</h5>
                    <ul className="mb-0">
                      <li><strong>{t('pdfFile')}:</strong> {t('pdfFileRequirement')}</li>
                      <li><strong>{t('appendixFile')}:</strong> {t('appendixFileRequirement')}:
                        <ul>
                          <li>{t('columnCommandName')}</li>
                          <li>{t('columnCommand')}</li>
                          <li>{t('columnReferenceValue')}</li>
                        </ul>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-upload mr-2"></i>
                    {t('submitNewMOP')}
                  </h3>
                </div>
                <div className="card-body">
                  <form onSubmit={handleSubmit}>
                    {/* MOP Name Field */}
                    <div className="row">
                      <div className="col-md-12">
                        <div className="form-group">
                          <label htmlFor="mopName"><strong>{t('mopNameLabel')}</strong></label>
                           <input 
                             type="text" 
                             className="form-control" 
                             id="mopName" 
                             placeholder={t('enterMOPNamePlaceholder')}
                             value={formData.mopName}
                             onChange={handleMopNameChange}
                             required
                           />
                           <small className="form-text text-muted">{t('enterMOPNameHelp')}</small>
                        </div>
                      </div>
                    </div>

                    {/* Assessment Type Field */}
                    <div className="row">
                      <div className="col-md-12">
                        <div className="form-group">
                          <label><strong>{t('assessmentType')}:</strong></label>
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
                                {t('riskAssessment')}
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
                                {t('handoverAssessment')}
                              </label>
                            </div>
                          </div>
                          <small className="form-text text-muted">{t('selectAssessmentTypeHelp')}</small>
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <label htmlFor="pdfFile"><strong>{t('pdfFileLabel')}</strong></label>
                           <div className="input-group">
                             <div className="custom-file">
                               <input 
                                 type="file" 
                                 className="custom-file-input" 
                                 id="pdfFile" 
                                 accept=".pdf"
                                 onChange={(e) => handleFileChange(e, 'pdfFile')}
                                 required
                               />
                               <label className="custom-file-label" htmlFor="pdfFile">
                                 {fileNames.pdfFile}
                               </label>
                             </div>
                           </div>
                           <small className="form-text text-muted">{t('uploadMOPPDFHelp')}</small>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <label htmlFor="appendixFile"><strong>{t('appendixFileLabel')}</strong></label>
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
                            {t('uploadAppendixHelp')}
                          </small>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-secondary ml-2" 
                        onClick={downloadTemplate}
                      >
                        <i className="fas fa-download mr-2"></i>{t('download')} Template
                      </button>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-12">
                        <div className="form-group">
                          <label htmlFor="mopDescription"><strong>{t('mopDescriptionLabel')}</strong></label>
                           <textarea 
                             className="form-control" 
                             id="mopDescription" 
                             rows={3} 
                             placeholder={t('mopDescriptionPlaceholder')}
                             value={formData.description}
                             onChange={handleDescriptionChange}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-12">
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? (
                            <><i className="fas fa-spinner fa-spin mr-2"></i>{t('submitting')}</>
                          ) : (
                            <><i className="fas fa-upload mr-2"></i>{t('submitMOP')}</>
                          )}
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
                <h5 className="modal-title">{t('submissionStatus')}</h5>
                <button type="button" className="close" onClick={closeModal}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {submissionStatus.type === 'success' ? (
                  <div className="alert alert-success">
                    <i className="fas fa-check-circle mr-2"></i>
                    <strong>{t('success')}!</strong> {submissionStatus.message}
                    {submissionStatus.mopId && (
                      <><br /><small>{t('mopId')}: {submissionStatus.mopId}</small></>
                    )}
                    {submissionStatus.status && (
                      <><br /><small>{t('status')}: {submissionStatus.status}</small></>
                    )}
                    {submissionStatus.commandsCount && (
                       <><br /><small>{t('commandsProcessed')}: <span className="number-display">{submissionStatus.commandsCount}</span></small></>
                     )}
                     {submissionStatus.sanitizedCommands && submissionStatus.sanitizedCommands > 0 && (
                       <><br /><small className="text-warning"><i className="fas fa-shield-alt mr-1"></i>{t('commandsSanitized')}: <span className="number-display">{submissionStatus.sanitizedCommands}</span></small></>
                     )}
                     {submissionStatus.sanitizeWarnings && submissionStatus.sanitizeWarnings > 0 && (
                       <><br /><small className="text-info"><i className="fas fa-exclamation-triangle mr-1"></i>{t('securityWarnings')}: <span className="number-display">{submissionStatus.sanitizeWarnings}</span></small></>
                     )}
                  </div>
                ) : (
                  <div className="alert alert-danger">
                    <i className="fas fa-times-circle mr-2"></i>
                    <strong>{t('error')}!</strong> {submissionStatus.message}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  {t('close')}
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