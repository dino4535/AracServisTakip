import api from './api';

export const dashboardService = {
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  getRecentActivity: async () => {
    const response = await api.get('/dashboard/activity');
    return response.data;
  },

  getFuelConsumption: async () => {
    const response = await api.get('/dashboard/fuel-consumption');
    return response.data;
  },

  getMaintenanceCosts: async () => {
    const response = await api.get('/dashboard/maintenance-costs');
    return response.data;
  },
};