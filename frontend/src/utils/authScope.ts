export const isElevatedRole = (roleInput: unknown): boolean => {
  if (!roleInput) return false;
  const roles: unknown[] = Array.isArray(roleInput) ? roleInput : [roleInput];
  return roles.some((role) => {
    if (typeof role !== 'string') return false;
    const normalized = role.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
    return normalized === 'superadmin' || normalized === 'admin';
  });
};

export const roleMatches = (roleInput: unknown, allowed: readonly string[]): boolean => {
  if (!roleInput) return false;
  const roles: unknown[] = Array.isArray(roleInput) ? roleInput : [roleInput];
  return roles.some((role) => {
    if (typeof role !== 'string') return false;
    const normalized = role.toLowerCase().trim();
    return allowed.some((allowedRole) => {
      const candidate = allowedRole.toLowerCase().trim();
      if (normalized === candidate) return true;
      if (normalized.replace(/\s+/g, '') === candidate.replace(/\s+/g, '')) return true;
      return false;
    });
  });
};
