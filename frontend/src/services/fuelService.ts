import api from './api';
import { FuelRecord } from '../types';

export const fuelService = {
  getAllFuelRecords: async (params?: {
    vehicleId?: number;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    export?: boolean;
    search?: string;
  }): Promise<any> => {
    const response = await api.get<{ fuelRecords: FuelRecord[]; pagination: any }>('/fuel', { params });
    if (params?.export) {
      return response.data.fuelRecords;
    }
    return {
      data: response.data.fuelRecords,
      pagination: response.data.pagination
    };
  },

  getFuelById: async (id: number): Promise<FuelRecord> => {
    const response = await api.get<{ fuelRecord: FuelRecord }>(`/fuel/${id}`);
    return response.data.fuelRecord;
  },

  createFuelRecord: async (data: Partial<FuelRecord>): Promise<FuelRecord> => {
    const response = await api.post<{ fuelRecord: FuelRecord }>('/fuel', data);
    return response.data.fuelRecord;
  },

  updateFuelRecord: async (id: number, data: Partial<FuelRecord>): Promise<FuelRecord> => {
    const response = await api.put<{ fuelRecord: FuelRecord }>(`/fuel/${id}`, data);
    return response.data.fuelRecord;
  },

  deleteFuelRecord: async (id: number): Promise<void> => {
    await api.delete(`/fuel/${id}`);
  },

  getFuelConsumption: async (vehicleId: number, params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get(`/fuel/${vehicleId}/consumption`, { params });
    return response.data.consumption;
  },

  syncOpetData: async (startDate?: string, endDate?: string): Promise<any> => {
    const response = await api.post('/fuel/sync/opet', { startDate, endDate });
    return response.data;
  },
};
