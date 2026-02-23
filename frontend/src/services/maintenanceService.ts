import api from './api';
import { MaintenanceRecord, PaginatedResponse, PaginationParams } from '../types';

export const maintenanceService = {
  getAllMaintenanceRecords: async (
    params?: { vehicleId?: number; search?: string } & PaginationParams
  ): Promise<PaginatedResponse<MaintenanceRecord>> => {
    const response = await api.get<{ maintenanceRecords: MaintenanceRecord[]; pagination: any }>('/maintenance', { params });
    if (response.data.pagination) {
      return {
        data: response.data.maintenanceRecords,
        pagination: response.data.pagination
      };
    }
    const data = response.data.maintenanceRecords || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 }
    };
  },

  getMaintenanceById: async (id: number): Promise<MaintenanceRecord> => {
    const response = await api.get<{ maintenanceRecord: MaintenanceRecord }>(`/maintenance/${id}`);
    return response.data.maintenanceRecord;
  },

  createMaintenanceRecord: async (data: Partial<MaintenanceRecord>): Promise<MaintenanceRecord> => {
    const response = await api.post<{ maintenanceRecord: MaintenanceRecord }>('/maintenance', data);
    return response.data.maintenanceRecord;
  },

  updateMaintenanceRecord: async (id: number, data: Partial<MaintenanceRecord>): Promise<MaintenanceRecord> => {
    const response = await api.put<{ maintenanceRecord: MaintenanceRecord }>(`/maintenance/${id}`, data);
    return response.data.maintenanceRecord;
  },

  deleteMaintenanceRecord: async (id: number): Promise<void> => {
    await api.delete(`/maintenance/${id}`);
  },

  getMaintenancePredictions: async (): Promise<any[]> => {
    const response = await api.get<any[]>('/maintenance/predictions');
    return response.data;
  },
};
