import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import FileUpload from './components/FileUpload';
import ManualServerInput from './components/ManualServerInput';
import ServerList from './components/ServerList';
import CommandBuilder from './components/CommandBuilder';
import CommandResults from './components/CommandResults';
import { Server, Command, CommandTemplate } from './types';
import { API_BASE_URL } from './config';

function App() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [commandTemplates, setCommandTemplates] = useState<CommandTemplate[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [jobResults, setJobResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load command templates on component mount
  useEffect(() => {
    loadCommandTemplates();
  }, []);

  // Poll job status if there's an active job
  useEffect(() => {
    if (currentJobId && jobStatus?.status === 'running') {
      const interval = setInterval(() => {
        checkJobStatus(currentJobId);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [currentJobId, jobStatus]);

  const loadCommandTemplates = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/commands`);
      const data = await response.json();
      setCommandTemplates(data.templates || []);
    } catch (error) {
      console.error('Error loading command templates:', error);
    }
  };

  const handleFileUpload = (uploadedServers: Server[]) => {
    setServers(uploadedServers);
    setSelectedServers(uploadedServers.map(s => s.ip));
  };

  const handleManualServerAdd = async (server: Server) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/servers/add`, server);
      
      if (response.status === 200) {
        // Refresh servers list
        setServers(prev => [...prev, server]);
        setSelectedServers(prev => [...prev, server.ip]);
        console.log('Server added successfully:', response.data);
      }
    } catch (error: any) {
      console.error('Error adding server:', error);
      if (error.response?.data?.error) {
        alert(`Lỗi: ${error.response.data.error}`);
      } else {
        alert('Lỗi khi thêm server');
      }
    }
  };

  const handleServerSelection = (selectedIps: string[]) => {
    setSelectedServers(selectedIps);
  };

  const handleCommandsChange = (newCommands: Command[]) => {
    setCommands(newCommands);
  };

  const handleRunCommands = async () => {
    if (selectedServers.length === 0) {
      alert('Vui lòng chọn ít nhất một server');
      return;
    }

    if (commands.length === 0) {
      alert('Vui lòng thêm ít nhất một lệnh');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/commands/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selected_servers: selectedServers,
          commands: commands
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setCurrentJobId(data.job_id);
        setJobStatus({
          status: 'running',
          job_id: data.job_id,
          servers_count: data.servers_count,
          commands_count: data.commands_count
        });
      } else {
        alert(`Lỗi: ${data.error}`);
      }
    } catch (error) {
      console.error('Error running commands:', error);
      alert('Lỗi khi chạy lệnh');
    } finally {
      setIsLoading(false);
    }
  };

  const checkJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/commands/status/${jobId}`);
      const data = await response.json();
      
      if (response.ok) {
        setJobStatus(data);
        if (data.status === 'completed') {
          loadJobResults(jobId);
        }
      }
    } catch (error) {
      console.error('Error checking job status:', error);
    }
  };

  const loadJobResults = async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/commands/results/${jobId}`);
      const data = await response.json();
      
      if (response.ok) {
        setJobResults(data);
      }
    } catch (error) {
      console.error('Error loading job results:', error);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/template/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'server_list_template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Lỗi khi tải template');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>System Checklist Tool</h1>
        <p>Hệ thống tự động đánh giá checklist cho hệ thống</p>
      </header>

      <main className="App-main">
        <div className="container">
          {/* File Upload Section */}
          <section className="section">
            <div className="section-header">
              <h2>1. Tải lên danh sách Server</h2>
              <button 
                className="btn btn-secondary"
                onClick={handleDownloadTemplate}
              >
                📥 Download Template
              </button>
            </div>
            <FileUpload onUpload={handleFileUpload} />
            
            <div className="upload-divider">
              <span>hoặc</span>
            </div>
            
            <ManualServerInput onAddServer={handleManualServerAdd} />
          </section>

          {/* Server List Section */}
          {servers.length > 0 && (
            <section className="section">
              <h2>2. Chọn Server cần đánh giá</h2>
              <ServerList 
                servers={servers}
                selectedServers={selectedServers}
                onSelectionChange={handleServerSelection}
              />
            </section>
          )}

          {/* Command Builder Section */}
          {selectedServers.length > 0 && (
            <section className="section">
              <h2>3. Tạo danh sách lệnh cần chạy</h2>
              <CommandBuilder 
                commands={commands}
                commandTemplates={commandTemplates}
                onCommandsChange={handleCommandsChange}
              />
            </section>
          )}

          {/* Run Commands Section */}
          {commands.length > 0 && selectedServers.length > 0 && (
            <section className="section">
              <h2>4. Chạy lệnh</h2>
              <div className="run-section">
                <button 
                  className="btn btn-primary btn-large"
                  onClick={handleRunCommands}
                  disabled={isLoading}
                >
                  {isLoading ? '🔄 Đang chạy...' : '▶️ Run Commands'}
                </button>
                <div className="summary">
                  <p>Servers: {selectedServers.length}</p>
                  <p>Commands: {commands.length}</p>
                </div>
              </div>
            </section>
          )}

          {/* Results Section */}
          {jobResults && (
            <section className="section">
              <h2>5. Kết quả</h2>
              <CommandResults 
                results={jobResults}
                jobStatus={jobStatus}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
