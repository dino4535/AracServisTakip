import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { getMonthlyKm, saveMonthlyKm, getVehicleKmHistory } from '../controllers/monthlyKmController';
import { PERMISSIONS } from '../utils/constants';

const router = Router();

router.use(authenticate);

router.get('/', getMonthlyKm);
router.post('/', authorize(PERMISSIONS.VEHICLES.EDIT), saveMonthlyKm);
router.get('/:vehicleId/history', getVehicleKmHistory);

export default router;