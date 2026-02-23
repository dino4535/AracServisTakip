import sql from '../config/database';

export interface User {
  UserID: number;
  CompanyID?: number;
  Email: string;
  PasswordHash: string;
  Name: string;
  Surname: string;
  IsActive: boolean;
  CreatedAt: Date;
  UpdatedAt: Date;
}

export interface Role {
  RoleID: number;
  Name: string;
  Description?: string;
  CreatedAt: Date;
  UpdatedAt: Date;
}

export interface Permission {
  PermissionID: number;
  PermissionCode: string;
  Description?: string;
  Module?: string;
}

export interface Company {
  CompanyID: number;
  Name: string;
  TaxNumber?: string;
  Address?: string;
  Phone?: string;
  IsActive: boolean;
  CreatedAt: Date;
  UpdatedAt: Date;
}

export interface Vehicle {
  VehicleID: number;
  CompanyID: number;
  Plate: string;
  VIN?: string;
  Make?: string;
  Model?: string;
  Year?: number;
  FuelType?: string;
  CurrentKm: number;
  Status?: string;
  AssignedDriverID?: number;
  RiskScore?: number;
  RiskCategory?: 'Green' | 'Yellow' | 'Red';
  CreatedAt: Date;
  UpdatedAt: Date;
}

export interface MaintenanceRecord {
  MaintenanceID: number;
  VehicleID: number;
  Type: string;
  Description?: string;
  Kilometer?: number;
  Cost?: number;
  ServiceDate: Date;
  NextServiceDate?: Date;
  CreatedBy: number;
  CreatedAt: Date;
}

export interface InsuranceRecord {
  InsuranceID: number;
  VehicleID: number;
  Type: string;
  PolicyNumber?: string;
  InsuranceCompany?: string;
  StartDate: Date;
  EndDate: Date;
  Cost?: number;
  Notes?: string;
  CreatedAt: Date;
}

export interface FuelRecord {
  FuelRecordID: number;
  VehicleID: number;
  Kilometer?: number;
  Liters?: number;
  CostPerLiter?: number;
  TotalCost?: number;
  FuelStation?: string;
  FilledBy?: number;
  FuelDate: Date;
  ExternalID?: string;
  Source?: string;
  ProductName?: string;
}

export interface ServiceRequest {
  RequestID: number;
  VehicleID: number;
  RequestedBy: number;
  Description: string;
  Priority: string;
  Status: string;
  AssignedTo?: number;
  EstimatedCost?: number;
  ActualCost?: number;
  RequestDate: Date;
  CompletedDate?: Date;
}

export interface Notification {
  NotificationID: number;
  UserID: number;
  Type: string;
  Title: string;
  Message: string;
  RelatedId?: number;
  IsRead: boolean;
  CreatedAt: Date;
}

export interface JwtPayload {
  UserID: number;
  Email: string;
  Name: string;
  CompanyID?: number;
}
