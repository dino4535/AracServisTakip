// Yetki modeli (iş kuralı):
//   SUPERADMIN          -> tüm uygulama; şirket/depo sınırı YOK
//   ADMIN               -> şirket admini; tanımlı şirket(ler) + tanımlı depolar
//   MANAGER             -> yönetici; tanımlı şirket(ler) + tanımlı depolar
//   VIEWER / DRIVER     -> kullanıcı; tanımlı şirket(ler) + tanımlı depolar
// Bu nedenle "elevated" (kapsamsız) sayılan TEK rol SUPERADMIN'dir. ADMIN dahil
// diğer tüm roller şirket ve depo kapsamına tabidir.
export const normalizeRole = (role?: string): string =>
  (role || '').toLowerCase().replace(/[\s-]+/g, '');

export const isElevatedRole = (role?: string): boolean => normalizeRole(role) === 'superadmin';

// Anlamı netleştirmek için alias: sınırsız erişim yalnızca SUPERADMIN'e aittir.
export const isSuperAdmin = isElevatedRole;

// Rol önceliği: çoklu rolü olan kullanıcının "en yetkili" rolünü seçmek için kullanılır.
const ROLE_PRIORITY: Record<string, number> = {
  superadmin: 1,
  admin: 2,
  manager: 3,
  viewer: 4,
  driver: 5,
};

export const rolePriority = (role?: string): number => ROLE_PRIORITY[normalizeRole(role)] ?? 99;

export const pickPrimaryRole = (roles: Array<string | null | undefined>): string | undefined =>
  roles
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    .sort((a, b) => rolePriority(a) - rolePriority(b))[0];

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
  alias = 'v',
  companyParam = '@CompanyID'
): string => {
  if (isElevatedRole(role)) return '1=1';
  const col = alias ? `${alias}.CompanyID` : 'CompanyID';
  const inUserCompanies = `${col} IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID)`;
  if (companyID != null) return `(${col} = ${companyParam} OR ${inUserCompanies})`;
  return `(${inUserCompanies})`;
};

// Depo kapsamı SQL koşulu. Kullanıcının depo ataması yoksa depo filtresi uygulanmaz;
// atama varsa yalnızca bu depolar kapsama girer. Deposu tanımsız (NULL) araçlar her
// zaman şirket kapsamı üzerinden görünür kalır (aksi halde araç kimseye görünmüyordu).
// depotIds verilmezse koşul yalnızca @UserID parametresiyle üretilir.
export const depotScopeSql = (alias = 'v', depotIds?: number[]): string => {
  const col = alias ? `${alias}.DepotID` : 'DepotID';
  if (depotIds) {
    if (depotIds.length === 0) return '1=1';
    return `(${col} IN (${depotIds.join(',')}) OR ${col} IS NULL)`;
  }
  return `(NOT EXISTS (SELECT 1 FROM UserDepots WHERE UserID = @UserID)
    OR ${col} IN (SELECT DepotID FROM UserDepots WHERE UserID = @UserID)
    OR ${col} IS NULL)`;
};

// Liste/aggregate sorguları için erişim koşulu: şirket kapsamı HER zaman geçerlidir,
// depo ataması bu kapsamı şirket içinde daraltır. Eski davranışta depo filtresi şirket
// filtresinin YERİNE geçiyordu; bu yüzden başka şirkete ait depoya atanan araçlar
// farklı şirketin kullanıcılarına görünüyor ve ADMIN tüm şirketleri görüyordu.
export const buildAccessCondition = (
  role: string | undefined,
  companyID: number | null | undefined,
  depotIds?: number[],
  alias = 'v',
  companyParam = '@CompanyID'
): string => {
  if (isElevatedRole(role)) return '1=1';
  const company = companyScopeSql(role, companyID, alias, companyParam);
  return `(${company} AND ${depotScopeSql(alias, depotIds)})`;
};
