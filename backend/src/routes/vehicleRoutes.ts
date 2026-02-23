import { Router } from 'express';
import { 
  getAllVehicles, 
  getVehicleById, 
  createVehicle, 
  updateVehicle, 
  deleteVehicle,
  updateKm,
  bulkUpdateVehicleManagers,
  calculateRisks,
  getVehicleFullOverviewByPlate
} from '../controllers/vehicleController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Vehicles
 *   description: Araç yönetimi
 */

/**
 * @swagger
 * /vehicles:
 *   get:
 *     summary: Tüm araçları listeler
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Duruma göre filtrele (Active, Passive, Maintenance, etc.)
 *     responses:
 *       200:
 *         description: Araç listesi
 */
router.get('/', authenticate, getAllVehicles);

router.get('/overview/by-plate', authenticate, authorize(PERMISSIONS.REPORTS.VIEW), getVehicleFullOverviewByPlate);

/**
 * @swagger
 * /vehicles/{id}:
 *   get:
 *     summary: Belirli bir aracı getirir
 *     tags: [Vehicles]
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
 *         description: Araç detayı
 *       404:
 *         description: Araç bulunamadı
 */
router.get('/:id', authenticate, authorize(PERMISSIONS.VEHICLES.VIEW), getVehicleById);

/**
 * @swagger
 * /vehicles:
 *   post:
 *     summary: Yeni araç oluşturur
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plate
 *               - make
 *               - model
 *             properties:
 *               plate:
 *                 type: string
 *               make:
 *                 type: string
 *               model:
 *                 type: string
 *     responses:
 *       201:
 *         description: Araç başarıyla oluşturuldu
 */
router.post('/', authenticate, authorize(PERMISSIONS.VEHICLES.ADD), createVehicle);

/**
 * @swagger
 * /vehicles/bulk-managers:
 *   post:
 *     summary: Toplu araç yöneticisi günceller
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vehicleIds
 *               - managerId
 *             properties:
 *               vehicleIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               managerId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Başarılı güncelleme
 */
router.post('/bulk-managers', authenticate, authorize(PERMISSIONS.VEHICLES.EDIT), bulkUpdateVehicleManagers);

router.put('/:id', authenticate, authorize(PERMISSIONS.VEHICLES.EDIT), updateVehicle);
router.delete('/:id', authenticate, authorize(PERMISSIONS.VEHICLES.DELETE), deleteVehicle);
router.post('/:id/km', authenticate, updateKm);

router.post('/calculate-risks', authenticate, authorize(PERMISSIONS.VEHICLES.EDIT), calculateRisks);

export default router;
