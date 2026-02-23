import express from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { PERMISSIONS } from '../utils/constants';
import { getAllRiskConfig, updateRiskConfig } from '../controllers/riskConfigController';

const router = express.Router();

router.get('/', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), getAllRiskConfig);
router.put('/:key', authenticate, authorize(PERMISSIONS.ADMIN.SETTINGS), updateRiskConfig);

export default router;

