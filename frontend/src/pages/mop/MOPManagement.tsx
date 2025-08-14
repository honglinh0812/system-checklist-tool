import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';

interface Command {
  id?: number;
  title: string;
  command: string;
  reference_value?: string;
}

interface MOP {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'approved';
  risk_assessment: boolean;
  handover_assessment: boolean;
  assessment_type?: string;
  commands: Command[];
  created_by?: { username: string };
  created_at: string;
}

interface MOPFormData {
  name: string;
  description: string;
  risk_assessment: boolean;
  handover_assessment: boolean;
  commands: Command[];
}

const MOPManagement: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [mops, setMops] = useState<MOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMopModal, setShowMopModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentMop, setCurrentMop] = useState<MOP | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [commandCounter, setCommandCounter] = useState(0);
  const [deleteMopId, setDeleteMopId] = useState<string | null>(null);
  const [deleteMopName, setDeleteMopName] = useState('');

  
  const [formData, setFormData] = useState<MOPFormData>({
    name: '',
    description: '',
    risk_assessment: false,
    handover_assessment: false,
    commands: []
  });

  useEffect(() => {
    fetchMOPs();
  }, []);

  const fetchMOPs = async () => {
    try {
      const data = await apiService.get<any>(API_ENDPOINTS.MOPS.LIST);
      if (data.success) {
        setMops(data.data.mops || []);
      }
    } catch (error) {
      console.error('Error fetching MOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const showCreateMOPModal = () => {
    setIsEditing(false);
    setCurrentMop(null);
    setFormData({
      name: '',
      description: '',
      risk_assessment: false,
      handover_assessment: false,
      commands: []
    });
    setCommandCounter(0);
    setShowMopModal(true);
  };

  const viewMOP = async (mopId: string) => {
    try {
      const data = await apiService.get<any>(API_ENDPOINTS.MOPS.DETAIL(mopId));
      if (data.success) {
        setCurrentMop(data.data);
        setShowDetailModal(true);
      } else {
        alert('Error loading MOP details');
      }
    } catch (error) {
      console.error('Error loading MOP details:', error);
      alert('Error loading MOP details');
    }
  };

  const editMOP = async (mopId: string) => {
    try {
      const data = await apiService.get<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}`);
      if (data.success) {
        const mop = data.data;
        setIsEditing(true);
        setCurrentMop(mop);
        setFormData({
          name: mop.name,
          description: mop.description || '',
          risk_assessment: mop.risk_assessment,
          handover_assessment: mop.handover_assessment,
          commands: mop.commands || []
        });
        setCommandCounter(mop.commands?.length || 0);
        setShowMopModal(true);
      } else {
        alert('Error loading MOP for editing');
      }
    } catch (error) {
      console.error('Error loading MOP for editing:', error);
      alert('Error loading MOP for editing');
    }
  };

  const deleteMOP = async (mopId: string) => {
    try {
      const data = await apiService.get<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}`);
      if (data.success) {
        setDeleteMopId(mopId);
        setDeleteMopName(data.data.name);
        setShowDeleteModal(true);
      } else {
        alert('Error loading MOP details');
      }
    } catch (error) {
      console.error('Error loading MOP details:', error);
      alert('Error loading MOP details');
    }
  };

  const confirmDeleteMOP = async () => {
    if (!deleteMopId) return;
    
    try {
      const data = await apiService.delete<any>(`${API_ENDPOINTS.MOPS.LIST}/${deleteMopId}`);
      if (data.success) {
        alert('MOP deleted successfully');
        setShowDeleteModal(false);
        setDeleteMopId(null);
        setDeleteMopName('');
        fetchMOPs();
      } else {
        alert(data.error || 'Error deleting MOP');
      }
    } catch (error) {
      console.error('Error deleting MOP:', error);
      alert('Error deleting MOP');
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

  const saveMOP = async () => {
    if (!formData.name) {
      alert('Please enter MOP name');
      return;
    }
    
    if (!formData.risk_assessment && !formData.handover_assessment) {
      alert('Please select at least one MOP type');
      return;
    }
    
    if (formData.commands.length === 0) {
      alert('Please add at least one command');
      return;
    }

    const mopData = {
      name: formData.name,
      description: formData.description,
      type: [
        ...(formData.risk_assessment ? ['risk'] : []),
        ...(formData.handover_assessment ? ['handover'] : [])
      ],
      commands: formData.commands.filter(cmd => cmd.title && cmd.command)
    };

    try {
      let data;
      if (isEditing && currentMop) {
        data = await apiService.put<any>(`${API_ENDPOINTS.MOPS.LIST}/${currentMop.id}`, mopData);
      } else {
        data = await apiService.post<any>(API_ENDPOINTS.MOPS.LIST, mopData);
      }
      if (data.success) {
        alert(isEditing ? 'MOP updated successfully' : 'MOP created successfully');
        setShowMopModal(false);
        fetchMOPs();
      } else {
        alert(data.error || 'Error saving MOP');
      }
    } catch (error) {
      console.error('Error saving MOP:', error);
      alert('Error saving MOP');
    }
  };

  const approveMOP = async (mopId: string) => {
    if (!confirm('Are you sure you want to approve this MOP?')) return;
    
    try {
      const data = await apiService.post<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}/approve`);
      if (data.success) {
        alert('MOP approved successfully');
        setShowDetailModal(false);
        fetchMOPs();
      } else {
        alert(data.error || 'Error approving MOP');
      }
    } catch (error) {
      console.error('Error approving MOP:', error);
      alert('Error approving MOP');
    }
  };

  const rejectMOP = async (mopId: string) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (reason === null) return;
    
    try {
      const data = await apiService.post<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}/reject`, { 
        comments: reason
      });
      if (data.success) {
        alert('MOP rejected successfully');
        setShowDetailModal(false);
        fetchMOPs();
      } else {
        alert(data.error || 'Error rejecting MOP');
      }
    } catch (error) {
      console.error('Error rejecting MOP:', error);
      alert('Error rejecting MOP');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="badge badge-success">Approved</span>;
      case 'pending':
        return <span className="badge badge-warning">Pending</span>;
      default:
        return <span className="badge badge-secondary">Unknown</span>;
    }
  };

  const getTypeBadges = (mop: MOP) => {
    if (mop.assessment_type) {
      return (
        <span className={`badge ${
          mop.assessment_type === 'risk_assessment' ? 'badge-warning' : 'badge-info'
        }`}>
          {mop.assessment_type === 'risk_assessment' ? 'Risk Assessment' : 'Handover Assessment'}
        </span>
      );
    }
    // Fallback to old boolean fields if assessment_type is not available
    return (
      <>
        {mop.risk_assessment && <span className="badge badge-warning mr-1">Risk Assessment</span>}
        {mop.handover_assessment && <span className="badge badge-info">Handover Assessment</span>}
      </>
    );
  };

  return (
    <>
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">MOP Management</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>Home</a>
                </li>
                <li className="breadcrumb-item active">MOP Management</li>
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
                    <i className="fas fa-tasks mr-2"></i>
                    Method of Procedure (MOP) Management
                  </h3>
                  <div className="card-tools">
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={showCreateMOPModal}
                    >
                      <i className="fas fa-plus mr-2"></i>Create New MOP
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-4">
                      <i className="fas fa-spinner fa-spin fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">Loading MOPs...</h5>
                    </div>
                  ) : mops.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Commands</th>
                            <th>Status</th>
                            <th>Created By</th>
                            <th>Created Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mops.map((mop) => (
                            <tr key={mop.id}>
                              <td>
                                <strong>{mop.name}</strong>
                                {mop.description && (
                                  <><br /><small className="text-muted">{mop.description}</small></>
                                )}
                              </td>
                              <td>{getTypeBadges(mop)}</td>
                              <td>{mop.commands?.length || 0} commands</td>
                              <td>{getStatusBadge(mop.status)}</td>
                              <td>{mop.created_by?.username || 'Unknown'}</td>
                              <td>{new Date(mop.created_at).toLocaleDateString()}</td>
                              <td>
                                <div className="btn-group">
                                  <button 
                                    className="btn btn-sm btn-info" 
                                    onClick={() => viewMOP(mop.id)}
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-primary" 
                                    onClick={() => editMOP(mop.id)}
                                  >
                                    <i className="fas fa-edit"></i>
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-danger" 
                                    onClick={() => deleteMOP(mop.id)}
                                  >
                                    <i className="fas fa-trash"></i>
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
                      <i className="fas fa-info-circle fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">No MOPs Available</h5>
                      <p className="text-muted">No MOPs have been created yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MOP Modal */}
      {showMopModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog" style={{ maxWidth: '95vw', width: '95vw', margin: '1rem auto' }}>
            <div className="modal-content" style={{ height: '90vh', maxHeight: '90vh' }}>
              <div className="modal-header">
                <h5 className="modal-title">{isEditing ? 'Edit MOP' : 'Create New MOP'}</h5>
                <button type="button" className="close" onClick={() => setShowMopModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
                <form>
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="mopName">MOP Name *</label>
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
                        <label htmlFor="mopDescription">Description</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          id="mopDescription" 
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="row">
                    <div className="col-md-12">
                      <div className="form-group">
                        <label>MOP Type *</label>
                        <div className="custom-control custom-checkbox">
                          <input 
                            type="checkbox" 
                            className="custom-control-input" 
                            id="riskAssessment" 
                            checked={formData.risk_assessment}
                            onChange={(e) => setFormData(prev => ({ ...prev, risk_assessment: e.target.checked }))}
                          />
                          <label className="custom-control-label" htmlFor="riskAssessment">Risk Assessment</label>
                        </div>
                        <div className="custom-control custom-checkbox">
                          <input 
                            type="checkbox" 
                            className="custom-control-input" 
                            id="handoverAssessment" 
                            checked={formData.handover_assessment}
                            onChange={(e) => setFormData(prev => ({ ...prev, handover_assessment: e.target.checked }))}
                          />
                          <label className="custom-control-label" htmlFor="handoverAssessment">Handover Assessment</label>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <hr />
                  
                  <div className="row">
                    <div className="col-md-12">
                      <h6>Commands</h6>
                      <button type="button" className="btn btn-sm btn-success" onClick={addCommand}>
                        <i className="fas fa-plus mr-2"></i>Add Command
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    {formData.commands.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-bordered">
                          <thead className="thead-dark">
                            <tr>
                              <th style={{ width: '8%' }}>STT</th>
                              <th style={{ width: '25%' }}>Tên Command</th>
                              <th style={{ width: '35%' }}>Câu lệnh</th>
                              <th style={{ width: '25%' }}>Giá trị đối chiếu</th>
                              <th style={{ width: '7%' }}>Xóa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.commands.map((command, index) => (
                              <tr key={index}>
                                <td className="text-center align-middle">{index + 1}</td>
                                <td>
                                  <input 
                                    type="text" 
                                    className="form-control" 
                                    value={command.title}
                                    onChange={(e) => updateCommand(index, 'title', e.target.value)}
                                    placeholder="Command Title"
                                    required 
                                  />
                                </td>
                                <td>
                                  <textarea 
                                    className="form-control" 
                                    rows={2}
                                    value={command.command}
                                    onChange={(e) => updateCommand(index, 'command', e.target.value)}
                                    placeholder="Enter command"
                                    required
                                  />
                                </td>
                                <td>
                                  <textarea 
                                    className="form-control" 
                                    rows={2}
                                    value={command.reference_value || ''}
                                    onChange={(e) => updateCommand(index, 'reference_value', e.target.value)}
                                    placeholder="Expected output for validation"
                                  />
                                </td>
                                <td className="text-center align-middle">
                                  <button 
                                    type="button" 
                                    className="btn btn-danger btn-sm" 
                                    onClick={() => removeCommand(index)}
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  
                  <hr />
                  
                  <div className="row">
                    <div className="col-md-12">
                      <h6>MOP Preview</h6>
                      <div className="border p-3 bg-light">
                        {formData.commands.length > 0 ? (
                          <div className="table-responsive">
                            <table className="table table-striped table-bordered">
                              <thead className="thead-dark">
                                <tr>
                                  <th style={{ width: '8%' }}>STT</th>
                                  <th style={{ width: '25%' }}>Tên Command</th>
                                  <th style={{ width: '35%' }}>Câu lệnh</th>
                                  <th style={{ width: '32%' }}>Giá trị đối chiếu</th>
                                </tr>
                              </thead>
                              <tbody>
                                {formData.commands.filter(cmd => cmd.title && cmd.command).map((cmd, index) => (
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
                        ) : (
                          <p className="text-muted">Commands will appear here as you add them...</p>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowMopModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveMOP}>
                  <i className="fas fa-save mr-2"></i>Save MOP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOP Detail Modal */}
      {showDetailModal && currentMop && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">MOP Details</h5>
                <button type="button" className="close" onClick={() => setShowDetailModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row mb-3">
                  <div className="col-md-6">
                    <h6>MOP Information</h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr><td><strong>Name:</strong></td><td>{currentMop.name}</td></tr>
                        <tr><td><strong>Description:</strong></td><td>{currentMop.description || 'N/A'}</td></tr>
                        <tr><td><strong>Status:</strong></td><td>{getStatusBadge(currentMop.status)}</td></tr>
                        <tr><td><strong>Type:</strong></td><td>{getTypeBadges(currentMop)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="col-md-6">
                    <h6>Commands ({currentMop.commands?.length || 0})</h6>
                  </div>
                </div>
                
                {currentMop.commands && currentMop.commands.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-striped table-bordered">
                      <thead className="thead-dark">
                        <tr>
                          <th style={{ width: '8%' }}>STT</th>
                          <th style={{ width: '25%' }}>Tên Command</th>
                          <th style={{ width: '35%' }}>Câu lệnh</th>
                          <th style={{ width: '32%' }}>Giá trị đối chiếu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentMop.commands.map((command, index) => (
                          <tr key={index}>
                            <td className="text-center">{index + 1}</td>
                            <td><strong>{command.title}</strong></td>
                            <td><code className="text-wrap">{command.command}</code></td>
                            <td><small className="text-muted">{command.reference_value || 'N/A'}</small></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {currentMop.status === 'pending' && isAdmin && (
                  <>
                    <button 
                      type="button" 
                      className="btn btn-success" 
                      onClick={() => approveMOP(currentMop.id)}
                    >
                      Approve MOP
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-danger" 
                      onClick={() => rejectMOP(currentMop.id)}
                    >
                      Reject MOP
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm Delete</h5>
                <button type="button" className="close" onClick={() => setShowDeleteModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete this MOP?</p>
                <p><strong>{deleteMopName}</strong></p>
                <p className="text-danger">This action cannot be undone.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={confirmDeleteMOP}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MOPManagement;