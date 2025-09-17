import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { ErrorMessage } from '../../components/common';
import { useAssessmentState } from '../../hooks/useAssessmentState';
import { useTranslation } from '../../i18n/useTranslation';
import { periodicAssessmentService } from '../../services/periodicAssessmentService';
import type { PeriodicAssessment, PeriodicAssessmentExecution } from '../../services/periodicAssessmentService';
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
  id?: number;
  command_id_ref?: string; // ID column
  title: string; // Name column
  command: string; // Command column
  command_text?: string;
  description?: string;
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
  const { selectedMOP, servers, selectedServers, assessmentType, assessmentResults, assessmentProgress } = assessmentState;

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
  
  // Non-persisted states - loading, temporary actions, và volatile data
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverFile, setServerFile] = useState<File | null>(null);
  const [connectionResults, setConnectionResults] = useState<({success: boolean, message: string, serverIndex: number} | null)[]>([]);
  
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteServerIndex, setDeleteServerIndex] = useState<number>(-1);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [savedServersLoading, setSavedServersLoading] = useState(false);
  
  // Saved servers states
  const [savedServers, setSavedServers] = useState<Server[]>([]);
  const [showSavedServersModal, setShowSavedServersModal] = useState(false);
  const [selectedSavedServers, setSelectedSavedServers] = useState<boolean[]>([]);
  const [showDeleteSavedServerConfirm, setShowDeleteSavedServerConfirm] = useState(false);
  const [deleteSavedServerId, setDeleteSavedServerId] = useState<number | null>(null);
  
  // New "Select from saved list" modal states
  const [showSelectFromSavedModal, setShowSelectFromSavedModal] = useState(false);
  const [savedListTab, setSavedListTab] = useState<'recent' | 'uploads'>('recent');
  const [recentServers, setRecentServers] = useState<any[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [selectedSavedEntries, setSelectedSavedEntries] = useState<boolean[]>([]);
  const [previewServers, setPreviewServers] = useState<any[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  // Periodic assessment states
  const [periodicAssessments, setPeriodicAssessments] = useState<PeriodicAssessment[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<PeriodicAssessmentExecution[]>([]);
  const [periodicFrequency, setPeriodicFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [periodicTime, setPeriodicTime] = useState<string>('09:00');
  const [periodicLoading, setPeriodicLoading] = useState(false);
  const [periodicSelectedServers, setPeriodicSelectedServers] = useState<boolean[]>([]);

  // Add useEffect to monitor selectedServers and connectionResults changes

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

  // Initialize periodicSelectedServers when servers change
  useEffect(() => {
    setPeriodicSelectedServers(new Array(servers.length).fill(true));
  }, [servers]);

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

    // Check if at least one server is selected for periodic assessment
    const hasSelectedServers = periodicSelectedServers.some(selected => selected);
    if (!hasSelectedServers) {
      showAlert('error', 'Vui lòng chọn ít nhất một server cho đánh giá định kỳ');
      return;
    }

    try {
      setPeriodicLoading(true);
      
      const data = {
        mop_id: parseInt(selectedMOP),
        assessment_type: 'risk' as const,
        frequency: periodicFrequency,
        execution_time: periodicTime,
        servers: servers.filter((_, index) => periodicSelectedServers[index]).map(server => ({
          ...server,
          selected: true
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
      ssh_port: parseInt(server.sshPort) || 22
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
      
      // Connection results updated - readiness will be calculated automatically
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
        
        // Initialize assessment progress with start time
        updateState({
          assessmentProgress: {
            currentCommand: 'Đang khởi tạo...',
            currentServer: 'Đang chuẩn bị...',
            completedCommands: 0,
            totalCommands: selectedMOPData.commands?.length || 0,
            completedServers: 0,
            totalServers: mappedServerList.length,
            logs: [],
            startTime: new Date(),
            estimatedTimeRemaining: 'Đang tính toán...'
          }
        });
        
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
                
                const startTime = assessmentProgress?.startTime ? new Date(assessmentProgress.startTime) : new Date();
                const estimatedTimeRemaining = calculateEstimatedTime(detailedProgress, startTime);
                
                updateState({ 
                  assessmentProgress: {
                    ...assessmentProgress,
                    currentCommand: `Đang thực hiện command ${detailedProgress.current_command || 1}/${detailedProgress.total_commands || selectedMOPData.commands?.length || 0}`,
                    currentServer: `Đang xử lý server ${detailedProgress.current_server || 1}/${detailedProgress.total_servers || mappedServerList.length}`,
                    completedCommands: detailedProgress.current_command || 0,
                    totalCommands: detailedProgress.total_commands || selectedMOPData.commands?.length || 0,
                    completedServers: detailedProgress.current_server || 0,
                    totalServers: detailedProgress.total_servers || mappedServerList.length,
                    logs: logs ? logs.slice(-20) : [],
                    startTime: assessmentProgress?.startTime || new Date(),
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
                  
                  // Debug: Kiểm tra cấu trúc data và recommendations
                  console.log('API Response structure:', resultsResponse.data);
                  if (resultsResponse.data.test_results) {
                    console.log('First few test results:', resultsResponse.data.test_results.slice(0, 3));
                    resultsResponse.data.test_results.forEach((result: any, index: number) => {
                      if (result.recommendations && result.recommendations.length > 0) {
                        console.log(`Result ${index} has recommendations:`, result.recommendations);
                      }
                    });
                  }
                  
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
    } catch (error: unknown) {
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
            sshPort: server.ssh_port?.toString() || '22',
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
    } catch (error: unknown) {
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
        message: 'Không có kết quả báo cáo để tải về'
      });
      return;
    }

    try {
      // Use apiService to ensure proper authentication
      const response = await apiService.downloadBlob(API_ENDPOINTS.ASSESSMENTS.RISK_DOWNLOAD(assessmentResults.id));

      // Get filename from response headers or create default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `risk_assessment_${assessmentResults.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (contentDisposition && typeof contentDisposition === 'string') {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/); 
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const url = window.URL.createObjectURL(response.data);
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
    } catch (error: unknown) {
      console.error('Error downloading report:', error);
      setNotification({
        type: 'error',
        message: 'Lỗi khi tải báo cáo'
      });
    }
  };

  // Saved servers functions
  const handleSaveCurrentServers = async () => {
    // Check if any servers are selected
    const selectedServerIndices = selectedServers.map((selected, index) => selected ? index : -1).filter(index => index !== -1);
    
    if (selectedServerIndices.length === 0) {
      showAlert('error', 'Vui lòng chọn ít nhất một server để lưu');
      return;
    }

    const selectedServerList = selectedServerIndices.map(index => servers[index]);

    try {
      const serverData = selectedServerList.map(server => ({
        name: server.name || server.ip || server.serverIP,
        ip: server.ip || server.serverIP,
        ssh_port: parseInt(server.sshPort) || 22,
        admin_username: server.sshUser,
        admin_password: server.sshPassword,
        root_username: server.sudoUser,
        root_password: server.sudoPassword,
        description: `Risk Assessment - ${new Date().toLocaleDateString('vi-VN')}`
      }));

      // Use bulk save servers to handle duplicates properly
      const result = await serverService.bulkSaveServers(serverData);
      
      if (result.success) {
        showAlert('success', `Đã lưu thành công ${result.saved_count} server(s)`);
        if (result.error_count && result.error_count > 0) {
          console.warn('Some servers had errors:', result.errors);
          showAlert('error', `${result.error_count} server(s) không thể lưu (có thể đã tồn tại)`);
        }
      } else {
        showAlert('error', result.message || 'Có lỗi xảy ra khi lưu server');
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

  const handleLoadSavedServers = async () => {
    const selectedIndexes = selectedSavedServers
      .map((selected, index) => selected ? index : -1)
      .filter(index => index !== -1);

    if (selectedIndexes.length === 0) {
      setNotification({
        type: 'error',
        message: 'Vui lòng chọn ít nhất một server'
      });
      return;
    }

    const selectedServersData = selectedIndexes.map(index => savedServers[index]);
    const newServers = selectedServersData.map(server => ({
      name: server.name,
      ip: server.ip,
      serverIP: server.ip,
      sshPort: server.ssh_port?.toString() || '22',
      sshUser: server.admin_username || '',
      sshPassword: server.admin_password || '',
      sudoUser: server.root_username || '',
      sudoPassword: server.root_password || ''
    }));

    updateState({ 
      servers: [...servers, ...newServers],
      selectedServers: [...selectedServers, ...new Array(newServers.length).fill(false)]
    });
    setConnectionResults([...connectionResults, ...new Array(newServers.length).fill(null)]);
    
    setShowSavedServersModal(false);
    setSelectedSavedServers([]);
    setNotification({
      type: 'success',
      message: `Đã tải thành công ${newServers.length} server`
    });
  };

  const handleDeleteSavedServer = async (serverId: number) => {
    setDeleteSavedServerId(serverId);
    setShowDeleteSavedServerConfirm(true);
  };

  const confirmDeleteSavedServer = async () => {
    if (deleteSavedServerId === null) return;

    try {
      await serverService.deleteServer(deleteSavedServerId);
      await fetchSavedServers();
      setNotification({
        type: 'success',
        message: 'Đã xóa server thành công'
      });
    } catch (error) {
      console.error('Error deleting server:', error);
      setNotification({
        type: 'error',
        message: 'Có lỗi xảy ra khi xóa server'
      });
    } finally {
      setShowDeleteSavedServerConfirm(false);
      setDeleteSavedServerId(null);
    }
  };

  const handleOpenSavedServersModal = () => {
    setShowSavedServersModal(true);
  };

  const fetchSavedServers = async () => {
    try {
      setSavedServersLoading(true);
      const response = await serverService.getSavedServers();
      setSavedServers(response.servers || []);
      setSelectedSavedServers(new Array(response.servers?.length || 0).fill(false));
    } catch (error) {
      console.error('Error fetching saved servers:', error);
      setNotification({
        type: 'error',
        message: 'Có lỗi xảy ra khi tải danh sách server đã lưu'
      });
    } finally {
      setSavedServersLoading(false);
    }
  };

  // Load saved servers when modal opens
  useEffect(() => {
    if (showSavedServersModal) {
      fetchSavedServers();
    }
  }, [showSavedServersModal]);

  // Load recent servers for "Select from saved list" modal
  const loadRecentServers = async () => {
    try {
      const result = await serverService.getRiskRecentServers(false, 20);
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
      // For now, we'll show basic info. In a real implementation, 
      // you'd fetch detailed server lists from the backend
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
    
    updateState({ 
      servers: updatedServers, 
      selectedServers: updatedSelectedServers 
    });

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
                                          id="checkMOP"
                                        />
                                        <label className="form-check-label" htmlFor="checkMOP">
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
                                          id="checkServers"
                                        />
                                        <label className="form-check-label" htmlFor="checkServers">
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
                                          id="checkConnection"
                                        />
                                        <label className="form-check-label" htmlFor="checkConnection">
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
                                <div className="col-md-4">
                                  <button 
                                    className="btn btn-outline-primary btn-block"
                                    onClick={() => setShowFileUploadModal(true)}
                                  >
                                    <i className="fas fa-upload mr-2"></i>
                                    Upload File Server
                                  </button>
                                </div>
                                <div className="col-md-4">
                                  <button 
                                    className="btn btn-outline-secondary btn-block"
                                    onClick={() => setShowManualInputModal(true)}
                                  >
                                    <i className="fas fa-keyboard mr-2"></i>
                                    Nhập thông tin server
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
                                                      connectionResults[index]?.success ? 'badge-success' : 'badge-danger'
                                                    }`}>
                                                      {connectionResults[index]?.success ? 'Connection Success' : 'Connection Failed'}
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
                                        className="btn btn-outline-warning"
                                        onClick={handleSaveCurrentServers}
                                        disabled={servers.length === 0}
                                      >
                                        <i className="fas fa-save mr-2"></i>
                                        Lưu servers
                                      </button>

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
                                               Đang thực hiện báo cáo rủi ro, vui lòng đợi...
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
                                             <div className="ml-auto">
                                              <button 
                                                className="btn btn-primary"
                                                onClick={handleDownloadReport}
                                                disabled={!assessmentResults?.id}
                                              >
                                                <i className="fas fa-download mr-2"></i>
                                                Tải báo cáo Excel
                                              </button>
                                            </div>
                                             <div className="ml-auto">
                                               <button 
                                                 className="btn btn-secondary btn-sm"
                                                 onClick={() => updateState({ assessmentResults: null })}
                                               >
                                                 <i className="fas fa-times mr-2"></i>
                                                 Clear Results
                                               </button>
                                             </div>
                                           </div>                                 
                                           
                                           <div className="card-body">
                                             {/* Assessment Summary */}
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
                                             <div className="mb-3">          
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
                                          <input 
                                            className="form-check-input" 
                                            type="checkbox" 
                                            id={`periodic-server-${index}`} 
                                            checked={periodicSelectedServers[index] || false}
                                            onChange={(e) => {
                                              const newSelection = [...periodicSelectedServers];
                                              newSelection[index] = e.target.checked;
                                              setPeriodicSelectedServers(newSelection);
                                            }}
                                          />
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
                                    disabled={!selectedMOP || servers.length === 0 || !periodicSelectedServers.some(selected => selected) || periodicLoading}
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
                      <button type="button" className="btn btn-outline-success btn-block mb-2" onClick={() => setShowSelectFromSavedModal(true)}>
                        <i className="fas fa-history mr-2"></i>Chọn từ danh sách đã lưu
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

      {/* Saved Servers Modal */}
      {showSavedServersModal && (
        <div className="modal fade show" style={{display: 'block'}} tabIndex={-1}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chọn từ danh sách server đã lưu</h5>
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
                  <div className="text-center">
                    <div className="spinner-border" role="status">
                      <span className="sr-only">Loading...</span>
                    </div>
                  </div>
                ) : savedServers.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-striped">
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
                          <th>Tên</th>
                          <th>IP</th>
                          <th>SSH Port</th>
                          <th>SSH User</th>
                          <th>Mô tả</th>
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
                            <td>{server.description}</td>
                            <td>
                              <button 
                                className="btn btn-sm btn-danger"
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
                  <p className="text-muted">Chưa có server nào được lưu.</p>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowSavedServersModal(false)}
                >
                  Đóng
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleLoadSavedServers}
                  disabled={!selectedSavedServers.some(selected => selected)}
                >
                  Tải server đã chọn
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

      {/* Delete Saved Server Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteSavedServerConfirm}
        onClose={() => setShowDeleteSavedServerConfirm(false)}
        onConfirm={confirmDeleteSavedServer}
        title="Xác nhận xóa server đã lưu"
        message="Bạn có chắc chắn muốn xóa server này khỏi danh sách đã lưu?"
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
                    <h6>Danh sách Assessment Risk gần đây</h6>
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

export default RiskAssessment;