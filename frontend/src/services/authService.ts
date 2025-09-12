import { apiService } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type { LoginCredentials, RegisterCredentials, AuthResponse, User } from '../types/auth';

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

  async register(credentials: RegisterCredentials): Promise<{ message: string }> {
    // Remove confirm_password before sending to backend
    const { confirm_password, ...registerData } = credentials;
    const response = await apiService.post<{ message: string }>(API_ENDPOINTS.AUTH.REGISTER, registerData);
    return response;
  }

  async logout(): Promise<void> {
    try {
      await apiService.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error: unknown) {
      const errorObj = error as { response?: { status?: number } };
      const status = errorObj?.response?.status;
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
      const response = await apiService.get<{success: boolean, data: User}>(API_ENDPOINTS.AUTH.ME);
      console.log('[AuthService] getCurrentUser response:', response);
      
      if (response.success && response.data) {
        console.log('[AuthService] getCurrentUser success:', response.data);
        return response.data;
      } else {
        throw new Error('Invalid response format');
      }
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