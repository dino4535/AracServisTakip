import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const pool = await connectDB();
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && req.user?.UserID) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, req.user.UserID)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    let accessCondition = '1=1';
    if (!isSuperAdmin) {
      if (userDepotIds.length > 0) {
        accessCondition = `v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        accessCondition = `(@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    // Basic counts
    const counts = await pool.request()
      .input('CompanyID', sql.Int, companyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM Vehicles v WHERE ${accessCondition} AND v.Status = 'Active') as ActiveVehicles,
          (SELECT COUNT(*) FROM MaintenanceRecords mr JOIN Vehicles v ON mr.VehicleID = v.VehicleID WHERE ${accessCondition} AND mr.NextServiceDate BETWEEN GETDATE() AND DATEADD(day, 30, GETDATE())) as UpcomingMaintenance,
          (SELECT COUNT(*) FROM InsuranceRecords ir JOIN Vehicles v ON ir.VehicleID = v.VehicleID WHERE ${accessCondition} AND ir.EndDate BETWEEN GETDATE() AND DATEADD(day, 30, GETDATE())) as ExpiringInsurance
      `);

    // Monthly costs (Last 6 months)
    const monthlyCosts = await pool.request()
      .input('CompanyID', sql.Int, companyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 
          FORMAT(Date, 'yyyy-MM') as Month,
          SUM(Cost) as TotalCost,
          Type
        FROM (
          SELECT FuelDate as Date, TotalCost as Cost, 'Fuel' as Type FROM FuelRecords fr JOIN Vehicles v ON fr.VehicleID = v.VehicleID WHERE ${accessCondition}
          UNION ALL
          SELECT ServiceDate as Date, Cost, 'Maintenance' as Type FROM MaintenanceRecords mr JOIN Vehicles v ON mr.VehicleID = v.VehicleID WHERE ${accessCondition}
          UNION ALL
          SELECT COALESCE(ReturnDate, CompletedDate, RequestDate) as Date, ActualCost as Cost, 'Maintenance' as Type FROM ServiceRequests sr JOIN Vehicles v ON sr.VehicleID = v.VehicleID WHERE sr.Status IN ('COMPLETED', 'RETURNED') AND ${accessCondition}
          UNION ALL
          SELECT StartDate as Date, Cost, 'Insurance' as Type FROM InsuranceRecords ir JOIN Vehicles v ON ir.VehicleID = v.VehicleID WHERE ${accessCondition}
          UNION ALL
          SELECT InspectionDate as Date, Cost, 'Inspection' as Type FROM VehicleInspections vi JOIN Vehicles v ON vi.VehicleID = v.VehicleID WHERE ${accessCondition}
          UNION ALL
          SELECT AccidentDate as Date, Cost, 'Accident' as Type FROM AccidentRecords ar JOIN Vehicles v ON ar.VehicleID = v.VehicleID WHERE ${accessCondition}
        ) Combined
        WHERE Date >= DATEADD(month, -6, GETDATE())
        GROUP BY FORMAT(Date, 'yyyy-MM'), Type
        ORDER BY Month
      `);

    res.json({
      stats: counts.recordset[0],
      costs: monthlyCosts.recordset
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVehiclePerformance = async (req: AuthRequest, res: Response) => {
  try {
    const pool = await connectDB();
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && req.user?.UserID) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, req.user.UserID)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    let accessCondition = '1=1';
    if (!isSuperAdmin) {
      if (userDepotIds.length > 0) {
        accessCondition = `v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        accessCondition = `(@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    const result = await pool.request()
      .input('CompanyID', sql.Int, companyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        WITH KmStats AS (
            SELECT 
                VehicleID,
                MIN(Km) as StartKm,
                MAX(Km) as EndKm
            FROM (
                SELECT VehicleID, Kilometer as Km FROM FuelRecords
                UNION ALL
                SELECT VehicleID, Kilometer as Km FROM KmUpdates
            ) AllKm
            GROUP BY VehicleID
        ),
        FuelStats AS (
            SELECT VehicleID, COUNT(*) as FuelRecords, SUM(Liters) as TotalLiters, SUM(TotalCost) as TotalFuelCost 
            FROM FuelRecords 
            GROUP BY VehicleID
        ),
        MaintenanceStats AS (
            SELECT VehicleID, SUM(Cost) as TotalMaintCost 
            FROM (
                SELECT VehicleID, Cost FROM MaintenanceRecords
                UNION ALL
                SELECT VehicleID, ActualCost as Cost FROM ServiceRequests WHERE Status IN ('COMPLETED', 'RETURNED')
            ) MaintData
            GROUP BY VehicleID
        ),
        InsuranceStats AS (
            SELECT VehicleID, SUM(Cost) as TotalInsCost 
            FROM InsuranceRecords 
            GROUP BY VehicleID
        ),
        InspectionStats AS (
            SELECT VehicleID, SUM(Cost) as TotalInspCost 
            FROM VehicleInspections 
            GROUP BY VehicleID
        ),
        AccidentStats AS (
            SELECT VehicleID, SUM(Cost) as TotalAccidentCost 
            FROM AccidentRecords 
            GROUP BY VehicleID
        )
        SELECT TOP 10
          v.Plate,
          v.Make,
          v.Model,
          ISNULL(fs.FuelRecords, 0) as FuelRecords,
          ISNULL(fs.TotalLiters, 0) as TotalLiters,
          ISNULL(fs.TotalFuelCost, 0) as TotalFuelCost,
          ISNULL(ms.TotalMaintCost, 0) as TotalMaintCost,
          ISNULL(ins.TotalInsCost, 0) as TotalInsCost,
          ISNULL(insp.TotalInspCost, 0) as TotalInspCost,
          ISNULL(acc.TotalAccidentCost, 0) as TotalAccidentCost,
          (ISNULL(fs.TotalFuelCost, 0) + ISNULL(ms.TotalMaintCost, 0) + ISNULL(ins.TotalInsCost, 0) + ISNULL(insp.TotalInspCost, 0) + ISNULL(acc.TotalAccidentCost, 0)) as TotalCost,
          ISNULL(ks.EndKm - ks.StartKm, 0) as TotalKm,
          CASE 
            WHEN (ks.EndKm - ks.StartKm) > 0 THEN (ISNULL(fs.TotalLiters, 0) * 100.0) / (ks.EndKm - ks.StartKm) 
            ELSE 0 
          END as AvgConsumption,
          CASE 
            WHEN (ks.EndKm - ks.StartKm) > 0 THEN (ISNULL(fs.TotalFuelCost, 0) + ISNULL(ms.TotalMaintCost, 0) + ISNULL(ins.TotalInsCost, 0) + ISNULL(insp.TotalInspCost, 0) + ISNULL(acc.TotalAccidentCost, 0)) / (ks.EndKm - ks.StartKm) 
            ELSE 0 
          END as CostPerKm
        FROM Vehicles v
        LEFT JOIN FuelStats fs ON v.VehicleID = fs.VehicleID
        LEFT JOIN MaintenanceStats ms ON v.VehicleID = ms.VehicleID
        LEFT JOIN InsuranceStats ins ON v.VehicleID = ins.VehicleID
        LEFT JOIN InspectionStats insp ON v.VehicleID = insp.VehicleID
        LEFT JOIN AccidentStats acc ON v.VehicleID = acc.VehicleID
        LEFT JOIN KmStats ks ON v.VehicleID = ks.VehicleID
        WHERE ${accessCondition}
        ORDER BY TotalCost DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Vehicle performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTrendAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const pool = await connectDB();
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && req.user?.UserID) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, req.user.UserID)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    let accessCondition = '1=1';
    if (!isSuperAdmin) {
      if (userDepotIds.length > 0) {
        accessCondition = `v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        accessCondition = `(@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    const query = `
        WITH AllowedVehicles AS (
            SELECT VehicleID FROM Vehicles v
            WHERE ${accessCondition}
        ),
        AllKmRecords AS (
            SELECT VehicleID, Kilometer as Km, FuelDate as Date FROM FuelRecords WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
            UNION ALL
            SELECT VehicleID, Kilometer as Km, UpdateDate as Date FROM KmUpdates WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
            UNION ALL
            SELECT VehicleID, Kilometer as Km, ServiceDate as Date FROM MaintenanceRecords WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
        ),
        MonthlyVehicleStats AS (
            SELECT 
                VehicleID,
                FORMAT(Date, 'yyyy-MM') as Month,
                MAX(Km) - MIN(Km) as Distance
            FROM AllKmRecords
            WHERE Date >= DATEADD(month, -12, GETDATE())
            GROUP BY VehicleID, FORMAT(Date, 'yyyy-MM')
        ),
        MonthlyTotalDistance AS (
            SELECT Month, SUM(Distance) as TotalDistance
            FROM MonthlyVehicleStats
            GROUP BY Month
        ),
        MonthlyFuel AS (
            SELECT 
                FORMAT(FuelDate, 'yyyy-MM') as Month,
                SUM(Liters) as TotalLiters,
                SUM(TotalCost) as FuelCost
            FROM FuelRecords
            WHERE FuelDate >= DATEADD(month, -12, GETDATE())
            AND VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
            GROUP BY FORMAT(FuelDate, 'yyyy-MM')
        ),
        MonthlyCosts AS (
            SELECT 
                FORMAT(Date, 'yyyy-MM') as Month,
                SUM(Cost) as TotalCost
            FROM (
                SELECT FuelDate as Date, TotalCost as Cost FROM FuelRecords WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
                UNION ALL
                SELECT ServiceDate as Date, Cost FROM MaintenanceRecords WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
                UNION ALL
                SELECT COALESCE(ReturnDate, CompletedDate, RequestDate) as Date, ActualCost as Cost FROM ServiceRequests WHERE Status IN ('COMPLETED', 'RETURNED') AND VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
                UNION ALL
                SELECT StartDate as Date, Cost FROM InsuranceRecords WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
                UNION ALL
                SELECT InspectionDate as Date, Cost FROM VehicleInspections WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
                UNION ALL
                SELECT AccidentDate as Date, Cost FROM AccidentRecords WHERE VehicleID IN (SELECT VehicleID FROM AllowedVehicles)
            ) AllCosts
            WHERE Date >= DATEADD(month, -12, GETDATE())
            GROUP BY FORMAT(Date, 'yyyy-MM')
        )
        SELECT 
            COALESCE(d.Month, f.Month, c.Month) as Month,
            ISNULL(d.TotalDistance, 0) as TotalKm,
            ISNULL(f.TotalLiters, 0) as TotalLiters,
            ISNULL(c.TotalCost, 0) as TotalCost,
            CASE 
                WHEN ISNULL(d.TotalDistance, 0) > 0 THEN (ISNULL(f.TotalLiters, 0) * 100.0) / d.TotalDistance 
                ELSE 0 
            END as AvgConsumption,
            CASE 
                WHEN ISNULL(d.TotalDistance, 0) > 0 THEN ISNULL(c.TotalCost, 0) / d.TotalDistance 
                ELSE 0 
            END as CostPerKm
        FROM MonthlyTotalDistance d
        FULL OUTER JOIN MonthlyFuel f ON d.Month = f.Month
        FULL OUTER JOIN MonthlyCosts c ON ISNULL(d.Month, f.Month) = c.Month
        ORDER BY Month
    `;

    const result = await pool.request()
      .input('CompanyID', sql.Int, companyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(query);

    res.json(result.recordset);
  } catch (error) {
    console.error('Trend analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDetailedReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, companyIds, depotId, driverId, plate } = req.query;
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const userCompanyId = isSuperAdmin ? null : req.user?.CompanyID;

    // Validasyon
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and End date are required' });
    }

    const pool = await connectDB();

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && req.user?.UserID) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, req.user.UserID)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    let vehicleAccessCondition = '1=1';
    if (!isSuperAdmin) {
      if (userDepotIds.length > 0) {
        vehicleAccessCondition = `v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        vehicleAccessCondition = `(@UserCompanyID IS NULL OR v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    // Main Query: Aggregates costs per vehicle within date range
    const query = `
      WITH FuelStats AS (
        SELECT VehicleID, SUM(TotalCost) as FuelCost, SUM(Liters) as TotalLiters
        FROM FuelRecords
        WHERE FuelDate BETWEEN @StartDate AND @EndDate
        GROUP BY VehicleID
      ),
      MaintenanceStats AS (
        SELECT VehicleID, SUM(Cost) as MaintenanceCost, COUNT(*) as MaintenanceCount
        FROM (
            SELECT VehicleID, Cost, ServiceDate FROM MaintenanceRecords
            UNION ALL
            SELECT VehicleID, ActualCost as Cost, COALESCE(ReturnDate, CompletedDate, RequestDate) as ServiceDate FROM ServiceRequests WHERE Status IN ('COMPLETED', 'RETURNED')
        ) AllMaint
        WHERE ServiceDate BETWEEN @StartDate AND @EndDate
        GROUP BY VehicleID
      ),
      InsuranceStats AS (
        SELECT 
          VehicleID,
          SUM(
            CASE 
              WHEN EndDate < @StartDate OR StartDate > @EndDate THEN 0
              ELSE
                CAST(Cost as decimal(18,4)) *
                (
                  DATEDIFF(
                    DAY,
                    CASE WHEN StartDate > @StartDate THEN StartDate ELSE @StartDate END,
                    CASE WHEN ISNULL(EndDate, StartDate) < @EndDate THEN ISNULL(EndDate, StartDate) ELSE @EndDate END
                  ) + 1
                ) /
                NULLIF(DATEDIFF(DAY, StartDate, ISNULL(EndDate, StartDate)) + 1, 0)
            END
          ) as InsuranceCost
        FROM InsuranceRecords
        WHERE EndDate >= @StartDate AND StartDate <= @EndDate
        GROUP BY VehicleID
      ),
      InspectionStats AS (
        SELECT VehicleID, SUM(Cost) as InspectionCost
        FROM VehicleInspections
        WHERE InspectionDate BETWEEN @StartDate AND @EndDate
        GROUP BY VehicleID
      ),
      AccidentStats AS (
        SELECT VehicleID, SUM(Cost) as AccidentCost
        FROM AccidentRecords
        WHERE AccidentDate BETWEEN @StartDate AND @EndDate
        GROUP BY VehicleID
      ),
      AllKm AS (
        SELECT VehicleID, FuelDate as Date, Kilometer as Km FROM FuelRecords
        UNION ALL
        SELECT VehicleID, UpdateDate as Date, Kilometer as Km FROM KmUpdates
        UNION ALL
        SELECT VehicleID, ServiceDate as Date, Kilometer as Km FROM MaintenanceRecords
      ),
      KmStats AS (
        SELECT 
          v.VehicleID,
          CASE 
            WHEN e.EndKm > ISNULL(s.StartKm, 0) 
              THEN e.EndKm - ISNULL(s.StartKm, 0) 
            ELSE 0 
          END as TotalKm
        FROM Vehicles v
        OUTER APPLY (
          SELECT TOP 1 Km as StartKm
          FROM AllKm ak
          WHERE ak.VehicleID = v.VehicleID AND ak.Date < @StartDate
          ORDER BY ak.Date DESC
        ) s
        OUTER APPLY (
          SELECT TOP 1 Km as EndKm
          FROM AllKm ak
          WHERE ak.VehicleID = v.VehicleID AND ak.Date <= @EndDate
          ORDER BY ak.Date DESC
        ) e
      )
      SELECT 
        v.VehicleID,
        v.Plate,
        v.Make,
        v.Model,
        c.Name as CompanyName,
        d.Name as DepotName,
        CONCAT(u.Name, ' ', u.Surname) as DriverName,
        ISNULL(ks.TotalKm, 0) as TotalKm,
        ISNULL(fs.FuelCost, 0) as FuelCost,
        ISNULL(fs.TotalLiters, 0) as FuelLiters,
        ISNULL(ms.MaintenanceCost, 0) as MaintenanceCost,
        ISNULL(ms.MaintenanceCount, 0) as MaintenanceCount,
        ISNULL(is_stats.InsuranceCost, 0) as InsuranceCost,
        ISNULL(insp_stats.InspectionCost, 0) as InspectionCost,
        ISNULL(acc_stats.AccidentCost, 0) as AccidentCost,
        (SELECT TOP 1 NextServiceDate FROM MaintenanceRecords WHERE VehicleID = v.VehicleID AND NextServiceDate >= GETDATE() ORDER BY NextServiceDate ASC) as NextMaintenanceDate,
        (SELECT TOP 1 EndDate FROM InsuranceRecords WHERE VehicleID = v.VehicleID AND Type IN ('Traffic', 'Trafik Sigortası') AND EndDate >= GETDATE() ORDER BY EndDate ASC) as NextTrafficInsurance,
        (SELECT TOP 1 EndDate FROM InsuranceRecords WHERE VehicleID = v.VehicleID AND Type IN ('Kasko', 'Kasko Sigortası') AND EndDate >= GETDATE() ORDER BY EndDate ASC) as NextKasko,
        (SELECT TOP 1 NextInspectionDate FROM VehicleInspections WHERE VehicleID = v.VehicleID AND NextInspectionDate >= GETDATE() ORDER BY NextInspectionDate ASC) as NextInspectionDate,
        (ISNULL(fs.FuelCost, 0) + ISNULL(ms.MaintenanceCost, 0) + ISNULL(is_stats.InsuranceCost, 0) + ISNULL(insp_stats.InspectionCost, 0) + ISNULL(acc_stats.AccidentCost, 0)) as TotalCost,
        CASE 
            WHEN ISNULL(ks.TotalKm, 0) > 0 THEN (ISNULL(fs.TotalLiters, 0) * 100.0) / ks.TotalKm 
            ELSE 0 
        END as AvgConsumption,
        CASE 
            WHEN ISNULL(ks.TotalKm, 0) > 0 THEN (ISNULL(fs.FuelCost, 0) + ISNULL(ms.MaintenanceCost, 0) + ISNULL(is_stats.InsuranceCost, 0) + ISNULL(insp_stats.InspectionCost, 0) + ISNULL(acc_stats.AccidentCost, 0)) / ks.TotalKm 
            ELSE 0 
        END as CostPerKm
      FROM Vehicles v
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots d ON v.DepotID = d.DepotID
      LEFT JOIN Users u ON v.AssignedDriverID = u.UserID
      LEFT JOIN FuelStats fs ON v.VehicleID = fs.VehicleID
      LEFT JOIN MaintenanceStats ms ON v.VehicleID = ms.VehicleID
      LEFT JOIN InsuranceStats is_stats ON v.VehicleID = is_stats.VehicleID
      LEFT JOIN InspectionStats insp_stats ON v.VehicleID = insp_stats.VehicleID
      LEFT JOIN AccidentStats acc_stats ON v.VehicleID = acc_stats.VehicleID
      LEFT JOIN KmStats ks ON v.VehicleID = ks.VehicleID
      WHERE ${vehicleAccessCondition}
      AND (@FilterCompanyIDs IS NULL OR v.CompanyID IN (SELECT value FROM STRING_SPLIT(@FilterCompanyIDs, ',')))
      AND (@DepotID IS NULL OR v.DepotID = @DepotID)
      AND (@DriverID IS NULL OR v.AssignedDriverID = @DriverID)
      AND (@Plate IS NULL OR v.Plate LIKE '%' + @Plate + '%')
    `;

    const request = pool.request()
      .input('StartDate', sql.DateTime2, new Date(startDate as string))
      .input('EndDate', sql.DateTime2, new Date(new Date(endDate as string).setHours(23, 59, 59, 999)))
      .input('UserCompanyID', sql.Int, userCompanyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('FilterCompanyIDs', sql.NVarChar, companyIds ? String(companyIds) : null)
      .input('DepotID', sql.Int, depotId || null)
      .input('DriverID', sql.Int, driverId || null)
      .input('Plate', sql.NVarChar, plate || null);

    const result = await request.query(query);
    res.json(result.recordset);

  } catch (error) {
    console.error('Detailed report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getServiceHistoryReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, companyIds, depotId, driverId, plate, missingCost, page, limit } = req.query;
    // Check for both 'SuperAdmin' and 'Super Admin'
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const userCompanyId = isSuperAdmin ? null : req.user?.CompanyID;

    // Validasyon
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and End date are required' });
    }

    const pool = await connectDB();

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && req.user?.UserID) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, req.user.UserID)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    let vehicleAccessCondition = '1=1';
    if (!isSuperAdmin) {
      if (userDepotIds.length > 0) {
        vehicleAccessCondition = `v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        vehicleAccessCondition = `(@UserCompanyID IS NULL OR v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }
    
    // Pagination logic
    const isExport = limit === '0';
    const pageNum = page ? Math.max(1, parseInt(page as string)) : 1;
    const limitNum = limit && limit !== '0' ? Math.max(1, parseInt(limit as string)) : 50; 
    const offset = (pageNum - 1) * limitNum;

    const baseQuery = `
      SELECT 
        'ServiceRequest' as RecordType,
        sr.RequestID as RecordID,
        COALESCE(sr.ReturnDate, sr.CompletedDate, sr.RequestDate) as ServiceDate,
        v.Plate,
        v.Make,
        v.Model,
        c.Name as CompanyName,
        sr.Description,
        sr.ServiceType,
        sr.ActualCost as Cost,
        NULL as Kilometer,
        NULL as NextServiceKm,
        NULL as NextServiceDate,
        sc.Name as ServiceCompanyName,
        sr.ServiceActions as Actions
      FROM ServiceRequests sr
      JOIN Vehicles v ON sr.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN ServiceCompanies sc ON sr.ServiceCompanyID = sc.ServiceCompanyID
      WHERE (sr.ReturnDate BETWEEN @StartDate AND @EndDate OR sr.CompletedDate BETWEEN @StartDate AND @EndDate)
      AND sr.Status IN ('COMPLETED', 'RETURNED')
      AND ${vehicleAccessCondition}
      AND (@FilterCompanyIDs IS NULL OR v.CompanyID IN (SELECT value FROM STRING_SPLIT(@FilterCompanyIDs, ',')))
      AND (@DepotID IS NULL OR v.DepotID = @DepotID)
      AND (@DriverID IS NULL OR v.AssignedDriverID = @DriverID)
      AND (@Plate IS NULL OR v.Plate LIKE '%' + @Plate + '%')
      AND (@MissingCost = 0 OR (sr.ActualCost IS NULL OR sr.ActualCost = 0))

      UNION ALL

      SELECT 
        'MaintenanceRecord' as RecordType,
        mr.MaintenanceID as RecordID,
        mr.ServiceDate,
        v.Plate,
        v.Make,
        v.Model,
        c.Name as CompanyName,
        mr.Description,
        mr.Type as ServiceType,
        mr.Cost,
        mr.Kilometer,
        NULL as NextServiceKm,
        mr.NextServiceDate,
        NULL as ServiceCompanyName,
        NULL as Actions
      FROM MaintenanceRecords mr
      JOIN Vehicles v ON mr.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      WHERE mr.ServiceDate BETWEEN @StartDate AND @EndDate
      AND ${vehicleAccessCondition}
      AND (@FilterCompanyIDs IS NULL OR v.CompanyID IN (SELECT value FROM STRING_SPLIT(@FilterCompanyIDs, ',')))
      AND (@DepotID IS NULL OR v.DepotID = @DepotID)
      AND (@DriverID IS NULL OR v.AssignedDriverID = @DriverID)
      AND (@Plate IS NULL OR v.Plate LIKE '%' + @Plate + '%')
      AND (@MissingCost = 0 OR (mr.Cost IS NULL OR mr.Cost = 0))
    `;

    // If page/limit are explicitly provided OR we want to enforce default pagination:
    
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as T`;
    
    const dataQuery = isExport 
      ? `SELECT * FROM (${baseQuery}) as T ORDER BY ServiceDate DESC`
      : `
        SELECT * FROM (${baseQuery}) as T
        ORDER BY ServiceDate DESC
        OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
      `;

    const request = pool.request()
      .input('StartDate', sql.DateTime2, new Date(startDate as string))
      .input('EndDate', sql.DateTime2, new Date(new Date(endDate as string).setHours(23, 59, 59, 999)))
      .input('UserCompanyID', sql.Int, userCompanyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('FilterCompanyIDs', sql.NVarChar, companyIds ? String(companyIds) : null)
      .input('DepotID', sql.Int, depotId || null)
      .input('DriverID', sql.Int, driverId || null)
      .input('Plate', sql.NVarChar, plate || null)
      .input('MissingCost', sql.Bit, missingCost === 'true' ? 1 : 0);

    if (!isExport) {
      request.input('Offset', sql.Int, offset);
      request.input('Limit', sql.Int, limitNum);
    }

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery)
    ]);

    const total = countResult.recordset[0].total;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: dataResult.recordset,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages
      }
    });

  } catch (error) {
    console.error('Service history report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
