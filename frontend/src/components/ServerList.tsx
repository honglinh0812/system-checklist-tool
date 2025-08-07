import React from 'react';
import { Server } from '../types';

interface ServerListProps {
  servers: Server[];
  selectedServers: string[];
  onSelectionChange: (selectedIps: string[]) => void;
}

const ServerList: React.FC<ServerListProps> = ({ 
  servers, 
  selectedServers, 
  onSelectionChange 
}) => {
  const handleSelectAll = () => {
    if (selectedServers.length === servers.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(servers.map(s => s.ip));
    }
  };

  const handleSelectServer = (ip: string) => {
    if (selectedServers.includes(ip)) {
      onSelectionChange(selectedServers.filter(s => s !== ip));
    } else {
      onSelectionChange([...selectedServers, ip]);
    }
  };

  const isAllSelected = selectedServers.length === servers.length;
  const isIndeterminate = selectedServers.length > 0 && selectedServers.length < servers.length;

  return (
    <div className="server-list">
      <div className="server-list-header">
        <div className="select-all">
          <button 
            className="select-all-btn"
            onClick={handleSelectAll}
          >
            {isAllSelected ? (
              <span className="icon">☑️</span>
            ) : (
              <span className={`icon ${isIndeterminate ? 'indeterminate' : ''}`}>⬜</span>
            )}
          </button>
          <span>
            {isAllSelected 
              ? 'Bỏ chọn tất cả' 
              : `Chọn tất cả (${selectedServers.length}/${servers.length})`
            }
          </span>
        </div>
      </div>

      <div className="server-grid">
        {servers.map((server) => (
          <div 
            key={server.ip}
            className={`server-card ${selectedServers.includes(server.ip) ? 'selected' : ''}`}
            onClick={() => handleSelectServer(server.ip)}
          >
            <div className="server-select">
              {selectedServers.includes(server.ip) ? (
                <span className="icon">☑️</span>
              ) : (
                <span className="icon">⬜</span>
              )}
            </div>
            
            <div className="server-info">
              <h4 className="server-ip">{server.ip}</h4>
              <div className="server-details">
                <p><strong>Admin:</strong> {server.admin_username}</p>
                <p><strong>Root:</strong> {server.root_username}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {servers.length === 0 && (
        <div className="no-servers">
          <p>Chưa có server nào được tải lên</p>
        </div>
      )}
    </div>
  );
};

export default ServerList; 