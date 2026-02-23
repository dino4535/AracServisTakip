import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import * as inspectionController from '../controllers/inspectionController';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Inspections
 *   description: Araç muayene yönetimi
 */

/**
 * @swagger
 * /inspections:
 *   get:
 *     summary: Tüm muayene kayıtlarını listeler
 *     tags: [Inspections]
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
 *         description: Muayene kayıtları listesi
 */
router.get('/', authorize('inspections.view'), inspectionController.getAllInspections);

/**
 * @swagger
 * /inspections/{id}:
 *   get:
 *     summary: Belirli bir muayene kaydını getirir
 *     tags: [Inspections]
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
 *         description: Muayene kaydı detayı
 *       404:
 *         description: Kayıt bulunamadı
 */
router.get('/:id', authorize('inspections.view'), inspectionController.getInspectionById);

/**
 * @swagger
 * /inspections:
 *   post:
 *     summary: Yeni muayene kaydı oluşturur
 *     tags: [Inspections]
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
 *               - inspectionDate
 *               - nextInspectionDate
 *               - cost
 *             properties:
 *               vehicleId:
 *                 type: integer
 *               inspectionDate:
 *                 type: string
 *                 format: date
 *               nextInspectionDate:
 *                 type: string
 *                 format: date
 *               cost:
 *                 type: number
 *     responses:
 *       201:
 *         description: Muayene kaydı oluşturuldu
 */
router.post('/', authorize('inspections.add'), inspectionController.createInspection);

router.put('/:id', authorize('inspections.edit'), inspectionController.updateInspection);
router.delete('/:id', authorize('inspections.delete'), inspectionController.deleteInspection);

export default router;
