import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { USER_ROLES } from '../../utils/constants';

interface MenuItem {
  title: string;
  icon: string;
  path: string;
  roles: string[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { user } = useAuth();

  const menuItems = [
    {
      title: 'Dashboard',
      icon: 'fas fa-tachometer-alt',
      path: '/dashboard',
      roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER]
    },
    {
      title: 'Risk assessment',
      icon: 'fas fa-shield-alt',
      path: '/risk-assessment',
      roles: [USER_ROLES.ADMIN, USER_ROLES.USER]
    },
    {
      title: 'Handover assessment',
      icon: 'fas fa-exchange-alt',
      path: '/handover-assessment',
      roles: [USER_ROLES.ADMIN, USER_ROLES.USER]
    },
    {
      title: 'MOP submission',
      icon: 'fas fa-upload',
      path: '/mop-submission',
      roles: [USER_ROLES.ADMIN, USER_ROLES.USER]
    },
    {
      title: 'MOP review',
      icon: 'fas fa-eye',
      path: '/mop-review',
      roles: [USER_ROLES.ADMIN] // Chỉ admin, bỏ USER và VIEWER
    },
    {
      title: 'MOP management',
      icon: 'fas fa-tasks',
      path: '/mop-management',
      roles: [USER_ROLES.ADMIN, USER_ROLES.VIEWER] // Thêm viewer
    },
    {
      title: 'User management',
      icon: 'fas fa-users',
      path: '/user-management',
      roles: [USER_ROLES.ADMIN]
    },
    {
      title: 'Execution history',
      icon: 'fas fa-history',
      path: '/execution-history',
      roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER]
    },
    {
      title: 'Audit Logs',
      icon: 'fas fa-clipboard-list',
      path: '/audit-logs',
      roles: [USER_ROLES.ADMIN, USER_ROLES.VIEWER] // Thêm viewer
    }
  ];

  // Helper function để hiển thị role name
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case USER_ROLES.ADMIN:
        return 'Administrator';
      case USER_ROLES.USER:
        return 'User';
      case USER_ROLES.VIEWER:
        return 'Viewer';
      default:
        return 'Unknown';
    }
  };

  const getMenuItemTitle = (item: MenuItem) => {
    if (item.path === '/mop-management' && user?.role === USER_ROLES.VIEWER) {
      return 'MOP List';
    }
    return item.title;
  };
  
  return (
    <>
      {/* Overlay for mobile */}
      <div 
        className={`sidebar-overlay ${!collapsed ? 'show' : ''} d-md-none`}
        onClick={onToggle}
      ></div>
      
      <aside className={`main-sidebar sidebar-dark-primary elevation-4 ${collapsed ? 'd-none' : ''}`} id="mainSidebar">
        {/* Brand Logo */}
        <div className="brand-link d-flex justify-content-between align-items-center">
          <Link to="/dashboard" className="d-flex align-items-center text-decoration-none" style={{ color: 'inherit' }}>
            <i className="fas fa-clipboard-check brand-image img-circle elevation-3" style={{ opacity: 0.8 }}></i>
            <span className="brand-text font-weight-light">System Checklist</span>
          </Link>
          <button 
            className="btn btn-sm btn-link text-white p-2" 
            onClick={onToggle}
            style={{ fontSize: '1.2rem', border: 'none', background: 'none' }}
            title="Ẩn sidebar"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          {/* User info section */}
          {user && (
            <div className="user-panel mt-3 pb-3 mb-3 d-flex">
              <div className="image">
                <i className="fas fa-user-circle" style={{ fontSize: '2.1rem', color: '#c2c7d0' }}></i>
              </div>
              <div className="info">
                <Link to="#" className="d-block text-white">
                  {user.full_name || user.username}
                </Link>
                <small className="text-muted">
                  {getRoleDisplayName(user.role)}
                </small>
              </div>
            </div>
          )}

          {/* Sidebar Menu */}
          <nav className="mt-2">
            <ul className="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu">
              {menuItems.map((item, index) => {
                // Kiểm tra quyền truy cập dựa trên roles
                if (!user?.role || !item.roles.includes(user.role)) {
                  return null;
                }
                
                return (
                  <li key={index} className="nav-item">
                    <Link 
                      to={item.path} 
                      className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                      onClick={() => {
                        // Tự động đóng sidebar trên mobile sau khi click
                        if (window.innerWidth < 768) {
                          onToggle();
                        }
                      }}
                    >
                      <i className={`nav-icon ${item.icon}`}></i>
                      <p>{getMenuItemTitle(item)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;