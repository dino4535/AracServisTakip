import express from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';
import { syncTrioKm, getTrioStatus } from '../controllers/trioController';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Trio
 *   description: Trio Mobil GPS/KM entegrasyonu
 */

/**
 * @swagger
 * /trio/status:
 *   get:
 *     summary: Trio bağlantı ve eşleşme durumu
 *     tags: [Trio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Durum bilgisi
 */
router.get('/status', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), getTrioStatus);

/**
 * @swagger
 * /trio/sync:
 *   post:
 *     summary: Trio CAN bus KM senkronunu manuel tetikle
 *     tags: [Trio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Senkronizasyon sonucu
 */
router.post('/sync', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), syncTrioKm);

export default router;
