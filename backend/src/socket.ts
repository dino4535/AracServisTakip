import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import logger from './utils/logger';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://77.83.37.229:4010',
        'http://arac.dinogida.com.tr'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`New client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
    
    // Join a room based on user ID or role if needed
    socket.on('join', (room: string) => {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room ${room}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
