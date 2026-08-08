export const isElevatedRole = (role?: string): boolean => {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
  return normalized === 'superadmin' || normalized === 'admin';
};

export const roleMatches = (role: string | undefined, allowed: readonly string[]): boolean => {
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  return allowed.some((allowedRole) => {
    const candidate = allowedRole.toLowerCase().trim();
    if (normalized === candidate) return true;
    if (normalized.replace(/\s+/g, '') === candidate.replace(/\s+/g, '')) return true;
    return false;
  });
};
