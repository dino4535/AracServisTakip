import { Router } from 'express';
import authRoutes from './authRoutes';
import dashboardRoutes from './dashboardRoutes';
import vehicleRoutes from './vehicleRoutes';
import maintenanceRoutes from './maintenanceRoutes';
import insuranceRoutes from './insuranceRoutes';
import fuelRoutes from './fuelRoutes';
import serviceRequestRoutes from './serviceRequestRoutes';
import notificationRoutes from './notificationRoutes';
import adminRoutes from './adminRoutes';
import bulkRoutes from './bulkRoutes';
import reportRoutes from './reportRoutes';
import monthlyKmRoutes from './monthlyKmRoutes';
import riskConfigRoutes from './riskConfigRoutes';
import inspectionRoutes from './inspectionRoutes';
import accidentRoutes from './accidentRoutes';
import auditRoutes from './auditRoutes';
import settingsRoutes from './settingsRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/insurance', insuranceRoutes);
router.use('/inspections', inspectionRoutes);
router.use('/accidents', accidentRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/settings', settingsRoutes);
router.use('/fuel', fuelRoutes);
router.use('/service-requests', serviceRequestRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/bulk', bulkRoutes);
router.use('/reports', reportRoutes);
router.use('/monthly-km', monthlyKmRoutes);
router.use('/risk-config', riskConfigRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Araç Servis Takip API' });
});

export default router;
