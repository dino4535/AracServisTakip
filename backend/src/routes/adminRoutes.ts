import { Router } from 'express';
import { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  bulkUpdateManagers,
  deleteUser,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllPermissions,
  getAllCompanies,
  getAllDepots,
  createDepot,
  updateDepot,
  deleteDepot,
  getDepotUsers,
  updateDepotUsers,
  getUserDepots,
  updateUserDepots,
  getAllServiceCompanies,
  createServiceCompany,
  updateServiceCompany,
  deleteServiceCompany,
  getAllInsuranceCompanies,
  createInsuranceCompany,
  updateInsuranceCompany,
  deleteInsuranceCompany
} from '../controllers/adminController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Yönetici işlemleri
 */

// Users
/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Tüm kullanıcıları listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kullanıcı listesi
 */
router.get('/users', authenticate, authorize(PERMISSIONS.ADMIN.USERS_VIEW), getAllUsers);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Kullanıcı detayını getirir
 *     tags: [Admin]
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
 *         description: Kullanıcı detayı
 */
router.get('/users/:id', authenticate, authorize(PERMISSIONS.ADMIN.USERS_VIEW), getUserById);

/**
 * @swagger
 * /admin/users:
 *   post:
 *     summary: Yeni kullanıcı oluşturur
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - surname
 *               - roleId
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               surname:
 *                 type: string
 *               roleId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Kullanıcı oluşturuldu
 */
router.post('/users', authenticate, authorize(PERMISSIONS.ADMIN.USERS_ADD), createUser);

router.put('/users/:id', authenticate, authorize(PERMISSIONS.ADMIN.USERS_EDIT), updateUser);
router.post('/users/bulk-managers', authenticate, authorize(PERMISSIONS.ADMIN.USERS_EDIT), bulkUpdateManagers);
router.delete('/users/:id', authenticate, authorize(PERMISSIONS.ADMIN.USERS_DELETE), deleteUser);
router.get('/users/:id/depots', authenticate, authorize(PERMISSIONS.ADMIN.USERS_VIEW), getUserDepots);
router.put('/users/:id/depots', authenticate, authorize(PERMISSIONS.ADMIN.USERS_EDIT), updateUserDepots);

// Roles
/**
 * @swagger
 * /admin/roles:
 *   get:
 *     summary: Tüm rolleri listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rol listesi
 */
router.get('/roles', authenticate, authorize(PERMISSIONS.ADMIN.ROLES_VIEW), getAllRoles);

router.post('/roles', authenticate, authorize(PERMISSIONS.ADMIN.ROLES_ADD), createRole);
router.put('/roles/:id', authenticate, authorize(PERMISSIONS.ADMIN.ROLES_EDIT), updateRole);
router.delete('/roles/:id', authenticate, authorize(PERMISSIONS.ADMIN.ROLES_DELETE), deleteRole);

// Permissions
/**
 * @swagger
 * /admin/permissions:
 *   get:
 *     summary: Tüm yetkileri listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Yetki listesi
 */
router.get('/permissions', authenticate, authorize(PERMISSIONS.ADMIN.ROLES_VIEW), getAllPermissions);

// Companies & Depots
/**
 * @swagger
 * /admin/companies:
 *   get:
 *     summary: Tüm şirketleri listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Şirket listesi
 */
router.get('/companies', authenticate, getAllCompanies);

/**
 * @swagger
 * /admin/depots:
 *   get:
 *     summary: Tüm depoları listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Depo listesi
 */
router.get('/depots', authenticate, getAllDepots);

router.post('/depots', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), createDepot);
router.put('/depots/:id', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), updateDepot);
router.delete('/depots/:id', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), deleteDepot);
router.get('/depots/:id/users', authenticate, authorize(PERMISSIONS.ADMIN.USERS_VIEW), getDepotUsers);
router.put('/depots/:id/users', authenticate, authorize(PERMISSIONS.ADMIN.USERS_EDIT), updateDepotUsers);

// Service Companies
/**
 * @swagger
 * /admin/service-companies:
 *   get:
 *     summary: Tüm servis firmalarını listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Servis firması listesi
 */
router.get('/service-companies', authenticate, getAllServiceCompanies);

router.post('/service-companies', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), createServiceCompany);
router.put('/service-companies/:id', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), updateServiceCompany);
router.delete('/service-companies/:id', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), deleteServiceCompany);

// Insurance Companies
/**
 * @swagger
 * /admin/insurance-companies:
 *   get:
 *     summary: Tüm sigorta şirketlerini listeler
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sigorta şirketi listesi
 */
router.get('/insurance-companies', authenticate, getAllInsuranceCompanies);

router.post('/insurance-companies', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), createInsuranceCompany);
router.put('/insurance-companies/:id', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), updateInsuranceCompany);
router.delete('/insurance-companies/:id', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), deleteInsuranceCompany);

export default router;
