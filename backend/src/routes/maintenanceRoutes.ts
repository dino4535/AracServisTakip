import { Router } from 'express';
import { 
  getAllMaintenanceRecords, 
  getMaintenanceById, 
  createMaintenanceRecord, 
  updateMaintenanceRecord, 
  deleteMaintenanceRecord,
  getMaintenancePredictions
} from '../controllers/maintenanceController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Maintenance
 *   description: Bakım yönetimi
 */

/**
 * @swagger
 * /maintenance/predictions:
 *   get:
 *     summary: Bakım tahminlerini getirir
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bakım tahminleri listesi
 */
router.get('/predictions', authenticate, authorize(PERMISSIONS.MAINTENANCE.VIEW), getMaintenancePredictions);

/**
 * @swagger
 * /maintenance:
 *   get:
 *     summary: Tüm bakım kayıtlarını listeler
 *     tags: [Maintenance]
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
 *         description: Bakım kayıtları listesi
 */
router.get('/', authenticate, getAllMaintenanceRecords);

/**
 * @swagger
 * /maintenance/{id}:
 *   get:
 *     summary: Belirli bir bakım kaydını getirir
 *     tags: [Maintenance]
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
 *         description: Bakım kaydı detayı
 *       404:
 *         description: Kayıt bulunamadı
 */
router.get('/:id', authenticate, authorize(PERMISSIONS.MAINTENANCE.VIEW), getMaintenanceById);

/**
 * @swagger
 * /maintenance:
 *   post:
 *     summary: Yeni bakım kaydı oluşturur
 *     tags: [Maintenance]
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
 *               - maintenanceType
 *               - date
 *               - cost
 *             properties:
 *               vehicleId:
 *                 type: integer
 *               maintenanceType:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               cost:
 *                 type: number
 *     responses:
 *       201:
 *         description: Bakım kaydı oluşturuldu
 */
router.post('/', authenticate, authorize(PERMISSIONS.MAINTENANCE.ADD), createMaintenanceRecord);

router.put('/:id', authenticate, authorize(PERMISSIONS.MAINTENANCE.EDIT), updateMaintenanceRecord);
router.delete('/:id', authenticate, authorize(PERMISSIONS.MAINTENANCE.DELETE), deleteMaintenanceRecord);

export default router;
