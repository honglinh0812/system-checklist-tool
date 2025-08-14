import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type { LoginCredentials, AuthResponse, User } from '../types/auth';

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Clear any existing auth data first
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    const response = await apiService.post<AuthResponse>(API_ENDPOINTS.AUTH.LOGIN, credentials);
    
    // Store token and user info
    localStorage.setItem('token', response.access_token);
    localStorage.setItem('user', JSON.stringify(response.user));
    
    return response;
  }

  async logout(): Promise<void> {
    try {
      await apiService.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 401 && status !== 403) {
        console.error('Logout error:', error);
      }
    } finally {
      // Always clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }
  async getCurrentUser(): Promise<User> {
    console.log('[AuthService] Getting current user from:', API_ENDPOINTS.AUTH.ME);
    try {
      const user = await apiService.get<User>(API_ENDPOINTS.AUTH.ME);
      console.log('[AuthService] getCurrentUser success:', user);
      return user;
    } catch (error) {
      console.log('[AuthService] getCurrentUser error:', error);
      throw error;
    }
  }

  async refreshToken(): Promise<AuthResponse> {
    return await apiService.post<AuthResponse>(API_ENDPOINTS.AUTH.REFRESH);
  }

  getStoredToken(): string | null {
    return localStorage.getItem('token');
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
      }
    }
    return null;
  }

  isAuthenticated(): boolean {
    const token = this.getStoredToken();
    const user = this.getStoredUser();
    return !!(token && user);
  }
}

export const authService = new AuthService();
export default authService;