import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { ErrorMessage } from '../../components/common';
import { useTranslation } from '../../i18n/useTranslation';
import { useAssessmentState } from '../../hooks/useAssessmentState';
import AssessmentResultsTable from '../../components/assessment/AssessmentResultsTable';
import { serverService, Server } from '../../services/serverService';


interface MOP {
  id: number;
  name: string;
  type: string[];
  status: string;
  commands?: Command[];
}

interface Command {
  id: number;
  command_id_ref?: string; 
  title?: string; 
  command: string; 
  command_text: string;
  description: string;
  extract_method?: string; // Extract column
  comparator_method?: string; // Comparator column
  reference_value?: string; // Reference Value column
  expected_output?: string;
  is_critical?: boolean;
  order_index: number;
  rollback_command?: string | null;
  timeout_seconds?: number;
  skip_condition?: {
    condition_id: string;
    condition_type: 'empty' | 'not_empty' | 'ok' | 'not_ok' | 'value_match';
    condition_value?: string;
  };
}

const HandoverAssessment: React.FC = () => {
  const { t } = useTranslation();
  
  // Assessment state management
  const { state, updateState } = useAssessmentState('handover');
  
  // State management
  const [selectedMOP, setSelectedMOP] = useState<string>('');

  const [filteredMops, setFilteredMops] = useState<MOP[]>([]);
  const [activeTab, setActiveTab] = useState<'assessment' | 'reports'>('assessment');
  const [assessmentType] = useState<'emergency' | 'periodic'>('emergency');
  const [savedServers, setSavedServers] = useState<Server[]>([]);
  const [selectedSavedServers, setSelectedSavedServers] = useState<boolean[]>([]);
  const [showSavedServersModal, setShowSavedServersModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [showViewMOPModal, setShowViewMOPModal] = useState(false);
  const [servers, setServers] = useState<{name?: string, ip?: string, serverIP: string, sshPort: string, sshUser: string, sshPassword: string, sudoUser: string, sudoPassword: string}[]>([]);
  const [selectedServers, setSelectedServers] = useState<boolean[]>([]);
  // Extract persistent state values
  const { assessmentResults, assessmentProgress } = state;
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
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteServerIndex, setDeleteServerIndex] = useState<number>(-1);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning' | 'info'; message: string} | null>(null);
  const [savedServersLoading, setSavedServersLoading] = useState(false);
  
  // New "Select from saved list" modal states
  const [showSelectFromSavedModal, setShowSelectFromSavedModal] = useState(false);
  const [savedListTab, setSavedListTab] = useState<'recent' | 'uploads'>('recent');
  const [recentServers, setRecentServers] = useState<any[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [selectedSavedEntries, setSelectedSavedEntries] = useState<boolean[]>([]);
  const [previewServers, setPreviewServers] = useState<any[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  // Assessment readiness check
  const assessmentReadiness = {
    mopSelected: !!selectedMOP,
    serversConfigured: servers.length > 0 && selectedServers.some(selected => selected),
    connectionTested: connectionResults.some(result => result?.success === true)
  };
  
  // Calculate if assessment can start based on readiness
  const canStartAssessment = assessmentReadiness.mopSelected && 
                            assessmentReadiness.serversConfigured && 
                            assessmentReadiness.connectionTested;

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
      }
    } catch (error) {
      console.error('Error fetching MOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMOPs();
  }, []);

  const handleMOPSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mopId = event.target.value;
    setSelectedMOP(mopId);
    
    // Reset assessment state when selecting new MOP
    updateState({
      assessmentStarted: false,
      assessmentCompleted: false,
      hasResults: false,
      currentStep: 'select-mop'
    });
    
    // Clear assessment results and progress
    updateState({ assessmentResults: null, assessmentProgress: null });
    setConnectionResults([]);
  };

  const getSelectedMOPCommands = () => {
    if (!Array.isArray(filteredMops)) return [];
    const selectedMOPData = filteredMops.find(mop => mop.id.toString() === selectedMOP);
    return selectedMOPData?.commands || [];
  };

  const handleTestConnection = async () => {
    console.log('handleTestConnection called');
    
    const selectedServerList = servers.filter((_: any, index: number) => selectedServers[index]);
    
    if (selectedServerList.length === 0) {
      setNotification({type: 'warning', message: t('selectAtLeastOneServer')});
      return;
    }

    try {
      const mappedServers = selectedServerList.map((server: any) => ({
        ip: server.serverIP || server.ip,
        admin_username: server.sshUser,
        admin_password: server.sshPassword,
        root_username: server.sudoUser || 'root',
        root_password: server.sudoPassword,
        ssh_port: parseInt(server.sshPort) || 22
      }));
      
      const response = await apiService.post<any>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_TEST_CONNECTION, {
        servers: mappedServers
      });
      
      const results = response.data?.results || response.results || [];
      
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
      //const selectedResults = newConnectionResults.filter((_, index) => selectedServers[index] && newConnectionResults[index]);
      // Connection results updated - readiness will be calculated automatically
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

    // Reset assessment state when starting new assessment
    updateState({
      assessmentStarted: false,
      assessmentCompleted: false,
      hasResults: false,
      currentStep: 'run-assessment'
    });
    
    // Clear previous results and progress
    updateState({ assessmentResults: null, assessmentProgress: null });

    try {
      setAssessmentLoading(true);
      
      // Update state to indicate assessment has started
      updateState({
        assessmentStarted: true,
        currentStep: 'run-assessment'
      });
      
      // Map frontend fields to backend expected fields
      const mappedServers = selectedServerList.map((server: any) => ({
        ip: server.serverIP,
        admin_username: server.sshUser,
        admin_password: server.sshPassword,
        root_username: server.sudoUser || 'root',
        root_password: server.sudoPassword,
        sshPort: parseInt(server.sshPort) || 22
      }));
      
      const response = await apiService.post<{data: {assessment_id: number, job_id: string, status: string, message: string}, success: boolean}>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_START, {
        mop_id: parseInt(selectedMOP),
        servers: mappedServers
      });
      
      if (response.data && response.data.assessment_id && response.data.job_id) {
        setNotification({type: 'success', message: t('assessmentStartedSuccessfully')});
        
        const jobId = response.data.job_id;
        const assessmentId = response.data.assessment_id;
        
        // Initialize assessment progress with start time
        updateState({
          assessmentProgress: {
            currentCommand: 'Đang khởi tạo...',
            currentServer: 'Đang chuẩn bị...',
            completedCommands: 0,
            totalCommands: selectedMOPData.commands?.length || 0,
            completedServers: 0,
            totalServers: mappedServers.length,
            logs: [],
            startTime: new Date(),
            estimatedTimeRemaining: 'Đang tính toán...'
          }
        });
        
        // Polling for job status and progress
        const pollJobStatus = async () => {
          try {
            const statusResponse = await apiService.get<any>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_JOB_STATUS(jobId));
            
            if (statusResponse.data) {
              const { status, logs } = statusResponse.data;
              
              // Update progress information based on job status
              if (status === 'pending' || status === 'running') {
                const detailedProgress = statusResponse.data.detailed_progress || {};
                
                // Calculate estimated time remaining with improved accuracy
                const calculateEstimatedTime = (currentProgress: any, startTime: Date) => {
                  const totalTasks = (currentProgress.total_commands || 0) * (currentProgress.total_servers || 1);
                  
                  // Use backend's percentage if available, otherwise calculate from current position
                  let completedTasks;
                  if (currentProgress.percentage && currentProgress.percentage > 0) {
                    // Use backend's percentage calculation which is more accurate
                    completedTasks = Math.floor((currentProgress.percentage / 100) * totalTasks);
                  } else {
                    // Fallback to position-based calculation
                    completedTasks = ((currentProgress.current_command || 1) - 1) * (currentProgress.total_servers || 1) + ((currentProgress.current_server || 1) - 1);
                  }
                  
                  if (completedTasks === 0) return 'Đang tính toán...';
                  
                  const elapsedTime = Date.now() - startTime.getTime();
                  const timePerTask = elapsedTime / Math.max(1, completedTasks);
                  const remainingTasks = Math.max(0, totalTasks - completedTasks);
                  const estimatedRemainingMs = remainingTasks * timePerTask;
                  
                  // Ensure non-negative values
                  if (estimatedRemainingMs <= 0 || remainingTasks === 0) return 'Sắp hoàn thành';
                  
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
                    ...assessmentProgress,
                    currentCommand: `Đang thực hiện command ${detailedProgress.current_command || 1}/${detailedProgress.total_commands || selectedMOPData.commands?.length || 0}`,
                    currentServer: `Đang xử lý server ${detailedProgress.current_server || 1}/${detailedProgress.total_servers || mappedServers.length}`,
                    completedCommands: detailedProgress.current_command || 0,
                    totalCommands: detailedProgress.total_commands || selectedMOPData.commands?.length || 0,
                    completedServers: detailedProgress.current_server || 0,
                    totalServers: detailedProgress.total_servers || mappedServers.length,
                    logs: logs ? logs.slice(-20) : [],
                    startTime: assessmentProgress?.startTime || new Date(),
                    estimatedTimeRemaining
                  }
                });
                
                console.log('Updated handover assessment progress:', {
                  currentCommand: detailedProgress.current_command,
                  totalCommands: detailedProgress.total_commands,
                  currentServer: detailedProgress.current_server,
                  totalServers: detailedProgress.total_servers,
                  percentage: detailedProgress.percentage
                });
                
                // Continue polling
                setTimeout(pollJobStatus, 1000);
              } else if (status === 'completed' || status === 'failed') {
                // Job completed, get final results
                  try {
                    const resultsResponse = await apiService.get<any>(API_ENDPOINTS.ASSESSMENTS.HANDOVER_RESULTS(assessmentId));
                    
                    // Debug: Kiểm tra cấu trúc data và recommendations
                    console.log('Handover API Response structure:', resultsResponse.data);
                    if (resultsResponse.data.test_results) {
                      console.log('First few handover test results:', resultsResponse.data.test_results.slice(0, 3));
                      resultsResponse.data.test_results.forEach((result: any, index: number) => {
                        if (result.recommendations && result.recommendations.length > 0) {
                          console.log(`Handover Result ${index} has recommendations:`, result.recommendations);
                        } else {
                          console.log(`Handover Result ${index} has no recommendations`);
                        }
                      });
                    }
                    
                    setAssessmentLoading(false);
                    
                    updateState({
                      assessmentResults: {
                        ...resultsResponse.data,
                        mop_name: selectedMOPData.name,
                        commands: selectedMOPData.commands || []
                      },
                      assessmentProgress: null,
                      assessmentCompleted: true,
                      hasResults: true,
                      currentStep: 'view-results'
                    });
                  
                  if (status === 'failed') {
                    setNotification({type: 'error', message: t('assessmentFailed')});
                  }
                } catch (resultsError) {
                  console.error('Error fetching final results:', resultsError);
                  setNotification({type: 'error', message: t('errorFetchingAssessmentResults')});
                  setAssessmentLoading(false);
                  updateState({ assessmentProgress: null });
                }
              }
            } else {
              // No status data, continue polling
              setTimeout(pollJobStatus, 1000);
            }
          } catch (error: unknown) {
            console.error('Error fetching job status:', error);
            // Continue polling even on error, might be temporary
            setTimeout(pollJobStatus, 2000);
          }
        };
        
        // Start polling after 2 seconds
        setTimeout(pollJobStatus, 2000);
      }
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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

      if (response.success && response.servers) {

        const newServers = response.servers.map((server: any) => {
          const mappedServer = {
            name: server.name || server.server_name || server.ip,
            ip: server.ip || server.server_ip,
            serverIP: server.ip || server.server_ip,
            sshPort: server.ssh_port?.toString() || '22',
            // Map từ backend fields sang frontend fields
            sshUser: server.admin_username,
            sshPassword: server.admin_password,
            sudoUser: server.root_username,
            sudoPassword: server.root_password
          };
          
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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

  // Server management functions
  const fetchSavedServers = async () => {
    try {
      setSavedServersLoading(true);
      const response = await serverService.getSavedServers();
      setSavedServers(response.servers || []);
      setSelectedSavedServers(new Array(response.servers?.length || 0).fill(false));
    } catch (error) {
      console.error('Error fetching saved servers:', error);
      setNotification({type: 'error', message: 'Lỗi khi tải danh sách server đã lưu'});
    } finally {
      setSavedServersLoading(false);
    }
  };

  // const handleLoadSelectedSavedServers = () => {
  //   const selectedServersList = savedServers.filter((_, index) => selectedSavedServers[index]);
    
  //   if (selectedServersList.length === 0) {
  //     setNotification({type: 'warning', message: 'Vui lòng chọn ít nhất một server'});
  //     return;
  //   }

  //   // Convert saved servers to the format used in the assessment
  //   const newServers = selectedServersList.map(server => ({
  //     name: server.name,
  //     ip: server.ip,
  //     serverIP: server.ip,
  //     sshPort: server.ssh_port?.toString() || '22',
  //     sshUser: server.admin_username,
  //     sshPassword: server.admin_password,
  //     sudoUser: server.root_username,
  //     sudoPassword: server.root_password
  //   }));

  //   // Add to existing servers
  //   setServers([...servers, ...newServers]);
  //   setSelectedServers([...selectedServers, ...new Array(newServers.length).fill(false)]);
  //   setConnectionResults([...connectionResults, ...new Array(newServers.length).fill(null)]);
    
  //   setShowSavedServersModal(false);
  //   setNotification({type: 'success', message: `Đã tải ${selectedServersList.length} server từ danh sách đã lưu`});
  // };

  // Load saved servers when modal opens
  useEffect(() => {
    if (showSavedServersModal) {
      fetchSavedServers();
    }
  }, [showSavedServersModal]);

  // Load recent servers for "Select from saved list" modal
  const loadRecentServers = async () => {
    try {
      const result = await serverService.getHandoverRecentServers(false, 20);
      setRecentServers(result.entries || []);
      setSelectedSavedEntries(new Array(result.entries?.length || 0).fill(false));
    } catch (error) {
      console.error('Error loading recent servers:', error);
      setAlert({ type: 'error', message: 'Failed to load recent servers' });
    }
  };

  // Load uploaded files for "Select from saved list" modal
  const loadUploadedFiles = async () => {
    try {
      const result = await serverService.getServerUploads();
      setUploadedFiles(result.entries || []);
      if (savedListTab === 'uploads') {
        setSelectedSavedEntries(new Array(result.entries?.length || 0).fill(false));
      }
    } catch (error) {
      console.error('Error loading uploaded files:', error);
      setAlert({ type: 'error', message: 'Failed to load uploaded files' });
    }
  };

  // Preview servers from selected entries
  const previewSelectedServers = async () => {
    const selectedEntries = savedListTab === 'recent' 
      ? recentServers.filter((_, index) => selectedSavedEntries[index])
      : uploadedFiles.filter((_, index) => selectedSavedEntries[index]);
    
    if (selectedEntries.length === 0) {
      setAlert({ type: 'error', message: 'Please select at least one entry to preview' });
      return;
    }

    try {
      setPreviewServers(selectedEntries);
      setShowPreviewModal(true);
    } catch (error) {
      console.error('Error previewing servers:', error);
      setAlert({ type: 'error', message: 'Failed to preview servers' });
    }
  };

  // Apply selected servers to assessment
  const applySelectedServers = () => {
    const selectedEntries = savedListTab === 'recent' 
      ? recentServers.filter((_, index) => selectedSavedEntries[index])
      : uploadedFiles.filter((_, index) => selectedSavedEntries[index]);
    
    if (selectedEntries.length === 0) {
      setAlert({ type: 'error', message: 'Please select at least one entry' });
      return;
    }

    // Convert selected entries to server format and add to assessment
    const newServers = selectedEntries.map((entry, index) => ({
      name: entry.description || `Server ${index + 1}`,
      ip: entry.server_info?.ip || 'Unknown',
      serverIP: entry.server_info?.ip || 'Unknown',
      sshPort: entry.server_info?.ssh_port || '22',
      sshUser: entry.server_info?.admin_username || '',
      sshPassword: entry.server_info?.admin_password || '',
      sudoUser: entry.server_info?.root_username || '',
      sudoPassword: entry.server_info?.root_password || ''
    }));

    // Add to existing servers
    const updatedServers = [...servers, ...newServers];
    const updatedSelectedServers = [...selectedServers, ...new Array(newServers.length).fill(true)];
    
    setServers(updatedServers);
    setSelectedServers(updatedSelectedServers);

    setShowSelectFromSavedModal(false);
    setAlert({ type: 'success', message: `Added ${newServers.length} servers from saved list` });
  };

  // Load data when "Select from saved list" modal opens
  useEffect(() => {
    if (showSelectFromSavedModal) {
      if (savedListTab === 'recent') {
        loadRecentServers();
      } else {
        loadUploadedFiles();
      }
    }
  }, [showSelectFromSavedModal, savedListTab]);

  const handleSaveCurrentServers = async () => {
    // Check if any servers are selected
    const selectedServerIndices = selectedServers.map((selected, index) => selected ? index : -1).filter(index => index !== -1);
    
    if (selectedServerIndices.length === 0) {
      showAlert('error', 'Vui lòng chọn ít nhất một server để lưu');
      return;
    }

    const selectedServerList = selectedServerIndices.map(index => servers[index]);

    try {
      const serversToSave = selectedServerList.map((server: any) => ({
        ip: server.serverIP || server.ip,
        ssh_port: parseInt(server.sshPort) || 22,
        admin_username: server.sshUser,
        admin_password: server.sshPassword,
        root_username: server.sudoUser || 'root',
        root_password: server.sudoPassword,
        name: server.name || server.ip || server.serverIP,
        description: `Handover Assessment - ${new Date().toLocaleDateString('vi-VN')}`
      }));

      const response = await serverService.bulkSaveServers(serversToSave);
      
      if (response.success) {
        showAlert('success', `Đã lưu thành công ${response.saved_count} server(s)`);
        if (response.error_count && response.error_count > 0) {
          console.warn('Some servers had errors:', response.errors);
          showAlert('warning', `${response.error_count} server(s) không thể lưu (có thể đã tồn tại)`);
        }
      } else {
        showAlert('error', response.message || 'Có lỗi xảy ra khi lưu server');
      }
    } catch (error: any) {
      console.error('Error saving servers:', error);
      
      // Handle specific error cases
      if (error?.response?.status === 409) {
        showAlert('error', 'Một số server đã tồn tại trong hệ thống');
      } else if (error?.response?.data?.message) {
        showAlert('error', error.response.data.message);
      } else {
        showAlert('error', 'Có lỗi xảy ra khi lưu server');
      }
    }
  };

  const handleLoadSavedServers = () => {
    const selectedSavedServerList = savedServers.filter((_, index) => selectedSavedServers[index]);
    
    if (selectedSavedServerList.length === 0) {
      setNotification({type: 'warning', message: 'Vui lòng chọn ít nhất một server để tải'});
      return;
    }

    const mappedServers = selectedSavedServerList.map((server: Server) => ({
      name: server.name,
      ip: server.ip,
      serverIP: server.ip,
      sshPort: server.ssh_port?.toString() || '22',
      sshUser: server.admin_username,
      sshPassword: server.admin_password,
      sudoUser: server.root_username,
      sudoPassword: server.root_password
    }));

    setServers([...servers, ...mappedServers]);
    setSelectedServers([...selectedServers, ...new Array(mappedServers.length).fill(false)]);
    setConnectionResults([...connectionResults, ...new Array(mappedServers.length).fill(null)]);
    
    setNotification({type: 'success', message: `Đã tải ${mappedServers.length} server(s) từ danh sách đã lưu`});
    setActiveTab('assessment'); // Switch back to assessment tab
  };

  const handleDeleteSavedServer = async (serverId: number) => {
    try {
      const response = await serverService.deleteServer(serverId);
      if (response.success) {
        setNotification({type: 'success', message: 'Đã xóa server thành công'});
        fetchSavedServers(); // Refresh list
      }
    } catch (error) {
      console.error('Error deleting server:', error);
      setNotification({type: 'error', message: 'Lỗi khi xóa server'});
    }
  };

  // Load saved servers when modal opens
  const handleOpenSavedServersModal = async () => {
    setShowSavedServersModal(true);
    await fetchSavedServers();
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
                            {/* Assessment Readiness Checklist */}
                            <div className="mb-4">
                              <div className="d-flex justify-content-between align-items-center mb-3">
                                <h6>Checklist chuẩn bị đánh giá</h6>
                                {(assessmentResults || selectedMOP || servers.length > 0) && (
                                  <button 
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={() => {
                                      updateState({
                                        selectedMOP: '',
                                        servers: [],
                                        selectedServers: [],
                                        assessmentStarted: false,
                                        assessmentCompleted: false,
                                        hasResults: false
                                      });
                                      updateState({ assessmentResults: null, assessmentProgress: null });
                                      setConnectionResults([]);
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
                              
                              <div className="card" style={{backgroundColor: '#f8f9fa', border: '1px solid #dee2e6'}}>
                                <div className="card-body py-2">
                                  <div className="row">
                                    <div className="col-md-4">
                                      <div className="form-check">
                                        <input 
                                          className="form-check-input" 
                                          type="checkbox" 
                                          checked={assessmentReadiness.mopSelected}
                                          disabled
                                          id="checkMOPHandover"
                                        />
                                        <label className="form-check-label" htmlFor="checkMOPHandover">
                                          <i className={`fas ${assessmentReadiness.mopSelected ? 'fa-check-circle text-success' : 'fa-circle text-muted'} mr-1`}></i>
                                          Chọn MOP
                                        </label>
                                      </div>
                                    </div>
                                    <div className="col-md-4">
                                      <div className="form-check">
                                        <input 
                                          className="form-check-input" 
                                          type="checkbox" 
                                          checked={assessmentReadiness.serversConfigured}
                                          disabled
                                          id="checkServersHandover"
                                        />
                                        <label className="form-check-label" htmlFor="checkServersHandover">
                                          <i className={`fas ${assessmentReadiness.serversConfigured ? 'fa-check-circle text-success' : 'fa-circle text-muted'} mr-1`}></i>
                                          Cấu hình Server
                                        </label>
                                      </div>
                                    </div>
                                    <div className="col-md-4">
                                      <div className="form-check">
                                        <input 
                                          className="form-check-input" 
                                          type="checkbox" 
                                          checked={assessmentReadiness.connectionTested}
                                          disabled
                                          id="checkConnectionHandover"
                                        />
                                        <label className="form-check-label" htmlFor="checkConnectionHandover">
                                          <i className={`fas ${assessmentReadiness.connectionTested ? 'fa-check-circle text-success' : 'fa-circle text-muted'} mr-1`}></i>
                                          Kiểm tra kết nối
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                             
                             {/* MOP Selection */}
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
                                <div className="col-md-4">
                                  <button 
                                    className="btn btn-outline-primary btn-block"
                                    onClick={() => setShowFileUploadModal(true)}
                                  >
                                    <i className="fas fa-upload mr-2"></i>
                                    {t('uploadFileServer')}
                                  </button>
                                </div>
                                <div className="col-md-4">
                                  <button 
                                    className="btn btn-outline-secondary btn-block"
                                    onClick={() => setShowManualInputModal(true)}
                                  >
                                    <i className="fas fa-keyboard mr-2"></i>
                                    {t('manualInput')}
                                  </button>
                                </div>
                                <div className="col-md-4">
                                  <button 
                                    className="btn btn-outline-success btn-block"
                                    onClick={handleOpenSavedServersModal}
                                  >
                                    <i className="fas fa-list mr-2"></i>
                                    Chọn từ danh sách đã lưu
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
                                                   const result = connectionResults?.[index];
                                                   return result ? (
                                                     <span className={`badge ${
                                                       result.success ? 'badge-success' : 'badge-danger'
                                                     }`}>
                                                       {result.success ? 'Connection Success' : 'Connection Failed'}
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
                                    <button 
                                      className="btn btn-outline-primary"
                                      onClick={handleSaveCurrentServers}
                                      title="Lưu danh sách server hiện tại"
                                    >
                                      <i className="fas fa-save mr-1"></i>
                                      Lưu servers
                                    </button>
                                  </div>
                                )}
                                
                                {/* Assessment Loading with Progress */}
                                {assessmentLoading && (
                                  <div className="mt-4">
                                    <div className="card">
                                      <div className="card-header">
                                        <h6 className="mb-0">
                                          <i className="fas fa-spinner fa-spin mr-2"></i>
                                          Đang thực hiện Handover Assessment
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
                                                    width: `${assessmentProgress.totalServers > 0 ? (assessmentProgress.completedServers / assessmentProgress.totalServers) * 100 : 0}%`
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
                                                    width: `${assessmentProgress.totalCommands > 0 ? (assessmentProgress.completedCommands / assessmentProgress.totalCommands) * 100 : 0}%`
                                                  }}
                                                ></div>
                                              </div>
                                              <small className="text-muted">
                                                <i className="fas fa-terminal mr-1"></i>
                                                Đang thực hiện: {assessmentProgress.currentCommand}
                                              </small>
                                            </div>
                                          
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
                                          {t('assessmentResults')}
                                        </h5>
                                        <div className="ml-auto">
                                          <button 
                                            className="btn btn-success btn-sm mr-2"
                                            onClick={handleDownloadReport}
                                          >
                                            <i className="fas fa-download mr-2"></i>
                                            {t('downloadExcelReport')}
                                          </button>
                                          <button 
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => updateState({ assessmentResults: null })}
                                          >
                                            <i className="fas fa-times mr-2"></i>
                                            {t('clearResults')}
                                          </button>
                                        </div>
                                      </div>
                                      <div className="card-body">
                                        {/* Assessment Summary */}
                                        
                                        <div className="mb-3">
                                          <h6><strong>{t('mopExecuted')}</strong> {assessmentResults.mop_name}</h6>
                                          <p><strong>{t('status')}:</strong> 
                                            <span className={`badge ml-2 ${
                                              assessmentResults.status === 'success' ? 'badge-success' : 
                                              assessmentResults.status === 'fail' ? 'badge-danger' : 'badge-warning'
                                            }`}>
                                              {assessmentResults.status === 'success' ? t('success') : 
                                               assessmentResults.status === 'fail' ? t('failed') : t('processing')}
                                            </span>
                                          </p>
                                          
                                          {/* Execution Logs */}
                                          {/* {assessmentResults.execution_logs && (
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
                                          )} */}
                                          
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
                                        
                                        {assessmentResults.test_results && (() => {
                                          // Get selected server IPs
                                          const selectedServerIPs = servers
                                            .filter((_, index) => selectedServers[index])
                                            .map(server => server.serverIP || server.ip);
                                          
                                          // Filter results to only show selected servers
                                          const filteredResults = assessmentResults.test_results.filter((result: any) => 
                                            selectedServerIPs.includes(result.server_ip)
                                          );
                                          
                                          if (selectedServerIPs.length === 0) {
                                            return (
                                              <div className="alert alert-warning">
                                                <i className="fas fa-exclamation-triangle mr-2"></i>
                                                Không có server nào được chọn. Vui lòng chọn server để xem kết quả.
                                              </div>
                                            );
                                          }
                                          
                                          if (filteredResults.length === 0) {
                                            return (
                                              <div className="alert alert-info">
                                                <i className="fas fa-info-circle mr-2"></i>
                                                Không có kết quả nào cho các server được chọn.
                                              </div>
                                            );
                                          }
                                          
                                          return (
                                            <AssessmentResultsTable 
                                              results={filteredResults.map((result: any) => {
                                                const command = assessmentResults.commands ? assessmentResults.commands[result.command_index] : null;
                                                let skipPrefix = '';
                                                let expandedSuffix = '';
                                                
                                                // Add skip condition prefix
                                                if (result.skip_condition) {
                                                  skipPrefix = `[SKIP_IF:${result.skip_condition.condition_id}:${result.skip_condition.condition_type}] `;
                                                } else if (result.skipped) {
                                                  skipPrefix = '[SKIPPED] ';
                                                }
                                                
                                                // Add expanded command suffix if applicable
                                                if (result._expanded_from) {
                                                  expandedSuffix = ` (expanded from ${result._expanded_from})`;
                                                }
                                                
                                                // Use consistent title logic
                                                const baseTitle = result.title?.trim() || command?.title || command?.description || result.command_name || 'Unnamed Command';
                                                const cmdName = skipPrefix + baseTitle + expandedSuffix;
                                                
                                                return {
                                                  server_ip: result.server_ip,
                                                  command_name: cmdName,
                                                  command_text: result.command_text || result.command,
                                                  status: result.skipped || result.status === 'SKIPPED' || result.validation_result === 'OK (skipped)' ? 'SKIPPED' :
                                                         result.decision === 'APPROVED' ? 'OK' : 
                                                         result.decision === 'REJECTED' ? 'Not OK' :
                                                         result.validation_result === 'OK' ? 'OK' :
                                                         result.validation_result === 'Not OK' ? 'Not OK' :
                                                         result.status === 'OK' ? 'OK' :
                                                         result.status === 'Not OK' ? 'Not OK' : 'N/A',
                                                  output: result.output || result.actual_output,
                                                  actual_output: result.actual_output,
                                                  reference_value: result.reference_value || result.expected_output,
                                                  expected_output: result.expected_output,
                                                  comparator_method: result.comparator_method,
                                                  skip_reason: result.skip_reason,
                                                  skipped: result.skipped || result.status === 'SKIPPED',
                                                  validation_result: result.validation_result,
                                                  decision: result.decision,
                                                  title: baseTitle,
                                                  command_id_ref: result.command_id_ref,
                                                  sub_results: result.sub_results,
                                                  _expanded_from: result._expanded_from,
                                                  recommendations: result.recommendations || []
                                                };
                                              })}
                                            />
                                          );
                                         })()}
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
                        className="btn btn-outline-success btn-block mb-2"
                        onClick={() => setShowSelectFromSavedModal(true)}
                      >
                        <i className="fas fa-history mr-2"></i>Chọn từ danh sách đã lưu
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
              <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>{t('id')}</th>
                        <th>ID Ref</th>
                        <th>{t('commandName')}</th>
                        <th>{t('commandContent')}</th>
                        <th>Extract</th>
                        <th>Comparator</th>
                        <th>Reference Value</th>
                        <th>Skip Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSelectedMOPCommands().map((command, index) => {
                        const hasSkipCondition = typeof command !== 'string' && command.skip_condition;
                        return (
                          <tr key={index}>
                            <td>{typeof command === 'string' ? index + 1 : command.id}</td>
                            <td>{typeof command === 'string' ? '-' : command.command_id_ref || '-'}</td>
                            <td>
                              {typeof command === 'string' ? `${t('command')} ${index + 1}` : command.title || command.description || `${t('command')} ${index + 1}`}
                              {hasSkipCondition && (
                                <><br /><small className="text-warning"><i className="fas fa-forward mr-1"></i>Has skip condition</small></>
                              )}
                            </td>
                            <td><code>{typeof command === 'string' ? command : command.command || command.command_text}</code></td>
                            <td>{typeof command === 'string' ? '-' : command.extract_method || '-'}</td>
                            <td>{typeof command === 'string' ? '-' : command.comparator_method || '-'}</td>
                            <td>{typeof command === 'string' ? '-' : command.reference_value || command.expected_output || '-'}</td>
                            <td>
                               {hasSkipCondition && command.skip_condition ? (
                                 <small className="text-warning">
                                   <i className="fas fa-link mr-1"></i>
                                   {command.skip_condition.condition_type === 'value_match' ? (
                                     <>Skip if {command.skip_condition.condition_id} = "{command.skip_condition.condition_value}"</>
                                   ) : (
                                     <>Skip if {command.skip_condition.condition_id} is {command.skip_condition.condition_type}</>
                                   )}
                                 </small>
                               ) : (
                                 <small className="text-muted">-</small>
                               )}
                             </td>
                          </tr>
                        );
                      })}
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

      {/* Saved Servers Modal */}
      {showSavedServersModal && (
        <div className="modal fade show" style={{display: 'block'}} tabIndex={-1}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-server mr-2"></i>
                  Chọn từ danh sách server đã lưu
                </h5>
                <button 
                  type="button" 
                  className="close" 
                  onClick={() => setShowSavedServersModal(false)}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {savedServersLoading ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status">
                      <span className="sr-only">Loading...</span>
                    </div>
                    <p className="mt-2 text-muted">Đang tải danh sách server...</p>
                  </div>
                ) : savedServers.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-striped table-hover">
                      <thead>
                        <tr>
                          <th>
                            <input 
                              type="checkbox" 
                              checked={selectedSavedServers.length > 0 && selectedSavedServers.every(selected => selected)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedSavedServers(savedServers.map(() => checked));
                              }}
                            /> Chọn tất cả
                          </th>
                          <th>Tên server</th>
                          <th>IP Address</th>
                          <th>SSH Port</th>
                          <th>SSH User</th>
                          <th>Mô tả</th>
                          <th>Ngày tạo</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedServers.map((server, index) => (
                          <tr key={server.id}>
                            <td>
                              <input 
                                type="checkbox" 
                                checked={selectedSavedServers[index] || false}
                                onChange={(e) => {
                                  const newSelected = [...selectedSavedServers];
                                  newSelected[index] = e.target.checked;
                                  setSelectedSavedServers(newSelected);
                                }}
                              />
                            </td>
                            <td>{server.name}</td>
                             <td>{server.ip}</td>
                             <td>{server.ssh_port}</td>
                             <td>{server.admin_username}</td>
                             <td>{server.description || '-'}</td>
                             <td>{server.created_at ? new Date(server.created_at).toLocaleDateString('vi-VN') : '-'}</td>
                             <td>
                                <button 
                                  className="btn btn-danger btn-sm"
                                  onClick={() => server.id && handleDeleteSavedServer(server.id)}
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
                ) : (
                  <div className="alert alert-info">
                    <i className="fas fa-info-circle mr-2"></i>
                    Chưa có server nào được lưu trong hệ thống.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowSavedServersModal(false)}
                >
                  Hủy
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleLoadSavedServers}
                  disabled={!selectedSavedServers.some(selected => selected)}
                >
                  <i className="fas fa-check mr-2"></i>
                  Tải server đã chọn ({selectedSavedServers.filter(selected => selected).length})
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

      {/* Select from Saved List Modal */}
      {showSelectFromSavedModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chọn từ danh sách đã lưu</h5>
                <button type="button" className="close" onClick={() => setShowSelectFromSavedModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {/* Tab Navigation */}
                <ul className="nav nav-tabs mb-3">
                  <li className="nav-item">
                    <button 
                      className={`nav-link ${savedListTab === 'recent' ? 'active' : ''}`}
                      onClick={() => setSavedListTab('recent')}
                    >
                      Assessment gần đây
                    </button>
                  </li>
                  <li className="nav-item">
                    <button 
                      className={`nav-link ${savedListTab === 'uploads' ? 'active' : ''}`}
                      onClick={() => setSavedListTab('uploads')}
                    >
                      File đã tải lên
                    </button>
                  </li>
                </ul>

                {/* Content based on selected tab */}
                {savedListTab === 'recent' ? (
                  <div>
                    <h6>Danh sách Assessment Handover gần đây</h6>
                    {recentServers.length === 0 ? (
                      <p className="text-muted">Không có assessment nào gần đây</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-striped">
                          <thead>
                            <tr>
                              <th>
                                <input 
                                  type="checkbox" 
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedSavedEntries(new Array(recentServers.length).fill(checked));
                                  }}
                                />
                              </th>
                              <th>ID</th>
                              <th>Thời gian</th>
                              <th>Số server</th>
                              <th>Mô tả</th>
                              <th>Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentServers.map((entry, index) => (
                              <tr key={entry.id || index}>
                                <td>
                                  <input 
                                    type="checkbox" 
                                    checked={selectedSavedEntries[index] || false}
                                    onChange={(e) => {
                                      const newSelected = [...selectedSavedEntries];
                                      newSelected[index] = e.target.checked;
                                      setSelectedSavedEntries(newSelected);
                                    }}
                                  />
                                </td>
                                <td>{entry.id || entry.source_id}</td>
                                <td>{new Date(entry.created_at).toLocaleString()}</td>
                                <td>{entry.total_servers || 'N/A'}</td>
                                <td>{entry.description || 'Không có mô tả'}</td>
                                <td>
                                  <span className={`badge ${entry.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                                    {entry.status || 'Unknown'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h6>Danh sách File Server đã tải lên</h6>
                    {uploadedFiles.length === 0 ? (
                      <p className="text-muted">Không có file nào đã tải lên</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-striped">
                          <thead>
                            <tr>
                              <th>
                                <input 
                                  type="checkbox" 
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedSavedEntries(new Array(uploadedFiles.length).fill(checked));
                                  }}
                                />
                              </th>
                              <th>Tên file</th>
                              <th>Thời gian</th>
                              <th>Số server</th>
                              <th>Mô tả</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadedFiles.map((file, index) => (
                              <tr key={file.id || index}>
                                <td>
                                  <input 
                                    type="checkbox" 
                                    checked={selectedSavedEntries[index] || false}
                                    onChange={(e) => {
                                      const newSelected = [...selectedSavedEntries];
                                      newSelected[index] = e.target.checked;
                                      setSelectedSavedEntries(newSelected);
                                    }}
                                  />
                                </td>
                                <td>{file.file_name || 'Unknown'}</td>
                                <td>{new Date(file.created_at).toLocaleString()}</td>
                                <td>{file.total_servers || 'N/A'}</td>
                                <td>{file.description || 'Không có mô tả'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-info" 
                  onClick={previewSelectedServers}
                  disabled={!selectedSavedEntries.some(selected => selected)}
                >
                  <i className="fas fa-eye mr-2"></i>Preview
                </button>
                <button 
                  type="button" 
                  className="btn btn-success" 
                  onClick={applySelectedServers}
                  disabled={!selectedSavedEntries.some(selected => selected)}
                >
                  <i className="fas fa-check mr-2"></i>Áp dụng
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSelectFromSavedModal(false)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Servers Modal */}
      {showPreviewModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Preview Servers</h5>
                <button type="button" className="close" onClick={() => setShowPreviewModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>IP</th>
                        <th>SSH Port</th>
                        <th>Admin User</th>
                        <th>Root User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewServers.map((server, index) => (
                        <tr key={index}>
                          <td>{server.server_info?.ip || 'Unknown'}</td>
                          <td>{server.server_info?.ssh_port || '22'}</td>
                          <td>{server.server_info?.admin_username || 'N/A'}</td>
                          <td>{server.server_info?.root_username || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPreviewModal(false)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HandoverAssessment;