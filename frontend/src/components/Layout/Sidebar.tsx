import React, { useState, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { USER_ROLES } from '../../utils/constants';
import { useTranslation, TranslationKey } from '../../i18n/useTranslation';

interface SubItem {
  titleKey: TranslationKey;
  path: string;
}

interface MenuItem {
  titleKey: TranslationKey;
  icon: string;
  path: string;
  roles: (typeof USER_ROLES[keyof typeof USER_ROLES])[];
  subItems?: SubItem[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const menuItems: MenuItem[] = [
  {
    titleKey: 'dashboard',
    icon: 'fas fa-tachometer-alt',
    path: '/dashboard',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER]
  },
  {
    titleKey: 'riskAssessment',
    icon: 'fas fa-shield-alt',
    path: '/risk-assessment',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER]
  },
  {
    titleKey: 'handoverAssessment',
    icon: 'fas fa-exchange-alt',
    path: '/handover-assessment',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER]
  },
  {
    titleKey: 'mopSubmission',
    icon: 'fas fa-upload',
    path: '/mop-submission',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER]
  },
  {
    titleKey: 'mopReview',
    icon: 'fas fa-eye',
    path: '/mop-review',
    roles: [USER_ROLES.ADMIN]
  },
  {
    titleKey: 'mopManagement',
    icon: 'fas fa-tasks',
    path: '/mop-management',
    roles: [USER_ROLES.ADMIN, USER_ROLES.VIEWER]
  },
  {
    titleKey: 'userManagement',
    icon: 'fas fa-users',
    path: '/user-management',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER]
  },
  {
    titleKey: 'executionHistory',
    icon: 'fas fa-history',
    path: '/execution-history',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER],
    subItems: [
      {
        titleKey: 'mopExecutionHistory',
        path: '/execution-history/mop-executions'
      },
      {
        titleKey: 'mopActionHistory',
        path: '/execution-history/mop-actions'
      }
    ]
  },
  {
    titleKey: 'auditLogs',
    icon: 'fas fa-clipboard-list',
    path: '/audit-logs',
    roles: [USER_ROLES.ADMIN, USER_ROLES.VIEWER]
  },
  {
    titleKey: 'assessmentLogs',
    icon: 'fas fa-file-alt',
    path: '/assessment-logs',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER]
  },
  {
    titleKey: 'assessmentResultsMenu',
    icon: 'fas fa-list',
    path: '/assessment-results',
    roles: [USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.VIEWER]
  },
];

const Sidebar: React.FC<SidebarProps> = React.memo(({ collapsed, onToggle }) => {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [openSubMenus, setOpenSubMenus] = useState<string[]>([]);

  const filteredMenuItems = useMemo(() => {
    if (!user?.role) return [];
    return menuItems.filter(item => item.roles.includes(user.role));
  }, [user?.role]);

  const getRoleDisplayName = useCallback((role: string) => {
    const roleMap: Record<string, string> = {
      [USER_ROLES.ADMIN]: t('admin') || 'Admin',
      [USER_ROLES.USER]: t('user') || 'User',
      [USER_ROLES.VIEWER]: t('viewer') || 'Viewer',
    };
    return roleMap[role] || (t('unknown') || 'Unknown');
  }, [t]);

  const getMenuItemTitle = useCallback((item: MenuItem) => {
    if (item.path === '/mop-management' && user?.role === USER_ROLES.VIEWER) {
      return t('mopList') || 'MOP List';
    }
    return t(item.titleKey) || item.titleKey;
  }, [t, user?.role]);

  const toggleSubMenu = useCallback((path: string) => {
    setOpenSubMenus(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  }, []);

  const isSubMenuOpen = useCallback((path: string) => openSubMenus.includes(path), [openSubMenus]);

  const isSubItemActive = useCallback((subItems: SubItem[]) => {
    return subItems.some(subItem => location.pathname === subItem.path);
  }, [location.pathname]);

  const renderMenuItem = useCallback((item: MenuItem, index: number) => {
    if (item.subItems && item.subItems.length > 0) {
      const hasActiveSubItem = isSubItemActive(item.subItems);
      const isOpen = isSubMenuOpen(item.path);

      return (
        <li key={index} className={`nav-item ${isOpen || hasActiveSubItem ? 'menu-open' : ''}`}>
          <a
            href="#"
            className={`nav-link ${hasActiveSubItem ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              toggleSubMenu(item.path);
            }}
            aria-expanded={isOpen || hasActiveSubItem}
            role="button"
          >
            <i className={`nav-icon ${item.icon}`}></i>
            <p>
              {getMenuItemTitle(item)}
              <i className={`right fas ${isOpen || hasActiveSubItem ? 'fa-angle-down' : 'fa-angle-left'}`}></i>
            </p>
          </a>
          <ul className="nav nav-treeview">
            {item.subItems.map((subItem, subIndex) => (
              <li key={subIndex} className="nav-item">
                <Link
                  to={subItem.path}
                  className={`nav-link ${location.pathname === subItem.path ? 'active' : ''}`}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onToggle();
                    }
                  }}
                >
                  <i className="far fa-circle nav-icon"></i>
                  <p>{t(subItem.titleKey) || subItem.titleKey}</p>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      );
    }

    return (
      <li key={index} className="nav-item">
        <Link
          to={item.path}
          className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
          onClick={() => {
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
  }, [getMenuItemTitle, isSubMenuOpen, isSubItemActive, location.pathname, onToggle, t, toggleSubMenu]);

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`sidebar-overlay ${!collapsed ? 'show' : ''} d-md-none`}
        onClick={onToggle}
        aria-hidden="true"
      ></div>

      <aside
        className={`main-sidebar sidebar-dark-primary elevation-4 ${collapsed ? 'd-none' : ''}`}
        id="mainSidebar"
        role="complementary"
        aria-label="Main navigation"
      >
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
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
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
                  {user.full_name || user.username || 'Unknown User'}
                </Link>
                <small className="text-muted">
                  {getRoleDisplayName(user.role || '')}
                </small>
              </div>
            </div>
          )}

          {/* Sidebar Menu */}
          <nav className="mt-2" role="navigation">
            <ul className="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu">
              {filteredMenuItems.map((item, index) => renderMenuItem(item, index))}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;