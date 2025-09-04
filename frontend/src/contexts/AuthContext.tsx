import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authService } from '../services/authService';
import type { AuthState, AuthContextType, LoginCredentials, RegisterCredentials, User } from '../types/auth';

// Auth reducer
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'REGISTER_START' }
  | { type: 'REGISTER_SUCCESS' }
  | { type: 'REGISTER_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User };

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: true,
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'REGISTER_START':
      return {
        ...state,
        isLoading: true,
      };
    case 'REGISTER_SUCCESS':
    case 'REGISTER_FAILURE':
      return {
        ...state,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state on app start
  useEffect(() => {
    initializeAuth();
    
    // Listen for auth logout events from API interceptor
    const handleAuthLogout = () => {
      ('[console.logAuthContext] Received auth:logout event');
      // Ensure localStorage is cleared when logout event is triggered
      authService.logout();
      dispatch({ type: 'LOGOUT' });
    };
    
    window.addEventListener('auth:logout', handleAuthLogout);
    
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, []);

  const initializeAuth = async () => {
    try {
      const token = authService.getStoredToken();
      const user = authService.getStoredUser();

      if (token && user) {
        // Verify token is still valid
        try {
          console.log('[AuthContext] Verifying stored token...');
          const currentUser = await authService.getCurrentUser();
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: { user: currentUser, token },
          });
        } catch (error) {
          console.log('[AuthContext] Token verification failed:', error);
          // Token is invalid, clear storage
          authService.logout();
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        console.log('[AuthContext] No stored token/user found');
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const login = async (username: string, password: string) => {
    try {
      console.log('[AuthContext] Starting login...');
      dispatch({ type: 'LOGIN_START' });
      const credentials: LoginCredentials = { username, password };
      const response = await authService.login(credentials);
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: response.user, token: response.access_token },
      });
    } catch (error) {
      console.log('[AuthContext] Login failed:', error);
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'LOGOUT' });
    }
  };

  const checkAuth = async () => {
    try {
      const user = await authService.getCurrentUser();
      dispatch({ type: 'SET_USER', payload: user });
    } catch (error) {
      logout();
      throw error;
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    try {
      console.log('[AuthContext] Starting registration...');
      dispatch({ type: 'REGISTER_START' });
      const response = await authService.register(credentials);
      dispatch({ type: 'REGISTER_SUCCESS' });
      return response;
    } catch (error) {
      console.log('[AuthContext] Registration failed:', error);
      dispatch({ type: 'REGISTER_FAILURE' });
      throw error;
    }
  };

  const value: AuthContextType = {
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    login,
    register,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;