import api from './api';

export const userService = {
  getUsers: async () => {
    const response = await api.get('/users');
    return response.data || response;
  },

  getUser: async (userId) => {
    const response = await api.get(`/users/${userId}`);
    return response.data || response;
  },

  updateUser: async (userId, userData) => {
    const response = await api.put(`/users/${userId}`, userData);
    return response.data || response;
  },
};

