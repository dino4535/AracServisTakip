import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { hashPassword } from '../utils/password';

export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const pool = await connectDB();

    let whereClause = ' WHERE u.IsActive = 1';
    // Filter by company if not SuperAdmin
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    if (req.user?.CompanyID && !isSuperAdmin) {
      whereClause += ` AND (u.CompanyID = @CompanyID OR u.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
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
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request();
    
    if (req.user?.CompanyID && !isSuperAdmin) {
      request.input('CompanyID', sql.Int, req.user.CompanyID);
      request.input('UserID', sql.Int, req.user.UserID);
    }
    if (search) {
      request.input('SearchTerm', sql.NVarChar(100), search);
    }
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limitNum);

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const users = (result.recordsets as any)[1];

    res.json({ 
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
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
    const result = await pool.request().query('SELECT * FROM Companies WHERE IsActive = 1');
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

    const countQuery = 'SELECT COUNT(*) as total FROM Depots';
    
    const dataQuery = `
      SELECT * FROM Depots 
      ORDER BY DepotID DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request();
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limitNum);

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
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Delete existing assignments for this depot
      await transaction.request()
        .input('DepotID', sql.Int, id)
        .query('DELETE FROM UserDepots WHERE DepotID = @DepotID');

      // Add new assignments
      for (const userId of userIds) {
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
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const pool = await connectDB();

    const countQuery = 'SELECT COUNT(*) as total FROM ServiceCompanies';
    
    const dataQuery = `
      SELECT * FROM ServiceCompanies 
      ORDER BY Name
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request();
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limitNum);

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const serviceCompanies = (result.recordsets as any)[1];

    res.json({ 
      serviceCompanies,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
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
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Delete existing assignments
      await transaction.request()
        .input('UserID', sql.Int, id)
        .query('DELETE FROM UserDepots WHERE UserID = @UserID');

      // Add new assignments
      for (const depotId of depotIds) {
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
