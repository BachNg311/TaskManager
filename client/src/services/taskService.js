import api from './api';
import { getApiUrl } from '../utils/apiConfig';

export const taskService = {
  getTasks: async (filters = {}, options = {}) => {
    const params = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params.append(key, filters[key]);
      }
    });
    // Add pagination options if provided
    if (options.limit !== undefined) {
      params.append('limit', options.limit);
    }
    if (options.page !== undefined) {
      params.append('page', options.page);
    }
    if (options.sortBy !== undefined) {
      params.append('sortBy', options.sortBy);
    }
    if (options.sortOrder !== undefined) {
      params.append('sortOrder', options.sortOrder);
    }
    const response = await api.get(`/tasks?${params.toString()}`);
    return response.data || response;
  },

  getTask: async (taskId) => {
    const response = await api.get(`/tasks/${taskId}`);
    return response.data || response;
  },

  createTask: async (taskData) => {
    const response = await api.post('/tasks', taskData);
    return response.data || response;
  },

  updateTask: async (taskId, taskData) => {
    const response = await api.put(`/tasks/${taskId}`, taskData);
    return response.data || response;
  },

  updateTaskStatus: async (taskId, status) => {
    const response = await api.patch(`/tasks/${taskId}/status`, { status });
    return response.data || response;
  },

  updateTaskChecklist: async (taskId, checklist, retryCount = 0) => {
    try {
      const response = await api.patch(`/tasks/${taskId}/checklist`, { checklist });
      return response.data; // API always returns { success, data, message }
    } catch (error) {
      // Retry on 429 (rate limit) errors, up to 2 times
      if (error.response?.status === 429 && retryCount < 2) {
        const delay = (retryCount + 1) * 1000; // 1s, 2s
        console.log(`⏳ Rate limited. Retrying in ${delay}ms... (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return taskService.updateTaskChecklist(taskId, checklist, retryCount + 1);
      }
      throw error;
    }
  },

  deleteTask: async (taskId) => {
    const response = await api.delete(`/tasks/${taskId}`);
    return response;
  },

  addComment: async (taskId, text) => {
    const response = await api.post(`/tasks/${taskId}/comments`, { text });
    return response.data;
  },

  getTaskStats: async () => {
    const response = await api.get('/tasks/stats');
    return response.data || response;
  },

  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('token');
    const response = await fetch(`${getApiUrl()}/tasks/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload file');
    }
    return data;
  },

  downloadEmployeeTaskReport: async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${getApiUrl()}/tasks/reports/users?format=csv`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to download report');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee-task-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  getAttachmentDownloadUrl: async (taskId, attachmentUrl) => {
    const response = await api.get('/tasks/attachments/download', {
      params: {
        taskId,
        url: attachmentUrl
      }
    });
    return response;
  },
};

