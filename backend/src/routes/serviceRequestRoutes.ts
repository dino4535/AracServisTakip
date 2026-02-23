import { Router } from 'express';
import { 
  getAllServiceRequests, 
  getServiceRequestById, 
  createServiceRequest, 
  updateServiceRequest, 
  approveServiceRequest,
  completeServiceRequest,
  deleteServiceRequest,
  markReturnedFromService
} from '../controllers/serviceRequestController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: ServiceRequests
 *   description: Servis talebi yönetimi
 */

/**
 * @swagger
 * /service-requests:
 *   get:
 *     summary: Tüm servis taleplerini listeler
 *     tags: [ServiceRequests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: integer
 *         description: Araç ID'sine göre filtrele
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Duruma göre filtrele (PENDING, APPROVED, IN_PROGRESS, COMPLETED, CANCELLED)
 *     responses:
 *       200:
 *         description: Servis talepleri listesi
 */
router.get('/', authenticate, getAllServiceRequests);

/**
 * @swagger
 * /service-requests/{id}:
 *   get:
 *     summary: Belirli bir servis talebini getirir
 *     tags: [ServiceRequests]
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
 *         description: Servis talebi detayı
 *       404:
 *         description: Talep bulunamadı
 */
router.get('/:id', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.VIEW), getServiceRequestById);

/**
 * @swagger
 * /service-requests:
 *   post:
 *     summary: Yeni servis talebi oluşturur
 *     tags: [ServiceRequests]
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
 *               - description
 *             properties:
 *               vehicleId:
 *                 type: integer
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *               serviceType:
 *                 type: string
 *     responses:
 *       201:
 *         description: Servis talebi oluşturuldu
 */
router.post('/', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.ADD), createServiceRequest);

router.put('/:id', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.EDIT), updateServiceRequest);
router.post('/:id/approve', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.APPROVE), approveServiceRequest);
router.post('/:id/return', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.EDIT), markReturnedFromService);
router.post('/:id/complete', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.EDIT), completeServiceRequest);
router.delete('/:id', authenticate, authorize(PERMISSIONS.SERVICE_REQUESTS.DELETE), deleteServiceRequest);

export default router;
