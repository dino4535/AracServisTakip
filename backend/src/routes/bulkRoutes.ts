import { Router } from 'express';
import multer from 'multer';
import { downloadTemplate, exportData, uploadVehicles, uploadInsurance, uploadFuel, uploadDriverMapping, uploadDrivers, uploadMonthlyKm } from '../controllers/bulkController';
import { authenticate } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/template/:type', authenticate, downloadTemplate);
router.get('/data/:type', authenticate, exportData);
router.post('/vehicles', authenticate, upload.single('file'), uploadVehicles);
router.post('/insurance', authenticate, upload.single('file'), uploadInsurance);
router.post('/fuel', authenticate, upload.single('file'), uploadFuel);
router.post('/driver-mapping', authenticate, upload.single('file'), uploadDriverMapping);
router.post('/drivers', authenticate, upload.single('file'), uploadDrivers);
router.post('/monthly-km', authenticate, upload.single('file'), uploadMonthlyKm);

export default router;
