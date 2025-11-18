import api from './api';

export const notificationService = {
  getNotifications: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit !== undefined) queryParams.append('limit', params.limit);
    if (params.unreadOnly) queryParams.append('unreadOnly', params.unreadOnly);
    
    // api interceptor already unwraps response.data, so response IS the data
    const response = await api.get(`/notifications?${queryParams.toString()}`);
    return response;
  },

  getUnreadCount: async () => {
    // api interceptor already unwraps response.data, so response IS the data
    const response = await api.get('/notifications/unread-count');
    return response;
  },

  markAsRead: async (notificationId) => {
    // api interceptor already unwraps response.data, so response IS the data
    const response = await api.put(`/notifications/${notificationId}/read`);
    return response;
  },

  markAllAsRead: async () => {
    // api interceptor already unwraps response.data, so response IS the data
    const response = await api.put('/notifications/read-all');
    return response;
  },

  deleteNotification: async (notificationId) => {
    // api interceptor already unwraps response.data, so response IS the data
    const response = await api.delete(`/notifications/${notificationId}`);
    return response;
  }
};

