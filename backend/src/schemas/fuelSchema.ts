import { z } from 'zod';

export const fuelSchema = z.object({
  vehicleId: z.number().int().positive('Araç seçimi zorunludur'),
  kilometer: z.number().int().min(0).optional().nullable(),
  liters: z.number().positive('Litre değeri 0\'dan büyük olmalıdır'),
  costPerLiter: z.number().positive('Litre fiyatı 0\'dan büyük olmalıdır').optional().nullable(),
  totalCost: z.number().positive('Toplam tutar 0\'dan büyük olmalıdır'),
  fuelStation: z.string().max(100, 'İstasyon adı en fazla 100 karakter olabilir').optional().nullable(),
});
