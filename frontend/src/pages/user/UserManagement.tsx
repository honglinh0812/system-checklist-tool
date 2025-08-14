import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';

interface User {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

interface CreateUserData {
  username: string;
  email: string;
  full_name: string;
  password: string;
  confirm_password: string;
  role: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface UsersData {
  users: User[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    total: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const [formData, setFormData] = useState<CreateUserData>({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirm_password: '',
    role: ''
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiService.get<ApiResponse<UsersData>>(API_ENDPOINTS.USERS.LIST);
      if (data.success) {
        setUsers(data.data.users);
      } else {
        showAlert('error', 'Error loading users');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      showAlert('error', 'Error loading users');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (formData.password !== formData.confirm_password) {
      showAlert('error', 'Passwords do not match');
      return;
    }
    
    if (formData.password.length < 1) {
      showAlert('error', 'Password must be at least 1 character long');
      return;
    }

    setCreateLoading(true);
    try {
      // Remove confirm_password before sending to backend
      const { confirm_password, ...userData } = formData;
      const data = await apiService.post<any>(API_ENDPOINTS.USERS.CREATE, userData);
      if (data.message) {
        showAlert('success', 'User created successfully');
        setFormData({
          username: '',
          email: '',
          full_name: '',
          password: '',
          confirm_password: '',
          role: ''
        });
        loadUsers();
      } else {
        showAlert('error', data.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      showAlert('error', 'Error creating user');
    } finally {
      setCreateLoading(false);
    }
  };

  const viewUserDetails = async (userId: number) => {
    try {
      const data = await apiService.get<any>(`/api/users/${userId}`);
      if (data.success) {
        setSelectedUser(data.user);
        setShowDetailsModal(true);
      } else {
        showAlert('error', 'Error loading user details');
      }
    } catch (error) {
      console.error('Error loading user details:', error);
      showAlert('error', 'Error loading user details');
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        const data = await apiService.delete<any>(`/api/users/${userId}`);
        if (data.message) {
          showAlert('success', 'User deleted successfully');
          loadUsers();
        } else {
          showAlert('error', data.error || 'Failed to delete user');
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('error', 'Error deleting user');
      }
    }
  };

  const getRoleBadgeClass = (role: string) => {
    return role === 'admin' ? 'badge-danger' : 'badge-info';
  };

  return (
    <div className="content-wrapper">
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1>User Management</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item active">User Management</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          {alert && (
        <ErrorMessage
          message={alert.message}
          type={alert.type === 'success' ? 'info' : 'danger'}
          dismissible
          onDismiss={() => setAlert(null)}
          className="fade show"
        />
      )}

          <div className="row">
            <div className="col-md-4">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-user-plus mr-2"></i>
                    Create New User
                  </h3>
                </div>
                <div className="card-body">
                  <form onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label htmlFor="username"><strong>Username:</strong></label>
                      <input 
                        type="text" 
                        className="form-control" 
                        id="username" 
                        name="username" 
                        value={formData.username}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="email"><strong>Email:</strong></label>
                      <input 
                        type="email" 
                        className="form-control" 
                        id="email" 
                        name="email" 
                        value={formData.email}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="full_name"><strong>Full Name:</strong></label>
                      <input 
                        type="text" 
                        className="form-control" 
                        id="full_name" 
                        name="full_name" 
                        value={formData.full_name}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="password"><strong>Password:</strong></label>
                      <input 
                        type="password" 
                        className="form-control" 
                        id="password" 
                        name="password" 
                        value={formData.password}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="confirmPassword"><strong>Confirm Password:</strong></label>
                      <input 
                        type="password" 
                        className="form-control" 
                        id="confirmPassword" 
                        name="confirm_password" 
                        value={formData.confirm_password}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="role"><strong>Role:</strong></label>
                      <select 
                        className="form-control" 
                        id="role" 
                        name="role" 
                        value={formData.role}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select Role</option>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    
                    <button type="submit" className="btn btn-primary" disabled={createLoading}>
                      {createLoading ? (
                        <LoadingSpinner size="sm" text="Creating..." />
                      ) : (
                        <><i className="fas fa-user-plus mr-2"></i>Create User</>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
            
            <div className="col-md-8">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-users mr-2"></i>
                    User List
                  </h3>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-striped">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Username</th>
                          <th>Role</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={5} className="text-center">
                              <LoadingSpinner size="sm" />
                            </td>
                          </tr>
                        ) : users.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center">No users found</td>
                          </tr>
                        ) : (
                          users.map(user => (
                            <tr key={user.id}>
                              <td>{user.id}</td>
                              <td><strong>{user.username}</strong></td>
                              <td>
                                <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                                  {user.role}
                                </span>
                              </td>
                              <td>{new Date(user.created_at).toLocaleDateString()}</td>
                              <td>
                                <button 
                                  className="btn btn-sm btn-info mr-1" 
                                  onClick={() => viewUserDetails(user.id)}
                                >
                                  <i className="fas fa-eye mr-1"></i>View
                                </button>
                                {user.id !== currentUser?.id && (
                                  <button 
                                    className="btn btn-sm btn-danger" 
                                    onClick={() => deleteUser(user.id, user.username)}
                                  >
                                    <i className="fas fa-trash mr-1"></i>Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* User Details Modal */}
      <Modal
        show={showDetailsModal}
        onHide={() => setShowDetailsModal(false)}
        title="User Details"
        footer={
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setShowDetailsModal(false)}
          >
            Close
          </button>
        }
      >
        {selectedUser && (
          <div className="row">
            <div className="col-md-12">
              <table className="table table-sm">
                <tbody>
                  <tr>
                    <td><strong>ID:</strong></td>
                    <td>{selectedUser.id}</td>
                  </tr>
                  <tr>
                    <td><strong>Username:</strong></td>
                    <td>{selectedUser.username}</td>
                  </tr>
                  <tr>
                    <td><strong>Role:</strong></td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(selectedUser.role)}`}>
                        {selectedUser.role}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Created:</strong></td>
                    <td>{new Date(selectedUser.created_at).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserManagement;