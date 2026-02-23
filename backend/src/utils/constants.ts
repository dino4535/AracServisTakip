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
  // Accident permissions
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
} as const;

export const NOTIFICATION_TYPES = {
  MAINTENANCE_DUE: 'MAINTENANCE_DUE',
  INSURANCE_EXPIRY: 'INSURANCE_EXPIRY',
  KASKO_EXPIRY: 'KASKO_EXPIRY',
  SERVICE_REQUEST_CREATED: 'SERVICE_REQUEST_CREATED',
  SERVICE_REQUEST_APPROVED: 'SERVICE_REQUEST_APPROVED',
  SERVICE_REQUEST_COMPLETED: 'SERVICE_REQUEST_COMPLETED',
};

export const PRIORITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const STATUS_LEVELS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export const FUEL_TYPES = ['Benzin', 'Dizel', 'LPG', 'Elektrik', 'Hibrit'];

export const VEHICLE_STATUS = ['Active', 'InMaintenance', 'Retired', 'Sold'];

export const MAINTENANCE_TYPES = ['Servis', 'Muayene', 'Periyodik Bakım', 'Acil Tamir', 'Yıllık Bakım'];

export const INSURANCE_TYPES = ['Trafik Sigortası', 'Kasko'];
