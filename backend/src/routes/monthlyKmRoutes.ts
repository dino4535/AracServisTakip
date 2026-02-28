import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { getMonthlyKm, saveMonthlyKm, getVehicleKmHistory, importMonthlyKm } from '../controllers/monthlyKmController';
import { PERMISSIONS } from '../utils/constants';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.get('/', getMonthlyKm);
router.post('/', authorize(PERMISSIONS.VEHICLES.EDIT), saveMonthlyKm);
router.post('/import', authorize(PERMISSIONS.VEHICLES.EDIT), upload.single('file'), importMonthlyKm);
router.get('/:vehicleId/history', getVehicleKmHistory);

export default router;