import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { connectDB } from './config/database';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { startReminderCron } from './scheduledJobs/reminderCron';
import { initOpetCron } from './scheduledJobs/opetCron';
import { initTrioCron } from './scheduledJobs/trioCron';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import logger from './utils/logger';
import { apiLimiter } from './middleware/rateLimiter';
import { authenticate, authorizeRole } from './middleware/auth';
import { initSocket } from './socket';

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.io
initSocket(httpServer);

app.use(helmet());

app.use(cors({
  origin: [
    'http://localhost:4010',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://77.83.37.229:4010',
    'http://arac.dinogida.com.tr'
  ],
  credentials: true,
}));

// Apply global rate limiter
app.use(apiLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger Documentation: prod'da yalnızca yetkili (admin) kullanıcılar
const docsGuard = process.env.NODE_ENV === 'production'
  ? [authenticate, authorizeRole(['ADMIN'])]
  : [];
app.use('/api-docs', ...docsGuard, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: { persistAuthorization: true },
}));

app.use('/api', routes);

app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Araç Servis Takip Portalı API',
    version: '1.0.0',
    status: 'running' 
  });
});

app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    
    startReminderCron();
    initOpetCron();
    initTrioCron();
    
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📊 API: http://localhost:${PORT}/api`);
      logger.info(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
      logger.info(`❤️  Health Check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
