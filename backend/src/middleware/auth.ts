import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { isElevatedRole, roleMatches, pickPrimaryRole } from '../utils/authScope';

export interface AuthRequest extends Request {
  user?: {
    UserID: number;
    Email: string;
    Name: string;
    CompanyID?: number;
    Role?: string;
    Roles: string[];
    Permissions: string[];
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    // Çoklu rolü olan kullanıcılar için TEK satır döner: tüm rollerin izinleri birleştirilir
    // ve en yetkili rol esas alınır. Eski sorgu rol başına bir satır üretip yalnızca
    // recordset[0]'ı kullanıyordu; ORDER BY olmadığı için hangi rolün kazanacağı belirsizdi
    // ve örneğin "Manager, Driver" sahibi bir kullanıcı yalnızca Driver izinleriyle çalışıyordu.
    const pool = await connectDB();
    const result = await pool
      .request()
      .input('UserID', sql.Int, decoded.UserID)
      .query(`
        SELECT 
          u.UserID, u.Email, u.Name, u.Surname, u.IsActive, u.CompanyID,
          (SELECT STRING_AGG(pc.PermissionCode, ',') FROM (
            SELECT DISTINCT p.PermissionCode
            FROM UserRoles ur
            JOIN RolePermissions rp ON ur.RoleID = rp.RoleID
            JOIN Permissions p ON rp.PermissionID = p.PermissionID
            WHERE ur.UserID = u.UserID
          ) pc) AS Permissions,
          (SELECT STRING_AGG(rn.Name, ',') FROM (
            SELECT DISTINCT r.Name
            FROM UserRoles ur
            JOIN Roles r ON ur.RoleID = r.RoleID
            WHERE ur.UserID = u.UserID
          ) rn) AS RoleNames
        FROM Users u
        WHERE u.UserID = @UserID AND u.IsActive = 1
      `);

    if (result.recordset.length === 0) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    const user = result.recordset[0];
    const roles: string[] = user.RoleNames
      ? String(user.RoleNames).split(',').map((r: string) => r.trim()).filter((r: string) => r !== '')
      : [];

    req.user = {
      UserID: user.UserID,
      Email: user.Email,
      Name: user.Name + ' ' + user.Surname,
      CompanyID: user.CompanyID,
      Role: pickPrimaryRole(roles),
      Roles: roles,
      Permissions: user.Permissions
        ? String(user.Permissions).split(',').map((p: string) => p.trim()).filter((p: string) => p !== '')
        : [],
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authorize = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Yalnızca SUPERADMIN izin kontrolünden muaftır; ADMIN dahil diğer roller
    // açık izin kayıtlarına tabidir.
    if (isElevatedRole(req.user.Role)) {
      next();
      return;
    }

    if (!req.user.Permissions.includes(permission)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export const authorizeRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (isElevatedRole(req.user.Role)) {
      next();
      return;
    }

    // Çoklu rolü olan kullanıcı, rollerinden herhangi biri listede ise erişir.
    if (!req.user.Roles.some((role) => roleMatches(role, roles))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
