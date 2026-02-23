import { Router } from 'express';
import { 
  getAllFuelRecords, 
  getFuelById, 
  createFuelRecord, 
  updateFuelRecord, 
  deleteFuelRecord,
  getFuelConsumption,
  syncOpetData
} from '../controllers/fuelController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Fuel
 *   description: Yakıt yönetimi
 */

/**
 * @swagger
 * /fuel:
 *   get:
 *     summary: Tüm yakıt kayıtlarını listeler
 *     tags: [Fuel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: integer
 *         description: Araç ID'sine göre filtrele
 *     responses:
 *       200:
 *         description: Yakıt kayıtları listesi
 */
router.get('/', authenticate, getAllFuelRecords);

/**
 * @swagger
 * /fuel/{id}:
 *   get:
 *     summary: Belirli bir yakıt kaydını getirir
 *     tags: [Fuel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Yakıt kaydı detayı
 *       404:
 *         description: Kayıt bulunamadı
 */
router.get('/:id', authenticate, authorize(PERMISSIONS.FUEL.VIEW), getFuelById);

/**
 * @swagger
 * /fuel/{vehicleId}/consumption:
 *   get:
 *     summary: Yakıt tüketim analizini getirir
 *     tags: [Fuel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tüketim analizi
 */
router.get('/:vehicleId/consumption', authenticate, authorize(PERMISSIONS.FUEL.VIEW), getFuelConsumption);

/**
 * @swagger
 * /fuel:
 *   post:
 *     summary: Yeni yakıt kaydı oluşturur
 *     tags: [Fuel]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vehicleId
 *               - fuelType
 *               - date
 *               - amount
 *               - cost
 *             properties:
 *               vehicleId:
 *                 type: integer
 *               fuelType:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               amount:
 *                 type: number
 *               cost:
 *                 type: number
 *     responses:
 *       201:
 *         description: Yakıt kaydı oluşturuldu
 */
router.post('/', authenticate, authorize(PERMISSIONS.FUEL.ADD), createFuelRecord);

router.put('/:id', authenticate, authorize(PERMISSIONS.FUEL.EDIT), updateFuelRecord);
router.delete('/:id', authenticate, authorize(PERMISSIONS.FUEL.DELETE), deleteFuelRecord);

/**
 * @swagger
 * /fuel/sync/opet:
 *   post:
 *     summary: Opet yakıt verilerini senkronize eder
 *     tags: [Fuel]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Senkronizasyon başarılı
 */
router.post('/sync/opet', authenticate, authorize(PERMISSIONS.FUEL.ADD), syncOpetData);

export default router;
