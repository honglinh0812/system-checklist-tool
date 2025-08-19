import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useModalState } from '../../utils/stateUtils';


// Cập nhật interface User để bao gồm đầy đủ thông tin
interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  status: 'pending' | 'active';  // Thêm trường status
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
  
  // State management with unique keys for User Management - users không cần persist vì luôn load từ API
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = usePersistedState<User | null>('user_selectedUser', null);
  const [showDetailsModal, setShowDetailsModal] = useModalState(false);
  const [formData, setFormData] = usePersistedState<CreateUserData>('user_formData', {
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirm_password: '',
    role: ''
  }, { excludeKeys: ['password', 'confirm_password'] });
  const [searchTerm, setSearchTerm] = usePersistedState<string>('user_searchTerm', '', { autoSave: true, debounceDelay: 500 });
  const [filterRole, setFilterRole] = usePersistedState<string>('user_filterRole', '', { autoSave: true });
  const [sortField, setSortField] = usePersistedState<string>('user_sortField', 'username', { autoSave: true });
  const [sortDirection, setSortDirection] = usePersistedState<'asc' | 'desc'>('user_sortDirection', 'asc', { autoSave: true });
  const [currentPage, setCurrentPage] = usePersistedState<number>('user_currentPage', 1, { autoSave: true });
  const [itemsPerPage, setItemsPerPage] = usePersistedState<number>('user_itemsPerPage', 10, { autoSave: true });
  
  // Các state không cần persist (loading, alerts, temporary actions)
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

  // Load users khi component mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await apiService.get<ApiResponse<UsersData>>(API_ENDPOINTS.USERS.LIST);
      console.log('API Response:', response);
      
      // Xử lý nhiều trường hợp cấu trúc dữ liệu từ API
      let usersData: User[] = [];
      
      if (response.success && response.data) {
        if (Array.isArray(response.data)) {
          // Trường hợp API trả về trực tiếp array users
          usersData = response.data;
        } else if (response.data.users && Array.isArray(response.data.users)) {
          // Trường hợp API trả về object có property users
          usersData = response.data.users;
        } else {
          console.warn('Unexpected API response structure:', response.data);
        }
      }
       
       // Đảm bảo chỉ set array hợp lệ
       if (Array.isArray(usersData)) {
         setUsers(usersData);
       } else {
         console.error('usersData is not an array:', usersData);
         setUsers([]);
       }
       setLoading(false);
    } catch (error) {
      console.error('Error loading users:', error);
      setLoading(false);
      setAlert({ type: 'error', message: 'Không thể tải danh sách người dùng' });
    }
  };

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterRole(e.target.value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleSort = (field: string) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.username || !formData.email || !formData.full_name || !formData.password || !formData.role) {
      showAlert('error', 'Vui lòng điền đầy đủ thông tin');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      showAlert('error', 'Mật khẩu xác nhận không khớp');
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
        loadUsers(); // Reload users list
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

  const handleViewDetails = (user: User) => {
    setSelectedUser(user);
    setShowDetailsModal(true);
  };

  // Filter and sort users
  // Đảm bảo users luôn là array để tránh lỗi filter
  const safeUsers = Array.isArray(users) ? users : [];
  
  const filteredUsers = safeUsers.filter(user => {
    const searchTermLower = (searchTerm || '').toLowerCase();
    const matchesSearch = user.username?.toLowerCase().includes(searchTermLower) ||
                         user.email?.toLowerCase().includes(searchTermLower) ||
                         user.full_name?.toLowerCase().includes(searchTermLower);
    const matchesRole = !filterRole || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aValue = a[sortField as keyof User] as string;
    const bValue = b[sortField as keyof User] as string;
    if (sortDirection === 'asc') {
      return aValue.localeCompare(bValue);
    } else {
      return bValue.localeCompare(aValue);
    }
  });

  // Pagination
  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = sortedUsers.slice(startIndex, startIndex + itemsPerPage);

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
        <h4>User Data Loading Issue</h4>
        <p>Unable to load user data. Please refresh the page.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Refresh Page
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
              <h3 className="card-title">Quản lý người dùng</h3>
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
                    placeholder="Tìm kiếm theo tên, email..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>
                <div className="col-md-3">
                  <select
                    className="form-control"
                    value={filterRole}
                    onChange={handleFilterChange}
                  >
                    <option value="">Tất cả vai trò</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <select
                    className="form-control"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  >
                    <option value={5}>5 per page</option>
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                  </select>
                </div>
              </div>

              {/* Create User Form */}
              {currentUser?.role === 'admin' && (
                <div className="card mb-4">
                  <div className="card-header">
                    <h5>Tạo người dùng mới</h5>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleSubmit}>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Tên đăng nhập</label>
                            <input
                              type="text"
                              className="form-control"
                              name="username"
                              value={formData.username}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Email</label>
                            <input
                              type="email"
                              className="form-control"
                              name="email"
                              value={formData.email}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Họ và tên</label>
                            <input
                              type="text"
                              className="form-control"
                              name="full_name"
                              value={formData.full_name}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Vai trò</label>
                            <select
                              className="form-control"
                              name="role"
                              value={formData.role}
                              onChange={handleInputChange}
                              required
                            >
                              <option value="">Chọn vai trò</option>
                              <option value="admin">Admin</option>
                              <option value="user">User</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Mật khẩu</label>
                            <input
                              type="password"
                              className="form-control"
                              name="password"
                              value={formData.password}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Xác nhận mật khẩu</label>
                            <input
                              type="password"
                              className="form-control"
                              name="confirm_password"
                              value={formData.confirm_password}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={createLoading}
                      >
                        {createLoading ? 'Đang tạo...' : 'Tạo người dùng'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Users Table */}
              <div className="table-responsive">
                <table className="table table-bordered table-striped">
                  <thead>
                    <tr>
                      <th 
                        onClick={() => handleSort('username')}
                        style={{ cursor: 'pointer' }}
                      >
                        Tên đăng nhập
                        {sortField === 'username' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('email')}
                        style={{ cursor: 'pointer' }}
                      >
                        Email
                        {sortField === 'email' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('full_name')}
                        style={{ cursor: 'pointer' }}
                      >
                        Họ và tên
                        {sortField === 'full_name' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th 
                        onClick={() => handleSort('role')}
                        style={{ cursor: 'pointer' }}
                      >
                        Vai trò
                        {sortField === 'role' && (
                          <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1`}></i>
                        )}
                      </th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>{user.full_name}</td>
                        <td>
                          <span className={`badge badge-${user.role === 'admin' ? 'danger' : 'primary'}`}>
                            {user.role === 'admin' ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${user.status === 'active' ? 'success' : 'warning'}`}>
                            {user.status === 'active' ? 'Hoạt động' : 'Chờ duyệt'}
                          </span>
                        </td>
                        <td>{new Date(user.created_at).toLocaleDateString('vi-VN')}</td>
                        <td>
                          <button
                            className="btn btn-info btn-sm mr-1"
                            onClick={() => handleViewDetails(user)}
                          >
                            <i className="fas fa-eye"></i> Xem
                          </button>
                          {currentUser?.role === 'admin' && user.status === 'pending' && (
                            <>
                              <button
                                className="btn btn-success btn-sm mr-1"
                                onClick={() => handleApprove(user)}
                              >
                                <i className="fas fa-check"></i> Duyệt
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleReject(user)}
                              >
                                <i className="fas fa-times"></i> Từ chối
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
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
                        Trước
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
                        Sau
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
          title={`Chi tiết người dùng: ${selectedUser.username}`}
        >
          <div className="row">
            <div className="col-md-6">
              <strong>Tên đăng nhập:</strong> {selectedUser.username}
            </div>
            <div className="col-md-6">
              <strong>Email:</strong> {selectedUser.email}
            </div>
          </div>
          <div className="row mt-2">
            <div className="col-md-6">
              <strong>Họ và tên:</strong> {selectedUser.full_name}
            </div>
            <div className="col-md-6">
              <strong>Vai trò:</strong> 
              <span className={`badge badge-${selectedUser.role === 'admin' ? 'danger' : 'primary'} ml-1`}>
                {selectedUser.role === 'admin' ? 'Admin' : 'User'}
              </span>
            </div>
          </div>
          <div className="row mt-2">
            <div className="col-md-6">
              <strong>Trạng thái:</strong>
              <span className={`badge badge-${selectedUser.status === 'active' ? 'success' : 'warning'} ml-1`}>
                {selectedUser.status === 'active' ? 'Hoạt động' : 'Chờ duyệt'}
              </span>
            </div>
            <div className="col-md-6">
              <strong>Ngày tạo:</strong> {new Date(selectedUser.created_at).toLocaleDateString('vi-VN')}
            </div>
          </div>
          {selectedUser.last_login && (
            <div className="row mt-2">
              <div className="col-12">
                <strong>Lần đăng nhập cuối:</strong> {new Date(selectedUser.last_login).toLocaleString('vi-VN')}
              </div>
            </div>
          )}
          {selectedUser.stats && (
            <div className="row mt-3">
              <div className="col-12">
                <h6>Thống kê:</h6>
                <ul>
                  <li>Tổng số MOP: {selectedUser.stats.total_mops}</li>
                  <li>Tổng số lần thực thi: {selectedUser.stats.total_executions}</li>
                  <li>MOP chờ duyệt: {selectedUser.stats.pending_mops}</li>
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
          title={`Xác nhận ${confirmAction.type === 'approve' ? 'phê duyệt' : 'từ chối'}`}
        >
          <p>
            Bạn có chắc chắn muốn {confirmAction.type === 'approve' ? 'phê duyệt' : 'từ chối'} người dùng <strong>{confirmAction.username}</strong>?
          </p>
          <div className="text-right">
            <button
              className="btn btn-secondary mr-2"
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmAction(null);
              }}
            >
              Hủy
            </button>
            <button
              className={`btn btn-${confirmAction.type === 'approve' ? 'success' : 'danger'}`}
              onClick={confirmAction.onConfirm}
            >
              {confirmAction.type === 'approve' ? 'Phê duyệt' : 'Từ chối'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default UserManagement;