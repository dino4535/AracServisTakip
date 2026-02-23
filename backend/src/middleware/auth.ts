import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { connectDB } from '../config/database';
import sql from 'mssql';

export interface AuthRequest extends Request {
  user?: {
    UserID: number;
    Email: string;
    Name: string;
    CompanyID?: number;
    Role?: string;
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

    const pool = await connectDB();
    const result = await pool
      .request()
      .input('UserID', sql.Int, decoded.UserID)
      .query(`
        SELECT 
          u.UserID, u.Email, u.Name, u.Surname, u.IsActive, u.CompanyID,
          r.Name as RoleName,
          STRING_AGG(p.PermissionCode, ',') as Permissions
        FROM Users u
        LEFT JOIN UserRoles ur ON u.UserID = ur.UserID
        LEFT JOIN Roles r ON ur.RoleID = r.RoleID
        LEFT JOIN RolePermissions rp ON ur.RoleID = rp.RoleID
        LEFT JOIN Permissions p ON rp.PermissionID = p.PermissionID
        WHERE u.UserID = @UserID AND u.IsActive = 1
        GROUP BY u.UserID, u.Email, u.Name, u.Surname, u.IsActive, u.CompanyID, r.Name
      `);

    if (result.recordset.length === 0) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    const user = result.recordset[0];
    req.user = {
      UserID: user.UserID,
      Email: user.Email,
      Name: user.Name + ' ' + user.Surname,
      CompanyID: user.CompanyID,
      Role: user.RoleName,
      Permissions: user.Permissions ? user.Permissions.split(',') : [],
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

    const userRole = req.user.Role?.toLowerCase() || '';
    if (userRole === 'superadmin' || userRole === 'super admin') {
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

    if (req.user.Role === 'SuperAdmin' || req.user.Role === 'Super Admin') {
      next();
      return;
    }

    if (!roles.includes(req.user.Role || '')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
