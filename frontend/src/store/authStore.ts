import { create } from 'zustand';
import { User } from '../types';
import { authService } from '../services/authService';

interface AuthState {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  checkPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: authService.getCurrentUser(),
  permissions: [],
  isAuthenticated: !!authService.getToken(),

  login: async (email: string, password: string) => {
    const data = await authService.login({ email, password });
    set({ user: data.user, isAuthenticated: true, permissions: data.permissions || [] });
    await get().fetchProfile();
  },

  logout: () => {
    authService.logout();
    set({ user: null, permissions: [], isAuthenticated: false });
  },

  fetchProfile: async () => {
    try {
      const data = await authService.getProfile();
      set({ user: data.user, permissions: data.permissions });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  },

  checkPermission: (permission: string) => {
    return get().permissions.includes(permission);
  },
}));
