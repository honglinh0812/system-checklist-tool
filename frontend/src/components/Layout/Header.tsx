import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, sidebarCollapsed }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <nav className="main-header navbar navbar-expand navbar-white navbar-light">
      {/* Left navbar links */}
      <ul className="navbar-nav">
        {/* Toggle sidebar button - only show when sidebar is collapsed */}
        {sidebarCollapsed && (
          <li className="nav-item">
            <button
              className="nav-link btn btn-link"
              onClick={onToggleSidebar}
              style={{ border: 'none', background: 'none', color: '#495057' }}
              title="Show sidebar"
            >
              <i className="fas fa-bars"></i>
            </button>
          </li>
        )}
      </ul>

      {/* Right navbar links */}
      <ul className="navbar-nav ml-auto">
        <li className="nav-item">
          <a
            className="nav-link"
            data-widget="fullscreen"
            href="#"
            role="button"
            onClick={(e) => {
              e.preventDefault();
              // Toggle fullscreen functionality
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen();
              }
            }}
          >
            <i className="fas fa-expand-arrows-alt"></i>
          </a>
        </li>
        <li className="nav-item dropdown">
          <a
            className="nav-link"
            data-toggle="dropdown"
            href="#"
            role="button"
          >
            <i className="fas fa-user"></i>
          </a>
          <div className="dropdown-menu dropdown-menu-right">
            <span className="dropdown-item-text">{user?.username}</span>
            <div className="dropdown-divider"></div>
            <a
              className="dropdown-item"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate('/settings');
              }}
            >
              <i className="fas fa-cog mr-2"></i> Settings
            </a>
            <a
              className="dropdown-item"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
              }}
            >
              <i className="fas fa-sign-out-alt mr-2"></i> Logout
            </a>
          </div>
        </li>
      </ul>
    </nav>
  );
};

export default Header;