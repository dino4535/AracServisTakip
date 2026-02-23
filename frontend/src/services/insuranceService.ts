import api from './api';
import { InsuranceRecord, PaginatedResponse, PaginationParams, InsuranceSummary } from '../types';

export const insuranceService = {
  getAllInsuranceRecords: async (
    params?: { vehicleId?: number; type?: string; sortField?: string; sortDirection?: 'asc' | 'desc'; search?: string } & PaginationParams
  ): Promise<PaginatedResponse<InsuranceRecord>> => {
    const response = await api.get<{ data: InsuranceRecord[]; pagination: any }>('/insurance', { params });
    if (response.data.pagination) {
      return {
        data: response.data.data,
        pagination: response.data.pagination
      };
    }
    const data = response.data.data || (response.data as any) || [];
    return {
      data: Array.isArray(data) ? data : [],
      pagination: { total: Array.isArray(data) ? data.length : 0, page: 1, limit: Array.isArray(data) ? data.length : 50, totalPages: 1 }
    };
  },

  getInsuranceById: async (id: number): Promise<InsuranceRecord> => {
    const response = await api.get<{ insuranceRecord: InsuranceRecord }>(`/insurance/${id}`);
    return response.data.insuranceRecord;
  },

  createInsuranceRecord: async (data: Partial<InsuranceRecord>): Promise<InsuranceRecord> => {
    const payload = {
      vehicleId: data.VehicleID,
      type: data.Type,
      policyNumber: data.PolicyNumber,
      insuranceCompany: data.InsuranceCompany,
      startDate: data.StartDate,
      endDate: data.EndDate,
      cost: data.Cost,
      notes: data.Notes
    };
    const response = await api.post<{ insuranceRecord: InsuranceRecord }>('/insurance', payload);
    return response.data.insuranceRecord;
  },

  updateInsuranceRecord: async (id: number, data: Partial<InsuranceRecord>): Promise<InsuranceRecord> => {
    const payload = {
      type: data.Type,
      policyNumber: data.PolicyNumber,
      insuranceCompany: data.InsuranceCompany,
      startDate: data.StartDate,
      endDate: data.EndDate,
      cost: data.Cost,
      notes: data.Notes
    };
    const response = await api.put<{ insuranceRecord: InsuranceRecord }>(`/insurance/${id}`, payload);
    return response.data.insuranceRecord;
  },

  deleteInsuranceRecord: async (id: number): Promise<void> => {
    await api.delete(`/insurance/${id}`);
  },

  getInsuranceSummary: async (): Promise<InsuranceSummary[]> => {
    const response = await api.get<{ data: InsuranceSummary[] }>('/insurance/summary');
    return response.data.data || [];
  },

  getUpcomingInsuranceRecords: async (days: number = 30): Promise<InsuranceRecord[]> => {
    const response = await api.get<{ data: InsuranceRecord[]; pagination: any }>('/insurance', {
      params: { page: 1, limit: 0 }
    });
    const all = response.data.data || [];
    const now = new Date();
    const target = new Date();
    target.setDate(now.getDate() + days);
    return all
      .filter(rec => {
        const end = new Date(rec.EndDate);
        return end >= now && end <= target;
      })
      .sort((a, b) => new Date(a.EndDate).getTime() - new Date(b.EndDate).getTime());
  },
};
