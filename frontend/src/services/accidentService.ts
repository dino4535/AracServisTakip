import api from './api';
import { Accident, AccidentInput, PaginatedResponse, PaginationParams } from '../types';

export const accidentService = {
  getAll: async (
    params?: PaginationParams & { search?: string }
  ): Promise<PaginatedResponse<Accident>> => {
    const response = await api.get<{ data: Accident[]; pagination: any }>('/accidents', { params });
    if (response.data.pagination) {
      return {
        data: response.data.data,
        pagination: response.data.pagination
      };
    }
    const data = response.data.data || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 }
    };
  },

  getById: async (id: number) => {
    const response = await api.get<{ accident: Accident }>(`/accidents/${id}`);
    return response.data.accident;
  },

  create: async (data: AccidentInput) => {
    const response = await api.post<{ accident: Accident }>('/accidents', data);
    return response.data.accident;
  },

  update: async (id: number, data: AccidentInput) => {
    const response = await api.put<{ accident: Accident }>(`/accidents/${id}`, data);
    return response.data.accident;
  },

  delete: async (id: number) => {
    await api.delete(`/accidents/${id}`);
  },

  uploadFile: async (id: number, formData: FormData) => {
    const response = await api.post(`/accidents/${id}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getFiles: async (id: number) => {
    const response = await api.get<{ files: any[] }>(`/accidents/${id}/files`);
    return response.data.files || [];
  },

  getByVehicle: async (vehicleId: number) => {
    const response = await api.get<{ data: Accident[] }>('/accidents', {
      params: { vehicleId }
    });
    // The controller returns { data: [...] } structure for filtered queries too
    return response.data.data || [];
  }
};
