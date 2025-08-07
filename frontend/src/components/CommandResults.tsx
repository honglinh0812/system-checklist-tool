import React, { useState } from 'react';
import { JobResults, JobStatus } from '../types';
import { API_BASE_URL } from '../config';

interface CommandResultsProps {
  results: JobResults;
  jobStatus: JobStatus;
}

const CommandResults: React.FC<CommandResultsProps> = ({ results, jobStatus }) => {
  const [expandedServers, setExpandedServers] = useState<{[key: string]: boolean}>({});

  const toggleServerExpansion = (ip: string) => {
    setExpandedServers(prev => ({
      ...prev,
      [ip]: !prev[ip]
    }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="icon success">✅</span>;
      case 'failed':
        return <span className="icon error">❌</span>;
      default:
        return <span className="icon warning">⏰</span>;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return 'Thành công';
      case 'failed':
        return 'Thất bại';
      default:
        return 'Đang xử lý';
    }
  };

  const downloadLog = () => {
    if (!results.job_id) {
      console.error('No job ID available for download');
      return;
    }
    
    try {
      const downloadUrl = `${API_BASE_URL}/api/logs/${results.job_id}/download`;
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `log_${results.job_id}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Downloading log file:', downloadUrl);
    } catch (error) {
      console.error('Error downloading log:', error);
      alert('Lỗi khi tải log file');
    }
  };

  return (
    <div className="command-results">
      {/* Summary */}
      <div className="results-summary">
        <div className="summary-header">
          <h3>Kết quả tổng quan</h3>
          <button className="btn btn-secondary" onClick={downloadLog}>
            📥 Tải log
          </button>
        </div>
        
        <div className="summary-stats">
          <div className="stat-item">
            <span className="stat-label">Tổng server:</span>
            <span className="stat-value">{results.summary.total_servers}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Thành công:</span>
            <span className="stat-value success">{results.summary.successful_servers}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Thất bại:</span>
            <span className="stat-value error">{results.summary.failed_servers}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Tổng lệnh:</span>
            <span className="stat-value">{results.summary.total_commands}</span>
          </div>
        </div>

        <div className="job-info">
          <p><strong>Job ID:</strong> {results.job_id}</p>
          <p><strong>Thời gian:</strong> {results.timestamp}</p>
          <p><strong>Trạng thái:</strong> {getStatusText(jobStatus.status)}</p>
        </div>
      </div>

      {/* Server Results */}
      <div className="server-results">
        <h3>Kết quả chi tiết theo server</h3>
        
        {Object.entries(results.servers).map(([ip, serverResult]) => (
          <div key={ip} className="server-result">
            <div 
              className="server-result-header"
              onClick={() => toggleServerExpansion(ip)}
            >
              <div className="server-info">
                {expandedServers[ip] ? (
                  <span className="icon">▼</span>
                ) : (
                  <span className="icon">▶</span>
                )}
                <span className="server-ip">{ip}</span>
                {/* {getStatusIcon(serverResult.status)}
                <span className={`server-status ${serverResult.status}`}>
                  {getStatusText(serverResult.status)}
                </span> */}
              </div>
              
              {serverResult.error && (
                <div className="server-error">
                  {serverResult.error}
                </div>
              )}
            </div>

            {expandedServers[ip] && (
              <div className="server-commands">
                {serverResult.commands.map((cmd, index) => (
                  <div key={index} className="command-result">
                    <div className="command-header">
                      <h4>{cmd.title}</h4>
                      {/* <div className="command-status">
                                              {cmd.success ? (
                        <span className="icon success">✅</span>
                      ) : (
                        <span className="icon error">❌</span>
                      )}
                        <span className={cmd.success ? 'success' : 'error'}>
                          {cmd.success ? 'Thành công' : 'Thất bại'}
                        </span>
                      </div> */}
                    </div>
                    
                    <div className="command-details">
                      <div className="command-line">
                        <strong>Lệnh:</strong>
                        <code>{cmd.command}</code>
                      </div>
                      
                      {cmd.output && (
                        <div className="command-output">
                          <strong>Output:</strong>
                          <pre>{cmd.output}</pre>
                        </div>
                      )}
                      
                      {cmd.error && (
                        <div className="command-error">
                          <strong>Error:</strong>
                          <pre>{cmd.error}</pre>
                        </div>
                      )}
                      
                      <div className="command-return">
                        <strong>Return Code:</strong> {cmd.return_code}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommandResults; 