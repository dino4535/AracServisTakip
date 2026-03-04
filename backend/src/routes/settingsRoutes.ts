
import express from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';
import { getSetting, updateSetting, getAllSettings, triggerReminders, testReminders } from '../controllers/settingsController';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: System settings management
 */

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Get all system settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all settings
 */
router.get('/', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), getAllSettings);

/**
 * @swagger
 * /settings/trigger-reminders:
 *   post:
 *     summary: Manually trigger reminder job
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job triggered successfully
 */
router.post('/trigger-reminders', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), triggerReminders);

/**
 * @swagger
 * /settings/test-reminders:
 *   post:
 *     summary: Send test reminders to current user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test triggered successfully
 */
router.post('/test-reminders', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), testReminders);

/**
 * @swagger
 * /settings/{key}:
 *   get:
 *     summary: Get a specific setting by key
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         schema:
 *           type: string
 *         required: true
 *         description: Setting key
 *     responses:
 *       200:
 *         description: Setting value
 *       404:
 *         description: Setting not found
 */
router.get('/:key', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), getSetting);

/**
 * @swagger
 * /settings/{key}:
 *   put:
 *     summary: Update a specific setting
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         schema:
 *           type: string
 *         required: true
 *         description: Setting key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Setting updated successfully
 */
router.put('/:key', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), updateSetting);

export default router;
