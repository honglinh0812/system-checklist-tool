import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    };

    // Set initial state
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Apply body classes for custom sidebar behavior
  useEffect(() => {
    const bodyClasses = [
      'hold-transition',
      sidebarCollapsed ? 'sidebar-hidden' : '',
    ].filter(Boolean).join(' ');

    document.body.className = bodyClasses;

    return () => {
      document.body.className = '';
    };
  }, [sidebarCollapsed]);

  return (
    <div className="wrapper">
      <Header onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      {/* Content Wrapper */}
      <div className="content-wrapper">
        {children}
      </div>

      <Footer />
    </div>
  );
};

export default Layout;