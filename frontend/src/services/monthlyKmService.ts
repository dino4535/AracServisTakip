import api from './api';
import { PaginatedResponse, PaginationParams } from '../types';

export interface MonthlyKmRecord {
  VehicleID: number;
  Plate: string;
  Make: string;
  Model: string;
  CurrentTotalKm: number;
  MonthlyKm: number | null;
  PreviousMonthKm: number | null;
  LogID: number | null;
  UpdatedAt: string | null;
}

export interface SaveMonthlyKmPayload {
  month: number;
  year: number;
  records: {
    vehicleId: number;
    kilometer: number;
  }[];
}

export interface MonthlyKmHistoryRecord {
  LogID: number;
  Month: number;
  Year: number;
  Kilometer: number;
  UpdatedAt: string;
  CreatedByName: string;
}

export const monthlyKmService = {
  getRecords: async (
    month: number,
    year: number,
    companyId?: number,
    params?: PaginationParams & { search?: string }
  ): Promise<PaginatedResponse<MonthlyKmRecord>> => {
    const response = await api.get<{ data: MonthlyKmRecord[]; pagination: any }>('/monthly-km', {
      params: { month, year, companyId, ...params }
    });
    
    if (response.data.pagination) {
      return {
        data: response.data.data,
        pagination: response.data.pagination
      };
    }
    
    // Fallback for non-paginated response structure if any
    const data = (response.data as any).data || response.data || [];
    return {
      data: Array.isArray(data) ? data : [],
      pagination: { total: Array.isArray(data) ? data.length : 0, page: 1, limit: Array.isArray(data) ? data.length : 50, totalPages: 1 }
    };
  },

  saveRecords: async (data: SaveMonthlyKmPayload): Promise<void> => {
    await api.post('/monthly-km', data);
  },

  getVehicleHistory: async (vehicleId: number): Promise<MonthlyKmHistoryRecord[]> => {
    const response = await api.get<MonthlyKmHistoryRecord[]>(`/monthly-km/${vehicleId}/history`);
    return response.data;
  }
};
