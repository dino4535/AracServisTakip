import { z } from 'zod';

export const maintenanceSchema = z.object({
  vehicleId: z.number().int().positive('Vehicle ID is required'),
  type: z.enum(['Periodic', 'Inspection', 'Repair', 'Tire Change', 'Oil Change', 'Other']),
  description: z.string().max(500).optional().nullable(),
  kilometer: z.number().int().min(0).optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  serviceDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  nextServiceDate: z.string().optional().nullable().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
});
