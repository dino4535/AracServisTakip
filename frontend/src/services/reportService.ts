import api from './api';
import { PaginatedResponse, PaginationParams } from '../types';

export interface DetailedReportItem {
  VehicleID: number;
  Plate: string;
  Make: string;
  Model: string;
  CompanyName: string;
  DepotName: string | null;
  DriverName: string;
  TotalKm: number;
  FuelCost: number;
  FuelLiters: number;
  MaintenanceCost: number;
  MaintenanceCount: number;
  InsuranceCost: number;
  InspectionCost: number;
  AccidentCost: number;
  TotalCost: number;
  AvgConsumption: number;
  CostPerKm: number;
  NextMaintenanceDate?: string;
  NextTrafficInsurance?: string;
  NextKasko?: string;
  NextInspectionDate?: string;
}

export interface ServiceHistoryItem {
  RecordID: number;
  ServiceDate: string;
  Plate: string;
  Make: string;
  Model: string;
  CompanyName: string;
  Description: string;
  ServiceType: string;
  Cost: number;
  Kilometer: number;
  NextServiceKm: number;
  NextServiceDate: string;
  ServiceCompanyName: string;
  InvoiceNo: string;
}

export const reportService = {
  getDashboardStats: async () => {
    const response = await api.get('/reports/dashboard');
    return response.data;
  },

  getVehiclePerformance: async () => {
    const response = await api.get('/reports/performance');
    return response.data;
  },

  getDetailedReport: async (startDate: string, endDate: string, companyIds?: number[], depotId?: number, driverId?: number, plate?: string): Promise<DetailedReportItem[]> => {
    const response = await api.get('/reports/detailed', {
      params: { 
        startDate, 
        endDate, 
        companyIds: companyIds?.length ? companyIds.join(',') : undefined, 
        depotId, 
        driverId, 
        plate 
      }
    });
    return response.data;
  },

  getServiceHistoryReport: async (
    startDate: string, 
    endDate: string, 
    companyIds?: number[], 
    depotId?: number, 
    driverId?: number, 
    plate?: string, 
    missingCost?: boolean,
    params?: PaginationParams
  ): Promise<PaginatedResponse<ServiceHistoryItem>> => {
    const response = await api.get<{ data: ServiceHistoryItem[]; pagination: any } | ServiceHistoryItem[]>('/reports/service-history', {
      params: { 
        startDate, 
        endDate, 
        companyIds: companyIds?.length ? companyIds.join(',') : undefined, 
        depotId, 
        driverId, 
        plate, 
        missingCost, 
        ...params 
      }
    });
    
    // Check if response is array (export mode) or object with data/pagination
    if (Array.isArray(response.data)) {
        return {
            data: response.data,
            pagination: { total: response.data.length, page: 1, limit: response.data.length, totalPages: 1 }
        };
    }

    if (response.data.pagination) {
      return {
        data: response.data.data,
        pagination: response.data.pagination
      };
    }

    // Fallback
    const data = (response.data as any).data || response.data || [];
    return {
      data: Array.isArray(data) ? data : [],
      pagination: { total: Array.isArray(data) ? data.length : 0, page: 1, limit: Array.isArray(data) ? data.length : 50, totalPages: 1 }
    };
  },

  getTrendAnalysis: async () => {
    const response = await api.get('/reports/trends');
    return response.data;
  }
};
