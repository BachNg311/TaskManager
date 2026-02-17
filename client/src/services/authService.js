import api from './api';

export const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data || response;
  },

  register: async (name, email, password) => {
    const response = await api.post('/auth/register', { name, email, password });
    return response.data || response;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data || response;
  },

  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data || response;
  },

  resetPassword: async (email, otp, password) => {
    const response = await api.post('/auth/reset-password', { email, otp, password });
    return response.data || response;
  },

  googleLogin: async (idToken) => {
    const response = await api.post('/auth/google', { idToken });
    return response.data || response;
  },

  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await api.post('/auth/upload-avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data || response;
  },
};

