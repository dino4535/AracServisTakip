import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { maintenanceSchema } from '../schemas/maintenanceSchema';
import { logAudit } from '../services/auditService';

export const getAllMaintenanceRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const pool = await connectDB();

    const userId = req.user?.UserID;
    const companyId = req.user?.CompanyID;
    const userRole = req.user?.Role;

    const isSuperAdmin = ['superadmin', 'super admin'].includes((userRole || '').toLowerCase());

    let whereClause = "WHERE 1=1";

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && userId) {
      const depotResult = await pool.request()
        .input('UserID', sql.Int, userId)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    if (!isSuperAdmin) {
      if (userDepotIds.length > 0) {
        whereClause += ` AND v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        whereClause += ` AND (v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    if (vehicleId) {
      whereClause += ` AND m.VehicleID = @VehicleID`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        v.Make LIKE '%' + @SearchTerm + '%' OR
        v.Model LIKE '%' + @SearchTerm + '%' OR
        m.Type LIKE '%' + @SearchTerm + '%' OR
        m.Description LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM MaintenanceRecords m
      LEFT JOIN Vehicles v ON m.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Users u ON m.CreatedBy = u.UserID
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        m.*, 
        v.Plate,
        v.CompanyID,
        c.Name as CompanyName,
        CONCAT(u.Name, ' ', u.Surname) as CreatedByName
      FROM MaintenanceRecords m
      LEFT JOIN Vehicles v ON m.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Users u ON m.CreatedBy = u.UserID
      ${whereClause}
      ORDER BY m.ServiceDate DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request();
    
    if (!isSuperAdmin) {
      if (companyId) {
        request.input('CompanyID', sql.Int, companyId);
      }
      if (userId) {
        request.input('UserID', sql.Int, userId);
      }
    }

    if (vehicleId) {
      request.input('VehicleID', sql.Int, Number(vehicleId));
    }
    if (search) {
      request.input('SearchTerm', sql.NVarChar(100), search);
    }
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limitNum);

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const maintenanceRecords = (result.recordsets as any)[1];

    res.json({ 
      maintenanceRecords,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get maintenance records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMaintenanceById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    const result = await pool
      .request()
      .input('MaintenanceID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || 0)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 
          m.*, 
          v.Plate,
          CONCAT(u.Name, ' ', u.Surname) as CreatedByName
        FROM MaintenanceRecords m
        LEFT JOIN Vehicles v ON m.VehicleID = v.VehicleID
        LEFT JOIN Users u ON m.CreatedBy = u.UserID
        WHERE m.MaintenanceID = @MaintenanceID
        AND (@Role = 'SuperAdmin' OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Maintenance record not found' });
      return;
    }

    res.json({ maintenanceRecord: result.recordset[0] });
  } catch (error) {
    console.error('Get maintenance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createMaintenanceRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = maintenanceSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { vehicleId, type, description, kilometer, cost, serviceDate, nextServiceDate, nextServiceKm } = validation.data;
  
    const pool = await connectDB();

    // Verify vehicle access
    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('CompanyID', sql.Int, req.user?.Role === 'SuperAdmin' ? null : req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 FROM Vehicles v
        WHERE VehicleID = @VehicleID
        AND (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);
      
    if (vehicleCheck.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this vehicle' });
      return;
    }

    // Update vehicle's NextMaintenanceKm if provided
    if (nextServiceKm) {
      await pool.request()
        .input('VehicleID', sql.Int, vehicleId)
        .input('NextServiceKm', sql.Int, nextServiceKm)
        .query('UPDATE Vehicles SET NextMaintenanceKm = @NextServiceKm WHERE VehicleID = @VehicleID');
    }

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('Type', sql.NVarChar(50), type)
      .input('Description', sql.NVarChar(500), description || null)
      .input('Kilometer', sql.Int, kilometer || null)
      .input('Cost', sql.Decimal(10, 2), cost || null)
      .input('ServiceDate', sql.DateTime2, serviceDate)
      .input('NextServiceDate', sql.DateTime2, nextServiceDate || null)
      .input('CreatedBy', sql.Int, req.user?.UserID)
      .query(`
        INSERT INTO MaintenanceRecords (VehicleID, Type, Description, Kilometer, Cost, ServiceDate, NextServiceDate, CreatedBy)
        OUTPUT inserted.*
        VALUES (@VehicleID, @Type, @Description, @Kilometer, @Cost, @ServiceDate, @NextServiceDate, @CreatedBy)
      `);

    res.status(201).json({
      message: 'Maintenance record created successfully',
      maintenanceRecord: result.recordset[0],
    });
  } catch (error) {
    console.error('Create maintenance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMaintenanceRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = maintenanceSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { vehicleId, type, description, kilometer, cost, serviceDate, nextServiceDate, nextServiceKm } = validation.data;

    const pool = await connectDB();

    // Check access
    const checkQuery = await pool.request()
      .input('MaintenanceID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 1 
        FROM MaintenanceRecords m
        JOIN Vehicles v ON m.VehicleID = v.VehicleID
        WHERE m.MaintenanceID = @MaintenanceID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this maintenance record' });
      return;
    }

    // Update vehicle's NextMaintenanceKm if provided
    if (nextServiceKm) {
      await pool.request()
        .input('VehicleID', sql.Int, vehicleId)
        .input('NextServiceKm', sql.Int, nextServiceKm)
        .query('UPDATE Vehicles SET NextMaintenanceKm = @NextServiceKm WHERE VehicleID = @VehicleID');
    }

    const result = await pool
      .request()
      .input('MaintenanceID', sql.Int, Number(id))
      .input('Type', sql.NVarChar(50), type)
      .input('Description', sql.NVarChar(500), description || null)
      .input('Kilometer', sql.Int, kilometer || null)
      .input('Cost', sql.Decimal(10, 2), cost || null)
      .input('ServiceDate', sql.DateTime2, serviceDate)
      .input('NextServiceDate', sql.DateTime2, nextServiceDate || null)
      .query(`
        UPDATE MaintenanceRecords
        SET Type = @Type,
            Description = @Description,
            Kilometer = @Kilometer,
            Cost = @Cost,
            ServiceDate = @ServiceDate,
            NextServiceDate = @NextServiceDate
        OUTPUT inserted.*
        WHERE MaintenanceID = @MaintenanceID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Maintenance record not found' });
      return;
    }

    res.json({
      message: 'Maintenance record updated successfully',
      maintenanceRecord: result.recordset[0],
    });
  } catch (error) {
    console.error('Update maintenance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteMaintenanceRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Check access
    const checkQuery = await pool.request()
      .input('MaintenanceID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 1 
        FROM MaintenanceRecords m
        JOIN Vehicles v ON m.VehicleID = v.VehicleID
        WHERE m.MaintenanceID = @MaintenanceID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this maintenance record' });
      return;
    }

    const result = await pool
      .request()
      .input('MaintenanceID', sql.Int, Number(id))
      .query('DELETE FROM MaintenanceRecords OUTPUT deleted.MaintenanceID WHERE MaintenanceID = @MaintenanceID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Maintenance record not found' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'DELETE_MAINTENANCE',
      'MaintenanceRecords',
      Number(id),
      {},
      req.ip || '0.0.0.0'
    );

    res.json({ message: 'Maintenance record deleted successfully' });
  } catch (error) {
    console.error('Delete maintenance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMaintenancePredictions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const { search } = req.query;
    const companyId = req.user?.CompanyID;

    let query = `
      WITH AllKm AS (
          SELECT VehicleID, FuelDate as Date, Kilometer as Km FROM FuelRecords WHERE Kilometer > 0
          UNION ALL
          SELECT VehicleID, UpdateDate as Date, Kilometer as Km FROM KmUpdates WHERE Kilometer > 0
          UNION ALL
          SELECT VehicleID, ServiceDate as Date, Kilometer as Km FROM MaintenanceRecords WHERE Kilometer > 0
          UNION ALL
          SELECT VehicleID, DATEFROMPARTS(Year, Month, 1) as Date, Kilometer as Km FROM MonthlyKmLog WHERE Kilometer > 0
      ),
      KmStats AS (
          SELECT 
              VehicleID,
              -- Overall Stats
              MIN(Date) as FirstDate,
              MAX(Date) as LastDate,
              MIN(Km) as FirstKm,
              MAX(Km) as LastKm,
              -- Recent Stats (Last 90 Days)
              MIN(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Date END) as RecentFirstDate,
              MAX(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Date END) as RecentLastDate,
              MIN(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Km END) as RecentFirstKm,
              MAX(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Km END) as RecentLastKm
          FROM AllKm
          GROUP BY VehicleID
      ),
      LastMaintenance AS (
          SELECT 
              VehicleID,
              MAX(ServiceDate) as LastServiceDate,
              MAX(Kilometer) as LastServiceKm
          FROM MaintenanceRecords
          GROUP BY VehicleID
      )
      SELECT 
          v.VehicleID,
          v.Plate,
          v.CurrentKm,
          v.NextMaintenanceKm,
          v.Make,
          v.Model,
          ks.FirstDate,
          ks.LastDate,
          ks.FirstKm,
          ks.LastKm,
          ks.RecentFirstDate,
          ks.RecentLastDate,
          ks.RecentFirstKm,
          ks.RecentLastKm,
          DATEDIFF(day, ks.FirstDate, ks.LastDate) as DaysTracked,
          (ks.LastKm - ks.FirstKm) as KmDiff,
          DATEDIFF(day, ks.RecentFirstDate, ks.RecentLastDate) as RecentDaysTracked,
          (ks.RecentLastKm - ks.RecentFirstKm) as RecentKmDiff,
          lm.LastServiceDate,
          lm.LastServiceKm
      FROM Vehicles v
      LEFT JOIN KmStats ks ON v.VehicleID = ks.VehicleID
      LEFT JOIN LastMaintenance lm ON v.VehicleID = lm.VehicleID
      WHERE v.Status = 'Active'
    `;

    if (companyId) {
      query += ` AND v.CompanyID = @CompanyID`;
    }

    if (search) {
      query += ` AND (v.Plate LIKE '%' + @SearchTerm + '%' OR v.Make LIKE '%' + @SearchTerm + '%' OR v.Model LIKE '%' + @SearchTerm + '%')`;
    }

    const request = pool.request();
    if (companyId) {
      request.input('CompanyID', sql.Int, companyId);
    }

    if (search) {
      request.input('SearchTerm', sql.NVarChar, search);
    }

    const result = await request.query(query);

    const predictions = result.recordset.map(record => {
      let avgDailyKm = 0;
      
      // Calculate Overall Average
      let overallAvg = 0;
      if (record.DaysTracked > 0 && record.KmDiff > 0) {
        overallAvg = record.KmDiff / record.DaysTracked;
      }

      // Calculate Recent Average (Last 90 Days)
      let recentAvg = 0;
      if (record.RecentDaysTracked > 7 && record.RecentKmDiff > 0) { // Require at least 7 days of recent data
        recentAvg = record.RecentKmDiff / record.RecentDaysTracked;
      }

      // Decision Logic: Prefer Recent Average if valid, otherwise fallback to Overall Average
      if (recentAvg > 0) {
        avgDailyKm = recentAvg;
      } else {
        avgDailyKm = overallAvg;
      }

      // Default maintenance interval: 15,000 KM
      const MAINTENANCE_INTERVAL = 15000;
      const lastServiceKm = record.LastServiceKm || 0;
      const nextServiceKmCalculated = lastServiceKm + MAINTENANCE_INTERVAL;
      const nextServiceKm = record.NextMaintenanceKm ? record.NextMaintenanceKm : nextServiceKmCalculated;
      const remainingKm = nextServiceKm - record.CurrentKm;
      
      let estDaysRemaining = null;
      let estDate = null;

      if (avgDailyKm > 0) {
        estDaysRemaining = Math.ceil(remainingKm / avgDailyKm);
        const today = new Date();
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + estDaysRemaining);
        estDate = targetDate;
      }

      return {
        ...record,
        AvgDailyKm: Math.round(avgDailyKm * 10) / 10, // 1 decimal
        NextServiceKm: nextServiceKm,
        RemainingKm: remainingKm,
        EstDaysRemaining: estDaysRemaining,
        EstServiceDate: estDate,
        Status: remainingKm <= 0 ? 'Overdue' : (remainingKm < 1000 ? 'Due Soon' : 'OK')
      };
    });

    res.json(predictions);

  } catch (error) {
    console.error('Get maintenance predictions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
