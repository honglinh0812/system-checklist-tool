import React, { useState } from 'react';
import { Server } from '../types';

interface ManualServerInputProps {
  onAddServer: (server: Server) => void;
}

const ManualServerInput: React.FC<ManualServerInputProps> = ({ onAddServer }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    ip: '',
    admin_username: '',
    admin_password: '',
    root_username: '',
    root_password: ''
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!formData.ip.trim()) {
      newErrors.ip = 'IP không được để trống';
    } else if (!/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(formData.ip) && formData.ip !== 'localhost') {
      newErrors.ip = 'IP không hợp lệ';
    }
    
    if (!formData.admin_username.trim()) {
      newErrors.admin_username = 'SSH username không được để trống';
    }
    
    if (!formData.admin_password.trim()) {
      newErrors.admin_password = 'SSH password không được để trống';
    }
    
    if (!formData.root_username.trim()) {
      newErrors.root_username = 'Sudo username không được để trống';
    }
    
    if (!formData.root_password.trim()) {
      newErrors.root_password = 'Sudo password không được để trống';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      const server: Server = {
        ip: formData.ip.trim(),
        admin_username: formData.admin_username.trim(),
        admin_password: formData.admin_password.trim(),
        root_username: formData.root_username.trim(),
        root_password: formData.root_password.trim()
      };
      
      onAddServer(server);
      
      // Reset form
      setFormData({
        ip: '',
        admin_username: '',
        admin_password: '',
        root_username: '',
        root_password: ''
      });
      setShowForm(false);
      setErrors({});
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({
      ip: '',
      admin_username: '',
      admin_password: '',
      root_username: '',
      root_password: ''
    });
    setErrors({});
  };

  return (
    <div className="manual-server-input">
      {!showForm ? (
        <button 
          className="btn btn-secondary"
          onClick={() => setShowForm(true)}
        >
          ✏️ Nhập thông tin server
        </button>
      ) : (
        <div className="manual-input-form">
          <h4>Nhập thông tin server</h4>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>IP Address *</label>
                <input
                  type="text"
                  value={formData.ip}
                  onChange={(e) => handleInputChange('ip', e.target.value)}
                  placeholder=""
                  className={errors.ip ? 'error' : ''}
                />
                {errors.ip && <span className="error-message">{errors.ip}</span>}
              </div>
              
              <div className="form-group">
                <label>SSH Username *</label>
                <input
                  type="text"
                  value={formData.admin_username}
                  onChange={(e) => handleInputChange('admin_username', e.target.value)}
                  placeholder="admin"
                  className={errors.admin_username ? 'error' : ''}
                />
                {errors.admin_username && <span className="error-message">{errors.admin_username}</span>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>SSH Password *</label>
                <input
                  type="password"
                  value={formData.admin_password}
                  onChange={(e) => handleInputChange('admin_password', e.target.value)}
                  placeholder=""
                  className={errors.admin_password ? 'error' : ''}
                />
                {errors.admin_password && <span className="error-message">{errors.admin_password}</span>}
              </div>
              
              <div className="form-group">
                <label>Admin username *</label>
                <input
                  type="text"
                  value={formData.root_username}
                  onChange={(e) => handleInputChange('root_username', e.target.value)}
                  placeholder="root"
                  className={errors.root_username ? 'error' : ''}
                />
                {errors.root_username && <span className="error-message">{errors.root_username}</span>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group full-width">
                <label>Admin password *</label>
                <input
                  type="password"
                  value={formData.root_password}
                  onChange={(e) => handleInputChange('root_password', e.target.value)}
                  placeholder=""
                  className={errors.root_password ? 'error' : ''}
                />
                {errors.root_password && <span className="error-message">{errors.root_password}</span>}
              </div>
            </div>
            
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                ➕ Import Server
              </button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleCancel}
              >
                ❌ Hủy
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ManualServerInput; 