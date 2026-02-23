
import { Router } from 'express';
import { 
  getAllAccidents, 
  getAccidentById, 
  createAccident, 
  updateAccident, 
  deleteAccident, 
  uploadAccidentFile, 
  getAccidentFiles 
} from '../controllers/accidentController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { upload } from '../middleware/upload';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Accidents
 *   description: Kaza ve hasar yönetimi
 */

/**
 * @swagger
 * /accidents:
 *   get:
 *     summary: Tüm kaza kayıtlarını listeler
 *     tags: [Accidents]
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
 *         description: Kaza kayıtları listesi
 */
router.get('/', authenticate, authorize(PERMISSIONS.ACCIDENTS.VIEW), getAllAccidents);

/**
 * @swagger
 * /accidents/{id}:
 *   get:
 *     summary: Belirli bir kaza kaydını getirir
 *     tags: [Accidents]
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
 *         description: Kaza kaydı detayı
 *       404:
 *         description: Kayıt bulunamadı
 */
router.get('/:id', authenticate, authorize(PERMISSIONS.ACCIDENTS.VIEW), getAccidentById);

/**
 * @swagger
 * /accidents:
 *   post:
 *     summary: Yeni kaza kaydı oluşturur
 *     tags: [Accidents]
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
 *               - accidentDate
 *               - cost
 *             properties:
 *               vehicleId:
 *                 type: integer
 *               accidentDate:
 *                 type: string
 *                 format: date
 *               cost:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Kaza kaydı oluşturuldu
 */
router.post('/', authenticate, authorize(PERMISSIONS.ACCIDENTS.ADD), createAccident);

router.put('/:id', authenticate, authorize(PERMISSIONS.ACCIDENTS.EDIT), updateAccident);
router.delete('/:id', authenticate, authorize(PERMISSIONS.ACCIDENTS.DELETE), deleteAccident);

// File routes
/**
 * @swagger
 * /accidents/{id}/files:
 *   post:
 *     summary: Kaza kaydına dosya yükler
 *     tags: [Accidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Dosya yüklendi
 */
router.post('/:id/files', authenticate, authorize(PERMISSIONS.ACCIDENTS.EDIT), upload.single('file'), uploadAccidentFile);

/**
 * @swagger
 * /accidents/{id}/files:
 *   get:
 *     summary: Kaza dosyalarını listeler
 *     tags: [Accidents]
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
 *         description: Dosya listesi
 */
router.get('/:id/files', authenticate, authorize(PERMISSIONS.ACCIDENTS.VIEW), getAccidentFiles);

export default router;
