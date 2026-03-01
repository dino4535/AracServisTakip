import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';

export const useSocketNotifications = () => {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data: { title: string; message: string; type?: 'success' | 'error' | 'info' }) => {
      const { title, message, type = 'info' } = data;
      
      switch (type) {
        case 'success':
          toast.success(`${title}: ${message}`);
          break;
        case 'error':
          toast.error(`${title}: ${message}`);
          break;
        default:
          toast(`${title}: ${message}`, {
            icon: '🔔',
          });
      }
    };

    socket.on('notification', handleNotification);

    return () => {
      socket.off('notification', handleNotification);
    };
  }, [socket]);
};
