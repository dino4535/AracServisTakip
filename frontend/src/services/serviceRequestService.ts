import api from './api';
import { ServiceRequest, PaginatedResponse, PaginationParams } from '../types';

export interface ServiceRequestStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export const serviceRequestService = {
  getAllServiceRequests: async (
    params?: { vehicleId?: number; status?: string; sortField?: string; sortDirection?: 'asc' | 'desc'; search?: string } & PaginationParams
  ): Promise<PaginatedResponse<ServiceRequest> & { stats?: ServiceRequestStats }> => {
    const response = await api.get<{ data: ServiceRequest[]; pagination: any; stats?: ServiceRequestStats }>('/service-requests', { params });
    if (response.data.pagination) {
      return {
        data: response.data.data,
        pagination: response.data.pagination,
        stats: response.data.stats
      };
    }
    const data = response.data.data || (response.data as any) || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, totalPages: 1 },
      stats: response.data.stats
    };
  },

  getServiceRequestById: async (id: number): Promise<ServiceRequest> => {
    const response = await api.get<{ serviceRequest: ServiceRequest }>(`/service-requests/${id}`);
    return response.data.serviceRequest;
  },

  createServiceRequest: async (data: Partial<ServiceRequest>): Promise<ServiceRequest> => {
    const payload = {
      vehicleId: data.VehicleID,
      description: data.Description,
      serviceType: data.ServiceType,
      priority: data.Priority,
      serviceCompanyId: data.ServiceCompanyID,
      driverName: data.DriverName,
      deliveredBy: data.DeliveredBy,
      extraWork: data.ExtraWork,
      estimatedCost: data.EstimatedCost,
      actualCost: data.ActualCost,
      assignedTo: data.AssignedTo,
      status: data.Status
    };
    const response = await api.post<{ serviceRequest: ServiceRequest }>('/service-requests', payload);
    return response.data.serviceRequest;
  },

  updateServiceRequest: async (id: number, data: Partial<ServiceRequest>): Promise<ServiceRequest> => {
    const payload = {
      vehicleId: data.VehicleID,
      description: data.Description,
      serviceType: data.ServiceType,
      priority: data.Priority,
      serviceCompanyId: data.ServiceCompanyID,
      driverName: data.DriverName,
      deliveredBy: data.DeliveredBy,
      extraWork: data.ExtraWork,
      estimatedCost: data.EstimatedCost,
      actualCost: data.ActualCost,
      assignedTo: data.AssignedTo,
      status: data.Status
    };
    const response = await api.put<{ serviceRequest: ServiceRequest }>(`/service-requests/${id}`, payload);
    return response.data.serviceRequest;
  },

  approveServiceRequest: async (id: number, data: { assignedTo?: number; estimatedCost?: number }): Promise<ServiceRequest> => {
    const response = await api.post<{ serviceRequest: ServiceRequest }>(`/service-requests/${id}/approve`, data);
    return response.data.serviceRequest;
  },

  markReturnedFromService: async (id: number, data?: { nextMaintenanceKm?: number; currentKm?: number }): Promise<ServiceRequest> => {
    const response = await api.post<{ serviceRequest: ServiceRequest }>(`/service-requests/${id}/return`, data || {});
    return response.data.serviceRequest;
  },

  completeServiceRequest: async (id: number, data: { actualCost?: number; serviceActions?: string }): Promise<ServiceRequest> => {
    const response = await api.post<{ serviceRequest: ServiceRequest }>(`/service-requests/${id}/complete`, data);
    return response.data.serviceRequest;
  },

  deleteServiceRequest: async (id: number): Promise<void> => {
    await api.delete(`/service-requests/${id}`);
  },
};
