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

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  full_name: string;
  password: string;
  confirm_password: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<{ message: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}