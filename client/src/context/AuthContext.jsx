import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const response = await authService.getCurrentUser();
          // response is already unwrapped by axios interceptor: { success, data: user }
          const userData = response?.data || response;
          console.log('🔍 initAuth user data:', userData);
          setUser(userData);
        } catch (error) {
          console.error('Auth initialization error:', error);
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [token]);

  const refreshUser = async () => {
    if (!token) return;
    try {
      const response = await authService.getCurrentUser();
      // response is already unwrapped by axios interceptor: { success, data: user }
      const userData = response?.data || response;
      console.log('🔄 refreshUser data:', userData);
      setUser(userData);
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authService.login(email, password);
      // response is already unwrapped by axios interceptor: { success, data: { user, token } }
      const data = response?.data || response;
      console.log('🔐 login data:', data);
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      return { success: true };
    } catch (error) {
      // Handle rate limiting error (429)
      if (error.response?.status === 429) {
        return {
          success: false,
          message: 'Too many login attempts. Please wait a few minutes and try again.',
        };
      }
      
      // Handle network errors
      if (!error.response) {
        return {
          success: false,
          message: 'Cannot connect to server. Please make sure the backend is running.',
        };
      }
      
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const loginWithGoogle = async (idToken) => {
    try {
      const response = await authService.googleLogin(idToken);
      const data = response?.data || response;
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      return { success: true };
    } catch (error) {
      console.error('Google login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Google login failed',
      };
    }
  };

  const register = async (name, email, password) => {
    try {
      const response = await authService.register(name, email, password);
      // response is already unwrapped by axios interceptor: { success, data: { user, token } }
      
      // Handle validation errors
      if (response.errors && Array.isArray(response.errors)) {
        return {
          success: false,
          message: response.errors.map(e => e.msg || e.message).join(', ') || 'Validation failed',
        };
      }
      
      // Check if response indicates failure
      if (response.success === false) {
        return {
          success: false,
          message: response.message || 'Registration failed',
        };
      }
      
      const data = response?.data || response;
      console.log('📝 register data:', data);
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      
      // Handle rate limiting error (429)
      if (error.response?.status === 429) {
        return {
          success: false,
          message: 'Too many registration attempts. Please wait a few minutes and try again.',
        };
      }
      
      // Handle network errors
      if (!error.response) {
        return {
          success: false,
          message: 'Cannot connect to server. Please make sure the backend is running.',
        };
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.errors?.[0]?.msg ||
                          error.message || 
                          'Registration failed. Please try again.';
      return {
        success: false,
        message: errorMessage,
      };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  const value = {
    user,
    token,
    loading,
    login,
    loginWithGoogle,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

