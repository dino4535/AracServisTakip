import api from './api';
import { PaginatedResponse, PaginationParams } from '../types';

export const adminService = {
  getAllRoles: async (): Promise<any[]> => {
    const response = await api.get<{ roles: any[] }>('/admin/roles');
    return response.data.roles;
  },

  createRole: async (data: any): Promise<any> => {
    const response = await api.post<{ roleId: number }>('/admin/roles', data);
    return response.data;
  },

  updateRole: async (id: number, data: any): Promise<void> => {
    await api.put(`/admin/roles/${id}`, data);
  },

  deleteRole: async (id: number): Promise<void> => {
    await api.delete(`/admin/roles/${id}`);
  },

  getAllPermissions: async (): Promise<any[]> => {
    const response = await api.get<{ permissions: any[] }>('/admin/permissions');
    return response.data.permissions;
  },

  getAllCompanies: async (): Promise<any[]> => {
    const response = await api.get<{ companies: any[] }>('/admin/companies');
    return response.data.companies;
  },

  getAllDepots: async (params?: PaginationParams): Promise<PaginatedResponse<any>> => {
    const response = await api.get<{ depots: any[]; pagination: any }>('/admin/depots', { params });
    if (response.data.pagination) {
      return {
        data: response.data.depots,
        pagination: response.data.pagination
      };
    }
    const data = response.data.depots || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 }
    };
  },

  createDepot: async (data: any): Promise<any> => {
    const response = await api.post<{ depotId: number }>('/admin/depots', data);
    return response.data;
  },

  updateDepot: async (id: number, data: any): Promise<void> => {
    await api.put(`/admin/depots/${id}`, data);
  },

  deleteDepot: async (id: number): Promise<void> => {
    await api.delete(`/admin/depots/${id}`);
  },

  getDepotUsers: async (id: number): Promise<number[]> => {
    const response = await api.get<{ userIds: number[] }>(`/admin/depots/${id}/users`);
    return response.data.userIds;
  },

  updateDepotUsers: async (id: number, userIds: number[]): Promise<void> => {
    await api.put(`/admin/depots/${id}/users`, { userIds });
  },

  getAllServiceCompanies: async (params?: PaginationParams): Promise<PaginatedResponse<any>> => {
    const response = await api.get<{ serviceCompanies: any[]; pagination: any }>('/admin/service-companies', { params });
    if (response.data.pagination) {
      return {
        data: response.data.serviceCompanies,
        pagination: response.data.pagination
      };
    }
    const data = response.data.serviceCompanies || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 }
    };
  },

  createServiceCompany: async (data: any): Promise<any> => {
    const response = await api.post<{ serviceCompanyId: number }>('/admin/service-companies', data);
    return response.data;
  },

  updateServiceCompany: async (id: number, data: any): Promise<void> => {
    await api.put(`/admin/service-companies/${id}`, data);
  },

  deleteServiceCompany: async (id: number): Promise<void> => {
    await api.delete(`/admin/service-companies/${id}`);
  },

  // Insurance Companies
  getAllInsuranceCompanies: async (params?: PaginationParams): Promise<PaginatedResponse<any>> => {
    const response = await api.get<{ insuranceCompanies: any[]; pagination: any }>('/admin/insurance-companies', { params });
    if (response.data.pagination) {
      return {
        data: response.data.insuranceCompanies,
        pagination: response.data.pagination
      };
    }
    const data = response.data.insuranceCompanies || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 }
    };
  },

  createInsuranceCompany: async (data: any): Promise<any> => {
    const response = await api.post<{ insuranceCompany: any }>('/admin/insurance-companies', data);
    return response.data;
  },

  updateInsuranceCompany: async (id: number, data: any): Promise<void> => {
    await api.put(`/admin/insurance-companies/${id}`, data);
  },

  deleteInsuranceCompany: async (id: number): Promise<void> => {
    await api.delete(`/admin/insurance-companies/${id}`);
  },

  getSetting: async (key: string): Promise<string> => {
    const response = await api.get<{ value: string }>(`/settings/${key}`);
    return response.data.value;
  },

  updateSetting: async (key: string, value: string): Promise<void> => {
    await api.put(`/settings/${key}`, { value });
  },

  triggerJobReminder: async (): Promise<void> => {
    await api.post('/settings/trigger-reminders');
  },
};
