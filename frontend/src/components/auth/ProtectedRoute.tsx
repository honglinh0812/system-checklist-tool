import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../common';
import { useTranslation } from '../../i18n/useTranslation';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<'admin' | 'user' | 'viewer'>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-content">
          <LoadingSpinner size="lg" />
          <p className="mt-3 mb-0">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authorization check
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user?.role;
    const isAllowed = userRole ? allowedRoles.includes(userRole) : false;
    if (!isAllowed) {
      return <Navigate to="/access-denied" state={{ from: location.pathname }} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;