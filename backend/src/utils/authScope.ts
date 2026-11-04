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

// Şirket kapsamı SQL koşulu. Elevated olmayan ve hiçbir şirket kapsamı olmayan
// kullanıcı için koşul boş kümeye düşer (erişim yok) — eski '@CompanyID IS NULL OR'
// kalıbı kapsamı olmayan kullanıcıya TÜM filoyu açıyordu.
export const companyScopeSql = (
  role: string | undefined,
  companyID: number | null | undefined,
  alias = 'v'
): string => {
  if (isElevatedRole(role)) return '1=1';
  const col = alias ? `${alias}.CompanyID` : 'CompanyID';
  const inUserCompanies = `${col} IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID)`;
  if (companyID != null) return `(${col} = @CompanyID OR ${inUserCompanies})`;
  return `(${inUserCompanies})`;
};

// Liste sorguları için erişim koşulu: önce depo, sonra şirket kapsamı.
export const buildAccessCondition = (
  role: string | undefined,
  companyID: number | null | undefined,
  depotIds: number[],
  alias = 'v'
): string => {
  if (isElevatedRole(role)) return '1=1';
  if (depotIds.length > 0) return `${alias}.DepotID IN (${depotIds.join(',')})`;
  return companyScopeSql(role, companyID, alias);
};
