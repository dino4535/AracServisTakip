import { Router } from 'express';
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead, 
  getUnreadCount 
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Bildirim yönetimi
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Kullanıcının bildirimlerini listeler
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bildirim listesi
 */
router.get('/', authenticate, getNotifications);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Okunmamış bildirim sayısını getirir
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Okunmamış bildirim sayısı
 */
router.get('/unread-count', authenticate, getUnreadCount);

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     summary: Bildirimi okundu olarak işaretler
 *     tags: [Notifications]
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
 *         description: İşlem başarılı
 */
router.put('/:id/read', authenticate, markAsRead);

/**
 * @swagger
 * /notifications/read-all:
 *   put:
 *     summary: Tüm bildirimleri okundu olarak işaretler
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: İşlem başarılı
 */
router.put('/read-all', authenticate, markAllAsRead);

export default router;
