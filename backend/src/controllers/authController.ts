import { Request, Response } from 'express';
import crypto from 'crypto';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../services/auditService';
import { sendEmail } from '../services/emailService';

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

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const pool = await connectDB();

    const userResult = await pool
      .request()
      .input('Email', sql.NVarChar(100), email)
      .query(`
        SELECT UserID, Email, Name, Surname
        FROM Users
        WHERE Email = @Email AND IsActive = 1
      `);

    if (userResult.recordset.length === 0) {
      res.json({
        message: 'If an account with this email exists, a reset link has been sent',
      });
      return;
    }

    const user = userResult.recordset[0];

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .query(`
        UPDATE PasswordResetTokens
        SET Used = 1, UsedAt = GETDATE()
        WHERE UserID = @UserID AND Used = 0
      `);

    await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .input('Token', sql.NVarChar(200), token)
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO PasswordResetTokens (UserID, Token, ExpiresAt)
        VALUES (@UserID, @Token, @ExpiresAt)
      `);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4010';
    const resetLink = `${frontendUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;

    const fullName = [user.Name, user.Surname].filter(Boolean).join(' ') || 'Kullanıcı';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
          Şifre Sıfırlama Talebi
        </h2>
        <p>Sayın ${fullName},</p>
        <p>Hesabınız için bir şifre sıfırlama talebi alındı. Yeni bir şifre belirlemek için aşağıdaki butona tıklayın.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="display: inline-block; background-color: #3498db; color: #fff; padding: 12px 24px; border-radius: 4px; text-decoration: none;">
            Şifremi Sıfırla
          </a>
        </p>
        <p>Eğer buton çalışmazsa, aşağıdaki bağlantıyı tarayıcınıza yapıştırabilirsiniz:</p>
        <p style="word-break: break-all; font-size: 12px; color: #555;">${resetLink}</p>
        <p style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
          Bu bağlantı 1 saat süreyle geçerlidir. Eğer bu talebi siz oluşturmadıysanız, bu e-postayı dikkate almayabilirsiniz.
        </p>
      </div>
    `;

    await sendEmail(
      user.Email,
      'Şifre Sıfırlama Talebi',
      emailContent
    );

    await logAudit(
      user.UserID,
      'FORGOT_PASSWORD_REQUEST',
      'Users',
      user.UserID,
      { email: user.Email },
      req.ip || '0.0.0.0'
    );

    res.json({
      message: 'If an account with this email exists, a reset link has been sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: 'Token and password are required' });
      return;
    }

    const pool = await connectDB();

    const tokenResult = await pool
      .request()
      .input('Token', sql.NVarChar(200), token)
      .query(`
        SELECT TOP 1 t.TokenID, t.UserID, t.ExpiresAt, t.Used, u.Email
        FROM PasswordResetTokens t
        JOIN Users u ON t.UserID = u.UserID
        WHERE t.Token = @Token
      `);

    if (tokenResult.recordset.length === 0) {
      res.status(400).json({ error: 'Invalid or expired reset link' });
      return;
    }

    const tokenRow = tokenResult.recordset[0];

    if (tokenRow.Used || new Date(tokenRow.ExpiresAt) < new Date()) {
      res.status(400).json({ error: 'Invalid or expired reset link' });
      return;
    }

    const passwordHash = hashPassword(password);

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      await transaction
        .request()
        .input('UserID', sql.Int, tokenRow.UserID)
        .input('PasswordHash', sql.NVarChar(255), passwordHash)
        .query(`
          UPDATE Users
          SET PasswordHash = @PasswordHash,
              UpdatedAt = GETDATE()
          WHERE UserID = @UserID
        `);

      await transaction
        .request()
        .input('TokenID', sql.Int, tokenRow.TokenID)
        .query(`
          UPDATE PasswordResetTokens
          SET Used = 1,
              UsedAt = GETDATE()
          WHERE TokenID = @TokenID
        `);

      await transaction.commit();
    } catch (txError) {
      await transaction.rollback();
      throw txError;
    }

    await logAudit(
      tokenRow.UserID,
      'RESET_PASSWORD',
      'Users',
      tokenRow.UserID,
      { email: tokenRow.Email },
      req.ip || '0.0.0.0'
    );

    try {
      await sendEmail(
        tokenRow.Email,
        'Şifreniz Güncellendi',
        `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
            Şifre Güncellemesi
          </h2>
          <p>Hesabınızın şifresi başarıyla güncellenmiştir.</p>
          <p>Eğer bu işlemi siz yapmadıysanız, lütfen sistem yöneticiniz ile iletişime geçin.</p>
        </div>
        `
      );
    } catch (emailError) {
      console.error('Reset password confirmation email error:', emailError);
    }

    res.json({
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
