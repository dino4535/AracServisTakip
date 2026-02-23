import { Request, Response } from 'express';
import { connectDB } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import sql from 'mssql';

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const userId = req.user?.UserID;
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && userId) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, userId)
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
        accessCondition = `(v.CompanyID = @CompanyID OR @CompanyID IS NULL OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM Vehicles v WHERE ${accessCondition}) as TotalVehicles,
        (SELECT COUNT(*) FROM Vehicles v WHERE Status = 'Bakımda' AND ${accessCondition}) as VehiclesInMaintenance,
        (SELECT COUNT(*) FROM ServiceRequests sr 
         LEFT JOIN Vehicles v ON sr.VehicleID = v.VehicleID
         WHERE sr.Status = 'Pending' AND ${accessCondition}) as PendingServiceRequests,
        (SELECT COUNT(*) FROM InsuranceRecords ir
         LEFT JOIN Vehicles v ON ir.VehicleID = v.VehicleID
         WHERE ir.EndDate BETWEEN GETDATE() AND DATEADD(day, 30, GETDATE()) AND ${accessCondition}) as ExpiringInsurances,
        (SELECT COUNT(*) FROM MaintenanceRecords mr
         LEFT JOIN Vehicles v ON mr.VehicleID = v.VehicleID
         WHERE mr.NextServiceDate BETWEEN GETDATE() AND DATEADD(day, 7, GETDATE()) AND ${accessCondition}) as UpcomingMaintenance,
        (SELECT COUNT(*) FROM FuelRecords fr
         LEFT JOIN Vehicles v ON fr.VehicleID = v.VehicleID
         WHERE fr.FuelDate >= DATEADD(day, -30, GETDATE()) AND ${accessCondition}) as RecentFuelRecords
    `;

    const result = await pool
      .request()
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, userId)
      .query(statsQuery);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRecentActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const userId = req.user?.UserID;
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && userId) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, userId)
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
        accessCondition = `(v.CompanyID = @CompanyID OR @CompanyID IS NULL OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    const activityQuery = `
      SELECT TOP 10 
        'ServiceRequest' as Type,
        CAST(sr.RequestID AS NVARCHAR) as ItemId,
        sr.Description as Title,
        sr.RequestDate as Date,
        sr.Status,
        'service_requests' as Module
      FROM ServiceRequests sr
      LEFT JOIN Vehicles v ON sr.VehicleID = v.VehicleID
      WHERE ${accessCondition}
      UNION ALL
      SELECT TOP 10 
        'Maintenance' as Type,
        CAST(mr.MaintenanceID AS NVARCHAR) as ItemId,
        mr.Description as Title,
        mr.ServiceDate as Date,
        'Completed' as Status,
        'maintenance' as Module
      FROM MaintenanceRecords mr
      LEFT JOIN Vehicles v ON mr.VehicleID = v.VehicleID
      WHERE ${accessCondition}
      UNION ALL
      SELECT TOP 10 
        'Fuel' as Type,
        CAST(fr.FuelRecordID AS NVARCHAR) as ItemId,
        'Yakıt dolumu' as Title,
        fr.FuelDate as Date,
        'Completed' as Status,
        'fuel' as Module
      FROM FuelRecords fr
      LEFT JOIN Vehicles v ON fr.VehicleID = v.VehicleID
      WHERE ${accessCondition}
      ORDER BY Date DESC
    `;

    const result = await pool
      .request()
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, userId)
      .query(activityQuery);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFuelConsumption = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const userId = req.user?.UserID;
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && userId) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, userId)
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
        accessCondition = `(v.CompanyID = @CompanyID OR @CompanyID IS NULL OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    // Get date 6 months ago from the first day of that month
    const dateQuery = `
      DECLARE @StartDate DATE = DATEADD(MONTH, -6, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));
      
      SELECT 
        DATEPART(MONTH, fr.FuelDate) as Month,
        DATEPART(YEAR, fr.FuelDate) as Year,
        c.Name as CompanyName,
        SUM(fr.TotalCost) as TotalCost
      FROM FuelRecords fr
      LEFT JOIN Vehicles v ON fr.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      WHERE fr.FuelDate >= @StartDate
      AND ${accessCondition}
      GROUP BY DATEPART(MONTH, fr.FuelDate), DATEPART(YEAR, fr.FuelDate), c.Name
      ORDER BY Year DESC, Month DESC, c.Name
    `;

    const result = await pool
      .request()
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, userId)
      .query(dateQuery);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get fuel consumption error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMaintenanceCosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const userId = req.user?.UserID;
    const isSuperAdmin = req.user?.Role === 'SuperAdmin' || req.user?.Role === 'Super Admin';
    const companyId = isSuperAdmin ? null : req.user?.CompanyID;

    let userDepotIds: number[] = [];
    if (!isSuperAdmin && userId) {
      const depotResult = await pool
        .request()
        .input('UserID', sql.Int, userId)
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
        accessCondition = `(v.CompanyID = @CompanyID OR @CompanyID IS NULL OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    // Monthly breakdown by company for last 6 months + current
    const query = `
      DECLARE @StartDate DATE = DATEADD(MONTH, -6, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));

      WITH CombinedMaintenance AS (
        SELECT 
          mr.ServiceDate as Date,
          mr.Cost,
          mr.VehicleID
        FROM MaintenanceRecords mr
        WHERE mr.ServiceDate >= @StartDate

        UNION ALL

        SELECT 
          sr.CompletedDate as Date,
          sr.ActualCost as Cost,
          sr.VehicleID
        FROM ServiceRequests sr
        WHERE sr.Status = 'COMPLETED' 
          AND sr.CompletedDate >= @StartDate
          AND sr.ActualCost > 0
      )
      SELECT 
        DATEPART(YEAR, cm.Date) as Year,
        DATEPART(MONTH, cm.Date) as Month,
        c.Name as CompanyName,
        SUM(cm.Cost) as TotalCost
      FROM CombinedMaintenance cm
      LEFT JOIN Vehicles v ON cm.VehicleID = v.VehicleID
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      WHERE ${accessCondition}
      GROUP BY DATEPART(YEAR, cm.Date), DATEPART(MONTH, cm.Date), c.Name
      ORDER BY Year DESC, Month DESC, c.Name
    `;

    const result = await pool
      .request()
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, userId)
      .query(query);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get maintenance costs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
