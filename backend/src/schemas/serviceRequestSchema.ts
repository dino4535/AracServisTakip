import { z } from 'zod';

export const serviceRequestSchema = z.object({
  vehicleId: z.number().int().positive('Vehicle ID is required'),
  description: z.string().min(1, 'Description is required').max(500),
  serviceType: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT']),
  status: z.enum(['PENDING', 'APPROVED', 'IN_PROGRESS', 'RETURNED', 'COMPLETED', 'CANCELLED', 'REJECTED']).optional(),
  actualCost: z.number().min(0).optional().nullable(),
  estimatedCost: z.number().min(0).optional().nullable(),
  assignedTo: z.number().int().positive().optional().nullable(),
  serviceCompanyId: z.number().int().positive().optional().nullable(),
  serviceCompany: z.string().optional(),
  driverName: z.string().optional(),
  deliveredBy: z.string().optional(),
  extraWork: z.string().optional(),
  serviceActions: z.string().optional(),
});
