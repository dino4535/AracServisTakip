import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { hashPassword } from '../utils/password';
import crypto from 'crypto';
import { sendEmail } from '../services/emailService';
import { logAudit } from '../services/auditService';
import { isElevatedRole, companyScopeSql, pickPrimaryRole, rolePriority } from '../utils/authScope';
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * (limitNum > 0 ? limitNum : 0);

    const pool = await connectDB();

    let whereClause = ' WHERE u.IsActive = 1';
    // SUPERADMIN tüm kullanıcıları görür; ADMIN (şirket admini) ve diğer roller yalnızca
    // kendi şirket(ler)inin kullanıcılarını görür. Şirket kapsamı olmayan kullanıcı için
    // koşul boş kümeye düşer (eski davranışta filtre hiç eklenmiyor ve tüm liste görünüyordu).
    const elevated = isElevatedRole(req.user?.Role);
    if (!elevated) {
      whereClause += ` AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'u')}`;
    }

    if (search) {
      whereClause += ` AND (
        u.Name LIKE '%' + @SearchTerm + '%' OR
        u.Surname LIKE '%' + @SearchTerm + '%' OR
        u.Email LIKE '%' + @SearchTerm + '%' OR
        c.Name LIKE '%' + @SearchTerm + '%' OR
        r.Name LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const baseFromClause = `
      FROM Users u
      LEFT JOIN Companies c ON u.CompanyID = c.CompanyID
      LEFT JOIN Users m ON u.ManagerID = m.UserID
      LEFT JOIN UserRoles ur ON u.UserID = ur.UserID
      LEFT JOIN Roles r ON ur.RoleID = r.RoleID
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT u.UserID) as total
      ${baseFromClause}
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        u.UserID, u.Name, u.Surname, u.Email, u.IsActive, u.CompanyID, u.ManagerID,
        c.Name as CompanyName,
        CONCAT(m.Name, ' ', m.Surname) as ManagerName,
        STRING_AGG(r.Name, ',') as Roles
      ${baseFromClause}
      ${whereClause}
      GROUP BY u.UserID, u.Name, u.Surname, u.Email, u.IsActive, u.CompanyID, u.ManagerID, c.Name, m.Name, m.Surname
      ORDER BY u.UserID DESC
      ${limitNum > 0 ? 'OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY' : ''}
    `;

    const request = pool.request();
    
    if (!elevated) {
      if (req.user?.CompanyID != null) {
        request.input('CompanyID', sql.Int, req.user.CompanyID);
      }
      request.input('UserID', sql.Int, req.user?.UserID);
    }
    if (search) {
      request.input('SearchTerm', sql.NVarChar(100), search);
    }
    
    if (limitNum > 0) {
      request.input('Offset', sql.Int, offset);
      request.input('Limit', sql.Int, limitNum);
    }

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const users = (result.recordsets as any)[1];

    res.json({ 
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum > 0 ? limitNum : total,
        totalPages: limitNum > 0 ? Math.ceil(total / limitNum) : 1
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    const result = await pool
      .request()
      .input('UserID', sql.Int, id)
      .query(`
        SELECT 
          u.UserID, u.Name, u.Surname, u.Email, u.IsActive, u.CompanyID, u.ManagerID,
          c.Name as CompanyName,
          CONCAT(m.Name, ' ', m.Surname) as ManagerName,
          STRING_AGG(r.Name, ',') as Roles,
          STRING_AGG(CAST(r.RoleID AS VARCHAR), ',') as RoleIDs
        FROM Users u
        LEFT JOIN Companies c ON u.CompanyID = c.CompanyID
        LEFT JOIN Users m ON u.ManagerID = m.UserID
        LEFT JOIN UserRoles ur ON u.UserID = ur.UserID
        LEFT JOIN Roles r ON ur.RoleID = r.RoleID
        WHERE u.UserID = @UserID
        GROUP BY u.UserID, u.Name, u.Surname, u.Email, u.IsActive, u.CompanyID, u.ManagerID, c.Name, m.Name, m.Surname
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get User Companies
    const companyResult = await pool
      .request()
      .input('UserID', sql.Int, id)
      .query('SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID');

    const user = result.recordset[0];
    user.companyIds = companyResult.recordset.map((r: any) => r.CompanyID);

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Elevated olmayan çağırıcılar elevated rol (ADMIN/SUPERADMIN) atayamaz → dikey yetki escalation engeli.
// Not: ADMIN artık elevated sayılmıyor (şirket admini), bu yüzden ADMIN/SUPERADMIN rollerini
// yalnızca SUPERADMIN atayabilir.
const assertCanAssignRoles = async (
  pool: sql.ConnectionPool,
  roleIds: unknown,
  callerRole?: string
): Promise<string | null> => {
  if (isElevatedRole(callerRole)) return null;
  const ids = Array.isArray(roleIds)
    ? [...new Set(roleIds.map((r: unknown) => Number(r)).filter((n: number) => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length === 0) return null;
  const r = await pool
    .request()
    .query(`SELECT COUNT(*) AS C FROM Roles WHERE RoleID IN (${ids.join(',')}) AND LOWER(LTRIM(RTRIM(Name))) IN ('admin', 'superadmin')`);
  return r.recordset[0].C > 0 ? 'Elevated roles can only be assigned by an administrator' : null;
};

// Çağırıcının şirket kapsamı: kendi CompanyID'i + UserCompanies kayıtları.
const getCallerCompanyIds = async (
  pool: sql.ConnectionPool,
  caller?: AuthRequest['user']
): Promise<number[]> => {
  if (!caller?.UserID) return [];
  const r = await pool
    .request()
    .input('UserID', sql.Int, caller.UserID)
    .query('SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID');
  const ids: number[] = r.recordset
    .map((row: any) => row.CompanyID)
    .filter((c: any) => c !== null && c !== undefined);
  if (caller.CompanyID !== null && caller.CompanyID !== undefined) ids.push(caller.CompanyID);
  return [...new Set(ids)];
};

// Kullanıcı yönetimi (oluşturma/güncelleme/pasife alma/depo atama) için kapsam kontrolü:
// SUPERADMIN sınırsız; ADMIN ve diğer roller yalnızca kendi şirket kapsamındaki kullanıcıları
// yönetebilir ve yeni şirket atamalarını yalnızca kendi şirketleri arasından seçebilir.
// Ayrıca kendinden daha yetkili role sahip kullanıcıları yönetemez.
const assertCanManageUser = async (
  pool: sql.ConnectionPool,
  caller: AuthRequest['user'],
  targetUserId?: unknown,
  requestedCompanyIds: unknown[] = []
): Promise<string | null> => {
  if (isElevatedRole(caller?.Role)) return null;

  const scope = await getCallerCompanyIds(pool, caller);
  if (scope.length === 0) {
    return 'Your account has no company scope; user management is not allowed';
  }

  const requested = [
    ...new Set(
      (Array.isArray(requestedCompanyIds) ? requestedCompanyIds : [])
        .map((c: unknown) => Number(c))
        .filter((n: number) => Number.isInteger(n) && n > 0)
    ),
  ];
  if (requested.some((cid) => !scope.includes(cid))) {
    return 'You can only assign companies within your own company scope';
  }

  if (targetUserId === null || targetUserId === undefined || targetUserId === '') return null;
  const targetId = Number(targetUserId);
  if (!Number.isInteger(targetId) || targetId <= 0) return null;

  const targetResult = await pool
    .request()
    .input('TargetUserID', sql.Int, targetId)
    .query(`
      SELECT u.UserID, u.CompanyID,
        (SELECT STRING_AGG(rn.Name, ',') FROM (
          SELECT DISTINCT r.Name FROM UserRoles ur JOIN Roles r ON ur.RoleID = r.RoleID WHERE ur.UserID = u.UserID
        ) rn) AS RoleNames
      FROM Users u WHERE u.UserID = @TargetUserID
    `);
  if (targetResult.recordset.length === 0) return null; // 404 akışı çağıran tarafta yönetilir

  const target = targetResult.recordset[0];
  const callerPriority = rolePriority(pickPrimaryRole(caller?.Roles ?? [caller?.Role]));
  const targetPriority = rolePriority(
    pickPrimaryRole(target.RoleNames ? String(target.RoleNames).split(',') : [])
  );
  if (targetPriority < callerPriority) {
    return 'You cannot manage a user with a higher role';
  }

  const targetCompanies: number[] = [];
  if (target.CompanyID !== null && target.CompanyID !== undefined) targetCompanies.push(target.CompanyID);
  const targetCompanyResult = await pool
    .request()
    .input('TargetUserID', sql.Int, targetId)
    .query('SELECT CompanyID FROM UserCompanies WHERE UserID = @TargetUserID');
  targetCompanyResult.recordset.forEach((row: any) => {
    if (row.CompanyID !== null && row.CompanyID !== undefined) targetCompanies.push(row.CompanyID);
  });

  // Şirket kapsamı olmayan kullanıcılar yalnızca SUPERADMIN tarafından yönetilebilir
  // (aksi halde sahipsiz hesaplar üzerinden yetki yükseltme riski doğar).
  if (targetCompanies.length === 0) {
    return 'Target user has no company scope; only a super administrator can manage it';
  }
  if (!targetCompanies.some((c) => scope.includes(c))) {
    return 'You can only manage users within your own company scope';
  }

  return null;
};

// Depo yönetimi: SUPERADMIN sınırsız; ADMIN ve diğer roller yalnızca kendi şirket
// kapsamındaki depoları oluşturabilir/güncelleyebilir/silebilir.
const assertCanManageDepot = async (
  pool: sql.ConnectionPool,
  caller: AuthRequest['user'],
  requestedCompanyId?: unknown,
  depotId?: unknown
): Promise<string | null> => {
  if (isElevatedRole(caller?.Role)) return null;

  const scope = await getCallerCompanyIds(pool, caller);
  if (scope.length === 0) {
    return 'Your account has no company scope; depot management is not allowed';
  }

  const hasRequestedCompany =
    requestedCompanyId !== undefined && requestedCompanyId !== null && requestedCompanyId !== '';
  if (hasRequestedCompany) {
    const requested = Number(requestedCompanyId);
    if (!Number.isInteger(requested) || !scope.includes(requested)) {
      return 'You can only manage depots within your own company scope';
    }
  }

  const idNum = Number(depotId);
  if (depotId !== undefined && depotId !== null && depotId !== '' && Number.isInteger(idNum) && idNum > 0) {
    const r = await pool
      .request()
      .input('DepotID', sql.Int, idNum)
      .query('SELECT CompanyID FROM Depots WHERE DepotID = @DepotID');
    if (r.recordset.length > 0) {
      const cid = r.recordset[0].CompanyID;
      if (cid === null || cid === undefined || !scope.includes(cid)) {
        return 'You can only manage depots within your own company scope';
      }
    }
  }

  return null;
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, surname, email, password, companyId, managerId, roleIds, companyIds } = req.body;

    if (!name || !surname || !email || !password) {
      res.status(400).json({ error: 'Name, surname, email, and password are required' });
      return;
    }

    const pool = await connectDB();

    const existingEmail = await pool
      .request()
      .input('Email', sql.NVarChar(100), email)
      .query('SELECT UserID FROM Users WHERE Email = @Email');

    if (existingEmail.recordset.length > 0) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }

    const roleAssignError = await assertCanAssignRoles(pool, roleIds, req.user?.Role);
    if (roleAssignError) {
      res.status(403).json({ error: roleAssignError });
      return;
    }

    const createScopeError = await assertCanManageUser(pool, req.user, null, [
      companyId,
      ...(Array.isArray(companyIds) ? companyIds : []),
    ]);
    if (createScopeError) {
      res.status(403).json({ error: createScopeError });
      return;
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const passwordHash = await hashPassword(password);
      const userResult = await transaction
        .request()
        .input('Name', sql.NVarChar(100), name)
        .input('Surname', sql.NVarChar(100), surname)
        .input('Email', sql.NVarChar(100), email)
        .input('PasswordHash', sql.NVarChar(255), passwordHash)
        .input('CompanyID', sql.Int, companyId || req.user?.CompanyID || null)
        .input('ManagerID', sql.Int, managerId || null)
        .query(`
          INSERT INTO Users (Name, Surname, Email, PasswordHash, CompanyID, ManagerID)
          OUTPUT inserted.UserID
          VALUES (@Name, @Surname, @Email, @PasswordHash, @CompanyID, @ManagerID)
        `);

      const userId = userResult.recordset[0].UserID;

      if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
          await transaction
            .request()
            .input('UserID', sql.Int, userId)
            .input('RoleID', sql.Int, roleId)
            .query(`
              INSERT INTO UserRoles (UserID, RoleID)
              VALUES (@UserID, @RoleID)
            `);
        }
      }

      // Handle multiple companies
      if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
        for (const cid of companyIds) {
          await transaction
            .request()
            .input('UserID', sql.Int, userId)
            .input('CompanyID', sql.Int, cid)
            .query(`
              INSERT INTO UserCompanies (UserID, CompanyID)
              VALUES (@UserID, @CompanyID)
            `);
        }
      } else if (companyId) {
        // Fallback: if only single companyId provided, ensure it's in UserCompanies
        await transaction
            .request()
            .input('UserID', sql.Int, userId)
            .input('CompanyID', sql.Int, companyId)
            .query(`
              INSERT INTO UserCompanies (UserID, CompanyID)
              VALUES (@UserID, @CompanyID)
            `);
      }

      await transaction.commit();

      res.status(201).json({
        message: 'User created successfully',
        userId,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, surname, email, isActive, companyId, roleIds, managerId, companyIds } = req.body;

    const pool = await connectDB();

    if (email) {
      const existingEmail = await pool
        .request()
        .input('Email', sql.NVarChar(100), email)
        .input('UserID', sql.Int, id)
        .query('SELECT UserID FROM Users WHERE Email = @Email AND UserID <> @UserID');

      if (existingEmail.recordset.length > 0) {
        res.status(400).json({ error: 'Email already exists' });
        return;
      }
    }

    const roleAssignError = await assertCanAssignRoles(pool, roleIds, req.user?.Role);
    if (roleAssignError) {
      res.status(403).json({ error: roleAssignError });
      return;
    }

    const updateScopeError = await assertCanManageUser(pool, req.user, id, [
      companyId,
      ...(Array.isArray(companyIds) ? companyIds : []),
    ]);
    if (updateScopeError) {
      res.status(403).json({ error: updateScopeError });
      return;
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      await transaction
        .request()
        .input('UserID', sql.Int, id)
        .input('Name', sql.NVarChar(100), name)
        .input('Surname', sql.NVarChar(100), surname)
        .input('Email', sql.NVarChar(100), email)
        .input('IsActive', sql.Bit, isActive !== undefined ? isActive : 1)
        .input('CompanyID', sql.Int, companyId || null)
        .input('ManagerID', sql.Int, managerId || null)
        .query(`
          UPDATE Users
          SET Name = @Name,
              Surname = @Surname,
              Email = @Email,
              IsActive = @IsActive,
              CompanyID = @CompanyID,
              ManagerID = @ManagerID,
              UpdatedAt = GETDATE()
          WHERE UserID = @UserID
        `);

      await transaction
        .request()
        .input('UserID', sql.Int, id)
        .query('DELETE FROM UserRoles WHERE UserID = @UserID');

      if (roleIds && Array.isArray(roleIds) && roleIds.length > 0) {
        // Dedup and validate
        const uniqueRoleIds = [...new Set(roleIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0))];

        for (const roleId of uniqueRoleIds) {
          await transaction
            .request()
            .input('UserID', sql.Int, id)
            .input('RoleID', sql.Int, roleId)
            .query(`
              INSERT INTO UserRoles (UserID, RoleID)
              VALUES (@UserID, @RoleID)
            `);
        }
      }

      // Handle multiple companies
      // First delete existing assignments
      await transaction
        .request()
        .input('UserID', sql.Int, id)
        .query('DELETE FROM UserCompanies WHERE UserID = @UserID');

      if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
        // Dedup and validate
        const uniqueCompanyIds = [...new Set(companyIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0))];
        
        for (const cid of uniqueCompanyIds) {
          await transaction
            .request()
            .input('UserID', sql.Int, id)
            .input('CompanyID', sql.Int, cid)
            .query(`
              INSERT INTO UserCompanies (UserID, CompanyID)
              VALUES (@UserID, @CompanyID)
            `);
        }
      } else if (companyId) {
        // Fallback: if only single companyId provided, ensure it's in UserCompanies
        await transaction
            .request()
            .input('UserID', sql.Int, id)
            .input('CompanyID', sql.Int, companyId)
            .query(`
              INSERT INTO UserCompanies (UserID, CompanyID)
              VALUES (@UserID, @CompanyID)
            `);
      }

      await transaction.commit();

      res.json({ message: 'User updated successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkUpdateManagers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userIds, managerId } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'User IDs array is required' });
      return;
    }

    const pool = await connectDB();
    
    // Validate and convert IDs to numbers
    const validUserIds = userIds
      .map(id => Number(id))
      .filter(id => !isNaN(id) && id > 0)
      .join(',');
    
    if (!validUserIds) {
       res.status(400).json({ error: 'Invalid user IDs' });
       return;
    }

    await pool.request()
      .input('ManagerID', sql.Int, managerId || null)
      .query(`
        UPDATE Users
        SET ManagerID = @ManagerID, UpdatedAt = GETDATE()
        WHERE UserID IN (${validUserIds})
      `);

    res.json({ message: 'Users updated successfully' });
  } catch (error) {
    console.error('Bulk update managers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const pool = await connectDB();

    const deleteScopeError = await assertCanManageUser(pool, req.user, id);
    if (deleteScopeError) {
      res.status(403).json({ error: deleteScopeError });
      return;
    }

    const result = await pool
      .request()
      .input('UserID', sql.Int, Number(id))
      .query(`
        UPDATE Users
        SET IsActive = 0,
            UpdatedAt = GETDATE()
        OUTPUT inserted.UserID
        WHERE UserID = @UserID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllRoles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const result = await pool
      .request()
      .query(`
        SELECT 
          r.*,
          STRING_AGG(p.PermissionCode, ',') as Permissions,
          STRING_AGG(CAST(p.PermissionID as nvarchar(20)), ',') as PermissionIDs
        FROM Roles r
        LEFT JOIN RolePermissions rp ON r.RoleID = rp.RoleID
        LEFT JOIN Permissions p ON rp.PermissionID = p.PermissionID
        GROUP BY r.RoleID, r.Name, r.Description, r.CreatedAt, r.UpdatedAt
      `);

    res.json({ roles: result.recordset });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, permissionIds } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const roleResult = await transaction
        .request()
        .input('Name', sql.NVarChar(50), name)
        .input('Description', sql.NVarChar(255), description || null)
        .query(`
          INSERT INTO Roles (Name, Description)
          OUTPUT inserted.RoleID
          VALUES (@Name, @Description)
        `);

      const roleId = roleResult.recordset[0].RoleID;

      if (permissionIds && permissionIds.length > 0) {
        for (const permissionId of permissionIds) {
          await transaction
            .request()
            .input('RoleID', sql.Int, roleId)
            .input('PermissionID', sql.Int, permissionId)
            .query(`
              INSERT INTO RolePermissions (RoleID, PermissionID)
              VALUES (@RoleID, @PermissionID)
            `);
        }
      }

      await transaction.commit();

      res.status(201).json({
        message: 'Role created successfully',
        roleId,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, permissionIds } = req.body;

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      await transaction
        .request()
        .input('RoleID', sql.Int, id)
        .input('Name', sql.NVarChar(50), name)
        .input('Description', sql.NVarChar(255), description || null)
        .query(`
          UPDATE Roles
          SET Name = @Name,
              Description = @Description,
              UpdatedAt = GETDATE()
          WHERE RoleID = @RoleID
        `);

      await transaction
        .request()
        .input('RoleID', sql.Int, id)
        .query('DELETE FROM RolePermissions WHERE RoleID = @RoleID');

      if (permissionIds && permissionIds.length > 0) {
        for (const permissionId of permissionIds) {
          await transaction
            .request()
            .input('RoleID', sql.Int, id)
            .input('PermissionID', sql.Int, permissionId)
            .query(`
              INSERT INTO RolePermissions (RoleID, PermissionID)
              VALUES (@RoleID, @PermissionID)
            `);
        }
      }

      await transaction.commit();

      res.json({ message: 'Role updated successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    const result = await pool
      .request()
      .input('RoleID', sql.Int, id)
      .query('DELETE FROM Roles OUTPUT deleted.RoleID WHERE RoleID = @RoleID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllPermissions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const result = await pool
      .request()
      .query(`
        SELECT * 
        FROM Permissions
        ORDER BY Module, PermissionCode
      `);

    res.json({ permissions: result.recordset });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllCompanies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();

    // SUPERADMIN tüm şirketleri görür; diğer roller yalnızca kendi şirket kapsamını görür.
    if (isElevatedRole(req.user?.Role)) {
      const result = await pool.request().query('SELECT * FROM Companies WHERE IsActive = 1');
      res.json({ companies: result.recordset });
      return;
    }

    const companyIds = await getCallerCompanyIds(pool, req.user);
    const idList = companyIds.length > 0 ? companyIds.join(',') : '0';
    const result = await pool
      .request()
      .query(`SELECT * FROM Companies WHERE IsActive = 1 AND CompanyID IN (${idList})`);
    res.json({ companies: result.recordset });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllDepots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const pool = await connectDB();

    // SUPERADMIN tüm depoları görür; diğer roller yalnızca kendi şirketlerinin depolarını görür.
    const elevated = isElevatedRole(req.user?.Role);
    const depotScope = elevated ? '1=1' : companyScopeSql(req.user?.Role, req.user?.CompanyID, 'd');

    const countQuery = `SELECT COUNT(*) as total FROM Depots d WHERE ${depotScope}`;
    
    const dataQuery = `
      SELECT d.* FROM Depots d
      WHERE ${depotScope}
      ORDER BY d.DepotID DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request();
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limitNum);
    if (!elevated) {
      if (req.user?.CompanyID != null) {
        request.input('CompanyID', sql.Int, req.user.CompanyID);
      }
      request.input('UserID', sql.Int, req.user?.UserID);
    }

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const depots = (result.recordsets as any)[1];

    res.json({ 
      depots,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get depots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createDepot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, city, address, companyId } = req.body;

    if (!name || !companyId) {
      res.status(400).json({ error: 'Name and CompanyID are required' });
      return;
    }

    const pool = await connectDB();

    const createDepotError = await assertCanManageDepot(pool, req.user, companyId);
    if (createDepotError) {
      res.status(403).json({ error: createDepotError });
      return;
    }

    const result = await pool
      .request()
      .input('Name', sql.NVarChar(100), name)
      .input('City', sql.NVarChar(50), city || null)
      .input('Address', sql.NVarChar(255), address || null)
      .input('CompanyID', sql.Int, companyId)
      .query(`
        INSERT INTO Depots (Name, City, Address, CompanyID)
        OUTPUT inserted.DepotID
        VALUES (@Name, @City, @Address, @CompanyID)
      `);

    res.status(201).json({
      message: 'Depot created successfully',
      depotId: result.recordset[0].DepotID,
    });
  } catch (error) {
    console.error('Create depot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateDepot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, city, address, companyId } = req.body;

    const pool = await connectDB();

    const updateDepotError = await assertCanManageDepot(pool, req.user, companyId, id);
    if (updateDepotError) {
      res.status(403).json({ error: updateDepotError });
      return;
    }

    await pool
      .request()
      .input('DepotID', sql.Int, id)
      .input('Name', sql.NVarChar(100), name)
      .input('City', sql.NVarChar(50), city || null)
      .input('Address', sql.NVarChar(255), address || null)
      .input('CompanyID', sql.Int, companyId)
      .query(`
        UPDATE Depots
        SET Name = @Name,
            City = @City,
            Address = @Address,
            CompanyID = @CompanyID
        WHERE DepotID = @DepotID
      `);

    res.json({ message: 'Depot updated successfully' });
  } catch (error) {
    console.error('Update depot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteDepot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    const deleteDepotError = await assertCanManageDepot(pool, req.user, undefined, id);
    if (deleteDepotError) {
      res.status(403).json({ error: deleteDepotError });
      return;
    }

    const result = await pool
      .request()
      .input('DepotID', sql.Int, id)
      .query('DELETE FROM Depots OUTPUT deleted.DepotID WHERE DepotID = @DepotID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Depot not found' });
      return;
    }

    res.json({ message: 'Depot deleted successfully' });
  } catch (error) {
    console.error('Delete depot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDepotUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Elevated olmayan çağırıcı yalnızca kendi şirketinin deposunu görebilir
    const depotUsersError = await assertCanManageDepot(pool, req.user, undefined, id);
    if (depotUsersError) {
      res.status(403).json({ error: depotUsersError });
      return;
    }

    const result = await pool
      .request()
      .input('DepotID', sql.Int, id)
      .query('SELECT UserID FROM UserDepots WHERE DepotID = @DepotID');
    res.json({ userIds: result.recordset.map((r: any) => r.UserID) });
  } catch (error) {
    console.error('Get depot users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateDepotUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      res.status(400).json({ error: 'userIds must be an array' });
      return;
    }

    const pool = await connectDB();

    // Elevated olmayan çağırıcı yalnızca kendi şirketinin deposunu yönetebilir
    if (!isElevatedRole(req.user?.Role)) {
      const callerCompanyIds = await getCallerCompanyIds(pool, req.user);
      const depotResult = await pool
        .request()
        .input('DepotID', sql.Int, Number(id))
        .query('SELECT DepotID, CompanyID FROM Depots WHERE DepotID = @DepotID');
      if (depotResult.recordset.length === 0) {
        res.status(404).json({ error: 'Depot not found' });
        return;
      }
      const depotCompanyId = depotResult.recordset[0].CompanyID;
      if (depotCompanyId === null || depotCompanyId === undefined || !callerCompanyIds.includes(depotCompanyId)) {
        res.status(403).json({ error: 'You can only manage depots within your own company scope' });
        return;
      }

      // Depoya atanan kullanıcılar da çağırıcının şirket kapsamında olmalıdır;
      // aksi halde başka şirketin kullanıcılarına depo atanabilir.
      const requestedUserIds = [
        ...new Set(userIds.map((u: unknown) => Number(u)).filter((n: number) => Number.isInteger(n) && n > 0)),
      ];
      if (requestedUserIds.length > 0) {
        const scopeList = callerCompanyIds.join(',');
        const targetScope = await pool
          .request()
          .query(`
            SELECT u.UserID,
              (CASE WHEN u.CompanyID IN (${scopeList}) THEN 1 ELSE 0 END)
              + (SELECT COUNT(*) FROM UserCompanies uc WHERE uc.UserID = u.UserID AND uc.CompanyID IN (${scopeList})) AS InScope
            FROM Users u WHERE u.UserID IN (${requestedUserIds.join(',')})
          `);
        if (targetScope.recordset.some((r: any) => Number(r.InScope) === 0)) {
          res.status(403).json({ error: 'You can only assign users within your own company scope' });
          return;
        }
      }
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Delete existing assignments for this depot
      await transaction.request()
        .input('DepotID', sql.Int, id)
        .query('DELETE FROM UserDepots WHERE DepotID = @DepotID');

      // Add new assignments (mükerrer kayıtlar elenir; tabloda UNIQUE(UserID, DepotID) var)
      const uniqueUserIds = [
        ...new Set(
          userIds.map((u: unknown) => Number(u)).filter((n: number) => Number.isInteger(n) && n > 0)
        ),
      ];
      for (const userId of uniqueUserIds) {
        await transaction.request()
        .input('UserID', sql.Int, userId)
        .input('DepotID', sql.Int, id)
        .query('INSERT INTO UserDepots (UserID, DepotID) VALUES (@UserID, @DepotID)');
      }

      await transaction.commit();
      res.json({ message: 'Depot users updated successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Update depot users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllServiceCompanies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const parsedLimit = parseInt(limit as string);
    const limitNum = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const isFetchAll = limitNum === 0;
    const safeLimitNum = isFetchAll ? 50 : Math.max(1, limitNum);
    const offset = (pageNum - 1) * safeLimitNum;

    const pool = await connectDB();

    const countQuery = 'SELECT COUNT(*) as total FROM ServiceCompanies';
    
    const dataQuery = isFetchAll
      ? `
        SELECT * FROM ServiceCompanies
        ORDER BY Name
      `
      : `
        SELECT * FROM ServiceCompanies 
        ORDER BY Name
        OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
      `;

    const request = pool.request();
    if (!isFetchAll) {
      request.input('Offset', sql.Int, offset);
      request.input('Limit', sql.Int, safeLimitNum);
    }

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const serviceCompanies = (result.recordsets as any)[1];

    res.json({ 
      serviceCompanies,
      pagination: {
        total,
        page: isFetchAll ? 1 : pageNum,
        limit: isFetchAll ? total : safeLimitNum,
        totalPages: isFetchAll ? 1 : Math.ceil(total / safeLimitNum)
      }
    });
  } catch (error) {
    console.error('Get all service companies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createServiceCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, address, phone, email, contactPerson } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const pool = await connectDB();
    const result = await pool
      .request()
      .input('Name', sql.NVarChar(100), name)
      .input('Address', sql.NVarChar(255), address || null)
      .input('Phone', sql.NVarChar(20), phone || null)
      .input('Email', sql.NVarChar(100), email || null)
      .input('ContactPerson', sql.NVarChar(100), contactPerson || null)
      .query(`
        INSERT INTO ServiceCompanies (Name, Address, Phone, Email, ContactPerson)
        OUTPUT inserted.*
        VALUES (@Name, @Address, @Phone, @Email, @ContactPerson)
      `);

    res.status(201).json({
      message: 'Service company created successfully',
      serviceCompany: result.recordset[0],
    });
  } catch (error) {
    console.error('Create service company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateServiceCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, address, phone, email, contactPerson, isActive } = req.body;

    const pool = await connectDB();
    const result = await pool
      .request()
      .input('ServiceCompanyID', sql.Int, id)
      .input('Name', sql.NVarChar(100), name)
      .input('Address', sql.NVarChar(255), address || null)
      .input('Phone', sql.NVarChar(20), phone || null)
      .input('Email', sql.NVarChar(100), email || null)
      .input('ContactPerson', sql.NVarChar(100), contactPerson || null)
      .input('IsActive', sql.Bit, isActive !== undefined ? isActive : 1)
      .query(`
        UPDATE ServiceCompanies
        SET Name = @Name,
            Address = @Address,
            Phone = @Phone,
            Email = @Email,
            ContactPerson = @ContactPerson,
            IsActive = @IsActive
        OUTPUT inserted.*
        WHERE ServiceCompanyID = @ServiceCompanyID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service company not found' });
      return;
    }

    res.json({
      message: 'Service company updated successfully',
      serviceCompany: result.recordset[0],
    });
  } catch (error) {
    console.error('Update service company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteServiceCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Check if used in ServiceRequests
    const check = await pool
      .request()
      .input('ServiceCompanyID', sql.Int, id)
      .query('SELECT TOP 1 1 FROM ServiceRequests WHERE ServiceCompanyID = @ServiceCompanyID');

    if (check.recordset.length > 0) {
      res.status(400).json({ error: 'Cannot delete service company used in service requests' });
      return;
    }

    const result = await pool
      .request()
      .input('ServiceCompanyID', sql.Int, id)
      .query('DELETE FROM ServiceCompanies OUTPUT deleted.ServiceCompanyID WHERE ServiceCompanyID = @ServiceCompanyID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service company not found' });
      return;
    }

    res.json({ message: 'Service company deleted successfully' });
  } catch (error) {
    console.error('Delete service company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserDepots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();
    const result = await pool
      .request()
      .input('UserID', sql.Int, id)
      .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');
    
    res.json({ depotIds: result.recordset.map((r: any) => r.DepotID) });
  } catch (error) {
    console.error('Get user depots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserDepots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { depotIds } = req.body;

    if (!Array.isArray(depotIds)) {
      res.status(400).json({ error: 'depotIds must be an array' });
      return;
    }

    const pool = await connectDB();

    const depotScopeError = await assertCanManageUser(pool, req.user, id);
    if (depotScopeError) {
      res.status(403).json({ error: depotScopeError });
      return;
    }

    // Yalnızca kendi şirket kapsamındaki depolar atanabilir (SUPERADMIN hariç)
    if (!isElevatedRole(req.user?.Role) && depotIds.length > 0) {
      const callerCompanyIds = await getCallerCompanyIds(pool, req.user);
      const ids = [
        ...new Set(
          depotIds.map((d: unknown) => Number(d)).filter((n: number) => Number.isInteger(n) && n > 0)
        ),
      ];
      if (ids.length > 0) {
        const companyList = callerCompanyIds.length > 0 ? callerCompanyIds.join(',') : '0';
        const depotCheck = await pool
          .request()
          .query(`SELECT COUNT(*) AS C FROM Depots WHERE DepotID IN (${ids.join(',')}) AND (CompanyID IS NULL OR CompanyID NOT IN (${companyList}))`);
        if (depotCheck.recordset[0].C > 0) {
          res.status(403).json({ error: 'You can only assign depots within your own company scope' });
          return;
        }
      }
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Delete existing assignments
      await transaction.request()
        .input('UserID', sql.Int, id)
        .query('DELETE FROM UserDepots WHERE UserID = @UserID');

      // Add new assignments (mükerrer kayıtlar elenir; tabloda UNIQUE(UserID, DepotID) var)
      const uniqueDepotIds = [
        ...new Set(
          depotIds.map((d: unknown) => Number(d)).filter((n: number) => Number.isInteger(n) && n > 0)
        ),
      ];
      for (const depotId of uniqueDepotIds) {
        await transaction.request()
          .input('UserID', sql.Int, id)
          .input('DepotID', sql.Int, depotId)
          .query('INSERT INTO UserDepots (UserID, DepotID) VALUES (@UserID, @DepotID)');
      }

      await transaction.commit();
      res.json({ message: 'User depots updated successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Update user depots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendWelcomeEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const pool = await connectDB();

    const userResult = await pool
      .request()
      .input('UserID', sql.Int, id)
      .query(`
        SELECT 
          u.UserID,
          u.Name,
          u.Surname,
          u.Email,
          u.IsActive,
          c.Name as CompanyName
        FROM Users u
        LEFT JOIN Companies c ON u.CompanyID = c.CompanyID
        WHERE u.UserID = @UserID
      `);

    if (userResult.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.recordset[0];

    if (!user.Email) {
      res.status(400).json({ error: 'User has no email address' });
      return;
    }

    const rolesResult = await pool
      .request()
      .input('UserID', sql.Int, id)
      .query(`
        SELECT r.Name
        FROM UserRoles ur
        JOIN Roles r ON ur.RoleID = r.RoleID
        WHERE ur.UserID = @UserID
      `);

    const depotResult = await pool
      .request()
      .input('UserID', sql.Int, id)
      .query(`
        SELECT d.Name
        FROM UserDepots ud
        JOIN Depots d ON ud.DepotID = d.DepotID
        WHERE ud.UserID = @UserID
      `);

    const depotNames = depotResult.recordset.map((row: any) => row.Name).filter(Boolean);
    const roleNames = rolesResult.recordset.map((row: any) => row.Name).filter(Boolean);

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

    const frontendUrl = process.env.FRONTEND_URL || 'http://arac.dinogida.com.tr';
    const resetLink = `${frontendUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;

    const fullName = [user.Name, user.Surname].filter(Boolean).join(' ') || 'Kullanıcı';
    const rolesText = roleNames.length > 0 ? roleNames.join(', ') : '-';
    const depotsText = depotNames.length > 0 ? depotNames.join(', ') : '-';
    const companyText = user.CompanyName || '-';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
          Araç Servis Takip Portalı'na Hoş Geldiniz
        </h2>
        <p>Sayın ${fullName},</p>
        <p>Araç Servis Takip Portalı'na kullanıcı olarak tanımlandınız. Aşağıda sistemde kayıtlı temel bilgileriniz yer almaktadır:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tbody>
            <tr>
              <td style="padding: 6px 8px; font-weight: bold; width: 160px;">Ad Soyad</td>
              <td style="padding: 6px 8px;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; font-weight: bold;">E-posta</td>
              <td style="padding: 6px 8px;">${user.Email}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; font-weight: bold;">Şirket</td>
              <td style="padding: 6px 8px;">${companyText}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; font-weight: bold;">Roller</td>
              <td style="padding: 6px 8px;">${rolesText}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; font-weight: bold;">Depolar</td>
              <td style="padding: 6px 8px;">${depotsText}</td>
            </tr>
          </tbody>
        </table>
        <p>Sisteme giriş yapabilmeniz için öncelikle şifrenizi belirlemeniz gerekmektedir. Aşağıdaki butona tıklayarak şifre belirleme ekranına gidebilirsiniz:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="display: inline-block; background-color: #3498db; color: #fff; padding: 12px 24px; border-radius: 4px; text-decoration: none;">
            Şifremi Belirle
          </a>
        </p>
        <p>Eğer buton çalışmazsa, aşağıdaki bağlantıyı tarayıcınıza yapıştırabilirsiniz:</p>
        <p style="word-break: break-all; font-size: 12px; color: #555;">${resetLink}</p>
        <p style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
          Bu bağlantı 1 saat süreyle geçerlidir. Eğer bu e-posta size yanlışlıkla ulaştığını düşünüyorsanız lütfen sistem yöneticiniz ile iletişime geçin.
        </p>
      </div>
    `;

    await sendEmail(
      user.Email,
      'Araç Servis Takip Portalı - Hoş Geldiniz',
      emailContent
    );

    await logAudit(
      req.user?.UserID,
      'SEND_WELCOME_EMAIL',
      'Users',
      user.UserID,
      {
        targetUserId: user.UserID,
        targetEmail: user.Email,
        company: companyText,
        roles: rolesText,
        depots: depotNames,
      },
      (req as any).ip || '0.0.0.0'
    );

    res.json({ message: 'Welcome email sent successfully' });
  } catch (error) {
    console.error('Send welcome email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Insurance Companies
export const getAllInsuranceCompanies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const pool = await connectDB();

    const countQuery = 'SELECT COUNT(*) as total FROM InsuranceCompanies WHERE IsActive = 1';
    
    const dataQuery = `
      SELECT * FROM InsuranceCompanies 
      WHERE IsActive = 1
      ORDER BY Name
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request();
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limitNum);

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const insuranceCompanies = (result.recordsets as any)[1];

    res.json({ 
      insuranceCompanies,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get all insurance companies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createInsuranceCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const pool = await connectDB();
    const result = await pool
      .request()
      .input('Name', sql.NVarChar(100), name)
      .query(`
        INSERT INTO InsuranceCompanies (Name)
        OUTPUT inserted.*
        VALUES (@Name)
      `);

    res.status(201).json({
      message: 'Insurance company created successfully',
      insuranceCompany: result.recordset[0],
    });
  } catch (error) {
    console.error('Create insurance company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateInsuranceCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;

    const pool = await connectDB();
    const result = await pool
      .request()
      .input('InsuranceCompanyID', sql.Int, id)
      .input('Name', sql.NVarChar(100), name)
      .input('IsActive', sql.Bit, isActive !== undefined ? isActive : 1)
      .query(`
        UPDATE InsuranceCompanies
        SET Name = @Name, IsActive = @IsActive, UpdatedAt = GETDATE()
        OUTPUT inserted.*
        WHERE InsuranceCompanyID = @InsuranceCompanyID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Insurance company not found' });
      return;
    }

    res.json({
      message: 'Insurance company updated successfully',
      insuranceCompany: result.recordset[0],
    });
  } catch (error) {
    console.error('Update insurance company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteInsuranceCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Soft delete
    const result = await pool
      .request()
      .input('InsuranceCompanyID', sql.Int, id)
      .query('UPDATE InsuranceCompanies SET IsActive = 0, UpdatedAt = GETDATE() OUTPUT inserted.InsuranceCompanyID WHERE InsuranceCompanyID = @InsuranceCompanyID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Insurance company not found' });
      return;
    }

    res.json({ message: 'Insurance company deleted successfully' });
  } catch (error) {
    console.error('Delete insurance company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
