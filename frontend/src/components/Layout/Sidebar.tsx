import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();

  const menuItems = [
    {
      title: 'Dashboard',
      icon: 'fas fa-tachometer-alt',
      path: '/dashboard'
    },
    {
      title: 'Risk assessment',
      icon: 'fas fa-shield-alt',
      path: '/risk-assessment'
    },
    {
      title: 'Handover assessment',
      icon: 'fas fa-exchange-alt',
      path: '/handover-assessment'
    },
    {
      title: 'MOP submission',
      icon: 'fas fa-upload',
      path: '/mop-submission'
    },
    {
      title: 'MOP review',
      icon: 'fas fa-eye',
      path: '/mop-review',
      adminOnly: true
    },
    {
      title: 'MOP management',
      icon: 'fas fa-tasks',
      path: '/mop-management',
      adminOnly: true
    },
    {
      title: 'User management',
      icon: 'fas fa-users',
      path: '/user-management',
      adminOnly: true
    },
    {
      title: 'Execution history',
      icon: 'fas fa-history',
      path: '/execution-history'
    },
    {
      title: 'Audit Logs',
      icon: 'fas fa-clipboard-list',
      path: '/audit-logs',
      adminOnly: true
    }
  ];

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';



  return (
    <aside className={`main-sidebar sidebar-dark-primary elevation-4 ${collapsed ? 'd-none' : ''}`} id="mainSidebar">
      {/* Brand Logo */}
      <div className="brand-link d-flex justify-content-between align-items-center">
        <Link to="/dashboard" className="d-flex align-items-center text-decoration-none" style={{ color: 'inherit' }}>
          <i className="fas fa-clipboard-check brand-image img-circle elevation-3" style={{ opacity: 0.8 }}></i>
          <span className="brand-text font-weight-light">System Checklist</span>
        </Link>
        <button 
          className="btn btn-sm btn-link text-white p-0" 
          onClick={onToggle}
          style={{ fontSize: '1.2rem', border: 'none', background: 'none' }}
        >
          <i className="fas fa-bars"></i>
        </button>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        {/* Sidebar Menu */}
        <nav className="mt-2">
          <ul className="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu">
            {menuItems.map((item, index) => {
              // Chỉ hiển thị menu admin nếu user là admin
              if (item.adminOnly && !isAdmin) {
                return null;
              }
              
              return (
                <li key={index} className="nav-item">
                  <Link 
                    to={item.path} 
                    className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                  >
                    <i className={`nav-icon ${item.icon}`}></i>
                    <p>{item.title}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;