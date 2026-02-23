import { useAuthStore } from '../store/authStore';
import { PERMISSIONS } from '../types';

export const usePermissions = () => {
  const { permissions, user } = useAuthStore();

  const isSuperAdmin = (() => {
    if (!user?.Roles) return false;
    if (Array.isArray(user.Roles)) {
      return user.Roles.some(role => role === 'SuperAdmin' || role === 'Super Admin');
    }
    // Fallback if Roles is a string (legacy/bug)
    if (typeof user.Roles === 'string') {
      return user.Roles === 'SuperAdmin' || user.Roles === 'Super Admin';
    }
    return false;
  })();

  const hasPermission = (permission: string) => {
    if (isSuperAdmin) return true;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: string[]) => {
    if (isSuperAdmin) return true;
    return permissionList.some((p) => permissions.includes(p));
  };

  const hasAllPermissions = (permissionList: string[]) => {
    if (isSuperAdmin) return true;
    return permissionList.every((p) => permissions.includes(p));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions,
    PERMISSIONS,
    isSuperAdmin,
  };
};

export { PERMISSIONS };
