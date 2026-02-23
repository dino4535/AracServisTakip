import express from 'express';
import { getAuditLogs } from '../controllers/auditController';
import { authenticate, authorizeRole } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: Denetim kayıtları
 */

/**
 * @swagger
 * /audit:
 *   get:
 *     summary: Denetim kayıtlarını listeler (Admin Only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Kayıt limiti
 *     responses:
 *       200:
 *         description: Denetim kayıtları
 *       403:
 *         description: Yetkisiz erişim
 */
// Only Admins and SuperAdmins should see audit logs
router.get('/', authorizeRole([
  'Admin', 'ADMIN', 'admin', 
  'SuperAdmin', 'SUPERADMIN', 'Superadmin', 'superadmin', 
  'Super Admin', 'SUPER ADMIN', 'Super admin', 'super admin'
]), getAuditLogs);

export default router;
