import api from './api';
import { PaginatedResponse, PaginationParams } from '../types';

export const userService = {
  getAllUsers: async (params?: PaginationParams & { search?: string }): Promise<PaginatedResponse<any>> => {
    const response = await api.get<{ users: any[]; pagination: any }>('/admin/users', { params });
    if (response.data.pagination) {
      return {
        data: response.data.users,
        pagination: response.data.pagination
      };
    }
    const data = response.data.users || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 }
    };
  },

  getUserById: async (id: number): Promise<any> => {
    const response = await api.get<{ user: any }>(`/admin/users/${id}`);
    return response.data.user;
  },

  createUser: async (data: any): Promise<any> => {
    const response = await api.post<{ userId: number }>('/admin/users', data);
    return response.data;
  },

  updateUser: async (id: number, data: any): Promise<void> => {
    await api.put(`/admin/users/${id}`, data);
  },

  bulkUpdateManagers: async (userIds: number[], managerId: number | null): Promise<void> => {
    await api.post('/admin/users/bulk-managers', { userIds, managerId });
  },

  deleteUser: async (id: number): Promise<void> => {
    await api.delete(`/admin/users/${id}`);
  },

  getUserDepots: async (id: number): Promise<number[]> => {
    const response = await api.get<{ depotIds: number[] }>(`/admin/users/${id}/depots`);
    return response.data.depotIds;
  },

  updateUserDepots: async (id: number, depotIds: number[]): Promise<void> => {
    await api.put(`/admin/users/${id}/depots`, { depotIds });
  },
  sendWelcomeEmail: async (id: number): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(`/admin/users/${id}/welcome-email`);
    return response.data;
  },
};
