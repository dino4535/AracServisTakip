import { Request, Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../services/auditService';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, surname, email, password, companyId } = req.body;

    if (!name || !surname || !email || !password) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const pool = await connectDB();

    const existingUser = await pool
      .request()
      .input('Email', sql.NVarChar(100), email)
      .query('SELECT UserID FROM Users WHERE Email = @Email');

    if (existingUser.recordset.length > 0) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }

    const passwordHash = hashPassword(password);

    const result = await pool
      .request()
      .input('Name', sql.NVarChar(100), name)
      .input('Surname', sql.NVarChar(100), surname)
      .input('Email', sql.NVarChar(100), email)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .input('CompanyID', sql.Int, companyId || null)
      .query(`
        INSERT INTO Users (Name, Surname, Email, PasswordHash, CompanyID)
        OUTPUT inserted.UserID, inserted.Name, inserted.Surname, inserted.Email, inserted.CompanyID
        VALUES (@Name, @Surname, @Email, @PasswordHash, @CompanyID)
      `);

    const user = result.recordset[0];

    const token = generateToken({
      UserID: user.UserID,
      Email: user.Email,
      Name: user.Name,
      CompanyID: user.CompanyID,
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        UserID: user.UserID,
        Name: user.Name,
        Surname: user.Surname,
        Email: user.Email,
      },
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const pool = await connectDB();

    const result = await pool
      .request()
      .input('Email', sql.NVarChar(100), email)
      .query(`
        SELECT 
          u.UserID, u.Name, u.Surname, u.Email, u.PasswordHash, u.IsActive, u.CompanyID,
          STRING_AGG(r.Name, ',') as Roles
        FROM Users u
        LEFT JOIN UserRoles ur ON u.UserID = ur.UserID
        LEFT JOIN Roles r ON ur.RoleID = r.RoleID
        WHERE u.Email = @Email
        GROUP BY u.UserID, u.Name, u.Surname, u.Email, u.PasswordHash, u.IsActive, u.CompanyID
      `);

    if (result.recordset.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.recordset[0];

    if (!user.IsActive) {
      res.status(401).json({ error: 'Account is inactive' });
      return;
    }

    const isValidPassword = verifyPassword(password, user.PasswordHash);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({
      UserID: user.UserID,
      Email: user.Email,
      Name: user.Name,
      CompanyID: user.CompanyID,
    });

    // Get permissions
    const permissionsResult = await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .query(`
        SELECT DISTINCT p.PermissionCode
        FROM Users u
        JOIN UserRoles ur ON u.UserID = ur.UserID
        JOIN RolePermissions rp ON ur.RoleID = rp.RoleID
        JOIN Permissions p ON rp.PermissionID = p.PermissionID
        WHERE u.UserID = @UserID
      `);
      
    const permissions = permissionsResult.recordset.map((row: any) => row.PermissionCode);

    // Log Audit
    await logAudit(
      user.UserID,
      'LOGIN',
      'Users',
      user.UserID,
      { email: user.Email },
      req.ip || '0.0.0.0'
    );

    res.json({
      message: 'Login successful',
      user: {
        UserID: user.UserID,
        Name: user.Name,
        Surname: user.Surname,
        Email: user.Email,
        Roles: user.Roles ? user.Roles.split(',') : [],
      },
      permissions,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();

    const result = await pool
      .request()
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 
          u.UserID, u.Name, u.Surname, u.Email, u.CompanyID,
          c.Name as CompanyName,
          STRING_AGG(r.Name, ',') as Roles
        FROM Users u
        LEFT JOIN Companies c ON u.CompanyID = c.CompanyID
        LEFT JOIN UserRoles ur ON u.UserID = ur.UserID
        LEFT JOIN Roles r ON ur.RoleID = r.RoleID
        WHERE u.UserID = @UserID
        GROUP BY u.UserID, u.Name, u.Surname, u.Email, u.CompanyID, c.Name
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.recordset[0];

    res.json({
      user: {
        UserID: user.UserID,
        Name: user.Name,
        Surname: user.Surname,
        Email: user.Email,
        CompanyID: user.CompanyID,
        CompanyName: user.CompanyName,
        Roles: user.Roles ? user.Roles.split(',') : [],
      },
      permissions: req.user?.Permissions || [],
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPermissions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({
      permissions: req.user?.Permissions || [],
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
