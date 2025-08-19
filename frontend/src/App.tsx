import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { StateProvider } from './contexts/StateContext';
import { Layout } from './components/Layout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/user/UserManagement';
import MOPSubmission from './pages/mop/MOPSubmission';
import MOPManagement from './pages/mop/MOPManagement';
import MOPReview from './pages/mop/MOPReview';
import RiskAssessment from './pages/assessment/RiskAssessment';
import HandoverAssessment from './pages/assessment/HandoverAssessment';
import ExecutionHistory from './pages/assessment/ExecutionHistory';
import AuditLogs from './pages/admin/AuditLogs';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ModalCleaner from './components/ModalCleaner';

function App() {
  return (
    <AuthProvider>
      <StateProvider>
        <Router>
          <ModalCleaner />
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/user-management" element={
              <ProtectedRoute>
                <Layout>
                  <UserManagement />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/mop-submission" element={
              <ProtectedRoute>
                <Layout>
                  <MOPSubmission />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/mop-management" element={
              <ProtectedRoute>
                <Layout>
                  <MOPManagement />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/mop-review" element={
              <ProtectedRoute>
                <Layout>
                  <MOPReview />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/risk-assessment" element={
              <ProtectedRoute>
                <Layout>
                  <RiskAssessment />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/handover-assessment" element={
              <ProtectedRoute>
                <Layout>
                  <HandoverAssessment />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/execution-history" element={
              <ProtectedRoute>
                <Layout>
                  <ExecutionHistory />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/audit-logs" element={
              <ProtectedRoute>
                <Layout>
                  <AuditLogs />
                </Layout>
              </ProtectedRoute>
            } />
            
            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </StateProvider>
    </AuthProvider>
  );
}

export default App;
