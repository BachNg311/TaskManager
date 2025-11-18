import axios from 'axios';
import { getApiUrl } from '../utils/apiConfig';

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Don't redirect on 401 during registration/login
    if (error.response?.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

