import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import { useTranslation } from '../../i18n/useTranslation';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';


interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  status: 'created' | 'pending' | 'deleted' | 'active';  // Hỗ trợ cả status cũ và mới
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_login?: string;
  stats?: {
    total_mops: number;
    total_executions: number;
    pending_mops: number;
  };
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
  const { t } = useTranslation();
  
  // State management
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [formData, setFormData] = useState<CreateUserData>({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirm_password: '',
    role: ''
  });
  const [fieldErrors, setFieldErrors] = useState<{[key: string]: string}>({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [sortField, setSortField] = useState<string>('username');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject';
    userId: number;
    username: string;
    onConfirm: () => void;
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Kiểm tra token trước khi gọi API
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        setAlert({ type: 'error', message: 'Vui lòng đăng nhập để xem danh sách người dùng' });
        return;
      }

      const response = await apiService.get<ApiResponse<UsersData>>(API_ENDPOINTS.USERS.LIST);
      console.log('API Response:', response);
      
      // Sử dụng interface ApiResponse<UsersData>
      if (response.success && response.data && Array.isArray(response.data.users)) {
        // Map is_active thành status và set users
        const mappedUsers = response.data.users.map(user => ({
          ...user,
          status: user.is_active ? 'active' : 'pending' as 'active' | 'pending'
        }));
        setUsers(mappedUsers);
        console.log('Loaded users:', mappedUsers.length, 'users');
      } else {
        console.warn('Unexpected API response structure:', response);
        setUsers([]);
        setAlert({ type: 'error', message: response.message || 'Cấu trúc dữ liệu từ server không đúng định dạng.' });
      }
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setLoading(false);
      
      // Xử lý các loại lỗi khác nhau
      if (error.response?.status === 401) {
        setAlert({ type: 'error', message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
      } else if (error.response?.status === 403) {
        setAlert({ type: 'error', message: 'Bạn không có quyền truy cập danh sách người dùng.' });
      } else {
        setAlert({ type: 'error', message: 'Không thể tải danh sách người dùng. Vui lòng thử lại.' });
      }
    }
  };

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  // Validation functions
  const validateField = (name: string, value: string, allData?: CreateUserData): string => {
    const data = allData || formData;
    
    switch (name) {
      case 'username':
        if (!value.trim()) return 'Tên đăng nhập là bắt buộc';
        if (value.length < 3) return 'Tên đăng nhập phải có ít nhất 3 ký tự';
        if (value.length > 50) return 'Tên đăng nhập không được quá 50 ký tự';
        if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới';
        return '';
      
      case 'email':
        if (!value.trim()) return 'Email là bắt buộc';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return 'Email không hợp lệ';
        return '';
      
      case 'full_name':
        if (!value.trim()) return 'Họ và tên là bắt buộc';
        if (value.length < 2) return 'Họ và tên phải có ít nhất 2 ký tự';
        if (value.length > 100) return 'Họ và tên không được quá 100 ký tự';
        return '';
      
      case 'password':
        if (!value) return 'Mật khẩu là bắt buộc';
        if (value.length < 5) return 'Mật khẩu phải có ít nhất 5 ký tự';
        if (value.length > 128) return 'Mật khẩu không được quá 128 ký tự';
        return '';
      
      case 'confirm_password':
        if (!value) return 'Xác nhận mật khẩu là bắt buộc';
        if (value !== data.password) return 'Mật khẩu xác nhận không khớp';
        return '';
      
      case 'role':
        if (!value) return 'Vai trò là bắt buộc';
        if (!['admin', 'user'].includes(value)) return 'Vai trò không hợp lệ';
        return '';
      
      default:
        return '';
    }
  };

  const validateForm = (data: CreateUserData): boolean => {
    const errors: {[key: string]: string} = {};
    
    Object.keys(data).forEach(key => {
      const error = validateField(key, data[key as keyof CreateUserData], data);
      if (error) {
        errors[key] = error;
      }
    });
    
    setFieldErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    setIsFormValid(isValid);
    return isValid;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);
    
    // Real-time validation
    const error = validateField(name, value, newFormData);
    setFieldErrors(prev => ({
      ...prev,
      [name]: error
    }));
    
    // Also validate confirm_password if password changed
    if (name === 'password' && newFormData.confirm_password) {
      const confirmError = validateField('confirm_password', newFormData.confirm_password, newFormData);
      setFieldErrors(prev => ({
        ...prev,
        confirm_password: confirmError
      }));
    }
    
    // Check overall form validity
    setTimeout(() => validateForm(newFormData), 0);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); 
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterRole(e.target.value);
    setCurrentPage(1); 
  };

  const handleSort = (field: string) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate entire form
    if (!validateForm(formData)) {
      showAlert('error', 'Vui lòng sửa các lỗi trong form trước khi gửi');
      return;
    }

    setCreateLoading(true);
    try {
      const response = await apiService.post<ApiResponse<User>>(API_ENDPOINTS.USERS.CREATE, {
        username: formData.username,
        email: formData.email,
        full_name: formData.full_name,
        password: formData.password,
        role: formData.role
      });

      if (response.success) {
        showAlert('success', 'Tạo người dùng thành công');
        setFormData({
          username: '',
          email: '',
          full_name: '',
          password: '',
          confirm_password: '',
          role: ''
        });
        setShowCreateModal(false);
        loadUsers();
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      showAlert('error', error.response?.data?.message || 'Có lỗi xảy ra khi tạo người dùng');
    } finally {
      setCreateLoading(false);
    }
  };

  const approveUser = async (userId: number) => {
    try {
      const response = await apiService.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.USERS.APPROVE(userId));
      if (response.success) {
        showAlert('success', 'Phê duyệt người dùng thành công');
        loadUsers();
      }
    } catch (error: any) {
      console.error('Error approving user:', error);
      showAlert('error', error.response?.data?.message || 'Có lỗi xảy ra khi phê duyệt người dùng');
    }
  };

  const rejectUser = async (userId: number) => {
    try {
      const response = await apiService.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.USERS.REJECT(userId));
      if (response.success) {
        showAlert('success', 'Từ chối người dùng thành công');
        loadUsers();
      }
    } catch (error: any) {
      console.error('Error rejecting user:', error);
      showAlert('error', error.response?.data?.message || 'Có lỗi xảy ra khi từ chối người dùng');
    }
  };

  const handleApprove = (user: User) => {
    setConfirmAction({
      type: 'approve',
      userId: user.id,
      username: user.username,
      onConfirm: () => {
        approveUser(user.id);
        setShowConfirmModal(false);
        setConfirmAction(null);
      }
    });
    setShowConfirmModal(true);
  };

  const handleReject = (user: User) => {
    setConfirmAction({
      type: 'reject',
      userId: user.id,
      username: user.username,
      onConfirm: () => {
        rejectUser(user.id);
        setShowConfirmModal(false);
        setConfirmAction(null);
      }
    });
    setShowConfirmModal(true);
  };

  const deleteUser = async (userId: number) => {
    try {
      const response = await apiService.delete<ApiResponse<{ message: string }>>(API_ENDPOINTS.USERS.DELETE(userId));
      if (response.success) {
        showAlert('success', 'Xóa người dùng thành công');
        loadUsers();
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      showAlert('error', error.response?.data?.message || 'Có lỗi xảy ra khi xóa người dùng');
    }
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteUser(userToDelete.id);
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  };

  const handleCreateUser = () => {
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      confirm_password: '',
      role: ''
    });
    setFieldErrors({});
    setIsFormValid(false);
  };

  const handleViewDetails = (user: User) => {
    setSelectedUser(user);
    setShowDetailsModal(true);
  };

  // Filter and sort users
  // Đảm bảo users luôn là array để tránh lỗi filter
  const safeUsers = Array.isArray(users) ? users : [];
  
  const filteredUsers = safeUsers.filter(user => {
    // Đảm bảo searchTerm luôn là string để tránh lỗi toLowerCase
    const safeSearchTerm = typeof searchTerm === 'string' ? searchTerm : '';
    const searchTermLower = safeSearchTerm.toLowerCase();
    const matchesSearch = user.username?.toLowerCase().includes(searchTermLower) ||
                         user.email?.toLowerCase().includes(searchTermLower) ||
                         user.full_name?.toLowerCase().includes(searchTermLower);
    // Đảm bảo filterRole luôn là string
    const safeFilterRole = typeof filterRole === 'string' ? filterRole : '';
    const matchesRole = !safeFilterRole || user.role === safeFilterRole;
    return matchesSearch && matchesRole;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    // Đảm bảo sortField luôn là string và giá trị sort cũng là string
    const safeSortField = typeof sortField === 'string' ? sortField : 'username';
    const aValue = String(a[safeSortField as keyof User] || '');
    const bValue = String(b[safeSortField as keyof User] || '');
    const safeSortDirection = typeof sortDirection === 'string' ? sortDirection : 'asc';
    
    if (safeSortDirection === 'asc') {
      return aValue.localeCompare(bValue);
    } else {
      return bValue.localeCompare(aValue);
    }
  });

  // Pagination - đảm bảo itemsPerPage luôn có giá trị hợp lệ
  const safeItemsPerPage = typeof itemsPerPage === 'number' && itemsPerPage > 0 ? itemsPerPage : 10;
  const totalPages = Math.ceil(sortedUsers.length / safeItemsPerPage);
  const startIndex = (currentPage - 1) * safeItemsPerPage;
  const paginatedUsers = sortedUsers.slice(startIndex, startIndex + safeItemsPerPage);
  
  // Debug logging đã được loại bỏ sau khi fix vấn đề pagination

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  // Safety check for data integrity
  if (!Array.isArray(users)) {
    return (
      <div className="alert alert-warning">
        <h4>{t('userDataLoadingIssue')}</h4>
        <p>{t('unableToLoadUserData')}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('refreshPage')}
        </button>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center">
                <h3 className="card-title">{t('userManagement')}</h3>
                <div className="ml-auto">
                  {currentUser?.role === 'admin' && (
                    <button 
                      className="btn btn-primary"
                      onClick={handleCreateUser}
                    >
                      <i className="fas fa-plus mr-2"></i>
                      {t('createUser')}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="card-body">
              {alert && (
                <ErrorMessage 
                  message={alert.message} 
                  type={alert.type === 'error' ? 'danger' : alert.type === 'success' ? 'info' : 'warning'}
                  dismissible={true}
                  onDismiss={() => setAlert(null)}
                />
              )}

              {/* Search and Filter */}
              <div className="row mb-3">
                <div className="col-md-6">
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t('searchByNameEmail')}
                    value={typeof searchTerm === 'string' ? searchTerm : ''}
                    onChange={handleSearchChange}
                  />
                </div>
                <div className="col-md-3">
                  <select
                    className="form-control"
                    value={filterRole}
                    onChange={handleFilterChange}
                  >
                    <option value="">{t('allRoles')}</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </select>
                  {fieldErrors.role && (
                    <div className="invalid-feedback">
                      {fieldErrors.role}
                    </div>
                  )}
                </div>
                <div className="col-md-3">
                  <select
                    className="form-control"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  >
                    <option value={5}>5 {t('perPage')}</option>
                    <option value={10}>10 {t('perPage')}</option>
                    <option value={20}>20 {t('perPage')}</option>
                    <option value={50}>50 {t('perPage')}</option>
                  </select>
                </div>
              </div>



              {/* Users Table */}
              <div className="table-responsive">
                <table className="table table-bordered table-striped">
                  <thead>
                    <tr>
                      <th 
                        onClick={() => handleSort('username')}
                        style={{ cursor: 'pointer' }}
                      >
                        {t('username')}
                        {sortField === 'username' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('email')}
                        style={{ cursor: 'pointer' }}
                      >
                        {t('email')}
                        {sortField === 'email' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('full_name')}
                        style={{ cursor: 'pointer' }}
                      >
                        {t('fullName')}
                        {sortField === 'full_name' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('role')}
                        style={{ cursor: 'pointer' }}
                      >
                        {t('role')}
                        {sortField === 'role' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th>{t('status')}</th>
                      <th>{t('createdDate')}</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.length > 0 ? (
                      paginatedUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{user.username}</td>
                          <td>{user.email}</td>
                          <td>{user.full_name}</td>
                          <td>
                            <span className={`badge badge-${user.role === 'admin' ? 'danger' : 'primary'}`}>
                              {user.role === 'admin' ? t('admin') : t('user')}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-${
                              user.status === 'active' ? 'success' :
                              user.status === 'created' ? 'info' :
                              user.status === 'pending' ? 'warning' :
                              user.status === 'deleted' ? 'danger' : 'secondary'
                            }`}>
                              {user.status === 'active' ? t('active') :
                               user.status === 'created' ? t('created') :
                               user.status === 'pending' ? t('pending') :
                               user.status === 'deleted' ? t('deleted') : user.status}
                            </span>
                          </td>
                          <td>{new Date(user.created_at).toLocaleDateString('vi-VN')}</td>
                          <td>
                            <button
                              className="btn btn-info btn-sm mr-1"
                              onClick={() => handleViewDetails(user)}
                            >
                              <i className="fas fa-eye"></i> {t('view')}
                            </button>
                            {currentUser?.role === 'admin' && user.status === 'pending' && (
                              <>
                                <button
                                  className="btn btn-success btn-sm mr-1"
                                  onClick={() => handleApprove(user)}
                                >
                                  <i className="fas fa-check"></i> {t('approve')}
                                </button>
                                <button
                                  className="btn btn-danger btn-sm mr-1"
                                  onClick={() => handleReject(user)}
                                >
                                  <i className="fas fa-times"></i> {t('reject')}
                                </button>
                              </>
                            )}
                            {currentUser?.role === 'admin' && user.id !== currentUser.id && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(user)}
                              >
                                <i className="fas fa-trash"></i> {t('delete')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          {loading ? (
                            <div>
                              <i className="fas fa-spinner fa-spin mr-2"></i>
                              {t('loadingData')}
                            </div>
                          ) : users.length === 0 ? (
                            <div>
                              <i className="fas fa-users mr-2"></i>
                              {t('noUsersInSystem')}
                            </div>
                          ) : (searchTerm || filterRole) ? (
                            <div>
                              <i className="fas fa-search mr-2"></i>
                              {t('noUsersMatchFilter')}
                            </div>
                          ) : (
                            <div>
                              <i className="fas fa-exclamation-triangle mr-2"></i>
                              {t('errorDisplayingUserData')}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <nav>
                  <ul className="pagination justify-content-center">
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        {t('previous')}
                      </button>
                    </li>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                        <button
                          className="page-link"
                          onClick={() => handlePageChange(page)}
                        >
                          {page}
                        </button>
                      </li>
                    ))}
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                      >
                        {t('next')}
                      </button>
                    </li>
                  </ul>
                </nav>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <Modal
          show={showDetailsModal}
          onHide={() => setShowDetailsModal(false)}
          title={`${t('userDetails')}: ${selectedUser.username}`}
        >
          <div className="row">
            <div className="col-md-6">
              <strong>{t('username')}:</strong> {selectedUser.username}
            </div>
            <div className="col-md-6">
              <strong>{t('email')}:</strong> {selectedUser.email}
            </div>
          </div>
          <div className="row mt-2">
            <div className="col-md-6">
              <strong>{t('fullName')}:</strong> {selectedUser.full_name}
            </div>
            <div className="col-md-6">
              <strong>{t('role')}:</strong> 
              <span className={`badge badge-${selectedUser.role === 'admin' ? 'danger' : 'primary'} ml-1`}>
                {selectedUser.role === 'admin' ? t('admin') : t('user')}
              </span>
            </div>
          </div>
          <div className="row mt-2">
            <div className="col-md-6">
              <strong>{t('status')}:</strong>
              <span className={`badge badge-${
                selectedUser.status === 'active' ? 'success' :
                selectedUser.status === 'created' ? 'info' :
                selectedUser.status === 'pending' ? 'warning' :
                selectedUser.status === 'deleted' ? 'danger' : 'secondary'
              } ml-1`}>
                {selectedUser.status === 'active' ? t('active') :
                 selectedUser.status === 'created' ? t('created') :
                 selectedUser.status === 'pending' ? t('pending') :
                 selectedUser.status === 'deleted' ? t('deleted') : selectedUser.status}
              </span>
            </div>
            <div className="col-md-6">
              <strong>{t('createdDate')}:</strong> {new Date(selectedUser.created_at).toLocaleDateString('vi-VN')}
            </div>
          </div>
          {selectedUser.last_login && (
            <div className="row mt-2">
              <div className="col-12">
                <strong>{t('lastLoginTime')}:</strong> {new Date(selectedUser.last_login).toLocaleString('vi-VN')}
              </div>
            </div>
          )}
          {selectedUser.stats && (
            <div className="row mt-3">
              <div className="col-12">
                <h6>{t('statistics')}:</h6>
                <ul>
                  <li>{t('totalMopsCount')}: {selectedUser.stats.total_mops}</li>
                  <li>{t('totalExecutionsCount')}: {selectedUser.stats.total_executions}</li>
                  <li>{t('pendingMopsCount')}: {selectedUser.stats.pending_mops}</li>
                </ul>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <Modal
          show={showConfirmModal}
          onHide={() => {
            setShowConfirmModal(false);
            setConfirmAction(null);
          }}
          title={confirmAction.type === 'approve' ? t('confirmApproval') : t('confirmRejection')}
        >
          <p>
            {confirmAction.type === 'approve' ? t('confirmApprovalMessage') : t('confirmRejectionMessage')} <strong>{confirmAction.username}</strong>?
          </p>
          <div className="text-right">
            <button
              className="btn btn-secondary mr-2"
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmAction(null);
              }}
            >
              {t('cancel')}
            </button>
            <button
              className={`btn btn-${confirmAction.type === 'approve' ? 'success' : 'danger'}`}
              onClick={confirmAction.onConfirm}
            >
              {confirmAction.type === 'approve' ? t('approveAction') : t('rejectAction')}
            </button>
          </div>
        </Modal>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <Modal
          show={showCreateModal}
          onHide={handleCloseCreateModal}
          title={t('createNewUser')}
          size="lg"
        >
          <form onSubmit={handleSubmit}>
            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>{t('username')}</label>
                  <input
                    type="text"
                    className={`form-control ${fieldErrors.username ? 'is-invalid' : formData.username && !fieldErrors.username ? 'is-valid' : ''}`}
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                  />
                  {fieldErrors.username && (
                    <div className="invalid-feedback">
                      {fieldErrors.username}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label>{t('email')}</label>
                  <input
                    type="email"
                    className={`form-control ${fieldErrors.email ? 'is-invalid' : formData.email && !fieldErrors.email ? 'is-valid' : ''}`}
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                  {fieldErrors.email && (
                    <div className="invalid-feedback">
                      {fieldErrors.email}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>{t('fullName')}</label>
                  <input
                    type="text"
                    className={`form-control ${fieldErrors.full_name ? 'is-invalid' : formData.full_name && !fieldErrors.full_name ? 'is-valid' : ''}`}
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    required
                  />
                  {fieldErrors.full_name && (
                    <div className="invalid-feedback">
                      {fieldErrors.full_name}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label>{t('role')}</label>
                  <select
                    className={`form-control ${fieldErrors.role ? 'is-invalid' : formData.role && !fieldErrors.role ? 'is-valid' : ''}`}
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">{t('selectRole')}</option>
                    <option value="admin">{t('admin')}</option>
                    <option value="user">{t('user')}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>{t('password')}</label>
                  <input
                    type="password"
                    className={`form-control ${fieldErrors.password ? 'is-invalid' : formData.password && !fieldErrors.password ? 'is-valid' : ''}`}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                  <small className="form-text text-muted">
                    Mật khẩu phải có ít nhất 5 ký tự
                  </small>
                  {fieldErrors.password && (
                    <div className="invalid-feedback">
                      {fieldErrors.password}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label>{t('confirmPassword')}</label>
                  <input
                    type="password"
                    className={`form-control ${fieldErrors.confirm_password ? 'is-invalid' : formData.confirm_password && !fieldErrors.confirm_password ? 'is-valid' : ''}`}
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleInputChange}
                    required
                  />
                  {fieldErrors.confirm_password && (
                    <div className="invalid-feedback">
                      {fieldErrors.confirm_password}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <button
                type="button"
                className="btn btn-secondary mr-2"
                onClick={handleCloseCreateModal}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createLoading || !isFormValid}
              >
                {createLoading ? t('creating') : t('createUser')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && userToDelete && (
        <Modal
          show={showDeleteModal}
          onHide={() => {
            setShowDeleteModal(false);
            setUserToDelete(null);
          }}
          title={t('confirmDeleteUser')}
        >
          <p>
            {t('confirmDeleteUserMessage')} <strong>{userToDelete.username}</strong>?
          </p>
          <p className="text-warning">
            <i className="fas fa-exclamation-triangle"></i> {t('actionCannotBeUndone')}
          </p>
          <div className="text-right">
            <button
              className="btn btn-secondary mr-2"
              onClick={() => {
                setShowDeleteModal(false);
                setUserToDelete(null);
              }}
            >
              {t('cancel')}
            </button>
            <button
              className="btn btn-danger"
              onClick={confirmDelete}
            >
              {t('delete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default UserManagement;