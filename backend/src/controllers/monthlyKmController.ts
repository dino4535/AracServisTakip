import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { logAudit } from '../services/auditService';
import * as XLSX from 'xlsx';

const saveMonthlyKmSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2000).max(2100),
  records: z.array(z.object({
    vehicleId: z.number(),
    kilometer: z.number().min(0)
  }))
});

export const getMonthlyKm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year, companyId, page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;
    
    if (!month || !year) {
      res.status(400).json({ error: 'Month and Year are required' });
      return;
    }

    const pool = await connectDB();
    const targetMonth = parseInt(month as string);
    const targetYear = parseInt(year as string);
    
    // Calculate previous month/year
    let prevMonth = targetMonth - 1;
    let prevYear = targetYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = targetYear - 1;
    }

    let whereClause = "WHERE v.Status = 'Active'";
    
    const userRole = req.user?.Role;
    const userId = req.user?.UserID;
    const userCompanyId = userRole === 'SuperAdmin' ? null : req.user?.CompanyID;

    const isSuperAdmin = ['superadmin', 'super admin'].includes((userRole || '').toLowerCase());

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
      } else if (userCompanyId) {
        whereClause += ` AND v.CompanyID = @UserCompanyID`;
      } else {
        whereClause += ` AND (v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    } else if (companyId) {
      whereClause += ` AND v.CompanyID = @FilterCompanyID`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        v.Make LIKE '%' + @SearchTerm + '%' OR
        v.Model LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM Vehicles v
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        v.VehicleID,
        v.Plate,
        v.Make,
        v.Model,
        v.CurrentKm as CurrentTotalKm,
        m.Kilometer as MonthlyKm,
        m.UpdatedAt,
        pm.Kilometer as PreviousMonthKm
      FROM Vehicles v
      LEFT JOIN MonthlyKmLog m ON v.VehicleID = m.VehicleID AND m.Month = @Month AND m.Year = @Year
      LEFT JOIN MonthlyKmLog pm ON v.VehicleID = pm.VehicleID AND pm.Month = @PrevMonth AND pm.Year = @PrevYear
      ${whereClause}
      ORDER BY v.Plate ASC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request()
      .input('Month', sql.Int, targetMonth)
      .input('Year', sql.Int, targetYear)
      .input('PrevMonth', sql.Int, prevMonth)
      .input('PrevYear', sql.Int, prevYear)
      .input('Limit', sql.Int, limitNum)
      .input('Offset', sql.Int, offset);

    if (search) {
      request.input('SearchTerm', sql.NVarChar, search);
    }

    if (!isSuperAdmin) {
      if (userCompanyId) request.input('UserCompanyID', sql.Int, userCompanyId);
      if (userId) request.input('UserID', sql.Int, userId);
    } else if (companyId) {
      request.input('FilterCompanyID', sql.Int, parseInt(companyId as string));
    }

    const result = await request.query(dataQuery);
    const countResult = await request.query(countQuery);

    res.json({
      data: result.recordset,
      pagination: {
        total: countResult.recordset[0].total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(countResult.recordset[0].total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get monthly km error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMissingMonthlyKm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year, companyId } = req.query;
    
    if (!month || !year) {
      res.status(400).json({ error: 'Month and Year are required' });
      return;
    }

    const pool = await connectDB();
    const targetMonth = parseInt(month as string);
    const targetYear = parseInt(year as string);
    
    let whereClause = "WHERE v.Status = 'Active'";
    
    const userRole = req.user?.Role;
    const userId = req.user?.UserID;
    const userCompanyId = userRole === 'SuperAdmin' ? null : req.user?.CompanyID;

    const isSuperAdmin = ['superadmin', 'super admin'].includes((userRole || '').toLowerCase());

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
      } else if (userCompanyId) {
        whereClause += ` AND v.CompanyID = @UserCompanyID`;
      } else {
        whereClause += ` AND (v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    } else if (companyId) {
      whereClause += ` AND v.CompanyID = @FilterCompanyID`;
    }

    // Exclude vehicles that have KM entry for this month/year
    whereClause += ` AND NOT EXISTS (
      SELECT 1 FROM MonthlyKmLog mk 
      WHERE mk.VehicleID = v.VehicleID 
      AND mk.Month = @Month 
      AND mk.Year = @Year
    )`;

    const query = `
      SELECT 
        v.VehicleID,
        v.Plate,
        v.CurrentKm,
        c.Name as CompanyName,
        d.Name as DepotName
      FROM Vehicles v
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots d ON v.DepotID = d.DepotID
      ${whereClause}
      ORDER BY v.Plate ASC
    `;

    const request = pool.request()
      .input('Month', sql.Int, targetMonth)
      .input('Year', sql.Int, targetYear);
      
    if (userCompanyId) request.input('UserCompanyID', sql.Int, userCompanyId);
    if (companyId) request.input('FilterCompanyID', sql.Int, parseInt(companyId as string));
    if (userId) request.input('UserID', sql.Int, userId);

    const result = await request.query(query);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get missing monthly km error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveMonthlyKm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = saveMonthlyKmSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { month, year, records } = validation.data;
    const userId = req.user?.UserID;

    const pool = await connectDB();

    const userRole = req.user?.Role;
    const companyId = req.user?.CompanyID;
    const isSuperAdmin = ['superadmin', 'super admin'].includes((userRole || '').toLowerCase());

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && userId) {
      const depotResult = await pool.request()
        .input('UserID', sql.Int, userId)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    const vehicleIds = records.map(r => r.vehicleId);
    if (vehicleIds.length > 0 && !isSuperAdmin) {
      const accessRequest = pool.request()
        .input('UserID', sql.Int, userId || null);

      if (companyId) {
        accessRequest.input('CompanyID', sql.Int, companyId);
      }

      const accessQueryParts: string[] = [];

      if (userDepotIds.length > 0) {
        accessQueryParts.push(`v.DepotID IN (${userDepotIds.join(',')})`);
      } else if (companyId) {
        accessQueryParts.push(`v.CompanyID = @CompanyID`);
        accessQueryParts.push(`v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID)`);
      } else {
        accessQueryParts.push(`v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID)`);
      }

      const accessWhere = accessQueryParts.length > 0 ? accessQueryParts.join(' OR ') : '1=1';

      const accessCheck = await accessRequest.query(`
        SELECT COUNT(*) as count 
        FROM Vehicles v
        WHERE VehicleID IN (${vehicleIds.join(',')})
        AND (${accessWhere})
      `);

      if (accessCheck.recordset[0].count !== vehicleIds.length) {
        res.status(403).json({ error: 'You do not have permission for one or more vehicles' });
        return;
      }
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const record of records) {
        // 1. Update Vehicle CurrentKm
        await transaction.request()
          .input('VehicleID', sql.Int, record.vehicleId)
          .input('CurrentKm', sql.Int, record.kilometer)
          .query(`
            UPDATE Vehicles 
            SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE()
            WHERE VehicleID = @VehicleID
          `);

        // 2. Upsert into MonthlyKmLog
        await transaction.request()
          .input('VehicleID', sql.Int, record.vehicleId)
          .input('Month', sql.Int, month)
          .input('Year', sql.Int, year)
          .input('Kilometer', sql.Int, record.kilometer)
          .input('CreatedBy', sql.Int, userId)
          .query(`
            MERGE MonthlyKmLog AS target
            USING (SELECT @VehicleID AS VehicleID, @Month AS Month, @Year AS Year) AS source
            ON (target.VehicleID = source.VehicleID AND target.Month = source.Month AND target.Year = source.Year)
            WHEN MATCHED THEN
              UPDATE SET Kilometer = @Kilometer, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (VehicleID, Month, Year, Kilometer, CreatedBy, CreatedAt, UpdatedAt)
              VALUES (@VehicleID, @Month, @Year, @Kilometer, @CreatedBy, GETDATE(), GETDATE());
          `);

        // 3. Keep KmUpdates for historical audit if needed (optional, but good practice)
        await transaction.request()
          .input('VehicleID', sql.Int, record.vehicleId)
          .input('Kilometer', sql.Int, record.kilometer)
          .input('UpdatedBy', sql.Int, userId)
          .query(`
            INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
            VALUES (@VehicleID, @Kilometer, @UpdatedBy, GETDATE())
          `);
      }

      await transaction.commit();

      // Log Audit
      await logAudit(
        userId,
        'SAVE_MONTHLY_KM',
        'MonthlyKmLog',
        0, // Batch operation, no single ID
        { month, year, recordCount: records.length },
        req.ip || '0.0.0.0'
      );

      res.json({ message: 'Monthly KM records saved successfully', count: records.length });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Save monthly KM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVehicleKmHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.params;
    const pool = await connectDB();

    // Permission check
    const accessCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT CompanyID FROM Vehicles v
        WHERE VehicleID = @VehicleID
        AND (@CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (accessCheck.recordset.length === 0) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const result = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        SELECT 
          m.LogID,
          m.Month,
          m.Year,
          m.Kilometer,
          m.UpdatedAt,
          CONCAT(u.Name, ' ', u.Surname) as CreatedByName
        FROM MonthlyKmLog m
        LEFT JOIN Users u ON m.CreatedBy = u.UserID
        WHERE m.VehicleID = @VehicleID
        ORDER BY m.Year DESC, m.Month DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get vehicle km history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const importMonthlyKm = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let importedCount = 0;
      let errors: string[] = [];

      for (const row of data as any[]) {
        const plate = row['Plate'] || row['Plaka'] || row['PLATE'] || row['PLAKA'];
        let dateVal = row['Date'] || row['Tarih'] || row['DATE'] || row['TARIH'];
        const km = row['Kilometer'] || row['KM'] || row['Km'] || row['KILOMETER'];

        if (!plate || !dateVal || !km) {
          continue; // Skip invalid rows
        }

        // Parse Date
        let date: Date;
        if (typeof dateVal === 'number') {
          // Excel date serial number
          const parsed = XLSX.SSF.parse_date_code(dateVal);
          date = new Date(parsed.y, parsed.m - 1, parsed.d);
        } else {
          date = new Date(dateVal);
        }

        if (isNaN(date.getTime())) {
          errors.push(`Invalid date for plate ${plate}: ${dateVal}`);
          continue;
        }

        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        // Get VehicleID
        const vehicleResult = await transaction.request()
          .input('Plate', sql.NVarChar, plate)
          .query('SELECT VehicleID, CurrentKm, CompanyID FROM Vehicles WHERE Plate = @Plate');

        if (vehicleResult.recordset.length === 0) {
          errors.push(`Vehicle not found: ${plate}`);
          continue;
        }

        const vehicle = vehicleResult.recordset[0];

        // Permission check
        if (req.user?.Role !== 'SuperAdmin' && req.user?.CompanyID && vehicle.CompanyID !== req.user.CompanyID) {
           errors.push(`Permission denied for vehicle: ${plate}`);
           continue;
        }

        // Update MonthlyKmLog (Upsert)
        await transaction.request()
          .input('VehicleID', sql.Int, vehicle.VehicleID)
          .input('Month', sql.Int, month)
          .input('Year', sql.Int, year)
          .input('Kilometer', sql.Int, km)
          .input('CreatedBy', sql.Int, req.user?.UserID)
          .query(`
            MERGE MonthlyKmLog AS target
            USING (SELECT @VehicleID AS VehicleID, @Month AS Month, @Year AS Year) AS source
            ON (target.VehicleID = source.VehicleID AND target.Month = source.Month AND target.Year = source.Year)
            WHEN MATCHED THEN
              UPDATE SET Kilometer = @Kilometer, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (VehicleID, Month, Year, Kilometer, CreatedBy, CreatedAt, UpdatedAt)
              VALUES (@VehicleID, @Month, @Year, @Kilometer, @CreatedBy, GETDATE(), GETDATE());
          `);

        // Insert into KmUpdates (History)
        await transaction.request()
          .input('VehicleID', sql.Int, vehicle.VehicleID)
          .input('Kilometer', sql.Int, km)
          .input('UpdatedBy', sql.Int, req.user?.UserID)
          .input('UpdateDate', sql.DateTime, date)
          .query(`
            INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
            VALUES (@VehicleID, @Kilometer, @UpdatedBy, @UpdateDate)
          `);

        // Update CurrentKm if new value is higher
        if (km > (vehicle.CurrentKm || 0)) {
          await transaction.request()
            .input('VehicleID', sql.Int, vehicle.VehicleID)
            .input('CurrentKm', sql.Int, km)
            .query(`
              UPDATE Vehicles 
              SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE()
              WHERE VehicleID = @VehicleID
            `);
        }

        importedCount++;
      }

      await transaction.commit();

      // Log Audit
      await logAudit(
        req.user?.UserID,
        'IMPORT_MONTHLY_KM',
        'MonthlyKmLog',
        0,
        { importedCount, errors },
        req.ip || '0.0.0.0'
      );

      res.json({ 
        message: 'Import completed', 
        importedCount, 
        errors: errors.length > 0 ? errors : undefined 
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Import monthly KM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
