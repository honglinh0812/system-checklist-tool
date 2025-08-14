import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface Command {
  id?: number;
  title: string;
  command: string;
  reference_value: string;
}

interface MOP {
  id: string;
  name: string;
  type: string[];
  commands: Command[];
}

const MOPEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mop, setMop] = useState<MOP | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [commandCounter, setCommandCounter] = useState(0);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning', message: string} | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    riskAssessment: false,
    handoverAssessment: false,
    commands: [] as Command[]
  });

  useEffect(() => {
    if (id) {
      fetchMOP(id);
    }
  }, [id]);

  const fetchMOP = async (mopId: string) => {
    try {
      const data = await apiService.get<any>(API_ENDPOINTS.MOPS.DETAIL(mopId));
      if (data.success) {
        const mopData = data.mop;
        setMop(mopData);
        setFormData({
          name: mopData.name,
          riskAssessment: mopData.type.includes('risk'),
          handoverAssessment: mopData.type.includes('handover'),
          commands: mopData.commands || []
        });
        setCommandCounter(mopData.commands?.length || 0);
      } else {
        setNotification({type: 'error', message: 'Error loading MOP'});
        navigate('/mop-review');
      }
    } catch (error) {
      console.error('Error loading MOP:', error);
      setNotification({type: 'error', message: 'Error loading MOP'});
      navigate('/mop-review');
    } finally {
      setLoading(false);
    }
  };

  const addCommand = () => {
    const newCounter = commandCounter + 1;
    setCommandCounter(newCounter);
    setFormData(prev => ({
      ...prev,
      commands: [...prev.commands, { title: '', command: '', reference_value: '' }]
    }));
  };

  const removeCommand = (index: number) => {
    setFormData(prev => ({
      ...prev,
      commands: prev.commands.filter((_, i) => i !== index)
    }));
  };

  const updateCommand = (index: number, field: keyof Command, value: string) => {
    setFormData(prev => ({
      ...prev,
      commands: prev.commands.map((cmd, i) => 
        i === index ? { ...cmd, [field]: value } : cmd
      )
    }));
  };

  const updatePreview = () => {
    const validCommands = formData.commands.filter(cmd => cmd.title && cmd.command && cmd.reference_value);
    return {
      name: formData.name,
      types: [
        ...(formData.riskAssessment ? ['Risk Assessment'] : []),
        ...(formData.handoverAssessment ? ['Handover Assessment'] : [])
      ],
      commands: validCommands
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      setNotification({type: 'warning', message: 'Please enter MOP name'});
      return;
    }
    
    if (!formData.riskAssessment && !formData.handoverAssessment) {
      setNotification({type: 'warning', message: 'Please select at least one assessment type'});
      return;
    }
    
    const validCommands = formData.commands.filter(cmd => cmd.title && cmd.command && cmd.reference_value);
    if (validCommands.length === 0) {
      setNotification({type: 'warning', message: 'Please add at least one valid command'});
      return;
    }

    const data = {
      name: formData.name,
      type: [
        ...(formData.riskAssessment ? ['risk'] : []),
        ...(formData.handoverAssessment ? ['handover'] : [])
      ],
      commands: validCommands
    };

    try {
      const result = await apiService.put<any>(`/api/mops/${id}`, data);
      if (result.success) {
        setNotification({type: 'success', message: 'MOP updated successfully'});
      } else {
        setNotification({type: 'error', message: result.error || 'Failed to update MOP'});
      }
    } catch (error) {
      console.error('Error updating MOP:', error);
      setNotification({type: 'error', message: 'Error updating MOP'});
    }
  };

  const handleApproveMOP = () => {
    if (!formData.name) {
      setNotification({type: 'warning', message: 'Please enter MOP name'});
      return;
    }
    
    if (!formData.riskAssessment && !formData.handoverAssessment) {
      setNotification({type: 'warning', message: 'Please select at least one assessment type'});
      return;
    }
    
    const validCommands = formData.commands.filter(cmd => cmd.title && cmd.command && cmd.reference_value);
    if (validCommands.length === 0) {
      setNotification({type: 'warning', message: 'Please add at least one valid command'});
      return;
    }

    setShowApproveConfirm(true);
  };

  const approveMOP = async () => {
    const data = {
      name: formData.name,
      type: [
        ...(formData.riskAssessment ? ['risk'] : []),
        ...(formData.handoverAssessment ? ['handover'] : [])
      ],
      commands: formData.commands.filter(cmd => cmd.title && cmd.command && cmd.reference_value)
    };

    try {
      const result = await apiService.post<any>(`/api/mops/${id}/approve-final`, data);
      if (result.success) {
        setNotification({type: 'success', message: 'MOP has been approved successfully'});
        setTimeout(() => {
          navigate('/mop-management');
        }, 1000);
      } else {
        setNotification({type: 'error', message: result.error || 'Failed to approve MOP'});
      }
    } catch (error) {
      console.error('Error approving MOP:', error);
      setNotification({type: 'error', message: 'Error approving MOP'});
    } finally {
      setShowApproveConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="content-header">
        <div className="container-fluid">
          <div className="text-center py-4">
            <i className="fas fa-spinner fa-spin fa-3x text-muted mb-3"></i>
            <h5 className="text-muted">Loading MOP...</h5>
          </div>
        </div>
      </div>
    );
  }

  if (!mop) {
    return (
      <div className="content-header">
        <div className="container-fluid">
          <div className="text-center py-4">
            <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
            <h5 className="text-muted">MOP not found</h5>
          </div>
        </div>
      </div>
    );
  }

  const previewData = updatePreview();

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
              <h1 className="m-0">Edit MOP</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate('/mop-review'); }}>MOP Review</a>
                </li>
                <li className="breadcrumb-item active">Edit MOP</li>
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
                    <i className="fas fa-edit mr-2"></i>
                    Edit MOP: {mop.name}
                  </h3>
                </div>
                <div className="card-body">
                  <form onSubmit={handleSubmit}>
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <label htmlFor="mopName"><strong>MOP Name:</strong></label>
                          <input 
                            type="text" 
                            className="form-control" 
                            id="mopName" 
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            required 
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <label><strong>Assessment Types:</strong></label>
                          <div className="form-check">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id="riskAssessment" 
                              checked={formData.riskAssessment}
                              onChange={(e) => setFormData(prev => ({ ...prev, riskAssessment: e.target.checked }))}
                            />
                            <label className="form-check-label" htmlFor="riskAssessment">
                              Risk Assessment
                            </label>
                          </div>
                          <div className="form-check">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id="handoverAssessment" 
                              checked={formData.handoverAssessment}
                              onChange={(e) => setFormData(prev => ({ ...prev, handoverAssessment: e.target.checked }))}
                            />
                            <label className="form-check-label" htmlFor="handoverAssessment">
                              Handover Assessment
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="row">
                      <div className="col-md-12">
                        <h5><strong>Commands:</strong></h5>
                        <div id="commandsContainer">
                          {formData.commands.map((command, index) => (
                            <div key={index} className="card mb-3 command-item">
                              <div className="card-header">
                                <div className="row align-items-center">
                                  <div className="col-md-11">
                                    <input 
                                      type="text" 
                                      className="form-control" 
                                      value={command.title}
                                      onChange={(e) => updateCommand(index, 'title', e.target.value)}
                                      placeholder="Command Title" 
                                      required 
                                    />
                                  </div>
                                  <div className="col-md-1">
                                    <button 
                                      type="button" 
                                      className="btn btn-danger btn-sm" 
                                      onClick={() => removeCommand(index)}
                                    >
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div className="card-body">
                                <div className="row">
                                  <div className="col-md-6">
                                    <div className="form-group">
                                      <label><strong>Command:</strong></label>
                                      <textarea 
                                        className="form-control" 
                                        rows={3}
                                        value={command.command}
                                        onChange={(e) => updateCommand(index, 'command', e.target.value)}
                                        placeholder="Enter command" 
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="col-md-6">
                                    <div className="form-group">
                                      <label><strong>Reference Value:</strong></label>
                                      <textarea 
                                        className="form-control" 
                                        rows={3}
                                        value={command.reference_value}
                                        onChange={(e) => updateCommand(index, 'reference_value', e.target.value)}
                                        placeholder="Expected output" 
                                        required
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <button type="button" className="btn btn-secondary" onClick={addCommand}>
                          <i className="fas fa-plus mr-2"></i>Add Command
                        </button>
                      </div>
                    </div>
                    
                    <div className="row mt-4">
                      <div className="col-md-12">
                        <button type="submit" className="btn btn-primary mr-2">
                          <i className="fas fa-save mr-2"></i>Save Changes
                        </button>
                        <button type="button" className="btn btn-success mr-2" onClick={handleApproveMOP}>
                          <i className="fas fa-check mr-2"></i>Approve MOP
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-info mr-2" 
                          onClick={() => setShowPreviewModal(true)}
                        >
                          <i className="fas fa-eye mr-2"></i>Preview
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          onClick={() => navigate('/mop-review')}
                        >
                          <i className="fas fa-arrow-left mr-2"></i>Back to Review
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

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">MOP Preview</h5>
                <button type="button" className="close" onClick={() => setShowPreviewModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-12">
                    <h5><strong>MOP Name:</strong> {previewData.name}</h5>
                    <h6><strong>Assessment Types:</strong></h6>
                    <ul>
                      {previewData.types.map((type, index) => (
                        <li key={index}>{type}</li>
                      ))}
                    </ul>
                    
                    <h6><strong>Commands ({previewData.commands.length}):</strong></h6>
                    {previewData.commands.map((cmd, index) => (
                      <div key={index} className="command-preview-item mb-3 p-3 border rounded">
                        <div className="row">
                          <div className="col-md-12">
                            <h6 className="text-primary">{index + 1}. {cmd.title}</h6>
                          </div>
                        </div>
                        <div className="row">
                          <div className="col-md-6">
                            <strong>Command:</strong>
                            <pre className="bg-light p-2 rounded mt-1">{cmd.command}</pre>
                          </div>
                          <div className="col-md-6">
                            <strong>Reference Value:</strong>
                            <pre className="bg-light p-2 rounded mt-1">{cmd.reference_value}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPreviewModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve MOP Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        onConfirm={approveMOP}
        title="Xác nhận phê duyệt MOP"
        message="Bạn có chắc chắn muốn phê duyệt MOP này? MOP sẽ được đưa vào sử dụng sau khi phê duyệt."
        confirmText="Phê duyệt"
        cancelText="Hủy"
        confirmVariant="success"
      />
    </>
  );
};

export default MOPEdit;