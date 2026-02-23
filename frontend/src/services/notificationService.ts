import api from './api';
import { Notification } from '../types';

export const notificationService = {
  getNotifications: async (params?: { unreadOnly?: boolean }): Promise<Notification[]> => {
    const response = await api.get<{ notifications: Notification[] }>('/notifications', { params });
    return response.data.notifications;
  },

  markAsRead: async (id: number): Promise<void> => {
    await api.put(`/notifications/${id}/read`);
  },

  markAllAsRead: async (): Promise<void> => {
    await api.put('/notifications/read-all');
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get<{ unreadCount: number }>('/notifications/unread-count');
    return response.data.unreadCount;
  },
};
