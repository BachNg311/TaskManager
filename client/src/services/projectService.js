import api from './api';

export const projectService = {
  getProjects: async () => {
    const response = await api.get('/projects');
    return response.data;
  },

  getProject: async (projectId) => {
    const response = await api.get(`/projects/${projectId}`);
    return response.data;
  },

  updateProject: async (projectId, projectData) => {
    const response = await api.put(`/projects/${projectId}`, projectData);
    return response.data;
  },

  deleteProject: async (projectId) => {
    const response = await api.delete(`/projects/${projectId}`);
    return response;
  },

  addMember: async (projectId, userId, role = 'member') => {
    const response = await api.post(`/projects/${projectId}/members`, {
      userId,
      role,
    });
    return response.data;
  },
};

