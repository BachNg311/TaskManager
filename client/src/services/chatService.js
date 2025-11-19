import api from './api';
import { getApiUrl } from '../utils/apiConfig';

export const chatService = {
  getChats: async () => {
    const response = await api.get('/chats');
    return response.data || response;
  },

  getOrCreateDirectChat: async (userId) => {
    const response = await api.get(`/chats/direct/${userId}`);
    return response.data || response;
  },

  createGroupChat: async (chatData) => {
    const response = await api.post('/chats/group', chatData);
    return response.data || response;
  },

  getChat: async (chatId) => {
    const response = await api.get(`/chats/${chatId}`);
    return response.data || response;
  },

  getMessages: async (chatId, page = 1, limit = 50) => {
    const response = await api.get(`/chats/${chatId}/messages?page=${page}&limit=${limit}`);
    return response.data || response;
  },

  addParticipant: async (chatId, userId) => {
    const response = await api.post(`/chats/${chatId}/participants`, { userId });
    return response.data || response;
  },

  removeParticipant: async (chatId, userId) => {
    const response = await api.delete(`/chats/${chatId}/participants/${userId}`);
    return response;
  },

  deleteChat: async (chatId) => {
    const response = await api.delete(`/chats/${chatId}`);
    return response.data || response;
  },

  uploadAttachment: async (chatId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${getApiUrl()}/chats/${chatId}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload attachment');
    }
    return data.data || data;
  },

  leaveChat: async (chatId) => {
    const response = await api.post(`/chats/${chatId}/leave`);
    return response.data || response;
  },

  updateChat: async (chatId, updateData) => {
    const response = await api.put(`/chats/${chatId}`, updateData);
    return response.data || response;
  },

  forwardMessage: async (messageId, targetChatIds) => {
    const response = await api.post('/chats/forward', { messageId, targetChatIds });
    return response.data || response;
  },

  summarizeChat: async (chatId, options = {}) => {
    const response = await api.post('/ai/chat-summary', {
      chatId,
      ...options,
    });
    return response.data || response;
  },
};

