import { Router } from 'express';
import { 
  getAllInsuranceRecords, 
  getInsuranceById, 
  createInsuranceRecord, 
  updateInsuranceRecord, 
  deleteInsuranceRecord,
  getInsuranceSummary
} from '../controllers/insuranceController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Insurance
 *   description: Sigorta ve kasko yönetimi
 */

/**
 * @swagger
 * /insurance:
 *   get:
 *     summary: Tüm sigorta kayıtlarını listeler
 *     tags: [Insurance]
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
 *         description: Sigorta kayıtları listesi
 */
router.get('/', authenticate, getAllInsuranceRecords);

/**
 * @swagger
 * /insurance:
 *   post:
 *     summary: Yeni sigorta kaydı oluşturur
 *     tags: [Insurance]
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
 *               - insuranceType
 *               - policyNumber
 *               - startDate
 *               - endDate
 *               - cost
 *             properties:
 *               vehicleId:
 *                 type: integer
 *               insuranceType:
 *                 type: string
 *               policyNumber:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               cost:
 *                 type: number
 *     responses:
 *       201:
 *         description: Sigorta kaydı oluşturuldu
 */
router.post('/', authenticate, authorize(PERMISSIONS.INSURANCE.ADD), createInsuranceRecord);

/**
 * @swagger
 * /insurance/summary:
 *   get:
 *     summary: Araç bazlı sigorta özetini döner
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sigorta özeti listesi
 */
router.get('/summary', authenticate, authorize(PERMISSIONS.INSURANCE.VIEW), getInsuranceSummary);

/**
 * @swagger
 * /insurance/{id}:
 *   get:
 *     summary: Belirli bir sigorta kaydını getirir
 *     tags: [Insurance]
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
 *         description: Sigorta kaydı detayı
 *       404:
 *         description: Kayıt bulunamadı
 */
router.get('/:id', authenticate, authorize(PERMISSIONS.INSURANCE.VIEW), getInsuranceById);

router.put('/:id', authenticate, authorize(PERMISSIONS.INSURANCE.EDIT), updateInsuranceRecord);
router.delete('/:id', authenticate, authorize(PERMISSIONS.INSURANCE.DELETE), deleteInsuranceRecord);

export default router;
