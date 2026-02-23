
import { z } from 'zod';

export const accidentSchema = z.object({
  vehicleId: z.number().int().positive('Vehicle ID is required'),
  driverId: z.number().int().positive().optional().nullable(),
  accidentDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid accident date'),
  reportNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  faultRate: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.enum(['OPEN', 'CLOSED', 'IN_PROCESS']).optional().default('OPEN'),
  location: z.string().optional().nullable(),
});
