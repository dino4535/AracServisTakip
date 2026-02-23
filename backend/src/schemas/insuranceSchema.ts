import { z } from 'zod';

export const insuranceSchema = z.object({
  vehicleId: z.number().int(),
  type: z.enum(['Traffic', 'Kasko', 'Trafik Sigortası', 'Kasko Sigortası']),
  company: z.string().min(1, 'Insurance company is required').max(100),
  policyNumber: z.string().min(1, 'Policy number is required').max(50),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
  cost: z.number().min(0, 'Cost must be positive'),
  description: z.string().optional().nullable(),
});
