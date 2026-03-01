export interface User {
  UserID: number;
  Name: string;
  Surname: string;
  Email: string;
  CompanyID?: number;
  CompanyName?: string;
  Roles: string[];
  ManagerID?: number;
  ManagerName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  surname: string;
  email: string;
  password: string;
  companyId?: number;
}

export interface AuthResponse {
  user: User;
  token: string;
  permissions?: string[];
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
  Segment?: string | null;
  CurrentKm: number;
  NextMaintenanceKm?: number | null;
  LastServiceKm?: number | null;
  Status?: string;
  AssignedDriverID?: number | null;
  DriverName?: string | null;
  LicenseSerial?: string | null;
  LicenseNumber?: string | null;
  EngineNumber?: string | null;
  Color?: string | null;
  RegistrationDate?: string | null;
  CompanyName?: string;
  DepotID?: number | null;
  DepotName?: string | null;
  ManagerID?: number | null;
  ManagerName?: string | null;
  RiskScore?: number;
  RiskCategory?: 'Green' | 'Yellow' | 'Red';
  RiskDetails?: string;
}

export interface MaintenanceRecord {
  MaintenanceID: number;
  VehicleID: number;
  Type: string;
  Description?: string;
  Kilometer?: number;
  Cost?: number;
  ServiceDate: string;
  NextServiceDate?: string;
  NextServiceKm?: number | null;
  nextServiceKm?: number | null;
  CreatedBy: number;
  CreatedByName?: string;
  Plate?: string;
}

export interface InsuranceRecord {
  InsuranceID: number;
  VehicleID: number;
  Type: string;
  PolicyNumber?: string;
  InsuranceCompany?: string;
  StartDate: string;
  EndDate: string;
  Cost?: number;
  Notes?: string;
  Plate?: string;
}

export interface InsuranceSummary {
  VehicleID: number;
  Plate: string;
  CompanyName?: string;
  DepotName?: string;
  NextRenewalDate?: string | null;
  HasAnyPolicy: boolean;
  HasActivePolicy: boolean;
   NextTrafficEndDate?: string | null;
   NextKaskoEndDate?: string | null;
   HasTrafficPolicy: boolean;
   HasActiveTrafficPolicy: boolean;
   HasKaskoPolicy: boolean;
   HasActiveKaskoPolicy: boolean;
}

export interface Inspection {
  InspectionID: number;
  VehicleID: number;
  Plate?: string;
  Make?: string;
  Model?: string;
  InspectionDate: string;
  NextInspectionDate: string;
  Cost: number;
  Notes?: string;
}

export interface Accident {
  AccidentID: number;
  VehicleID: number;
  Plate?: string;
  Make?: string;
  Model?: string;
  AccidentDate: string;
  DriverID?: number;
  DriverName?: string;
  ReportNumber?: string;
  Description?: string;
  Cost?: number;
  FaultRate?: number;
  Status?: string;
  Location?: string;
  Files?: any[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface AccidentInput {
  vehicleId?: number;
  driverId?: number | null;
  accidentDate?: string;
  reportNumber?: string;
  description?: string;
  cost?: number;
  faultRate?: number;
  status?: string;
  location?: string;
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
  FilledByName?: string;
  FuelDate: string;
  Plate?: string;
}

export interface ServiceRequest {
  RequestID: number;
  VehicleID: number;
  RequestedBy: number;
  Description: string;
  ServiceType?: string;
  Priority: string;
  Status: string;
  AssignedTo?: number;
  EstimatedCost?: number;
  ActualCost?: number;
  ServiceCompany?: string;
  ServiceCompanyID?: number;
  DriverName?: string;
  DeliveredBy?: string;
  ExtraWork?: string;
  RequestDate: string;
  ReturnDate?: string;
  ServiceActions?: string;
  CompletedDate?: string;
  Plate?: string;
  RequesterName?: string;
  AssigneeName?: string;
}

export interface Notification {
  NotificationID: number;
  UserID: number;
  Type: string;
  Title: string;
  Message: string;
  RelatedId?: number;
  IsRead: boolean;
  CreatedAt: string;
}

export interface Company {
  CompanyID: number;
  Name: string;
  TaxNumber?: string;
  Address?: string;
  Phone?: string;
  IsActive: boolean;
}

export interface ServiceCompany {
  ServiceCompanyID: number;
  Name: string;
  Address?: string;
  Phone?: string;
  Email?: string;
  ContactPerson?: string;
  IsActive: boolean;
}

export interface InsuranceCompany {
  InsuranceCompanyID: number;
  Name: string;
  IsActive: boolean;
}

export interface Depot {
  DepotID: number;
  CompanyID: number;
  Name: string;
  City?: string;
}

export interface Role {
  RoleID: number;
  Name: string;
  Description?: string;
  Permissions?: string[];
}

export interface Permission {
  PermissionID: number;
  PermissionCode: string;
  Description?: string;
  Module?: string;
}

export const PERMISSIONS = {
  VEHICLES: {
    VIEW: 'vehicles.view',
    ADD: 'vehicles.add',
    EDIT: 'vehicles.edit',
    DELETE: 'vehicles.delete',
  },
  MAINTENANCE: {
    VIEW: 'maintenance.view',
    ADD: 'maintenance.add',
    EDIT: 'maintenance.edit',
    DELETE: 'maintenance.delete',
  },
  SERVICE_REQUESTS: {
    VIEW: 'service_requests.view',
    ADD: 'service_requests.add',
    EDIT: 'service_requests.edit',
    DELETE: 'service_requests.delete',
    APPROVE: 'service_requests.approve',
  },
  INSURANCE: {
    VIEW: 'insurance.view',
    ADD: 'insurance.add',
    EDIT: 'insurance.edit',
    DELETE: 'insurance.delete',
  },
  INSPECTIONS: {
    VIEW: 'inspections.view',
    ADD: 'inspections.add',
    EDIT: 'inspections.edit',
    DELETE: 'inspections.delete',
  },
  FUEL: {
    VIEW: 'fuel.view',
    ADD: 'fuel.add',
    EDIT: 'fuel.edit',
    DELETE: 'fuel.delete',
  },
  REPORTS: {
    VIEW: 'reports.view',
    EXPORT: 'reports.export',
  },
  ACCIDENTS: {
    VIEW: 'ACCIDENTS.VIEW',
    ADD: 'ACCIDENTS.ADD',
    EDIT: 'ACCIDENTS.EDIT',
    DELETE: 'ACCIDENTS.DELETE',
  },
  ADMIN: {
    USERS_VIEW: 'admin.users.view',
    USERS_ADD: 'admin.users.add',
    USERS_EDIT: 'admin.users.edit',
    USERS_DELETE: 'admin.users.delete',
    ROLES_VIEW: 'admin.roles.view',
    ROLES_ADD: 'admin.roles.add',
    ROLES_EDIT: 'admin.roles.edit',
    ROLES_DELETE: 'admin.roles.delete',
    ROLES_PERMISSIONS: 'admin.roles.permissions',
    SETTINGS: 'admin.settings',
  },
};
