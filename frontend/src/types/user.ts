export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
  last_login?: string;
  is_active: boolean;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'user';
  is_active?: boolean;
}

export interface UserFilter {
  role?: string;
  is_active?: boolean;
  search?: string;
}

export interface UserStats {
  total_users: number;
  active_users: number;
  admin_users: number;
  regular_users: number;
}