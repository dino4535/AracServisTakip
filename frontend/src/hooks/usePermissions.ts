import { useAuthStore } from '../store/authStore';
import { PERMISSIONS } from '../types';
import { isElevatedRole } from '../utils/authScope';

export const usePermissions = () => {
  const { permissions, user } = useAuthStore();

  const isSuperAdmin = (() => {
    if (!user?.Roles) return false;
    if (Array.isArray(user.Roles)) {
      return user.Roles.some(role => role === 'SuperAdmin' || role === 'Super Admin');
    }
    if (typeof user.Roles === 'string') {
      return user.Roles === 'SuperAdmin' || user.Roles === 'Super Admin';
    }
    return false;
  })();

  const isElevated = isElevatedRole(user?.Roles);

  const hasPermission = (permission: string) => {
    if (isElevated) return true;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: string[]) => {
    if (isElevated) return true;
    return permissionList.some((p) => permissions.includes(p));
  };

  const hasAllPermissions = (permissionList: string[]) => {
    if (isElevated) return true;
    return permissionList.every((p) => permissions.includes(p));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions,
    PERMISSIONS,
    isSuperAdmin,
    isElevated,
  };
};

export { PERMISSIONS };
