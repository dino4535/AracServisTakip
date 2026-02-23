
import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { fuelSchema } from '../schemas/fuelSchema';
import { logAudit } from '../services/auditService';
import { opetService } from '../services/opetService';

export const getAllFuelRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, startDate, endDate, page = 1, limit = 50, export: isExport, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;
    const isSearching = !!search && String(search).trim() !== '';

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
        whereClause += ` AND (v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    if (vehicleId) {
      whereClause += ` AND f.VehicleID = @VehicleID`;
    }

    if (startDate) {
      whereClause += ` AND f.FuelDate >= @StartDate`;
    }

    if (endDate) {
      whereClause += ` AND f.FuelDate <= @EndDate`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        f.FuelStation LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const baseFromClause = `
      FROM FuelRecords f
      JOIN Vehicles v ON f.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots d ON v.DepotID = d.DepotID
      LEFT JOIN Users u ON f.FilledBy = u.UserID
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      ${baseFromClause}
      ${whereClause}
    `;

    let dataQuery = `
      SELECT 
        f.*, 
        v.Plate,
        c.Name as CompanyName,
        d.Name as DepotName,
        CONCAT(u.Name, ' ', u.Surname) as FilledByName
      ${baseFromClause}
      ${whereClause}
      ORDER BY f.FuelDate DESC
    `;

    if (isExport !== 'true' && !isSearching) {
      dataQuery += ` OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`;
    }

    const request = pool.request();
    request.input('UserID', sql.Int, userId);
    if (companyId) request.input('UserCompanyID', sql.Int, companyId);
    if (vehicleId) request.input('VehicleID', sql.Int, vehicleId);
    if (startDate) request.input('StartDate', sql.Date, startDate);
    if (endDate) request.input('EndDate', sql.Date, endDate);
    if (search) request.input('SearchTerm', sql.NVarChar(100), search);
    if (!isSearching && isExport !== 'true') {
      request.input('Offset', sql.Int, offset);
      request.input('Limit', sql.Int, limitNum);
    }

    const result = await request.query(`${countQuery}; ${dataQuery}`);
    
    const total = (result.recordsets as any)[0][0].total;
    const fuelRecords = (result.recordsets as any)[1];

    res.json({ 
      fuelRecords,
      pagination: {
        total,
        page: pageNum,
        limit: isExport === 'true' || isSearching ? total : limitNum,
        totalPages: isExport === 'true' || isSearching ? 1 : Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get all fuel records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFuelById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const pool = await connectDB();
    const isSuperAdmin = ['superadmin', 'super admin'].includes((req.user?.Role || '').toLowerCase());

    const result = await pool.request()
      .input('FuelRecordID', sql.Int, parseInt(id))
      .input('UserID', sql.Int, req.user?.UserID)
      .input('UserCompanyID', sql.Int, req.user?.CompanyID || 0)
      .input('Role', sql.NVarChar, isSuperAdmin ? 'SuperAdmin' : req.user?.Role)
      .query(`
        SELECT f.*, v.Plate, CONCAT(u.Name, ' ', u.Surname) as FilledByName
        FROM FuelRecords f
        JOIN Vehicles v ON f.VehicleID = v.VehicleID
        LEFT JOIN Users u ON f.FilledBy = u.UserID
        WHERE f.FuelRecordID = @FuelRecordID
        AND (@Role = 'SuperAdmin' OR v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Fuel record not found' });
      return;
    }

    res.json({ fuelRecord: result.recordset[0] });
  } catch (error) {
    console.error('Get fuel record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = fuelSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { vehicleId, fuelDate, liters, costPerLiter, totalCost, fuelStation, filledBy, kilometer, fuelType, invoiceNo } = validation.data as any;

    const pool = await connectDB();
    const isSuperAdmin = ['superadmin', 'super admin'].includes((req.user?.Role || '').toLowerCase());

    // Check vehicle access
    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('UserCompanyID', sql.Int, req.user?.CompanyID || 0)
      .input('Role', sql.NVarChar, isSuperAdmin ? 'SuperAdmin' : req.user?.Role)
      .query(`
        SELECT CompanyID FROM Vehicles 
        WHERE VehicleID = @VehicleID 
        AND (@Role = 'SuperAdmin' OR CompanyID = @UserCompanyID OR CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (vehicleCheck.recordset.length === 0) {
      res.status(403).json({ error: 'Not authorized for this vehicle' });
      return;
    }

    const result = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('FuelDate', sql.DateTime, fuelDate)
      .input('Liters', sql.Decimal(10, 2), liters)
      .input('CostPerLiter', sql.Decimal(10, 2), costPerLiter)
      .input('TotalCost', sql.Decimal(10, 2), totalCost)
      .input('FuelStation', sql.NVarChar(100), fuelStation)
      .input('FilledBy', sql.Int, filledBy)
      .input('Kilometer', sql.Int, kilometer)
      .input('FuelType', sql.NVarChar(50), fuelType)
      .input('InvoiceNo', sql.NVarChar(50), invoiceNo)
      .query(`
        INSERT INTO FuelRecords (VehicleID, FuelDate, Liters, CostPerLiter, TotalCost, FuelStation, FilledBy, Kilometer, FuelType, InvoiceNo)
        OUTPUT INSERTED.*
        VALUES (@VehicleID, @FuelDate, @Liters, @CostPerLiter, @TotalCost, @FuelStation, @FilledBy, @Kilometer, @FuelType, @InvoiceNo)
      `);

    const newRecord = result.recordset[0];
    await logAudit(req.user!.UserID, 'CREATE', 'FuelRecords', newRecord.FuelRecordID, newRecord, req.ip || '0.0.0.0');

    // Update vehicle last kilometer if higher
    if (kilometer) {
      await pool.request()
        .input('VehicleID', sql.Int, vehicleId)
        .input('CurrentKm', sql.Int, kilometer)
        .query(`
          UPDATE Vehicles 
          SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE()
          WHERE VehicleID = @VehicleID AND (CurrentKm IS NULL OR CurrentKm < @CurrentKm)
        `);
    }

    res.status(201).json({ fuelRecord: newRecord });
  } catch (error) {
    console.error('Create fuel record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const validation = fuelSchema.partial().safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const pool = await connectDB();
    const isSuperAdmin = ['superadmin', 'super admin'].includes((req.user?.Role || '').toLowerCase());

    // Check access and get old data
    const oldDataResult = await pool.request()
      .input('FuelRecordID', sql.Int, parseInt(id))
      .input('UserID', sql.Int, req.user?.UserID)
      .input('UserCompanyID', sql.Int, req.user?.CompanyID || 0)
      .input('Role', sql.NVarChar, isSuperAdmin ? 'SuperAdmin' : req.user?.Role)
      .query(`
        SELECT f.* 
        FROM FuelRecords f
        JOIN Vehicles v ON f.VehicleID = v.VehicleID
        WHERE f.FuelRecordID = @FuelRecordID
        AND (@Role = 'SuperAdmin' OR v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (oldDataResult.recordset.length === 0) {
      res.status(404).json({ error: 'Fuel record not found or unauthorized' });
      return;
    }

    const oldData = oldDataResult.recordset[0];
    const { vehicleId, fuelDate, liters, costPerLiter, totalCost, fuelStation, filledBy, kilometer, fuelType, invoiceNo } = validation.data as any;

    const result = await pool.request()
      .input('FuelRecordID', sql.Int, parseInt(id))
      .input('VehicleID', sql.Int, vehicleId || oldData.VehicleID)
      .input('FuelDate', sql.DateTime, fuelDate || oldData.FuelDate)
      .input('Liters', sql.Decimal(10, 2), liters ?? oldData.Liters)
      .input('CostPerLiter', sql.Decimal(10, 2), costPerLiter ?? oldData.CostPerLiter)
      .input('TotalCost', sql.Decimal(10, 2), totalCost ?? oldData.TotalCost)
      .input('FuelStation', sql.NVarChar(100), fuelStation ?? oldData.FuelStation)
      .input('FilledBy', sql.Int, filledBy ?? oldData.FilledBy)
      .input('Kilometer', sql.Int, kilometer ?? oldData.Kilometer)
      .input('FuelType', sql.NVarChar(50), fuelType ?? oldData.FuelType)
      .input('InvoiceNo', sql.NVarChar(50), invoiceNo ?? oldData.InvoiceNo)
      .query(`
        UPDATE FuelRecords
        SET VehicleID = @VehicleID,
            FuelDate = @FuelDate,
            Liters = @Liters,
            CostPerLiter = @CostPerLiter,
            TotalCost = @TotalCost,
            FuelStation = @FuelStation,
            FilledBy = @FilledBy,
            Kilometer = @Kilometer,
            FuelType = @FuelType,
            InvoiceNo = @InvoiceNo,
            UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE FuelRecordID = @FuelRecordID
      `);

    const updatedRecord = result.recordset[0];
    await logAudit(req.user!.UserID, 'UPDATE', 'FuelRecords', parseInt(id), { old: oldData, new: updatedRecord }, req.ip || '0.0.0.0');

    res.json({ fuelRecord: updatedRecord });
  } catch (error) {
    console.error('Update fuel record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteFuelRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const pool = await connectDB();
    const isSuperAdmin = ['superadmin', 'super admin'].includes((req.user?.Role || '').toLowerCase());

    // Check access and get old data
    const oldDataResult = await pool.request()
      .input('FuelRecordID', sql.Int, parseInt(id))
      .input('UserID', sql.Int, req.user?.UserID)
      .input('UserCompanyID', sql.Int, req.user?.CompanyID || 0)
      .input('Role', sql.NVarChar, isSuperAdmin ? 'SuperAdmin' : req.user?.Role)
      .query(`
        SELECT f.* 
        FROM FuelRecords f
        JOIN Vehicles v ON f.VehicleID = v.VehicleID
        WHERE f.FuelRecordID = @FuelRecordID
        AND (@Role = 'SuperAdmin' OR v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (oldDataResult.recordset.length === 0) {
      res.status(404).json({ error: 'Fuel record not found or unauthorized' });
      return;
    }

    const oldData = oldDataResult.recordset[0];

    await pool.request()
      .input('FuelRecordID', sql.Int, parseInt(id))
      .query('DELETE FROM FuelRecords WHERE FuelRecordID = @FuelRecordID');

    await logAudit(req.user!.UserID, 'DELETE', 'FuelRecords', parseInt(id), oldData, req.ip || '0.0.0.0');

    res.json({ message: 'Fuel record deleted successfully' });
  } catch (error) {
    console.error('Delete fuel record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFuelConsumption = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.params;
    const { startDate, endDate } = req.query;
    
    const pool = await connectDB();
    const isSuperAdmin = ['superadmin', 'super admin'].includes((req.user?.Role || '').toLowerCase());

    // Check access
    const accessCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('UserCompanyID', sql.Int, req.user?.CompanyID || 0)
      .input('Role', sql.NVarChar, isSuperAdmin ? 'SuperAdmin' : req.user?.Role)
      .query(`
        SELECT CompanyID FROM Vehicles 
        WHERE VehicleID = @VehicleID 
        AND (@Role = 'SuperAdmin' OR CompanyID = @UserCompanyID OR CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (accessCheck.recordset.length === 0) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    let statsQuery: string;
    const request = pool.request().input('VehicleID', sql.Int, vehicleId);

    if (startDate && endDate) {
      statsQuery = `
        WITH AllKm AS (
          SELECT VehicleID, FuelDate as Date, Kilometer as Km
          FROM FuelRecords
          WHERE VehicleID = @VehicleID
          
          UNION ALL
          
          SELECT VehicleID, UpdateDate as Date, Kilometer as Km
          FROM KmUpdates
          WHERE VehicleID = @VehicleID
          
          UNION ALL
          
          SELECT VehicleID, ServiceDate as Date, Kilometer as Km
          FROM MaintenanceRecords
          WHERE VehicleID = @VehicleID
        ),
        KmBounds AS (
          SELECT
            (SELECT TOP 1 Km FROM AllKm WHERE Date < @StartDate ORDER BY Date DESC) as startKm,
            (SELECT TOP 1 Km FROM AllKm WHERE Date <= @EndDate ORDER BY Date DESC) as endKm
        ),
        FuelStats AS (
          SELECT
            SUM(Liters) as totalLiters,
            SUM(TotalCost) as totalCost,
            COUNT(*) as recordCount
          FROM FuelRecords
          WHERE VehicleID = @VehicleID
          AND FuelDate BETWEEN @StartDate AND @EndDate
        )
        SELECT 
          fs.totalLiters,
          fs.totalCost,
          fs.recordCount,
          kb.startKm,
          kb.endKm
        FROM FuelStats fs
        CROSS JOIN KmBounds kb
      `;

      request.input('StartDate', sql.DateTime, new Date(startDate as string));
      request.input('EndDate', sql.DateTime, new Date(new Date(endDate as string).setHours(23, 59, 59, 999)));
    } else {
      statsQuery = `
        SELECT 
          SUM(Liters) as totalLiters,
          SUM(TotalCost) as totalCost,
          MIN(Kilometer) as startKm,
          MAX(Kilometer) as endKm,
          COUNT(*) as recordCount
        FROM FuelRecords
        WHERE VehicleID = @VehicleID
      `;

      if (startDate) {
        statsQuery += ` AND FuelDate >= @StartDate`;
        request.input('StartDate', sql.DateTime, new Date(startDate as string));
      }
      if (endDate) {
        statsQuery += ` AND FuelDate <= @EndDate`;
        request.input('EndDate', sql.DateTime, new Date(new Date(endDate as string).setHours(23, 59, 59, 999)));
      }
    }

    const result = await request.query(statsQuery);
    const stats = result.recordset[0] || {};

    const startKm = stats.startKm || 0;
    const endKm = stats.endKm || 0;
    const distance = endKm > startKm ? endKm - startKm : 0;
    const totalLiters = stats.totalLiters || 0;
    const totalCost = stats.totalCost || 0;

    const avgConsumption = distance > 0 ? (totalLiters * 100) / distance : 0;
    const costPerKm = distance > 0 ? totalCost / distance : 0;

    res.json({
      consumption: {
        ...stats,
        distance,
        avgConsumption,
        costPerKm
      }
    });
  } catch (error) {
    console.error('Get fuel consumption error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const syncOpetData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;
    
    // Check for admin role
    const userRole = req.user?.Role?.toLowerCase() || '';
    const allowedRoles = ['superadmin', 'super admin', 'admin'];
    
    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({ error: 'Only admins can perform sync operations' });
      return;
    }

    const result = await opetService.syncAllCompanies(new Date(startDate), new Date(endDate));
    
    await logAudit(
      req.user!.UserID, 
      'SYNC', 
      'FuelRecords', 
      0, 
      { result, startDate, endDate },
      req.ip || '0.0.0.0'
    );

    res.json(result);
  } catch (error) {
    console.error('Opet sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
