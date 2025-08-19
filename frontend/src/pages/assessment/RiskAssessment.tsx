import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useModalState } from '../../utils/stateUtils';
import ConfirmDialog from '../../components/common/ConfirmDialog';

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

const RiskAssessment: React.FC = () => {
  // Persisted state management with unique keys for Risk Assessment
  const [selectedMOP, setSelectedMOP] = usePersistedState<string>('risk_selectedMOP', '', { autoSave: true });
  const [filteredMops, setFilteredMops] = usePersistedState<MOP[]>('risk_filteredMops', []);
  const [activeTab, setActiveTab] = usePersistedState<'assessment' | 'reports'>('risk_activeTab', 'assessment');
  const [showExecutionModal, setShowExecutionModal] = useModalState(false);
  const [showFileUploadModal, setShowFileUploadModal] = useModalState(false);
  const [showManualInputModal, setShowManualInputModal] = useModalState(false);
  const [showViewMOPModal, setShowViewMOPModal] = useModalState(false);
  const [servers, setServers] = usePersistedState<{name?: string, ip?: string, serverIP: string, sshPort: string, sshUser: string, sshPassword: string, sudoUser: string, sudoPassword: string}[]>('risk_servers', [], {
    excludeKeys: ['sshPassword', 'sudoPassword'],
    autoSave: true,
    autoSaveInterval: 10000
  });
  const [selectedServers, setSelectedServers] = usePersistedState<boolean[]>('risk_selectedServers', []);
  const [assessmentResults, setAssessmentResults] = usePersistedState<any>('risk_assessmentResults', null);
  const [manualServerData, setManualServerData] = usePersistedState<{
    serverIP: string;
    sshPort: string;
    sshUser: string;
    sshPassword: string;
    sudoUser: string;
    sudoPassword: string;
  }>('risk_manualServerData', {
    serverIP: '',
    sshPort: '22',
    sshUser: '',
    sshPassword: '',
    sudoUser: '',
    sudoPassword: ''
  }, { excludeKeys: ['sshPassword', 'sudoPassword'] });
  
  // Non-persisted states - loading, temporary actions, và volatile data
  const [loading, setLoading] = useState<boolean>(true);
  const [serverFile, setServerFile] = useState<File | null>(null);
  const [connectionResults, setConnectionResults] = useState<({success: boolean, message: string, serverIndex: number} | null)[]>([]);
  const [canStartAssessment, setCanStartAssessment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteServerIndex, setDeleteServerIndex] = useState<number>(-1);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Add useEffect to monitor selectedServers and connectionResults changes
  useEffect(() => {
    // Check if all selected servers have successful connections
    const selectedResults = connectionResults.filter((_, index) => selectedServers[index] && connectionResults[index]);
    const allSuccess = selectedResults.length > 0 && selectedResults.every((result) => result && result.success === true);
    console.log('Can start assessment updated:', allSuccess, 'Selected results:', selectedResults);
    setCanStartAssessment(allSuccess);
  }, [selectedServers, connectionResults]);

  const fetchMOPs = async () => {
    try {
      setLoading(true);
      console.log('Fetching MOPs for risk assessment...');
      const response = await apiService.get<{success: boolean; data: {mops: MOP[]; pagination: any}}>(`${API_ENDPOINTS.MOPS.LIST}?context=assessment`);
      console.log('MOP API response:', response);
      
      if (response && response.success && response.data) {
        const allMops = response.data.mops || [];
        // Filter MOPs for risk assessment (approved status and assessment_type is 'risk_assessment')
        const riskMops = allMops.filter((mop: MOP) => 
          mop.status === 'approved' && (mop as any).assessment_type === 'risk_assessment'
        );
        setFilteredMops(riskMops);
        console.log('Fetched MOPs:', allMops.length, 'Risk MOPs:', riskMops.length);
      } else {
        console.warn('Invalid MOP response:', response);
        setFilteredMops([]);
      }
    } catch (error) {
      console.error('Error fetching MOPs:', error);
      setFilteredMops([]);
    } finally {
      console.log('Risk Assessment fetchMOPs completed');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMOPs();
  }, []);

  const handleMOPSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mopId = event.target.value;
    setSelectedMOP(mopId);
    // MOP selection logic handled by setSelectedMOP
  };

  const handleTestConnection = async () => {
    const selectedServerList = servers.filter((_, index) => selectedServers[index]);
    console.log('selectedServerList:', selectedServerList);
    
    if (selectedServerList.length === 0) {
      alert('Vui lòng chọn ít nhất một server (tick vào checkbox) để test connection.');
      return;
    }

    // Map frontend field names to backend expected field names
    const mappedServerList = selectedServerList.map(server => ({
      ip: server.serverIP || server.ip,
      admin_username: server.sshUser,
      admin_password: server.sshPassword,
      root_username: server.sudoUser,
      root_password: server.sudoPassword,
      sshPort: server.sshPort || '22'
    }));

    try {
      console.log('Sending request to:', API_ENDPOINTS.ASSESSMENTS.RISK_TEST_CONNECTION);
      console.log('Request data:', { servers: mappedServerList });
      
      const response = await apiService.post<any>(API_ENDPOINTS.ASSESSMENTS.RISK_TEST_CONNECTION, {
        servers: mappedServerList
      });

      const results = response.data?.results || response.results || [];

      // Create a new connection results array
      const newConnectionResults = [...connectionResults];
      
      // Map results back to original server indices
      let selectedServerIndex = 0;
      servers.forEach((_, originalIndex) => {
        if (selectedServers[originalIndex]) {
          const result = results[selectedServerIndex];
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
      
      setConnectionResults(newConnectionResults);
      
      // Check if all selected servers have successful connections
      const selectedResults = newConnectionResults.filter((_, index) => selectedServers[index] && newConnectionResults[index]);
      const allSuccess = selectedResults.length > 0 && selectedResults.every((result) => result && result.success === true);
      console.log('Can start assessment:', allSuccess);
      
      setCanStartAssessment(allSuccess);
    } catch (error) {
      console.error('Error testing connection:', error);
      alert('Có lỗi xảy ra khi test connection.');
    }
  };

  const handleStartAssessment = async () => {
    console.log('Starting assessment...');
    // Validate MOP selection
    if (!selectedMOP) {
      setNotification({type: 'error', message: 'Vui lòng chọn MOP trước khi bắt đầu assessment.'});
      return;
    }

    // Validate MOP type for risk assessment
    const selectedMOPData = Array.isArray(filteredMops) ? filteredMops.find(mop => mop.id.toString() === selectedMOP) : null;
    if (!selectedMOPData || (selectedMOPData as any).assessment_type !== 'risk_assessment') {
      setNotification({type: 'error', message: 'MOP đã chọn không phù hợp với đánh giá rủi ro. Vui lòng chọn MOP có kiểu "risk_assessment".'});
      return;
    }

    // Validate server selection
    const selectedServerList = servers.filter((_, index) => selectedServers[index]);
    if (selectedServerList.length === 0) {
      setNotification({type: 'error', message: 'Vui lòng chọn ít nhất một server để thực hiện assessment.'});
      return;
    }

    // Map frontend field names to backend expected field names
    const mappedServerList = selectedServerList.map(server => ({
      ip: server.serverIP || server.ip,
      admin_username: server.sshUser,
      admin_password: server.sshPassword,
      root_username: server.sudoUser,
      root_password: server.sudoPassword,
      sshPort: server.sshPort || '22'
    }));

    try {
      console.log('Setting assessment loading to true');
      setAssessmentLoading(true);
      console.log('Sending request to start assessment with data:', {
        mop_id: parseInt(selectedMOP),
        servers: mappedServerList
      });
      const response = await apiService.post<{data: {assessment_id: number, status: string, message: string}, success: boolean}>(API_ENDPOINTS.ASSESSMENTS.RISK_START, {
        mop_id: parseInt(selectedMOP),
        servers: mappedServerList
      });
      console.log('Start assessment response:', response);
      
      if (response.data && response.data.assessment_id) {
        alert('Assessment đã được bắt đầu thành công!');
        
        // Polling for results instead of setTimeout
        const pollResults = async () => {
          try {
            console.log('Fetching results for assessment ID:', response.data.assessment_id);
            const resultsUrl = API_ENDPOINTS.ASSESSMENTS.RISK_RESULTS(response.data.assessment_id);
            console.log('Results URL:', resultsUrl);
            const resultsResponse = await apiService.get<any>(resultsUrl);
            console.log('Results response:', resultsResponse);
            
            if (resultsResponse.data && resultsResponse.data.status === 'completed') {
              setAssessmentResults({
                ...resultsResponse.data,
                mop_name: selectedMOPData.name,
                commands: selectedMOPData.commands || []
              });
              console.log('Assessment results set successfully');
              setAssessmentLoading(false);
            } else if (resultsResponse.data && resultsResponse.data.status === 'failed') {
              alert('Assessment thất bại. Vui lòng kiểm tra logs.');
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
            alert('Có lỗi xảy ra khi lấy kết quả assessment.');
            setAssessmentLoading(false);
          }
        };
        
        // Start polling after 2 seconds
        setTimeout(pollResults, 2000);
      }
    } catch (error) {
      console.error('Error starting assessment:', error);
      alert('Có lỗi xảy ra khi bắt đầu assessment.');
      setAssessmentLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.ASSESSMENTS.TEMPLATE_DOWNLOAD);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'server_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Có lỗi xảy ra khi tải template.');
    }
  };

  const handleAddManualServer = () => {
    if (!manualServerData.serverIP || !manualServerData.sshUser || !manualServerData.sshPassword) {
      alert('Vui lòng điền đầy đủ thông tin server.');
      return;
    }

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
    setConnectionResults([...connectionResults, null]);
    
    // Reset form
    setManualServerData({
      serverIP: '',
      sshPort: '22',
      sshUser: '',
      sshPassword: '',
      sudoUser: '',
      sudoPassword: ''
    });
    
    setShowManualInputModal(false);
  };

  const handleFileUpload = async () => {
    if (!serverFile) {
      alert('Vui lòng chọn file trước khi upload.');
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
        alert(`Đã thêm thành công ${newServers.length} server từ file.`);
      } else {
        alert(response.message || 'Có lỗi xảy ra khi xử lý file.');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Có lỗi xảy ra khi upload file.');
    }
  };

  const handleDeleteServer = (index: number) => {
    setDeleteServerIndex(index);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteServer = () => {
    if (deleteServerIndex >= 0) {
      const newServers = servers.filter((_, i) => i !== deleteServerIndex);
      const newSelectedServers = selectedServers.filter((_, i) => i !== deleteServerIndex);
      const newConnectionResults = connectionResults.filter((_, i) => i !== deleteServerIndex);
      
      setServers(newServers);
      setSelectedServers(newSelectedServers);
      setConnectionResults(newConnectionResults);
    }
    setShowDeleteConfirm(false);
    setDeleteServerIndex(-1);
  };

  const getSelectedMOPCommands = () => {
    if (!Array.isArray(filteredMops)) return [];
    const selectedMOPData = filteredMops.find(mop => mop.id.toString() === selectedMOP);
    return selectedMOPData?.commands || [];
  };

  const handleDownloadReport = async () => {
    if (!assessmentResults?.id) {
      setNotification({
        type: 'error',
        message: 'Không có kết quả assessment để tải về'
      });
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.ASSESSMENTS.RISK_DOWNLOAD(assessmentResults.id), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}` // Add auth if needed
        }
      });

      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      // Get filename from response headers or create default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `risk_assessment_${assessmentResults.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
        message: 'Báo cáo đã được tải về thành công'
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      setNotification({
        type: 'error',
        message: 'Lỗi khi tải báo cáo'
      });
    }
  };

  return (
    <div>
      {/* Content Header */}
      <section className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1>Risk Assessment</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <Link to="/dashboard">Home</Link>
                </li>
                <li className="breadcrumb-item active">Risk Assessment</li>
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
                  <ul className="nav nav-tabs" id="riskTabs" role="tablist">
                    <li className="nav-item">
                      <button 
                        className={`nav-link ${activeTab === 'assessment' ? 'active' : ''}`}
                        onClick={() => setActiveTab('assessment')}
                        type="button"
                      >
                        <i className="fas fa-exclamation-triangle mr-1"></i> Đánh giá đột xuất
                      </button>
                    </li>
                    <li className="nav-item">
                      <button 
                        className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reports')}
                        type="button"
                      >
                        <i className="fas fa-calendar-check mr-1"></i> Đánh giá định kỳ
                      </button>
                    </li>
                  </ul>
                </div>
                <div className="card-body">
                  <div className="tab-content" id="riskTabsContent">
                    {/* Assessment Tab */}
                    {activeTab === 'assessment' && (
                      <div className="tab-pane fade show active">
                        {loading ? (
                          <div className="text-center py-4">
                            <div className="spinner-border text-primary" role="status">
                              <span className="sr-only">Loading...</span>
                            </div>
                            <p className="mt-2 text-muted">Đang tải danh sách MOPs...</p>
                          </div>
                        ) : (
                          <>
                            {/* MOP Selection - Always visible */}
                            <div className="form-group">
                              <label htmlFor="mopSelect">
                                <strong>Chọn MOP:</strong>
                              </label>
                              <select 
                                className="form-control" 
                                id="mopSelect" 
                                value={selectedMOP}
                                onChange={handleMOPSelect}
                              >
                                <option value="">-- Chọn MOP --</option>
                                {Array.isArray(filteredMops) && filteredMops.map(mop => (
                                  <option key={mop.id} value={mop.id}>
                                    {mop.name}
                                  </option>
                                ))}
                              </select>
                              {(!Array.isArray(filteredMops) || filteredMops.length === 0) && (
                                <small className="text-muted">No approved MOPs for risk assessment are currently available.</small>
                              )}
                            </div>
                            
                            {selectedMOP && (
                              <div className="mt-3">
                                <button 
                                  className="btn btn-info mr-2"
                                  onClick={() => setShowViewMOPModal(true)}
                                >
                                  View MOP
                                </button>
                              </div>
                            )}
                              
                            {/* Server Selection Section - Always visible */}
                            <div className="mt-4">
                              <h6>Chọn Server</h6>
                              <div className="row">
                                <div className="col-md-6">
                                  <button 
                                    className="btn btn-outline-primary btn-block"
                                    onClick={() => setShowFileUploadModal(true)}
                                  >
                                    <i className="fas fa-upload mr-2"></i>
                                    Upload File Server
                                  </button>
                                </div>
                                <div className="col-md-6">
                                  <button 
                                    className="btn btn-outline-secondary btn-block"
                                    onClick={() => setShowManualInputModal(true)}
                                  >
                                    <i className="fas fa-keyboard mr-2"></i>
                                    Nhập Thủ Công
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
                                   Download Template
                                 </a>
                              </div>
                              
                              {/* Server List Table - Always visible */}
                              <div className="mt-4">
                                <h6>Danh sách Server</h6>
                                {servers.length > 0 ? (
                                  <>
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
                                              /> Chọn tất cả
                                            </th>
                                            <th>IP Server</th>
                                            <th>SSH Port</th>
                                            <th>Trạng thái kết nối</th>
                                            <th>Thao tác</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {servers.map((server, index) => (
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
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    
                                    <div className="mt-3">
                                       <button 
                                         className="btn btn-warning mr-2"
                                         onClick={handleTestConnection}
                                       >
                                         <i className="fas fa-plug mr-2"></i>
                                         Test Connection
                                       </button>
                                       
                                       <button 
                                         className="btn btn-success"
                                         disabled={!canStartAssessment}
                                         onClick={handleStartAssessment}
                                       >
                                         <i className="fas fa-play mr-2"></i>
                                         Start Assessment
                                       </button>
                                     </div>
                                     
                                     {/* Assessment Loading */}
                                     {assessmentLoading && (
                                       <div className="mt-4">
                                         <div className="alert alert-info">
                                           <i className="fas fa-spinner fa-spin mr-2"></i>
                                           Đang thực hiện assessment, vui lòng đợi...
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
                                               Assessment Results
                                             </h5>
                                             <button 
                                               className="btn btn-secondary btn-sm"
                                               onClick={() => setAssessmentResults(null)}
                                             >
                                               <i className="fas fa-times mr-2"></i>
                                               Clear Results
                                             </button>
                                           </div>
                                           <div className="card-body">
                                             <div className="mb-3">
                                               <h6><strong>MOP đã chạy:</strong> {assessmentResults.mop_name}</h6>
                                               <p><strong>Trạng thái:</strong> 
                                                 <span className={`badge ml-2 ${
                                                   assessmentResults.status === 'completed' ? 'badge-success' : 
                                                   assessmentResults.status === 'failed' ? 'badge-danger' : 'badge-warning'
                                                 }`}>
                                                   {assessmentResults.status === 'completed' ? 'Thành công' : 
                                                    assessmentResults.status === 'failed' ? 'Thất bại' : 'Đang xử lý'}
                                                 </span>
                                               </p>
                                               
                                               {/* Execution Logs */}
                                               {assessmentResults.execution_logs && (
                                                 <div className="mt-3">
                                                   <h6><strong>Logs thực thi:</strong></h6>
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
                                                     <h6><strong>Lỗi:</strong></h6>
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
                                                       <th>Tên câu lệnh</th>
                                                       <th>Kết quả thực hiện</th>
                                                       <th>Giá trị tham chiếu</th>
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
                                           
                                           {/* Download Report Button */}
                                           <div className="mt-3">
                                             <button 
                                               className="btn btn-primary"
                                               onClick={handleDownloadReport}
                                               disabled={!assessmentResults?.id}
                                             >
                                               <i className="fas fa-download mr-2"></i>
                                               Tải báo cáo Excel
                                             </button>
                                           </div>
                                         </div>
                                       </div>
                                     )}
                                  </>
                                ) : (
                                  <div className="alert alert-light">
                                    <p className="mb-0 text-muted">Chưa có server nào được thêm. Vui lòng upload file hoặc nhập thủ công thông tin server.</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    
                    {/* Reports Tab */}
                    {activeTab === 'reports' && (
                      <div className="tab-pane fade show active">
                        <div className="row">
                          <div className="col-md-6">
                            <div className="card">
                              <div className="card-header">
                                <h3 className="card-title">
                                  <i className="fas fa-calendar-week mr-2"></i>
                                  Báo cáo Tuần
                                </h3>
                              </div>
                              <div className="card-body">
                                <p>Tạo báo cáo risk assessment hàng tuần</p>
                                <button className="btn btn-info">
                                  <i className="fas fa-download mr-2"></i>
                                  Tải báo cáo tuần
                                </button>
                              </div>
                            </div>
                          </div>
                          
                          <div className="col-md-6">
                            <div className="card">
                              <div className="card-header">
                                <h3 className="card-title">
                                  <i className="fas fa-calendar-alt mr-2"></i>
                                  Báo cáo Tháng
                                </h3>
                              </div>
                              <div className="card-body">
                                <p>Tạo báo cáo risk assessment hàng tháng</p>
                                <button className="btn btn-success">
                                  <i className="fas fa-download mr-2"></i>
                                  Tải báo cáo tháng
                                </button>
                              </div>
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
                <h5 className="modal-title">Execute Risk Assessment</h5>
                <button type="button" className="close" onClick={() => setShowExecutionModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Select Servers</label>
                  <div className="border p-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {servers.length > 0 ? (
                      servers.map((server, index) => (
                        <div key={index} className="form-check">
                          <input className="form-check-input" type="checkbox" id={`server-${index}`} />
                          <label className="form-check-label" htmlFor={`server-${index}`}>
                            {server.name} ({server.ip})
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted">No servers added. Please add servers using the options below.</p>
                    )}
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Server Input</label>
                  <div className="row">
                    <div className="col-md-4">
                      <button type="button" className="btn btn-outline-primary btn-block mb-2" onClick={() => setShowFileUploadModal(true)}>
                        <i className="fas fa-upload mr-2"></i>Upload Server List
                      </button>
                    </div>
                    <div className="col-md-4">
                      <button type="button" className="btn btn-outline-secondary btn-block mb-2" onClick={() => setShowManualInputModal(true)}>
                        <i className="fas fa-edit mr-2"></i>Manual Input
                      </button>
                    </div>
                    <div className="col-md-4">
                      <button type="button" className="btn btn-outline-info btn-block mb-2">
                        <i className="fas fa-plug mr-2"></i>Test Connection
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowExecutionModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary">
                  <i className="fas fa-play mr-2"></i>Execute Assessment
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
                <h5 className="modal-title">Upload Server List</h5>
                <button type="button" className="close" onClick={() => setShowFileUploadModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="serverFile">Select File (Excel/CSV)</label>
                  <input 
                    type="file" 
                    className="form-control-file" 
                    id="serverFile" 
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setServerFile(e.target.files?.[0] || null)}
                  />
                  <small className="form-text text-muted">Upload Excel or CSV file with server information</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowFileUploadModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!serverFile} onClick={handleFileUpload}>
                  <i className="fas fa-upload mr-2"></i>Upload
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
                <h5 className="modal-title">Manual Server Input</h5>
                <button type="button" className="close" onClick={() => setShowManualInputModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label htmlFor="serverIP">Server IP</label>
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
                      <label htmlFor="sshPort">SSH Port</label>
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
                      <label htmlFor="sshUser">SSH User</label>
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
                        <label htmlFor="sshPassword">SSH Password</label>
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
                        <label htmlFor="sudoUser">Sudo User</label>
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
                        <label htmlFor="sudoPassword">Sudo Password</label>
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
                <button type="button" className="btn btn-secondary" onClick={() => setShowManualInputModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleAddManualServer}>
                  <i className="fas fa-plus mr-2"></i>Add Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* View MOP Modal */}
      {showViewMOPModal && (
        <div className="modal fade show" style={{display: 'block'}} tabIndex={-1}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">MOP Details: {Array.isArray(filteredMops) ? filteredMops.find(mop => mop.id.toString() === selectedMOP)?.name || '' : ''}</h5>
                <button 
                  type="button" 
                  className="close" 
                  onClick={() => setShowViewMOPModal(false)}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Command Name</th>
                        <th>Command</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSelectedMOPCommands().map((command, index) => (
                        <tr key={index}>
                          <td>{typeof command === 'object' ? command.id : index + 1}</td>
                          <td>{typeof command === 'object' ? command.description : `Command ${index + 1}`}</td>
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
                  Close
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
        title="Xác nhận xóa server"
        message="Bạn có chắc chắn muốn xóa server này?"
        confirmText="Xóa"
        cancelText="Hủy"
        confirmVariant="danger"
      />
      
      {/* Notification */}
      {notification && (
        <div className={`alert alert-${notification.type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`} style={{position: 'fixed', top: '20px', right: '20px', zIndex: 9999}}>
          {notification.message}
          <button type="button" className="close" onClick={() => setNotification(null)}>
            <span>&times;</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default RiskAssessment;