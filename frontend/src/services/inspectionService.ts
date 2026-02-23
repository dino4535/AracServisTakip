import api from './api';
import { PaginatedResponse, PaginationParams } from '../types';

export interface Inspection {
  InspectionID: number;
  VehicleID: number;
  Plate: string;
  Make?: string;
  Model?: string;
  InspectionDate: string;
  NextInspectionDate: string;
  Cost: number;
  Notes?: string;
}

export const getInspections = async (
  params?: { vehicleId?: number; search?: string } & PaginationParams
): Promise<PaginatedResponse<Inspection>> => {
  const response = await api.get<{ data: Inspection[]; pagination: any }>('/inspections', { params });
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
};

export const getInspectionById = async (id: number) => {
  const response = await api.get<Inspection>(`/inspections/${id}`);
  return response.data;
};

export const createInspection = async (data: Partial<Inspection>) => {
  const response = await api.post<Inspection>('/inspections', data);
  return response.data;
};

export const updateInspection = async (id: number, data: Partial<Inspection>) => {
  const response = await api.put<Inspection>(`/inspections/${id}`, data);
  return response.data;
};

export const deleteInspection = async (id: number) => {
  await api.delete(`/inspections/${id}`);
};
