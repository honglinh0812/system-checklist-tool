import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useTranslation } from '../../i18n/useTranslation';


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
  description?: string;
  status: 'pending' | 'approved';
  type: string[]; // Backend trả về array như ["handover_assessment"] hoặc ["risk_assessment"]
  assessment_type?: string;
  risk_assessment?: boolean;
  handover_assessment?: boolean;
  commands: Command[];
  created_by?: { 
    username: string;
    full_name: string;
    email: string;
    id: number;
  };
  created_at: string;
  updated_at?: string;
  category?: string;
  priority?: string;
  risk_level?: string;
  estimated_duration?: number;
}

interface MOPFormData {
  name: string;
  description: string;
  risk_assessment: boolean;
  handover_assessment: boolean;
  commands: Command[];
}

const MOPManagement: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'admin';
  
  // Persisted state management with unique keys for MOP Management
  const [mops, setMops] = useState<MOP[]>([]);
  const [currentMop, setCurrentMop] = useState<MOP | null>(null);
  const [formData, setFormData] = useState<MOPFormData>({
    name: '',
    description: '',
    risk_assessment: false,
    handover_assessment: false,
    commands: []
  });

  const [showMopModal, setShowMopModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCommandTemplates, setShowCommandTemplates] = useState(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  
  // Non-persisted states - những state không cần duy trì (loading, notifications, temporary actions)
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [deleteMopId, setDeleteMopId] = useState<string | null>(null);
  const [deleteMopName, setDeleteMopName] = useState('');
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning', message: string} | null>(null);


  // Command templates
  const commandTemplates = [
    {
      title: t('checkServiceStatus'),
      command: "systemctl status <service_name>",
      reference_value: t('activeRunning')
    },
    {
      title: t('checkDiskUsage'),
      command: "df -h",
      reference_value: t('lessThan80Usage')
    },
    {
      title: t('checkMemoryUsage'),
      command: "free -h",
      reference_value: t('availableMemoryGreaterThan1GB')
    },
    {
      title: t('checkNetworkConnectivity'),
      command: "ping -c 4 <target_ip>",
      reference_value: t('zeroPacketLoss')
    },
    {
      title: t('checkProcessStatus'),
      command: "ps aux | grep <process_name>",
      reference_value: t('processIsRunning')
    },
    {
      title: t('checkPortListening'),
      command: "netstat -tlnp | grep <port>",
      reference_value: t('portIsListening')
    }
  ];

  useEffect(() => {
    fetchMOPs();
  }, []);

  // Auto-hide notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchMOPs = async () => {
    try {
      console.log('Fetching MOPs...');
      const data = await apiService.get<any>(API_ENDPOINTS.MOPS.LIST);
      console.log('Fetch MOPs response:', data);
      if (data.success) {
        console.log('MOPs data:', data.data.mops);
        setMops(data.data.mops || []);
      }
    } catch (error) {
      console.error('Error fetching MOPs:', error);
      setNotification({type: 'error', message: t('errorLoadingMOPs')});
    } finally {
      setLoading(false);
    }
  };

  const showCreateMOPModal = () => {
    // Close all other modals first
    setShowDetailModal(false);
    setShowPreviewModal(false);
    setShowCommandTemplates(false);
    setShowDeleteModal(false);
    setShowApproveConfirm(false);
    
    setIsEditing(false);
    setCurrentMop(null);
    setFormData({
      name: '',
      description: '',
      risk_assessment: false,
      handover_assessment: false,
      commands: []
    });
    setShowMopModal(true);
  };

  const viewMOP = async (mopId: string) => {
    try {
      // Close all other modals first
      setShowMopModal(false);
      setShowPreviewModal(false);
      setShowCommandTemplates(false);
      setShowDeleteModal(false);
      setShowApproveConfirm(false);
      
      const data = await apiService.get<any>(API_ENDPOINTS.MOPS.DETAIL(mopId));
      if (data.success) {
        setCurrentMop(data.data);
        setShowDetailModal(true);
      } else {
        setNotification({type: 'error', message: t('errorLoadingMOPDetails')});
      }
    } catch (error) {
      console.error('Error loading MOP details:', error);
      setNotification({type: 'error', message: t('errorLoadingMOPDetails')});
    }
  };

  const editMOP = async (mopId: string) => {
    try {
      // Close all other modals first
      setShowDetailModal(false);
      setShowPreviewModal(false);
      setShowCommandTemplates(false);
      setShowDeleteModal(false);
      setShowApproveConfirm(false);
      
      const data = await apiService.get<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}`);
      if (data.success) {
        const mop = data.data;
        setIsEditing(true);
        setCurrentMop(mop);
        
        const mopTypes = Array.isArray(mop.type) ? mop.type : [];
        
        setFormData({
          name: mop.name || '',
          description: mop.description || '',
          risk_assessment: mopTypes.includes('risk_assessment'),
          handover_assessment: mopTypes.includes('handover_assessment'),
          commands: (mop.commands || []).map((cmd: Command) => ({
            id: cmd.id,
            command_id_ref: cmd.command_id_ref || '',
            title: cmd.title || '',
            command: cmd.command || cmd.command_text || '',
            extract_method: cmd.extract_method || '',
            comparator_method: cmd.comparator_method || '',
            reference_value: cmd.reference_value || cmd.expected_output || ''
          }))
        });

        setShowMopModal(true);
      } else {
        setNotification({type: 'error', message: t('errorLoadingMOPForEditing')});
      }
    } catch (error) {
      console.error('Error loading MOP for editing:', error);
      setNotification({type: 'error', message: t('errorLoadingMOPForEditing')});
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
        setNotification({type: 'error', message: 'Error loading MOP details'});
      }
    } catch (error) {
      console.error('Error loading MOP details:', error);
      setNotification({type: 'error', message: 'Error loading MOP details'});
    }
  };

  const confirmDeleteMOP = async () => {
    if (!deleteMopId) return;
    
    try {
      const data = await apiService.delete<any>(`${API_ENDPOINTS.MOPS.LIST}/${deleteMopId}`);
      if (data.success) {
        setNotification({type: 'success', message: t('mopDeletedSuccessfully')});
        setShowDeleteModal(false);
        setDeleteMopId(null);
        setDeleteMopName('');
        fetchMOPs();
      } else {
        setNotification({type: 'error', message: data.error || t('errorDeletingMOP')});
      }
    } catch (error) {
      console.error('Error deleting MOP:', error);
      setNotification({type: 'error', message: t('errorDeletingMOP')});
    }
  };

  // Command management functions
  const addCommand = () => {
    const newCommand: Command = {
      command_id_ref: '',
      title: '',
      command: '',
      extract_method: '',
      comparator_method: '',
      reference_value: ''
    };
    setFormData(prev => ({
      ...prev,
      commands: [...prev.commands, newCommand]
    }));
  };

  const removeCommand = (index: number) => {
    setFormData(prev => ({
      ...prev,
      commands: prev.commands.filter((_, i) => i !== index)
    }));

  };

  const updateCommand = (index: number, field: keyof Command, value: string) => {
    setFormData(prev => {
      const newCommands = prev.commands.map((cmd, i) => 
        i === index ? { ...cmd, [field]: value } : cmd
      );
      

      
      return {
        ...prev,
        commands: newCommands
      };
    });
  };





  // Add command from template
  const addCommandFromTemplate = (template: typeof commandTemplates[0]) => {
    const newCommand: Command = {
      command_id_ref: '',
      title: template.title,
      command: template.command,
      extract_method: '',
      comparator_method: '',
      reference_value: template.reference_value
    };
    
    setFormData(prev => ({
      ...prev,
      commands: [...prev.commands, newCommand]
    }));
    
    setShowCommandTemplates(false);
  };

  // Preview functions
  const updatePreview = () => {
    setShowPreviewModal(true);
  };

  const handleApproveMOP = () => {
    if (currentMop && currentMop.status === 'pending') {
      setShowApproveConfirm(true);
    }
  };

  const approveCurrentMOP = async () => {
    if (!currentMop) return;
    
    try {
      const data = await apiService.post<any>(`${API_ENDPOINTS.MOPS.LIST}/${currentMop.id}/approve`);
      if (data.success) {
        setNotification({type: 'success', message: t('mopApprovedSuccessfully')});
        setShowApproveConfirm(false);
        setShowDetailModal(false);
        fetchMOPs();
      } else {
        setNotification({type: 'error', message: data.error || t('errorApprovingMOP')});
      }
    } catch (error) {
      console.error('Error approving MOP:', error);
      setNotification({type: 'error', message: t('errorApprovingMOP')});
    }
  };

  const saveMOP = async () => {
    if (!formData.name) {
      setNotification({type: 'warning', message: t('pleaseEnterMOPName')});
      return;
    }
    
    if (!formData.risk_assessment && !formData.handover_assessment) {
      setNotification({type: 'warning', message: t('pleaseSelectAtLeastOneMOPType')});
      return;
    }
    
    if (formData.commands.length === 0) {
      setNotification({type: 'warning', message: t('pleaseAddAtLeastOneCommand')});
      return;
    }

    // Basic validation for commands
    const hasInvalidCommands = formData.commands.some(cmd => !cmd.title?.trim() || !cmd.command?.trim());
    if (hasInvalidCommands) {
      setNotification({type: 'error', message: t('pleaseFillInAllCommandTitlesAndCommands')});
      return;
    }

    try {
      if (isEditing && currentMop) {
        const mopUpdateData = {
          name: formData.name,
          description: formData.description,
          type: [
            ...(formData.risk_assessment ? ['risk_assessment'] : []),
            ...(formData.handover_assessment ? ['handover_assessment'] : [])
          ]
        };
        
        console.log('Updating MOP with data:', mopUpdateData);
        console.log('MOP ID:', currentMop.id);
        
        const updateResponse = await apiService.put<any>(`${API_ENDPOINTS.MOPS.LIST}/${currentMop.id}`, mopUpdateData);
        
        console.log('Update response:', updateResponse);
        
        if (!updateResponse.success) {
          console.error('Update failed:', updateResponse.error);
          setNotification({type: 'error', message: updateResponse.error || t('errorUpdatingMOP')});
          return;
        }
        
        const validCommands = formData.commands.filter(cmd => cmd.title && cmd.command);
        if (validCommands.length > 0) {
          try {
            const commandsResponse = await apiService.post<any>(`${API_ENDPOINTS.MOPS.LIST}/${currentMop.id}/commands/bulk`, {
              commands: validCommands
            });
            
            if (!commandsResponse.success) {
              setNotification({type: 'warning', message: t('mopUpdatedButFailedToUpdateCommands')});
            }
          } catch (cmdError) {
            console.error('Commands update failed:', cmdError);
            setNotification({type: 'warning', message: t('mopUpdatedButFailedToUpdateCommands')});
          }
        }
        
        setNotification({type: 'success', message: t('mopUpdatedSuccessfully')});
      } else {
        const mopData = {
          name: formData.name,
          description: formData.description,
          type: [
            ...(formData.risk_assessment ? ['risk_assessment'] : []),
            ...(formData.handover_assessment ? ['handover_assessment'] : [])
          ],
          commands: formData.commands.filter(cmd => cmd.title && cmd.command)
        };
        
        const data = await apiService.post<any>(API_ENDPOINTS.MOPS.LIST, mopData);
        
        if (!data.success) {
          setNotification({type: 'error', message: data.error || t('errorCreatingMOP')});
          return;
        }
        
        setNotification({type: 'success', message: t('mopCreatedSuccessfully')});
      }
      
      setShowMopModal(false);
      fetchMOPs();
    } catch (error) {
      console.error('Error saving MOP:', error);
      setNotification({type: 'error', message: t('errorSavingMOP')});
    }
  };

  const approveMOP = async (mopId: string) => {
    try {
      const data = await apiService.post<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}/approve`);
      if (data.success) {
        setNotification({type: 'success', message: 'MOP approved successfully'});
        fetchMOPs();
      } else {
        setNotification({type: 'error', message: data.error || 'Error approving MOP'});
      }
    } catch (error) {
      console.error('Error approving MOP:', error);
      setNotification({type: 'error', message: t('errorApprovingMOP')});
    }
  };

  const rejectMOP = async (mopId: string) => {
    try {
      const data = await apiService.post<any>(`${API_ENDPOINTS.MOPS.LIST}/${mopId}/reject`);
      if (data.success) {
        setNotification({type: 'success', message: t('mopRejectedSuccessfully')});
        fetchMOPs();
      } else {
        setNotification({type: 'error', message: data.error || t('errorRejectingMOP')});
      }
    } catch (error) {
      console.error('Error rejecting MOP:', error);
      setNotification({type: 'error', message: t('errorRejectingMOP')});
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <div className="spinner-border" role="status">
          <span className="sr-only">{t('loading')}</span>
        </div>
      </div>
    );
  }

  // Safety check for data integrity
  if (!Array.isArray(mops)) {
    return (
      <div className="alert alert-warning">
        <h4>{t('dataLoadingIssue')}</h4>
        <p>{t('unableToLoadMOPData')}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('refreshPage')}
        </button>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* Notification */}
      {notification && (
        <div className={`alert alert-${notification.type === 'error' ? 'danger' : notification.type} alert-dismissible fade show`} role="alert">
          <i className={`fas fa-${notification.type === 'success' ? 'check-circle' : notification.type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'} mr-2`}></i>
          {notification.message}
          <button type="button" className="close" onClick={() => setNotification(null)}>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="d-sm-flex align-items-center justify-content-between mb-4">
        <h1 className="h3 mb-0 text-gray-800">{t('mopManagement')}</h1>
        <button 
          className="btn btn-primary btn-sm shadow-sm"
          onClick={showCreateMOPModal}
        >
          <i className="fas fa-plus fa-sm text-white-50 mr-1"></i>
          {t('createNewMOP')}
        </button>
      </div>

      {/* MOPs Table */}
      <div className="card shadow mb-4">
        <div className="card-header py-3">
          <h6 className="m-0 font-weight-bold text-primary">{t('mopsList')}</h6>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered" width="100%" cellSpacing="0">
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('type')}</th>
                  <th>{t('status')}</th>
                  <th>{t('createdBy')}</th>
                  <th>{t('createdAt')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {mops.map((mop) => (
                  <tr key={mop.id}>
                    <td>{mop.name}</td>
                    <td>
                      {Array.isArray(mop.type) ? mop.type.map(t => (
                        <span key={t} className="badge badge-info mr-1">
                          {t ? t.replace('_', ' ').toUpperCase() : 'UNKNOWN'}
                        </span>
                      )) : (
                        <span className="badge badge-secondary">Unknown</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${mop.status === 'approved' ? 'success' : 'warning'}`}>
                        {mop.status?.toUpperCase() || t('unknown')}
                      </span>
                    </td>
                    <td>{mop.created_by?.full_name || mop.created_by?.username || t('unknown')}</td>
                    <td>{new Date(mop.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="btn-group" role="group">
                        <button 
                          className="btn btn-info btn-sm" 
                          onClick={() => viewMOP(mop.id)}
                          title={t('viewDetails')}
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                        <button 
                          className="btn btn-warning btn-sm" 
                          onClick={() => editMOP(mop.id)}
                          title={t('editMOP')}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        {isAdmin && (
                          <button 
                            className="btn btn-danger btn-sm" 
                            onClick={() => deleteMOP(mop.id)}
                            title={t('deleteMOP')}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create/Edit MOP Modal */}
      {showMopModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-file-alt mr-2"></i>
                  {isEditing ? t('editMOP') : t('createNewMOP')}
                </h5>
                <button type="button" className="close" onClick={() => setShowMopModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <form>
                  {/* MOP Name */}
                  <div className="form-group">
                    <label className="form-label">
                      <i className="fas fa-tag mr-2"></i>
                      {t('mopName')} *
                    </label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={formData.name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t('enterMOPName')}
                      required 
                    />
                  </div>

                  {/* MOP Description */}
                  <div className="form-group">
                    <label className="form-label">
                      <i className="fas fa-align-left mr-2"></i>
                      {t('description')}
                    </label>
                    <textarea 
                      className="form-control" 
                      rows={3}
                      value={formData.description || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={t('enterMOPDescription')}
                    />
                  </div>

                  {/* MOP Type */}
                  <div className="form-group">
                    <label className="form-label">
                      <i className="fas fa-list mr-2"></i>
                      {t('assessmentType')} *
                    </label>
                    <div className="form-check-container">
                      <div className="form-check form-check-inline">
                        <input 
                          className="form-check-input" 
                          type="checkbox" 
                          id="risk_assessment"
                          checked={formData.risk_assessment || false}
                          onChange={(e) => setFormData(prev => ({ ...prev, risk_assessment: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="risk_assessment">
                          Risk Assessment
                        </label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input 
                          className="form-check-input" 
                          type="checkbox" 
                          id="handover_assessment"
                          checked={formData.handover_assessment || false}
                          onChange={(e) => setFormData(prev => ({ ...prev, handover_assessment: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="handover_assessment">
                          Handover Assessment
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Commands Section */}
                  <div className="form-group">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <label className="form-label">
                        <i className="fas fa-terminal mr-2"></i>
                        Commands ({formData.commands.length})
                      </label>
                      <div className="btn-group">
                        <button 
                          type="button" 
                          className="btn btn-success btn-sm" 
                          onClick={addCommand}
                        >
                          <i className="fas fa-plus mr-1"></i>Add Command
                        </button>
                        <button 
                          type="button" 
                          className={`btn btn-info btn-sm ${showCommandTemplates ? 'active' : ''}`}
                          onClick={() => setShowCommandTemplates(!showCommandTemplates)}
                        >
                          <i className="fas fa-clipboard-list mr-1"></i>
                          {showCommandTemplates ? 'Hide Templates' : 'Show Templates'}
                        </button>
                      </div>
                    </div>

                    {/* Command Templates */}
                    {showCommandTemplates && (
                      <div className="card mb-3">
                        <div className="card-header">
                          <h6 className="mb-0">
                            <i className="fas fa-clipboard-list mr-2"></i>
                            Command Templates
                            <button 
                              type="button" 
                              className="btn btn-sm btn-outline-secondary float-right"
                              onClick={() => setShowCommandTemplates(false)}
                            >
                              <i className="fas fa-times"></i> Close
                            </button>
                          </h6>
                        </div>
                        <div className="card-body">
                          <div className="row">
                            {commandTemplates.map((template, index) => (
                              <div key={index} className="col-md-6 mb-2">
                                <div className="card border-left-primary">
                                  <div className="card-body p-2">
                                    <h6 className="card-title mb-1">{template.title}</h6>
                                    <p className="card-text small mb-1">
                                      <code>{template.command}</code>
                                    </p>
                                    <button 
                                      type="button" 
                                      className="btn btn-primary btn-xs"
                                      onClick={() => {
                                        addCommandFromTemplate(template);
                                        setShowCommandTemplates(false); // Auto close after adding
                                      }}
                                    >
                                      <i className="fas fa-plus mr-1"></i>Add
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Commands Table - Simplified without drag-drop */}
                    {!showCommandTemplates && formData.commands.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-bordered">
                          <thead className="thead-light">
                            <tr>
                              <th style={{ width: '5%' }}>STT</th>
                              <th style={{ width: '10%' }}>ID</th>
                              <th style={{ width: '20%' }}>Name</th>
                              <th style={{ width: '25%' }}>Command</th>
                              <th style={{ width: '12%' }}>Extract</th>
                              <th style={{ width: '12%' }}>Comparator</th>
                              <th style={{ width: '11%' }}>Reference Value</th>
                              <th style={{ width: '5%' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.commands.map((command, index) => (
                              <tr key={index}>
                                <td className="text-center align-middle">{index + 1}</td>
                                <td>
                                  <input 
                                    type="text" 
                                    className="form-control form-control-sm"
                                    value={command.command_id_ref || ''}
                                    onChange={(e) => updateCommand(index, 'command_id_ref', e.target.value)}
                                    placeholder="1a, 6a@{{user}}"
                                    required 
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="text" 
                                    className="form-control form-control-sm"
                                    value={command.title || ''}
                                    onChange={(e) => updateCommand(index, 'title', e.target.value)}
                                    placeholder="Command Name"
                                    required 
                                  />
                                </td>
                                <td>
                                  <textarea 
                                    className="form-control form-control-sm"
                                    rows={2}
                                    value={command.command || ''}
                                    onChange={(e) => updateCommand(index, 'command', e.target.value)}
                                    placeholder="Enter command"
                                    required
                                    style={{ resize: 'vertical', minHeight: '50px' }}
                                  />
                                </td>
                                <td>
                                  <select 
                                    className="form-control form-control-sm"
                                    value={command.extract_method || 'raw'}
                                    onChange={(e) => updateCommand(index, 'extract_method', e.target.value)}
                                  >
                                    <option value="raw">raw</option>
                                    <option value="first_line">first_line</option>
                                    <option value="lines_count">lines_count</option>
                                    <option value="regex">regex:(...)</option>
                                    <option value="field">field:N</option>
                                    <option value="per_line">per_line:&lt;sub&gt;</option>
                                  </select>
                                </td>
                                <td>
                                  <select 
                                    className="form-control form-control-sm"
                                    value={command.comparator_method || 'eq'}
                                    onChange={(e) => updateCommand(index, 'comparator_method', e.target.value)}
                                  >
                                    <option value="eq">eq</option>
                                    <option value="neq">neq</option>
                                    <option value="contains">contains</option>
                                    <option value="not_contains">not_contains</option>
                                    <option value="regex">regex</option>
                                    <option value="int_eq">int_eq</option>
                                    <option value="int_ge">int_ge</option>
                                    <option value="int_gt">int_gt</option>
                                    <option value="int_le">int_le</option>
                                    <option value="int_lt">int_lt</option>
                                    <option value="empty">empty</option>
                                    <option value="non_empty">non_empty</option>
                                  </select>
                                </td>
                                <td>
                                  <textarea 
                                    className="form-control form-control-sm" 
                                    rows={2}
                                    value={command.reference_value || ''}
                                    onChange={(e) => updateCommand(index, 'reference_value', e.target.value)}
                                    placeholder="Reference value"
                                    style={{ resize: 'vertical', minHeight: '50px' }}
                                  />
                                </td>
                                <td className="text-center align-middle">
                                  <button 
                                    type="button" 
                                    className="btn btn-danger btn-sm" 
                                    onClick={() => removeCommand(index)}
                                    title="Delete Command"
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

                    {!showCommandTemplates && formData.commands.length === 0 && (
                      <div className="text-center py-4 border border-dashed rounded">
                        <i className="fas fa-terminal fa-3x text-muted mb-3"></i>
                        <h5 className="text-muted">No Commands Added</h5>
                        <p className="text-muted">Click "Add Command" or use templates to get started</p>
                      </div>
                    )}
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-info" 
                  onClick={updatePreview}
                >
                  <i className="fas fa-eye mr-1"></i>Preview
                </button>
                {isEditing && currentMop && currentMop.status === 'pending' && (
                  <button 
                    type="button" 
                    className="btn btn-success" 
                    onClick={handleApproveMOP}
                  >
                    <i className="fas fa-check mr-1"></i>Approve MOP
                  </button>
                )}
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={saveMOP}
                >
                  <i className="fas fa-save mr-1"></i>
                  {isEditing ? 'Update MOP' : 'Save MOP'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowMopModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View MOP Details Modal */}
      {showDetailModal && currentMop && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-file-alt mr-2"></i>
                  MOP Details: {currentMop.name}
                </h5>
                <button type="button" className="close" onClick={() => setShowDetailModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="row">
                  <div className="col-md-6">
                    <p><strong>Name:</strong> {currentMop.name}</p>
                    <p><strong>Description:</strong> {currentMop.description || 'N/A'}</p>
                    <p><strong>Status:</strong> 
                      <span className={`badge badge-${currentMop.status === 'approved' ? 'success' : 'warning'} ml-2`}>
                        {currentMop.status?.toUpperCase() || 'UNKNOWN'}
                      </span>
                    </p>
                  </div>
                  <div className="col-md-6">
                    <p><strong>Type:</strong> 
                      {Array.isArray(currentMop.type) ? currentMop.type.map(t => (
                        <span key={t} className="badge badge-info ml-1">
                          {t ? t.replace('_', ' ').toUpperCase() : 'UNKNOWN'}
                        </span>
                      )) : 'Unknown'}
                    </p>
                    <p><strong>Created By:</strong> {currentMop.created_by?.full_name || 'Unknown'}</p>
                    <p><strong>Created At:</strong> {new Date(currentMop.created_at).toLocaleString()}</p>
                  </div>
                </div>
                
                {currentMop.commands && currentMop.commands.length > 0 && (
                  <div className="mt-4">
                    <h6><strong>Commands:</strong></h6>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered">
                        <thead className="thead-light">
                          <tr>
                            <th>STT</th>
                            <th>Command Title</th>
                            <th>Command</th>
                            <th>Expected Output</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentMop.commands.map((cmd, index) => (
                            <tr key={index}>
                              <td>{index + 1}</td>
                              <td>{cmd.title}</td>
                              <td><code>{cmd.command}</code></td>
                              <td>{cmd.reference_value || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {isAdmin && currentMop.status === 'pending' && (
                  <>
                    <button 
                      type="button" 
                      className="btn btn-success" 
                      onClick={() => approveMOP(currentMop.id)}
                    >
                      <i className="fas fa-check mr-1"></i>Approve MOP
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-danger" 
                      onClick={() => rejectMOP(currentMop.id)}
                    >
                      <i className="fas fa-times mr-1"></i>Reject MOP
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

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-eye mr-2"></i>
                  MOP Preview
                </h5>
                <button type="button" className="close" onClick={() => setShowPreviewModal(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="row">
                  <div className="col-md-6">
                    <p><strong>Name:</strong> {formData.name}</p>
                    <p><strong>Description:</strong> {formData.description || 'N/A'}</p>
                  </div>
                  <div className="col-md-6">
                    <p><strong>Type:</strong> 
                      {formData.risk_assessment && (
                        <span className="badge badge-info ml-1">RISK ASSESSMENT</span>
                      )}
                      {formData.handover_assessment && (
                        <span className="badge badge-info ml-1">HANDOVER ASSESSMENT</span>
                      )}
                    </p>
                  </div>
                </div>
                
                {formData.commands.length > 0 && (
                  <div className="mt-4">
                    <h6><strong>Commands:</strong></h6>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered">
                        <thead className="thead-light">
                          <tr>
                            <th style={{ width: '5%' }}>STT</th>
                            <th style={{ width: '10%' }}>ID</th>
                            <th style={{ width: '20%' }}>Name</th>
                            <th style={{ width: '25%' }}>Command</th>
                            <th style={{ width: '12%' }}>Extract</th>
                            <th style={{ width: '12%' }}>Comparator</th>
                            <th style={{ width: '16%' }}>Reference Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.commands.map((cmd, index) => (
                            <tr key={index}>
                              <td>{index + 1}</td>
                              <td>{cmd.command_id_ref || 'N/A'}</td>
                              <td>{cmd.title}</td>
                              <td><code>{cmd.command}</code></td>
                              <td>{cmd.extract_method || 'raw'}</td>
                              <td>{cmd.comparator_method || 'eq'}</td>
                              <td>{cmd.reference_value || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowPreviewModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        title="Approve MOP"
        message="Are you sure you want to approve this MOP? This action cannot be undone."
        onConfirm={approveCurrentMOP}
        onClose={() => setShowApproveConfirm(false)}
        confirmText="Approve"
        cancelText="Cancel"
        confirmVariant="success"
      />
    </div>
  );
};

export default MOPManagement;