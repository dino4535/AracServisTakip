import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getDashboardStats,
  getRecentActivity,
  getFuelConsumption,
  getMaintenanceCosts,
} from '../controllers/dashboardController';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Ana sayfa dashboard verileri
 */

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Genel istatistikleri getirir
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard istatistikleri
 */
router.get('/stats', authenticate, getDashboardStats);

/**
 * @swagger
 * /dashboard/activity:
 *   get:
 *     summary: Son aktiviteleri getirir
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Aktivite listesi
 */
router.get('/activity', authenticate, getRecentActivity);

/**
 * @swagger
 * /dashboard/fuel-consumption:
 *   get:
 *     summary: Yakıt tüketim grafiği verilerini getirir
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Yakıt tüketim verileri
 */
router.get('/fuel-consumption', authenticate, getFuelConsumption);

/**
 * @swagger
 * /dashboard/maintenance-costs:
 *   get:
 *     summary: Bakım maliyet grafiği verilerini getirir
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bakım maliyet verileri
 */
router.get('/maintenance-costs', authenticate, getMaintenanceCosts);

export default router;