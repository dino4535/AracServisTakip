import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const { user, permissions, isAuthenticated, login, logout, fetchProfile, checkPermission } = useAuthStore();

  return {
    user,
    permissions,
    isAuthenticated,
    login,
    logout,
    fetchProfile,
    hasPermission: checkPermission,
  };
};
