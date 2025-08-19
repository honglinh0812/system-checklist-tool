export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user' | 'viewer';
  status: 'pending' | 'active';
  created_at: string;
  updated_at: string;
  last_login?: string;
  is_active: boolean;
  pending_expires_at?: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: 'admin' | 'user' | 'viewer';
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  full_name?: string;
  password?: string;
  role?: 'admin' | 'user' | 'viewer';
  is_active?: boolean;
}

export interface UserFilter {
  role?: string;
  status?: string;
  is_active?: boolean;
  search?: string;
}

export interface UserStats {
  total_users: number;
  active_users: number;
  pending_users: number;
  admin_users: number;
  regular_users: number;
  viewer_users: number;
}

export interface UserApprovalRequest {
  action: 'approve' | 'reject';
  role?: 'user' | 'viewer';
}