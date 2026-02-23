import { Router } from 'express';
import { getDashboardStats, getVehiclePerformance, getDetailedReport, getTrendAnalysis, getServiceHistoryReport } from '../controllers/reportController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Raporlama ve analiz
 */

/**
 * @swagger
 * /reports/dashboard:
 *   get:
 *     summary: Dashboard istatistiklerini getirir
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard verileri
 */
router.get('/dashboard', authenticate, getDashboardStats);

/**
 * @swagger
 * /reports/performance:
 *   get:
 *     summary: Araç performans raporunu getirir
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Performans raporu
 */
router.get('/performance', authenticate, getVehiclePerformance);

/**
 * @swagger
 * /reports/detailed:
 *   get:
 *     summary: Detaylı maliyet raporunu getirir
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Detaylı rapor
 */
router.get('/detailed', authenticate, getDetailedReport);

/**
 * @swagger
 * /reports/trends:
 *   get:
 *     summary: Trend analizini getirir
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trend analizi
 */
router.get('/trends', authenticate, getTrendAnalysis);

/**
 * @swagger
 * /reports/service-history:
 *   get:
 *     summary: Servis geçmişi raporunu getirir
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: plate
 *         schema:
 *           type: string
 *         description: Plakaya göre filtrele
 *       - in: query
 *         name: missingCost
 *         schema:
 *           type: boolean
 *         description: Maliyet bilgisi eksik olanları getir
 *     responses:
 *       200:
 *         description: Servis geçmişi raporu
 */
router.get('/service-history', authenticate, getServiceHistoryReport);

export default router;
