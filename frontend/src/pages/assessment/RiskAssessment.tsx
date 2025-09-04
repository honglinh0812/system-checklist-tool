import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { ErrorMessage, ProgressSteps } from '../../components/common';
import { useAssessmentState, getAssessmentSteps, isStepCompleted, isStepAccessible } from '../../hooks/useAssessmentState';
import { useTranslation } from '../../i18n/useTranslation';
import { periodicAssessmentService } from '../../services/periodicAssessmentService';
import type { PeriodicAssessment, PeriodicAssessmentExecution } from '../../services/periodicAssessmentService';

interface MOP {
  id: number;
  name: string;
  type: string[];
  status: string;
  commands?: Command[];
}

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

const RiskAssessment: React.FC = () => {
  // Use persistent state management
  const { state: assessmentState, updateState } = useAssessmentState('risk');
  
  // Extract state values for easier access
  const { selectedMOP, servers, selectedServers, currentStep, assessmentType, assessmentResults, assessmentProgress } = assessmentState;

  const { t } = useTranslation();
  
  // Non-persistent UI states
  const [filteredMops, setFilteredMops] = useState<MOP[]>([]);
  const [activeTab, setActiveTab] = useState<'assessment' | 'periodic' | 'reports'>('assessment');
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [showViewMOPModal, setShowViewMOPModal] = useState(false);
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
  
  // Progress steps
  const steps = getAssessmentSteps('risk').map(step => ({
    ...step,
    completed: isStepCompleted(step.id, assessmentState),
    active: step.id === currentStep
  }));
  
  // Non-persisted states - loading, temporary actions, và volatile data
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverFile, setServerFile] = useState<File | null>(null);
  const [connectionResults, setConnectionResults] = useState<({success: boolean, message: string, serverIndex: number} | null)[]>([]);
  const [canStartAssessment, setCanStartAssessment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteServerIndex, setDeleteServerIndex] = useState<number>(-1);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  // Periodic assessment states
  const [periodicAssessments, setPeriodicAssessments] = useState<PeriodicAssessment[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<PeriodicAssessmentExecution[]>([]);
  const [periodicFrequency, setPeriodicFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [periodicTime, setPeriodicTime] = useState<string>('09:00');
  const [periodicLoading, setPeriodicLoading] = useState(false);

  // Add useEffect to monitor selectedServers and connectionResults changes
  useEffect(() => {
    // Check if all selected servers have successful connections
    const selectedResults = connectionResults.filter((_, index) => selectedServers[index] && connectionResults[index]);
    const allSuccess = selectedResults.length > 0 && selectedResults.every((result) => result && result.success === true);
    console.log('Can start assessment updated:', allSuccess, 'Selected results:', selectedResults);
    setCanStartAssessment(allSuccess);
  }, [selectedServers, connectionResults]);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const fetchMOPs = async () => {
    try {
      setLoading(true);
      const response = await apiService.get<{success: boolean; data: {mops: MOP[]; pagination: any}}>(`${API_ENDPOINTS.MOPS.LIST}?context=assessment`);
      
      if (response && response.success && response.data) {
        const allMops = response.data.mops || [];
        // Filter MOPs for risk assessment (approved status and assessment_type is 'risk_assessment')
        const riskMops = allMops.filter((mop: MOP) => 
          mop.status === 'approved' && (mop as any).assessment_type === 'risk_assessment'
        );
        setFilteredMops(riskMops);
      } else {
        console.warn('Invalid MOP response:', response);
        setFilteredMops([]);
      }
    } catch (error) {
      console.error('Error fetching MOPs:', error);
      setFilteredMops([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMOPs();
  }, []);

  // Load periodic assessment data when tab changes
  useEffect(() => {
    if (activeTab === 'periodic') {
      loadPeriodicAssessmentData();
    }
  }, [activeTab]);

  const loadPeriodicAssessmentData = async () => {
    try {
      setPeriodicLoading(true);
      
      // Load periodic assessments
      const assessments = await periodicAssessmentService.getPeriodicAssessments();
      setPeriodicAssessments(assessments);
      
      // Load recent executions (last 5) only if there are assessments
      const allExecutions: PeriodicAssessmentExecution[] = [];
      if (assessments.length > 0) {
        for (const assessment of assessments) {
          try {
            const response = await periodicAssessmentService.getPeriodicAssessmentExecutions(assessment.id);
            allExecutions.push(...response.executions);
          } catch (executionError) {
            // Log error but continue with other assessments
            console.warn(`Failed to load executions for assessment ${assessment.id}:`, executionError);
          }
        }
      }
      
      // Sort by execution time and take last 5
      const sortedExecutions = allExecutions
        .sort((a, b) => new Date(b.completed_at || b.started_at || b.created_at).getTime() - new Date(a.completed_at || a.started_at || a.created_at).getTime())
        .slice(0, 5);
      
      setRecentExecutions(sortedExecutions);
    } catch (error) {
      console.error('Error loading periodic assessment data:', error);
      showAlert('error', 'Không thể tải dữ liệu đánh giá định kỳ');
    } finally {
      setPeriodicLoading(false);
    }
  };

  const handleCreatePeriodicAssessment = async () => {
    if (!selectedMOP || servers.length === 0) {
      showAlert('error', 'Vui lòng chọn MOP và thêm ít nhất một server');
      return;
    }

    try {
      setPeriodicLoading(true);
      
      const data = {
        mop_id: parseInt(selectedMOP),
        assessment_type: 'risk' as const,
        frequency: periodicFrequency,
        execution_time: periodicTime,
        servers: servers.map((server, index) => ({
          ...server,
          selected: selectedServers[index] || false
        }))
      };

      await periodicAssessmentService.createPeriodicAssessment(data);
      showAlert('success', 'Đã tạo đánh giá định kỳ thành công');
      await loadPeriodicAssessmentData();
    } catch (error) {
      console.error('Error creating periodic assessment:', error);
      showAlert('error', 'Không thể tạo đánh giá định kỳ');
    } finally {
      setPeriodicLoading(false);
    }
  };



  const handleMOPSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mopId = event.target.value;
    
    // Reset assessment state when selecting new MOP
    updateState({ 
      selectedMOP: mopId,
      currentStep: mopId ? 'configure-servers' : 'select-mop',
      assessmentStarted: false,
      assessmentCompleted: false,
      hasResults: false
    });
    
    // Clear assessment results
    updateState({ assessmentResults: null });
    setAssessmentLoading(false);
  };
  
  const handleStepClick = (stepId: string) => {
    if (isStepAccessible(stepId, assessmentState)) {
      updateState({ currentStep: stepId });
    }
  };

  const handleTestConnection = async () => {
    const selectedServerList = servers.filter((_, index) => selectedServers[index]);
    
    if (selectedServerList.length === 0) {
      showAlert('error', 'Vui lòng chọn ít nhất một server (tick vào checkbox) để test connection.');
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
      showAlert('error', 'Có lỗi xảy ra khi test connection.');
    }
  };

  const handleStartAssessment = async () => {
    console.log('Starting assessment...');
    // Validate MOP selection
    if (!selectedMOP) {
      setNotification({type: 'error', message: 'Vui lòng chọn MOP trước khi bắt đầu assessment.'});
      return;
    }

    // Reset assessment state when starting new assessment
    updateState({
      assessmentStarted: false,
      assessmentCompleted: false,
      hasResults: false,
      currentStep: 'run-assessment'
    });
    updateState({ assessmentResults: null });

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
      setAssessmentLoading(true);
      
      // Update state to indicate assessment has started
      updateState({
        assessmentStarted: true,
        currentStep: 'run-assessment'
      });
      
      console.log('Sending request to start assessment with data:', {
        mop_id: parseInt(selectedMOP),
        servers: mappedServerList
      });
      const response = await apiService.post<{data: {assessment_id: number, job_id: string, status: string, message: string}, success: boolean}>(API_ENDPOINTS.ASSESSMENTS.RISK_START, {
        mop_id: parseInt(selectedMOP),
        servers: mappedServerList
      });
      
      if (response.data && response.data.assessment_id && response.data.job_id) {
        showAlert('success', 'Assessment đã được bắt đầu thành công!');
        
        // Polling for job status and progress using job_id
        const pollJobStatus = async () => {
          try {
            console.log('Fetching job status for job ID:', response.data.job_id);
            const statusResponse = await apiService.get<any>(API_ENDPOINTS.ASSESSMENTS.RISK_JOB_STATUS(response.data.job_id));
            
            if (statusResponse.data) {
              const { status, logs } = statusResponse.data;
              
              // Update progress information
              if (status === 'running' || status === 'pending') {
                const detailedProgress = statusResponse.data.detailed_progress || {};
                
                // Calculate estimated time remaining
                const calculateEstimatedTime = (currentProgress: any, startTime: Date) => {
                  const totalTasks = (currentProgress.total_commands || 0) * (currentProgress.total_servers || 1);
                  // Fix calculation: completed tasks = (current_command - 1) * total_servers + (current_server - 1)
                  const completedTasks = ((currentProgress.current_command || 1) - 1) * (currentProgress.total_servers || 1) + ((currentProgress.current_server || 1) - 1);
                  
                  if (completedTasks === 0) return 'Đang tính toán...';
                  
                  const elapsedTime = Date.now() - startTime.getTime();
                  const timePerTask = elapsedTime / completedTasks;
                  const remainingTasks = totalTasks - completedTasks;
                  const estimatedRemainingMs = remainingTasks * timePerTask;
                  
                  // Ensure non-negative values
                  if (estimatedRemainingMs <= 0) return 'Sắp hoàn thành';
                  
                  const remainingMinutes = Math.ceil(estimatedRemainingMs / (1000 * 60));
                  if (remainingMinutes < 1) {
                    return 'Dưới 1 phút';
                  } else if (remainingMinutes < 60) {
                    return `${remainingMinutes} phút`;
                  } else {
                    const hours = Math.floor(remainingMinutes / 60);
                    const minutes = remainingMinutes % 60;
                    return `${hours}h ${minutes}m`;
                  }
                };
                
                const startTime = assessmentProgress?.startTime || new Date();
                const estimatedTimeRemaining = calculateEstimatedTime(detailedProgress, startTime);
                
                updateState({ 
                  assessmentProgress: {
                    currentCommand: `Đang thực hiện command ${detailedProgress.current_command || 1}/${detailedProgress.total_commands || selectedMOPData.commands?.length || 0}`,
                    currentServer: `Đang xử lý server ${detailedProgress.current_server || 1}/${detailedProgress.total_servers || mappedServerList.length}`,
                    completedCommands: detailedProgress.current_command || 0,
                    totalCommands: detailedProgress.total_commands || selectedMOPData.commands?.length || 0,
                    completedServers: detailedProgress.current_server || 0,
                    totalServers: detailedProgress.total_servers || mappedServerList.length,
                    logs: logs ? logs.slice(-20) : [],
                    startTime,
                    estimatedTimeRemaining
                  }
                });
                
                console.log('Updated assessment progress:', {
                  currentCommand: detailedProgress.current_command,
                  totalCommands: detailedProgress.total_commands,
                  currentServer: detailedProgress.current_server,
                  totalServers: detailedProgress.total_servers,
                  percentage: detailedProgress.percentage
                });
                
                // Continue polling
                setTimeout(pollJobStatus, 1000);
              } else if (status === 'completed' || status === 'failed') {
                // Job finished, get final results
                updateState({ assessmentProgress: null });
                
                try {
                  console.log('Fetching final results for assessment ID:', response.data.assessment_id);
                  const resultsResponse = await apiService.get<any>(API_ENDPOINTS.ASSESSMENTS.RISK_RESULTS(response.data.assessment_id));
                  
                  updateState({ 
                    assessmentResults: {
                      ...resultsResponse.data,
                      mop_name: selectedMOPData.name,
                      commands: selectedMOPData.commands || []
                    },
                    assessmentProgress: null
                  });
                  setAssessmentLoading(false);
                  
                  updateState({
                    assessmentCompleted: true,
                    hasResults: true,
                    currentStep: 'view-results'
                  });
                  
                  if (status === 'failed') {
                    showAlert('error', 'Assessment thất bại. Vui lòng kiểm tra logs.');
                  }
                } catch (resultsError) {
                  console.error('Error fetching final results:', resultsError);
                  showAlert('error', 'Có lỗi xảy ra khi lấy kết quả assessment.');
                  setAssessmentLoading(false);
                  updateState({ assessmentProgress: null });
                }
              }
            } else {
              // No status data, continue polling
              setTimeout(pollJobStatus, 1000);
            }
          } catch (error) {
            console.error('Error fetching job status:', error);
            // Continue polling even on error, might be temporary
            setTimeout(pollJobStatus, 2000);
          }
        };
        
        // Start polling after 2 seconds
        setTimeout(pollJobStatus, 2000);
      }
    } catch (error) {
      console.error('Error starting assessment:', error);
      showAlert('error', 'Có lỗi xảy ra khi bắt đầu assessment.');
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
      showAlert('error', 'Có lỗi xảy ra khi tải template.');
    }
  };

  const handleAddManualServer = () => {
    if (!manualServerData.serverIP || !manualServerData.sshUser || !manualServerData.sshPassword) {
      showAlert('error', 'Vui lòng điền đầy đủ thông tin server.');
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

    updateState({ 
      servers: [...servers, newServer],
      selectedServers: [...selectedServers, false],
      currentStep: 'test-connection'
    });
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
      showAlert('error', 'Vui lòng chọn file trước khi upload.');
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

      if (response.success && response.servers) {

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
          
          return mappedServer;
        });

        updateState({ 
          servers: [...servers, ...newServers],
          selectedServers: [...selectedServers, ...new Array(newServers.length).fill(false)]
        });
        setConnectionResults([...connectionResults, ...new Array(newServers.length).fill(null)]);
        
        setShowFileUploadModal(false);
        setServerFile(null);
        showAlert('success', `Đã thêm thành công ${newServers.length} server từ file.`);
      } else {
        showAlert('error', response.message || 'Có lỗi xảy ra khi xử lý file.');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      showAlert('error', 'Có lỗi xảy ra khi upload file.');
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
      
      updateState({ 
        servers: newServers,
        selectedServers: newSelectedServers
      });
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

      {alert && (
        <ErrorMessage 
          message={alert.message} 
          type={alert.type === 'error' ? 'danger' : alert.type === 'success' ? 'info' : 'warning'}
          dismissible={true}
          onDismiss={() => setAlert(null)}
        />
      )}

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
                        <i className="fas fa-clipboard-check mr-1"></i> Đánh giá
                      </button>
                    </li>
                    <li className="nav-item">
                      <button 
                        className={`nav-link ${activeTab === 'periodic' ? 'active' : ''}`}
                        onClick={() => setActiveTab('periodic')}
                        type="button"
                      >
                        <i className="fas fa-clock mr-1"></i> Đánh giá định kỳ
                      </button>
                    </li>
                    <li className="nav-item">
                      <button 
                        className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reports')}
                        type="button"
                      >
                        <i className="fas fa-chart-bar mr-1"></i> Báo cáo
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
                            {/* Progress Steps - Always visible */}
                            <div className="mb-4">
                              <div className="d-flex justify-content-between align-items-center">
                                <h6>Tiến trình đánh giá</h6>
                                {(assessmentResults || selectedMOP || servers.length > 0) && (
                                  <button 
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={() => {
                                      updateState({
                                        selectedMOP: '',
                                        servers: [],
                                        selectedServers: [],
                                        currentStep: 'select-mop',
                                        assessmentStarted: false,
                                        assessmentCompleted: false,
                                        hasResults: false
                                      });
                                      updateState({ assessmentResults: null, assessmentProgress: null });
                                      setConnectionResults([]);
                                      setCanStartAssessment(false);
                                      setAssessmentLoading(false);
                                      setNotification(null);
                                    }}
                                    title="Reset về trạng thái ban đầu"
                                  >
                                    <i className="fas fa-redo mr-1"></i>
                                    Reset
                                  </button>
                                )}
                              </div>
                              <ProgressSteps 
                                steps={steps}
                                onStepClick={handleStepClick}
                              />
                            </div>
                            
                            {/* MOP Selection */}
                            <div className="form-group">
                              <label htmlFor="mopSelect">
                                <strong>{t('selectMOP')}:</strong>
                              </label>
                              <select 
                                className="form-control" 
                                id="mopSelect" 
                                value={selectedMOP}
                                onChange={handleMOPSelect}
                              >
                                <option value="">-- {t('selectMOP')} --</option>
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
                            
                            {selectedMOP && assessmentType && (
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
                                                  updateState({ selectedServers: servers.map(() => checked) });
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
                                                    updateState({ selectedServers: newSelected });
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
                                                    updateState({ servers: newServers });
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
                                                    updateState({ servers: newServers });
                                                  }}
                                                  placeholder="22"
                                                />
                                              </td>
                                              <td>
                                                {(() => {
                                                  console.log(`Checking connectionResults[${index}]:`, connectionResults[index]);
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
                                     
                                     {/* Assessment Loading with Progress */}
                                     {assessmentLoading && (
                                       <div className="mt-4">
                                         <div className="card">
                                           <div className="card-header">
                                             <h6 className="mb-0">
                                               <i className="fas fa-spinner fa-spin mr-2"></i>
                                               Đang thực hiện Risk Assessment
                                             </h6>
                                           </div>
                                           <div className="card-body">
                                             {assessmentProgress ? (
                                               <div>
                                                 {/* Server Progress */}
                                                 <div className="mb-3">
                                                   <div className="d-flex justify-content-between align-items-center mb-2">
                                                     <span><strong>Tiến trình Server:</strong></span>
                                                     <span className="text-muted">
                                                       {assessmentProgress.completedServers}/{assessmentProgress.totalServers} servers
                                                     </span>
                                                   </div>
                                                   <div className="progress mb-2">
                                                     <div 
                                                       className="progress-bar bg-primary" 
                                                       style={{
                                                         width: `${(assessmentProgress.completedServers / assessmentProgress.totalServers) * 100}%`
                                                       }}
                                                     ></div>
                                                   </div>
                                                   <small className="text-muted">
                                                     <i className="fas fa-server mr-1"></i>
                                                     Đang xử lý: {assessmentProgress.currentServer}
                                                   </small>
                                                 </div>
                                                 
                                                 {/* Command Progress */}
                                                 <div className="mb-3">
                                                   <div className="d-flex justify-content-between align-items-center mb-2">
                                                     <span><strong>Tiến trình Commands:</strong></span>
                                                     <span className="text-muted">
                                                       {assessmentProgress.completedCommands}/{assessmentProgress.totalCommands} commands
                                                     </span>
                                                   </div>
                                                   <div className="progress mb-2">
                                                     <div 
                                                       className="progress-bar bg-success" 
                                                       style={{
                                                         width: `${(assessmentProgress.completedCommands / assessmentProgress.totalCommands) * 100}%`
                                                       }}
                                                     ></div>
                                                   </div>
                                                   <small className="text-muted">
                                                     <i className="fas fa-terminal mr-1"></i>
                                                     Đang thực hiện: {assessmentProgress.currentCommand}
                                                   </small>
                                                 </div>
                                                 
                                                 {/* Time Estimation */}
                                                 {assessmentProgress.estimatedTimeRemaining && (
                                                   <div className="mb-3">
                                                     <div className="d-flex justify-content-between align-items-center mb-2">
                                                       <span><strong>Thời gian ước tính:</strong></span>
                                                       <span className="text-muted">
                                                         <i className="fas fa-clock mr-1"></i>
                                                         Còn lại: {assessmentProgress.estimatedTimeRemaining}
                                                       </span>
                                                     </div>
                                                   </div>
                                                 )}
                                                 
                                                 {/* Real-time Logs */}
                                                 {assessmentProgress.logs && assessmentProgress.logs.length > 0 && (
                                                   <div className="mt-3">
                                                     <h6><strong>Logs thời gian thực:</strong></h6>
                                                     <div className="card">
                                                       <div className="card-body p-2" style={{backgroundColor: '#f8f9fa', maxHeight: '200px', overflowY: 'auto'}}>
                                                         <pre style={{fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap'}}>
                                                           {assessmentProgress.logs.slice(-20).join('\n')}
                                                         </pre>
                                                       </div>
                                                     </div>
                                                   </div>
                                                 )}
                                               </div>
                                             ) : (
                                               <div className="text-center">
                                                 <div className="spinner-border text-primary mb-3" role="status">
                                                   <span className="sr-only">Loading...</span>
                                                 </div>
                                                 <p className="mb-0">Đang khởi tạo assessment...</p>
                                               </div>
                                             )}
                                           </div>
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
                                               onClick={() => updateState({ assessmentResults: null })}
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
                                                   assessmentResults.status === 'success' ? 'badge-success' : 
                                                   assessmentResults.status === 'fail' ? 'badge-danger' : 'badge-warning'
                                                 }`}>
                                                   {assessmentResults.status === 'success' ? 'Thành công' : 
                                                    assessmentResults.status === 'fail' ? 'Thất bại' : 'Đang xử lý'}
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
                                                           <code>{result.reference_value || ' '}</code>
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
                    
                    {/* Periodic Assessment Tab */}
                    {activeTab === 'periodic' && (
                      <div className="tab-pane fade show active">
                        <div className="row">
                          <div className="col-md-12">
                            <div className="card">
                              <div className="card-header">
                                <h3 className="card-title">
                                  <i className="fas fa-clock mr-2"></i>
                                  Đánh giá định kỳ
                                </h3>
                              </div>
                              <div className="card-body">
                                <div className="row">
                                  <div className="col-md-6">
                                    <div className="form-group">
                                      <label>Tần suất đánh giá</label>
                                      <select 
                                        className="form-control" 
                                        value={periodicFrequency} 
                                        onChange={(e) => setPeriodicFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                                      >
                                        <option value="daily">Hàng ngày</option>
                                        <option value="weekly">Hàng tuần</option>
                                        <option value="monthly">Hàng tháng</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="col-md-6">
                                    <div className="form-group">
                                      <label>Thời gian thực hiện</label>
                                      <input 
                                        type="time" 
                                        className="form-control" 
                                        value={periodicTime} 
                                        onChange={(e) => setPeriodicTime(e.target.value)} 
                                      />
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="form-group">
                                   <label>MOP được chọn</label>
                                   <div className="border p-3 bg-light">
                                     {selectedMOP ? (
                                       <div>
                                         <strong>{filteredMops.find(mop => mop.id.toString() === selectedMOP)?.name || selectedMOP}</strong>
                                         <p className="text-muted mb-0">Loại: {filteredMops.find(mop => mop.id.toString() === selectedMOP)?.type.join(', ') || 'N/A'}</p>
                                       </div>
                                     ) : (
                                       <p className="text-muted mb-0">Chưa chọn MOP. Vui lòng chọn MOP ở tab Đánh giá.</p>
                                     )}
                                   </div>
                                 </div>
                                
                                <div className="form-group">
                                  <label>Danh sách server</label>
                                  <div className="border p-3" style={{maxHeight: '200px', overflowY: 'auto'}}>
                                    {servers.length > 0 ? (
                                      servers.map((server, index) => (
                                        <div key={index} className="form-check">
                                          <input className="form-check-input" type="checkbox" id={`periodic-server-${index}`} defaultChecked />
                                          <label className="form-check-label" htmlFor={`periodic-server-${index}`}>
                                            {server.name} ({server.ip})
                                          </label>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-muted mb-0">Chưa có server nào. Vui lòng thêm server ở tab Đánh giá.</p>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="mt-3">
                                  <button 
                                    className="btn btn-primary mr-2" 
                                    disabled={!selectedMOP || servers.length === 0 || periodicLoading}
                                    onClick={handleCreatePeriodicAssessment}
                                  >
                                    {periodicLoading ? (
                                      <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Đang tạo...
                                      </>
                                    ) : (
                                      <>
                                        <i className="fas fa-plus mr-2"></i>
                                        Tạo đánh giá định kỳ
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Recent Periodic Assessments */}
                        <div className="row mt-4">
                          <div className="col-md-12">
                            <div className="card">
                              <div className="card-header">
                                <h3 className="card-title">
                                  <i className="fas fa-history mr-2"></i>
                                  5 lần đánh giá định kỳ gần nhất
                                </h3>
                              </div>
                              <div className="card-body">
                                <div className="table-responsive">
                                  <table className="table table-striped">
                                    <thead>
                                      <tr>
                                        <th>Thời gian</th>
                                        <th>MOP</th>
                                        <th>Số server</th>
                                        <th>Trạng thái</th>
                                        <th>Kết quả</th>
                                        <th>Hành động</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {periodicLoading ? (
                                        <tr>
                                          <td colSpan={6} className="text-center">
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Đang tải dữ liệu...
                                          </td>
                                        </tr>
                                      ) : recentExecutions.length === 0 ? (
                                        <tr>
                                          <td colSpan={6} className="text-center text-muted">
                                            Chưa có đánh giá định kỳ nào được thực hiện
                                          </td>
                                        </tr>
                                      ) : (
                                        recentExecutions.map((execution) => {
                                          const periodicAssessment = periodicAssessments.find(p => p.id === execution.periodic_assessment_id);
                                          const mop = filteredMops.find(m => m.id === periodicAssessment?.mop_id);
                                          
                                          return (
                                            <tr key={execution.id}>
                                              <td>
                                                {new Date(execution.completed_at || execution.started_at || execution.created_at).toLocaleString('vi-VN')}
                                              </td>
                                              <td>{mop?.name || 'N/A'}</td>
                                              <td>{periodicAssessment?.server_info?.length || 0}</td>
                                              <td>
                                                <span className={`badge ${
                                                  execution.status === 'success' ? 'badge-success' :
                                                  execution.status === 'fail' ? 'badge-danger' :
                                                  execution.status === 'running' ? 'badge-warning' :
                                                  'badge-secondary'
                                                }`}>
                                                  {execution.status === 'success' ? 'Thành công' :
                                                   execution.status === 'fail' ? 'Thất bại' :
                                                   execution.status === 'running' ? 'Đang chạy' :
                                                   'Chờ xử lý'}
                                                </span>
                                              </td>
                                              <td>
                                                {execution.status === 'success' ? (
                                                  <span className="text-success">
                                                    <i className="fas fa-check-circle mr-1"></i>
                                                    Hoàn thành
                                                  </span>
                                                ) : execution.status === 'fail' ? (
                                                  <span className="text-danger">
                                                    <i className="fas fa-times-circle mr-1"></i>
                                                    {execution.error_message || 'Có lỗi xảy ra'}
                                                  </span>
                                                ) : (
                                                  <span className="text-muted">
                                                    <i className="fas fa-clock mr-1"></i>
                                                    {execution.duration ? `${execution.duration}s` : 'N/A'}
                                                  </span>
                                                )}
                                              </td>
                                              <td>
                                                {execution.assessment_result_id && (
                                                  <button className="btn btn-sm btn-outline-primary">
                                                    <i className="fas fa-eye mr-1"></i>
                                                    Xem chi tiết
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
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
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
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
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
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
                      {getSelectedMOPCommands().map((command, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{typeof command === 'object' ? (command.command_id_ref || command.id || 'N/A') : 'N/A'}</td>
                          <td>{typeof command === 'object' ? (command.title || command.description || `Command ${index + 1}`) : `Command ${index + 1}`}</td>
                          <td><code>{typeof command === 'string' ? command : (command.command || command.command_text || 'N/A')}</code></td>
                          <td>{typeof command === 'object' ? (command.extract_method || 'raw') : 'raw'}</td>
                          <td>{typeof command === 'object' ? (command.comparator_method || 'eq') : 'eq'}</td>
                          <td>{typeof command === 'object' ? (command.reference_value || command.expected_output || 'N/A') : 'N/A'}</td>
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