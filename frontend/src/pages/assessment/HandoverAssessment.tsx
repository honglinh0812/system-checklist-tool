import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { ErrorMessage } from '../../components/common';
import { useTranslation } from '../../i18n/useTranslation';

interface MOP {
  id: number;
  name: string;
  type: string[];
  status: string;
  commands?: Command[];
}

interface Command {
  id: number;
  command_text: string;
  description: string;
  order_index: number;
}

const HandoverAssessment: React.FC = () => {
  const { t } = useTranslation();
  
  // State management
  const [selectedMOP, setSelectedMOP] = useState<string>('');

  const [filteredMops, setFilteredMops] = useState<MOP[]>([]);
  const [activeTab, setActiveTab] = useState<'assessment' | 'reports'>('assessment');
  const [assessmentType] = useState<'emergency' | 'periodic'>('emergency');
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [showViewMOPModal, setShowViewMOPModal] = useState(false);
  const [servers, setServers] = useState<{name?: string, ip?: string, serverIP: string, sshPort: string, sshUser: string, sshPassword: string, sudoUser: string, sudoPassword: string}[]>([]);
  const [selectedServers, setSelectedServers] = useState<boolean[]>([]);
  const [assessmentResults, setAssessmentResults] = useState<any>(null);
  const [manualServerData, setManualServerData] = useState<{
    serverIP: string;
    sshPort: string;
    sshUser: string;
    sshPassword: string;
    sudoUser: string;
    sudoPassword: string;
  }>({
    serverIP: '',
    sshPort: '22',
    sshUser: '',
    sshPassword: '',
    sudoUser: '',
    sudoPassword: ''
  });
  
  // Non-persisted states - loading, temporary actions, volatile data
  const [alert, setAlert] = useState<{type: 'error' | 'success' | 'warning' | 'info'; message: string} | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverFile, setServerFile] = useState<File | null>(null);
  const [connectionResults, setConnectionResults] = useState<({success: boolean, message: string, serverIndex: number} | null)[]>([]);
  const [canStartAssessment, setCanStartAssessment] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteServerIndex, setDeleteServerIndex] = useState<number>(-1);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning' | 'info'; message: string} | null>(null);

  // Add useEffect to monitor selectedServers and connectionResults changes
  useEffect(() => {
    // Check if all selected servers have successful connections
    const selectedResults = connectionResults.filter((_, index) => selectedServers[index] && connectionResults[index]);
    const allSuccess = selectedResults.length > 0 && selectedResults.every((result) => result && result.success === true);
    console.log('Can start assessment updated:', allSuccess, 'Selected results:', selectedResults);
    setCanStartAssessment(allSuccess);
  }, [selectedServers, connectionResults]);

  const showAlert = (type: 'error' | 'success' | 'warning' | 'info', message: string) => {
    setAlert({type, message});
    setTimeout(() => setAlert(null), 3000);
  };

  const fetchMOPs = async () => {
    try {
      setLoading(true);
      const response = await apiService.get<{success: boolean; data: {mops: MOP[]; pagination: any}}>(`${API_ENDPOINTS.MOPS.LIST}?context=assessment`);
      if (response.success && response.data) {
        const allMops = response.data.mops || [];
        // Filter MOPs for handover assessment (approved status and assessment_type is 'handover_assessment')
        const handoverMops = allMops.filter((mop: MOP) => 
          mop.status === 'approved' && (mop as any).assessment_type === 'handover_assessment'
        );
        setFilteredMops(handoverMops);
        console.log('Fetched MOPs:', allMops.length, 'Handover MOPs:', handoverMops.length);
      }
    } catch (error) {
      console.error('Error fetching MOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('HandoverAssessment mounted, current states:', {
      selectedMOP,
      activeTab,
      assessmentType,
      serversLength: servers.length,
      selectedServersLength: selectedServers.length
    });
    fetchMOPs();
  }, []);

  const handleMOPSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mopId = event.target.value;
    setSelectedMOP(mopId);
    // MOP selection logic handled by setSelectedMOP
  };

  const getSelectedMOPCommands = () => {
    if (!Array.isArray(filteredMops)) return [];
    const selectedMOPData = filteredMops.find(mop => mop.id.toString() === selectedMOP);
    return selectedMOPData?.commands || [];
  };

  const handleTestConnection = async () => {
    console.log('handleTestConnection called');
    console.log('servers:', servers);
    console.log('selectedServers:', selectedServers);
    
    const selectedServerList = servers.filter((_: any, index: number) => selectedServers[index]);
    console.log('selectedServerList:', selectedServerList);
    
    if (selectedServerList.length === 0) {
      setNotification({type: 'warning', message: t('selectAtLeastOneServer')});
      return;
    }

    try {
      console.log('Sending request to:', API_ENDPOINTS.ASSESSMENTS.HANDOVER_TEST_CONNECTION);
      
      // Map frontend fields to backend expected fields
      const mappedServers = selectedServerList.map((server: any) => ({
        ip: server.serverIP,
        admin_username: server.sshUser,
        admin_password: server.sshPassword,
        root_username: server.sudoUser || 'root',
        root_password: server.sudoPassword,
        sshPort: parseInt(server.sshPort) || 22
      }));
      
      console.log('Request data:', { servers: mappedServers });
      
      const response = await apiService.post<any>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_TEST_CONNECTION, {
        servers: mappedServers
      });
      
      console.log('Response received:', response);
      const results = response.data?.results || response.results || [];
      console.log('Extracted results:', results);
      
      // Create a new connection results array
      const newConnectionResults = [...connectionResults];
      
      // Map results back to original server indices
      let selectedServerIndex = 0;
      servers.forEach((_: any, originalIndex: number) => {
        if (selectedServers[originalIndex]) {
          const result = results[selectedServerIndex]; // Direct index mapping
          if (result) {
            newConnectionResults[originalIndex] = {
              success: result.success,
              message: result.message,
              serverIndex: originalIndex
            };
          }
          selectedServerIndex++;
        }
      });
      
      console.log('Setting connectionResults to:', newConnectionResults);
      setConnectionResults(newConnectionResults);
      
      // Check if all selected servers have successful connections
      const selectedResults = newConnectionResults.filter((_, index) => selectedServers[index] && newConnectionResults[index]);
      console.log('Selected results for assessment check:', selectedResults);
      const allSuccess = selectedResults.length > 0 && selectedResults.every((result) => result && result.success === true);
      console.log('Can start assessment:', allSuccess);
      
      setCanStartAssessment(allSuccess);
    } catch (error) {
      console.error('Error testing connection:', error);
      setNotification({type: 'error', message: t('connectionTestError')});
    }
  };

  const handleStartAssessment = async () => {
    // Validate MOP selection
    if (!selectedMOP) {
      setNotification({type: 'warning', message: t('selectMOPFirst')});
      return;
    }

    // Validate MOP type for handover assessment
    const selectedMOPData = Array.isArray(filteredMops) ? filteredMops.find(mop => mop.id.toString() === selectedMOP) : null;
    if (!selectedMOPData || (selectedMOPData as any).assessment_type !== 'handover_assessment') {
      setNotification({type: 'warning', message: t('mopNotSuitableForHandover')});
      return;
    }

    // Validate server selection
    const selectedServerList = servers.filter((_: any, index: number) => selectedServers[index]);
    if (selectedServerList.length === 0) {
      setNotification({type: 'warning', message: t('selectAtLeastOneServerForAssessment')});
      return;
    }

    try {
      setAssessmentLoading(true);
      
      // Map frontend fields to backend expected fields
      const mappedServers = selectedServerList.map((server: any) => ({
        ip: server.serverIP,
        admin_username: server.sshUser,
        admin_password: server.sshPassword,
        root_username: server.sudoUser || 'root',
        root_password: server.sudoPassword,
        sshPort: parseInt(server.sshPort) || 22
      }));
      
      const response = await apiService.post<{data: {assessment_id: number, status: string, message: string}, success: boolean}>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_START, {
        mop_id: parseInt(selectedMOP),
        servers: mappedServers
      });
      
      if (response.data && response.data.assessment_id) {
        setNotification({type: 'success', message: t('assessmentStartedSuccessfully')});
        
        // Polling for results instead of setTimeout
        const pollResults = async () => {
          try {
            const resultsResponse = await apiService.get<any>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_RESULTS(response.data.assessment_id));
            
            if (resultsResponse.data && resultsResponse.data.status === 'completed') {
              setAssessmentResults({
                ...resultsResponse.data,
                mop_name: selectedMOPData.name,
                commands: selectedMOPData.commands || []
              });
              setAssessmentLoading(false);
            } else if (resultsResponse.data && resultsResponse.data.status === 'failed') {
              setNotification({type: 'error', message: t('assessmentFailed')});
              setAssessmentResults({
                ...resultsResponse.data,
                mop_name: selectedMOPData.name,
                commands: selectedMOPData.commands || []
              });
              setAssessmentLoading(false);
            } else {
              // Still processing, continue polling
              setTimeout(pollResults, 2000); // Poll every 2 seconds
            }
          } catch (error) {
            console.error('Error fetching assessment results:', error);
            setNotification({type: 'error', message: t('errorFetchingAssessmentResults')});
            setAssessmentLoading(false);
          }
        };
        
        // Start polling after 2 seconds
        setTimeout(pollResults, 2000);
      }
    } catch (error) {
      console.error('Error starting assessment:', error);
      setNotification({type: 'error', message: t('errorStartingAssessment')});
      setAssessmentLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiService.get(API_ENDPOINTS.ASSESSMENTS.TEMPLATE_DOWNLOAD, {
        responseType: 'blob'
      }) as {data: Blob};
      
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'server_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      showAlert('error', 'Error downloading template. Please try again.');
    }
  };

  const handleAddManualServer = () => {
    if (manualServerData.serverIP && manualServerData.sshUser) {
      const newServer = {
        serverIP: manualServerData.serverIP,
        sshPort: manualServerData.sshPort,
        sshUser: manualServerData.sshUser,
        sshPassword: manualServerData.sshPassword,
        sudoUser: manualServerData.sudoUser,
        sudoPassword: manualServerData.sudoPassword
      };
      setServers([...servers, newServer]);
      setSelectedServers([...selectedServers, false]);
      setManualServerData({
        serverIP: '',
        sshPort: '22',
        sshUser: '',
        sshPassword: '',
        sudoUser: '',
        sudoPassword: ''
      });
      setShowManualInputModal(false);
    } else {
      setNotification({type: 'warning', message: t('fillRequiredFields')});
    }
  };

  const handleFileUpload = async () => {
    if (!serverFile) {
      setNotification({type: 'warning', message: 'Vui lòng chọn file trước khi upload.'});
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', serverFile);

      const response = await apiService.post<{success: boolean; servers: any[]; message?: string}>(
         API_ENDPOINTS.SERVERS.UPLOAD,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      // Debug: Log toàn bộ response từ backend
      console.log('Backend response:', response);
      console.log('Backend servers data:', response.servers);

      if (response.success && response.servers) {
        // Debug: Log từng server object
        response.servers.forEach((server, index) => {
          console.log(`Server ${index}:`, server);
          console.log(`  admin_username: ${server.admin_username}`);
          console.log(`  admin_password: ${server.admin_password}`);
          console.log(`  root_username: ${server.root_username}`);
          console.log(`  root_password: ${server.root_password}`);
        });

        const newServers = response.servers.map((server: any) => {
          const mappedServer = {
            name: server.name || server.server_name || server.ip,
            ip: server.ip || server.server_ip,
            serverIP: server.ip || server.server_ip,
            sshPort: server.ssh_port || '22',
            // Map từ backend fields sang frontend fields
            sshUser: server.admin_username,
            sshPassword: server.admin_password,
            sudoUser: server.root_username,
            sudoPassword: server.root_password
          };
          
          // Debug: Log mapped server
          console.log('Mapped server:', mappedServer);
          return mappedServer;
        });

        setServers([...servers, ...newServers]);
        setSelectedServers([...selectedServers, ...new Array(newServers.length).fill(false)]);
        setConnectionResults([...connectionResults, ...new Array(newServers.length).fill(null)]);
        
        setShowFileUploadModal(false);
        setServerFile(null);
        setNotification({type: 'success', message: `${t('uploadedSuccessfully')} ${newServers.length} ${t('servers')}`});
      } else {
        setNotification({type: 'error', message: t('errorUploadingFile') + (response.message || t('unknownError'))});
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setNotification({type: 'error', message: t('errorUploadingFileGeneral')});
    }
  };

  const handleDownloadReport = async () => {
    if (!assessmentResults?.id) {
      setNotification({
        type: 'error',
        message: t('noAssessmentResultsToDownload')
      });
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.ASSESSMENTS.HANDOVER_DOWNLOAD(assessmentResults.id), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('failedToDownloadReport'));
      }

      // Get filename from response headers or create default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `handover_assessment_${assessmentResults.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setNotification({
        type: 'success',
        message: t('reportDownloadedSuccessfully')
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      setNotification({
        type: 'error',
        message: t('errorDownloadingReport')
      });
    }
  };

  const handleDeleteServer = (index: number) => {
    setDeleteServerIndex(index);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteServer = () => {
    if (deleteServerIndex >= 0) {
      const newServers = servers.filter((_: any, i: number) => i !== deleteServerIndex);
      const newSelectedServers = selectedServers.filter((_: any, i: number) => i !== deleteServerIndex);
      const newConnectionResults = connectionResults.filter((_: any, i: number) => i !== deleteServerIndex);
      
      setServers(newServers);
      setSelectedServers(newSelectedServers);
      setConnectionResults(newConnectionResults);
    }
    setShowDeleteConfirm(false);
    setDeleteServerIndex(-1);
  };



  return (
    <div>
      {/* Notification */}
      {notification && (
        <div 
          className={`alert alert-${notification.type === 'error' ? 'danger' : notification.type} alert-dismissible fade show`}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            minWidth: '300px',
            maxWidth: '500px'
          }}
        >
          {notification.message}
          <button 
            type="button" 
            className="close" 
            onClick={() => setNotification(null)}
          >
            <span>&times;</span>
          </button>
        </div>
      )}

      {alert && (
        <ErrorMessage 
          message={alert.message} 
          type={alert.type === 'error' ? 'danger' : alert.type === 'success' ? 'info' : 'warning'}
          dismissible={true}
          onDismiss={() => setAlert(null)}
        />
      )}
      
      {/* Content Header */}
      <section className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1>{t('handoverAssessment')}</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <Link to="/dashboard">{t('home')}</Link>
                </li>
                <li className="breadcrumb-item active">{t('handoverAssessment')}</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header p-0 border-bottom-0">
                  <ul className="nav nav-tabs" id="handoverTabs" role="tablist">
                    <li className="nav-item">
                      <button 
                        className={`nav-link ${activeTab === 'assessment' ? 'active' : ''}`}
                        onClick={() => setActiveTab('assessment')}
                        type="button"
                      >
                        <i className="fas fa-exchange-alt mr-1"></i> {t('assessment')}
                      </button>
                    </li>
                    <li className="nav-item">
                      <button 
                        className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reports')}
                        type="button"
                      >
                        <i className="fas fa-chart-bar mr-1"></i> {t('reports')}
                      </button>
                    </li>
                  </ul>
                </div>
                <div className="card-body">
                  <div className="tab-content" id="handoverTabsContent">
                    {/* Assessment Tab */}
                    {activeTab === 'assessment' && (
                      <div className="tab-pane fade show active">
                        {loading ? (
                          <div className="text-center py-4">
                            <div className="spinner-border text-primary" role="status">
                              <span className="sr-only">Loading...</span>
                            </div>
                            <p className="mt-2 text-muted">{t('loadingMOPs')}</p>
                          </div>
                        ) : (
                          <>
                            {/* MOP Selection - Always visible */}
                            <div className="form-group">
                              <label htmlFor="mopSelect">
                                <strong>{t('selectMOP')}</strong>
                              </label>
                              <select 
                                className="form-control" 
                                id="mopSelect" 
                                value={selectedMOP}
                                onChange={handleMOPSelect}
                              >
                                <option value="">{t('chooseMOP')}</option>
                                {filteredMops.map(mop => (
                                  <option key={mop.id} value={mop.id}>
                                    {mop.name}
                                  </option>
                                ))}
                              </select>
                              {filteredMops.length === 0 && (
                                <small className="text-muted">{t('noApprovedMOPs')}</small>
                              )}
                            </div>
                            
                            {selectedMOP && assessmentType && (
                              <div className="mt-3">
                                <button 
                                  className="btn btn-info mr-2"
                                  onClick={() => setShowViewMOPModal(true)}
                                >
                                  {t('viewMOP')}
                                </button>
                              </div>
                            )}

                            {/* Server Selection Section - Always visible */}
                            <div className="mt-4">
                              <h6>{t('selectServer')}</h6>
                              <div className="row">
                                <div className="col-md-6">
                                  <button 
                                    className="btn btn-outline-primary btn-block"
                                    onClick={() => setShowFileUploadModal(true)}
                                  >
                                    <i className="fas fa-upload mr-2"></i>
                                    {t('uploadFileServer')}
                                  </button>
                                </div>
                                <div className="col-md-6">
                                  <button 
                                    className="btn btn-outline-secondary btn-block"
                                    onClick={() => setShowManualInputModal(true)}
                                  >
                                    <i className="fas fa-keyboard mr-2"></i>
                                    {t('manualInput')}
                                  </button>
                                </div>
                              </div>
                              
                              <div className="mt-3">
                                <a 
                                  href="#" 
                                  className="btn btn-link"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleDownloadTemplate();
                                  }}
                                >
                                  <i className="fas fa-download mr-2"></i>
                                  {t('downloadTemplate')}
                                </a>
                              </div>
                              
                              {/* Server List Table - Always visible */}
                              <div className="mt-4">
                                <h6>{t('serverList')}</h6>
                                {servers.length > 0 ? (
                                  <div className="table-responsive">
                                    <table className="table table-striped">
                                      <thead>
                                        <tr>
                                          <th>
                                            <input 
                                              type="checkbox" 
                                              checked={selectedServers.length > 0 && selectedServers.every(selected => selected)}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSelectedServers(servers.map(() => checked));
                                              }}
                                            /> {t('selectAll')}
                                          </th>
                                          <th>{t('ipAddress')}</th>
                                          <th>{t('sshPort')}</th>
                                          <th>{t('sshUser')}</th>
                                          <th>{t('connectionStatus')}</th>
                                          <th>{t('actions')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {servers.map((server, index) => {
                                          return (
                                            <tr key={index}>
                                              <td>
                                                <input 
                                                  type="checkbox" 
                                                  checked={selectedServers[index] || false}
                                                  onChange={(e) => {
                                                    const newSelected = [...selectedServers];
                                                    newSelected[index] = e.target.checked;
                                                    setSelectedServers(newSelected);
                                                  }}
                                                />
                                              </td>
                                              <td>
                                                <input 
                                                  type="text" 
                                                  className="form-control form-control-sm" 
                                                  value={server.ip || server.serverIP}
                                                  onChange={(e) => {
                                                    const newServers = [...servers];
                                                    newServers[index] = {
                                                      ...newServers[index],
                                                      serverIP: e.target.value,
                                                      ip: e.target.value
                                                    };
                                                    setServers(newServers);
                                                  }}
                                                  placeholder="192.168.1.100"
                                                />
                                              </td>
                                              <td>
                                                <input 
                                                  type="text" 
                                                  className="form-control form-control-sm" 
                                                  value={server.sshPort || '22'}
                                                  onChange={(e) => {
                                                    const newServers = [...servers];
                                                    newServers[index] = {
                                                      ...newServers[index],
                                                      sshPort: e.target.value
                                                    };
                                                    setServers(newServers);
                                                  }}
                                                  placeholder="22"
                                                />
                                              </td>
                                              <td>{server.sshUser}</td>
                                              <td>
                                                 {(() => {
                                                   console.log(`Checking connectionResults[${index}]:`, connectionResults[index]);
                                                   console.log('Full connectionResults array:', connectionResults);
                                                   return connectionResults[index] ? (
                                                     <span className={`badge ${
                                                       connectionResults[index].success ? 'badge-success' : 'badge-danger'
                                                     }`}>
                                                       {connectionResults[index].success ? 'Connection Success' : 'Connection Failed'}
                                                     </span>
                                                   ) : (
                                                     <span className="text-muted">Chưa kiểm tra</span>
                                                   );
                                                 })()}
                                               </td>
                                               <td>
                                                 <button 
                                                   className="btn btn-danger btn-sm"
                                                   onClick={() => handleDeleteServer(index)}
                                                   title="Xóa server"
                                                 >
                                                   <i className="fas fa-trash"></i>
                                                 </button>
                                               </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="alert alert-light">
                                    <p className="mb-0 text-muted">Chưa có server nào được thêm. Vui lòng upload file hoặc nhập thủ công thông tin server.</p>
                                  </div>
                                )}

                                {/* Action Buttons */}
                                {servers.length > 0 && (
                                  <div className="d-flex gap-2 mt-3">
                                    <button 
                                      className="btn btn-info"
                                      onClick={handleTestConnection}
                                    >
                                      {t('testConnection')}
                                    </button>
                                    <button 
                                      className="btn btn-success"
                                      onClick={handleStartAssessment}
                                      disabled={!canStartAssessment}
                                    >
                                      {t('executeAssessment')}
                                    </button>
                                  </div>
                                )}
                                
                                {/* Assessment Loading */}
                                {assessmentLoading && (
                                  <div className="mt-4">
                                    <div className="alert alert-info">
                                      <i className="fas fa-spinner fa-spin mr-2"></i>
                                      {t('assessmentInProgress')}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Assessment Results */}
                                {assessmentResults && (
                                  <div className="mt-4">
                                    <div className="card">
                                      <div className="card-header d-flex justify-content-between align-items-center">
                                        <h5 className="card-title mb-0">
                                          <i className="fas fa-chart-line mr-2"></i>
                                          {t('assessmentResults')}
                                        </h5>
                                        <div>
                                          <button 
                                            className="btn btn-success btn-sm mr-2"
                                            onClick={handleDownloadReport}
                                          >
                                            <i className="fas fa-download mr-2"></i>
                                            {t('downloadExcelReport')}
                                          </button>
                                          <button 
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setAssessmentResults(null)}
                                          >
                                            <i className="fas fa-times mr-2"></i>
                                            {t('clearResults')}
                                          </button>
                                        </div>
                                      </div>
                                      <div className="card-body">
                                        <div className="mb-3">
                                          <h6><strong>{t('mopExecuted')}</strong> {assessmentResults.mop_name}</h6>
                                          <p><strong>{t('status')}:</strong> 
                                            <span className={`badge ml-2 ${
                                              assessmentResults.status === 'completed' ? 'badge-success' : 
                                              assessmentResults.status === 'failed' ? 'badge-danger' : 'badge-warning'
                                            }`}>
                                              {assessmentResults.status === 'completed' ? t('success') : 
                                               assessmentResults.status === 'failed' ? t('failed') : t('processing')}
                                            </span>
                                          </p>
                                          
                                          {/* Execution Logs */}
                                          {assessmentResults.execution_logs && (
                                            <div className="mt-3">
                                              <h6><strong>{t('executionLogs')}</strong></h6>
                                              <div className="card">
                                                <div className="card-body" style={{backgroundColor: '#f8f9fa'}}>
                                                  <pre style={{fontSize: '12px', maxHeight: '300px', overflow: 'auto', whiteSpace: 'pre-wrap'}}>
                                                    {assessmentResults.execution_logs}
                                                  </pre>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Error Message */}
                                          {assessmentResults.error_message && (
                                            <div className="mt-3">
                                              <div className="alert alert-danger">
                                                <h6><strong>{t('error')}:</strong></h6>
                                                <p className="mb-0">{assessmentResults.error_message}</p>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {assessmentResults.test_results && (
                                          <div className="table-responsive">
                                            <table className="table table-bordered table-striped">
                                              <thead className="thead-dark">
                                                <tr>
                                                  <th>Server</th>
                                                  <th>{t('commandName')}</th>
                                                  <th>{t('executionResult')}</th>
                                                  <th>{t('referenceValue')}</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {assessmentResults.test_results.map((result: any, index: number) => (
                                                  <tr key={index}>
                                                    <td>{result.server_ip}</td>
                                                    <td>{result.command_text}</td>
                                                    <td>
                                                      <div className="mt-1">
                                                        <small className="text-muted">{result.output}</small>
                                                      </div>
                                                    </td>
                                                    <td>
                                                      <code>{result.reference_value || 'N/A'}</code>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>  
                        )}
                    </div>
                  )}
                  
                  {activeTab === 'reports' && (
                    <div className="tab-pane fade show active">
                      <div className="row">
                        <div className="col-12">
                          <h5>{t('handoverAssessmentReports')}</h5>
                          <div className="text-center py-4">
                            <i className="fas fa-chart-line fa-3x text-muted mb-3"></i>
                            <h6 className="text-muted">{t('assessmentReports')}</h6>
                            <p className="text-muted">
                              {t('viewAndDownloadReports')}
                            </p>
                            <button className="btn btn-primary">
                              <i className="fas fa-download mr-2"></i>
                              {t('downloadReports')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
        
      </section>

      {/* MOP Execution Modal */}
      {showExecutionModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('executeHandoverAssessment')}</h5>
                <button 
                  type="button" 
                  className="close" 
                  onClick={() => setShowExecutionModal(false)}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="form-group">
                  <label>{t('selectServers')}</label>
                  <div className="border p-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {servers.length > 0 ? (
                      servers.map((server, index) => (
                        <div key={index} className="form-check">
                          <input className="form-check-input" type="checkbox" id={`server-${index}`} />
                          <label className="form-check-label" htmlFor={`server-${index}`}>
                            {server.name || server.ip}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted">{t('noServersAddedYet')}</p>
                    )}
                  </div>
                </div>
                
                <div className="form-group">
                  <label>{t('serverInput')}</label>
                  <div className="row">
                    <div className="col-md-4">
                      <button 
                        type="button" 
                        className="btn btn-outline-primary btn-block mb-2"
                        onClick={() => setShowFileUploadModal(true)}
                      >
                        <i className="fas fa-upload mr-2"></i>{t('uploadServerList')}
                      </button>
                    </div>
                    <div className="col-md-4">
                      <button 
                        type="button" 
                        className="btn btn-outline-secondary btn-block mb-2"
                        onClick={() => setShowManualInputModal(true)}
                      >
                        <i className="fas fa-edit mr-2"></i>{t('manualInputButton')}
                      </button>
                    </div>
                    <div className="col-md-4">
                      <button 
                        type="button" 
                        className="btn btn-outline-info btn-block mb-2"
                      >
                        <i className="fas fa-plug mr-2"></i>{t('testConnectionButton')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowExecutionModal(false)}
                >
                  {t('cancel')}
                </button>
                <button type="button" className="btn btn-primary">
                  {t('executeAssessment')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Modal */}
      {showFileUploadModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('uploadServerList')}</h5>
                <button type="button" className="close" onClick={() => setShowFileUploadModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="serverFile">{t('selectFileExcelCSV')}</label>
                  <input 
                    type="file" 
                    className="form-control-file" 
                    id="serverFile" 
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setServerFile(e.target.files?.[0] || null)}
                  />
                  <small className="form-text text-muted">{t('uploadExcelOrCSV')}</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowFileUploadModal(false)}>{t('cancel')}</button>
                <button type="button" className="btn btn-primary" disabled={!serverFile} onClick={handleFileUpload}>
                  <i className="fas fa-upload mr-2"></i>{t('upload')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Input Modal */}
      {showManualInputModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('manualServerInput')}</h5>
                <button type="button" className="close" onClick={() => setShowManualInputModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label htmlFor="serverIP">{t('serverIP')}</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        id="serverIP" 
                        placeholder="192.168.1.100"
                        value={manualServerData.serverIP}
                        onChange={(e) => setManualServerData({...manualServerData, serverIP: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label htmlFor="sshPort">{t('sshPort')}</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        id="sshPort" 
                        placeholder="22"
                        value={manualServerData.sshPort}
                        onChange={(e) => setManualServerData({...manualServerData, sshPort: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label htmlFor="sshUser">{t('sshUser')}</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        id="sshUser"
                        placeholder="root"
                        value={manualServerData.sshUser}
                        onChange={(e) => setManualServerData({...manualServerData, sshUser: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="sshPassword">{t('sshPassword')}</label>
                        <input 
                          type="password" 
                          className="form-control" 
                          id="sshPassword"
                          value={manualServerData.sshPassword}
                          onChange={(e) => setManualServerData({...manualServerData, sshPassword: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="sudoUser">{t('sudoUser')}</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          id="sudoUser"
                          placeholder="root"
                          value={manualServerData.sudoUser}
                          onChange={(e) => setManualServerData({...manualServerData, sudoUser: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="sudoPassword">{t('sudoPassword')}</label>
                        <input 
                          type="password" 
                          className="form-control" 
                          id="sudoPassword"
                          value={manualServerData.sudoPassword}
                          onChange={(e) => setManualServerData({...manualServerData, sudoPassword: e.target.value})}
                        />
                      </div>
                    </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowManualInputModal(false)}>{t('cancel')}</button>
                <button type="button" className="btn btn-primary" onClick={handleAddManualServer}>
                  <i className="fas fa-plus mr-2"></i>{t('addServer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View MOP Modal */}
      {showViewMOPModal && (
        <div className="modal show d-block" tabIndex={-1}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('mopDetails')}: {Array.isArray(filteredMops) ? filteredMops.find(mop => mop.id.toString() === selectedMOP)?.name || '' : ''}</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowViewMOPModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>{t('id')}</th>
                        <th>{t('commandName')}</th>
                        <th>{t('commandContent')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSelectedMOPCommands().map((command, index) => (
                        <tr key={index}>
                          <td>{typeof command === 'string' ? index + 1 : command.id}</td>
                          <td>{typeof command === 'string' ? `${t('command')} ${index + 1}` : command.description || `${t('command')} ${index + 1}`}</td>
                          <td><code>{typeof command === 'string' ? command : command.command_text}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowViewMOPModal(false)}
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Server Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteServer}
        title={t('confirmDeleteServer')}
        message={t('confirmDeleteServerMessage')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        confirmVariant="danger"
      />
    </div>
  );
};

export default HandoverAssessment;