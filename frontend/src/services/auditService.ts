import api from './api';

export interface AuditLog {
  LogID: number;
  UserID: number;
  Action: string;
  TableName: string;
  RecordID: number;
  Details: string;
  IPAddress: string;
  CreatedAt: string;
  Name?: string;
  Surname?: string;
  Email?: string;
  UserRole?: string;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  action?: string;
  tableName?: string;
  userId?: number;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getAuditLogs = async (filters: AuditLogFilters = {}): Promise<AuditLogResponse> => {
  const response = await api.get('/audit-logs', { params: filters });
  return response.data;
};
