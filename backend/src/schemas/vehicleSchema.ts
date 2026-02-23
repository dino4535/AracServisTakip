import { z } from 'zod';

export const vehicleSchema = z.object({
  plate: z.string().min(1, 'Plate is required').max(20),
  vin: z.string().max(17).optional().nullable(),
  make: z.string().max(50).optional().nullable(),
  model: z.string().max(50).optional().nullable(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional().nullable(),
  fuelType: z.enum(['Gasoline', 'Diesel', 'LPG', 'Electric', 'Hybrid']).optional().nullable(),
  currentKm: z.number().int().min(0).optional().nullable(),
  nextMaintenanceKm: z.number().int().min(0).optional().nullable(),
  status: z.enum(['Active', 'Maintenance', 'Sold', 'Retired']).default('Active'),
  assignedDriverId: z.number().int().optional().nullable(),
  licenseSerial: z.string().max(50).optional().nullable(),
  licenseNumber: z.string().max(50).optional().nullable(),
  engineNumber: z.string().max(50).optional().nullable(),
  color: z.string().max(30).optional().nullable(),
  registrationDate: z.string().optional().nullable(), // ISO Date string
});

export const updateKmSchema = z.object({
  kilometer: z.number().int().min(0, 'Kilometer must be a positive number'),
});
