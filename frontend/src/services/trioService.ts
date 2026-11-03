import api from './api';

export interface TrioStatus {
  configured: boolean;
  connected: boolean;
  connectionError: string | null;
  autoSync: boolean;
  trioVehicleCount: number | null;
  totalVehicles: number;
  linkedVehicles: number;
}

export interface TrioSyncResult {
  totalVehicles: number;
  canbusReadings: number;
  updated: number;
  skippedLower: number;
  skippedNoChange: number;
  unmatched: string[];
}

export const trioService = {
  getStatus: async (): Promise<TrioStatus> => {
    const response = await api.get<TrioStatus>('/trio/status');
    return response.data;
  },

  syncKm: async (): Promise<{ message: string; result: TrioSyncResult }> => {
    const response = await api.post<{ message: string; result: TrioSyncResult }>('/trio/sync');
    return response.data;
  },
};
