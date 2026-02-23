import api from './api';
import { Vehicle, PaginatedResponse, PaginationParams } from '../types';

export const vehicleService = {
  getAllVehicles: async (params?: { companyId?: number; status?: string; search?: string } & PaginationParams): Promise<PaginatedResponse<Vehicle>> => {
    const response = await api.get<{ vehicles: Vehicle[]; pagination: any }>('/vehicles', { params });
    // Handle both old and new response formats for safety
    if (response.data.pagination) {
      return {
        data: Array.isArray(response.data.vehicles) ? response.data.vehicles : [],
        pagination: response.data.pagination
      };
    } else {
      // Fallback for non-paginated response
      let data: Vehicle[] = [];
      if (Array.isArray(response.data.vehicles)) {
        data = response.data.vehicles;
      } else if (Array.isArray(response.data)) {
        data = response.data as any;
      }
      
      return {
        data,
        pagination: {
          total: data.length,
          page: 1,
          limit: data.length,
          totalPages: 1
        }
      };
    }
  },

  getVehicleById: async (id: number): Promise<Vehicle> => {
    const response = await api.get<{ vehicle: Vehicle }>(`/vehicles/${id}`);
    return response.data.vehicle;
  },

  createVehicle: async (data: Partial<Vehicle>): Promise<Vehicle> => {
    const response = await api.post<{ vehicle: Vehicle }>('/vehicles', data);
    return response.data.vehicle;
  },

  updateVehicle: async (id: number, data: Partial<Vehicle>): Promise<Vehicle> => {
    const response = await api.put<{ vehicle: Vehicle }>(`/vehicles/${id}`, data);
    return response.data.vehicle;
  },

  deleteVehicle: async (id: number): Promise<void> => {
    await api.delete(`/vehicles/${id}`);
  },

  updateKm: async (id: number, kilometer: number): Promise<void> => {
    await api.post(`/vehicles/${id}/km`, { kilometer });
  },

  bulkUpdateManagers: async (vehicleIds: number[], managerId: number | null): Promise<void> => {
    await api.post('/vehicles/bulk-managers', { vehicleIds, managerId });
  },

  calculateRisks: async (): Promise<{ message: string; processed: number }> => {
    const response = await api.post('/vehicles/calculate-risks');
    return response.data;
  },
  
  getVehicleOverviewByPlate: async (plate: string) => {
    const response = await api.get('/vehicles/overview/by-plate', {
      params: { plate },
    });
    return response.data;
  },
};
