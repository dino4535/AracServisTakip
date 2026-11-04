import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../services/auditService';
import { isElevatedRole, companyScopeSql } from '../utils/authScope';

const parseDecimal10_2 = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!isFinite(value)) return null;
    const rounded = Math.round(value * 100) / 100;
    if (rounded < 0 || Math.abs(rounded) > 99999999.99) return null;
    return rounded;
  }
  if (typeof value !== 'string') return null;

  let s = value.trim();
  if (s === '') return null;

  s = s.replace(/\s+/g, '');
  s = s.replace(/[₺]/g, '');
  s = s.replace(/[a-zA-Z]/g, '');

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '');
      s = s.replace(/,/g, '.');
    } else {
      s = s.replace(/,/g, '');
      const dotCount = (s.match(/\./g) || []).length;
      if (dotCount > 1) {
        const parts = s.split('.');
        const last = parts.pop();
        s = `${parts.join('')}.${last}`;
      }
    }
  } else if (hasComma) {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1) {
      const parts = s.split(',');
      const last = parts.pop();
      s = `${parts.join('')},${last}`;
    }
    s = s.replace(/,/g, '.');
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      const parts = s.split('.');
      const last = parts.pop();
      s = `${parts.join('')}.${last}`;
    }
  }

  s = s.replace(/[^0-9.-]/g, '');
  const num = parseFloat(s);
  if (!isFinite(num)) return null;

  const rounded = Math.round(num * 100) / 100;
  if (rounded < 0 || Math.abs(rounded) > 99999999.99) return null;
  return rounded;
};

export const getAllInsuranceRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, type, page = 1, limit = 50, sortField, sortDirection, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(0, parseInt(limit as string));
    const offset = limitNum > 0 ? (pageNum - 1) * limitNum : 0;

    const pool = await connectDB();
    const userId = req.user?.UserID;
    const elevated = isElevatedRole(req.user?.Role);
    const companyId = elevated ? null : req.user?.CompanyID;

    let whereClause = 'WHERE 1=1';

    const sortFieldStr = (sortField as string) || 'EndDate';
    const sortDirectionStr = ((sortDirection as string) || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let orderByColumn = 'i.EndDate';

    switch (sortFieldStr) {
      case 'Plate':
        orderByColumn = 'v.Plate';
        break;
      case 'Type':
        orderByColumn = 'i.Type';
        break;
      case 'InsuranceCompany':
        orderByColumn = 'i.InsuranceCompany';
        break;
      case 'PolicyNumber':
        orderByColumn = 'i.PolicyNumber';
        break;
      case 'StartDate':
        orderByColumn = 'i.StartDate';
        break;
      case 'EndDate':
        orderByColumn = 'i.EndDate';
        break;
      case 'Cost':
        orderByColumn = 'i.Cost';
        break;
      default:
        orderByColumn = 'i.EndDate';
        break;
    }

    let userDepotIds: number[] = [];
    if (!elevated && userId) {
      const depotResult = await pool.request()
        .input('UserID', sql.Int, userId)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    if (!elevated) {
      if (userDepotIds.length > 0) {
        whereClause += ` AND v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        whereClause += ` AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}`;
      }
    } else {
      whereClause += ` AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}`;
    }

    if (vehicleId) {
      whereClause += ` AND i.VehicleID = @VehicleID`;
    }
    if (type) {
      whereClause += ` AND i.Type = @Type`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        i.PolicyNumber LIKE '%' + @SearchTerm + '%' OR
        i.InsuranceCompany LIKE '%' + @SearchTerm + '%' OR
        i.Type LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const countQuery = limitNum > 0
      ? `
        SELECT COUNT(*) as total
        FROM InsuranceRecords i
        LEFT JOIN Vehicles v ON i.VehicleID = v.VehicleID
        ${whereClause}
      `
      : '';

    const dataQuery = `
      SELECT 
        i.*, 
        v.Plate
      FROM InsuranceRecords i
      LEFT JOIN Vehicles v ON i.VehicleID = v.VehicleID
      ${whereClause}
      ORDER BY ${orderByColumn} ${sortDirectionStr}
      ${limitNum > 0 ? 'OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY' : ''}
    `;

    const request = pool.request();

    if (limitNum > 0) {
      request.input('Offset', sql.Int, offset).input('Limit', sql.Int, limitNum);
    }
    
    request.input('CompanyID', sql.Int, companyId);
    request.input('UserID', sql.Int, userId);

    if (vehicleId) {
      request.input('VehicleID', sql.Int, Number(vehicleId));
    }
    if (type) {
      request.input('Type', sql.NVarChar(50), type);
    }
    if (search) {
      request.input('SearchTerm', sql.NVarChar(100), search);
    }

    if (limitNum > 0) {
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
      return;
    }

    const dataResult = await request.query(dataQuery);

    res.json({
      data: dataResult.recordset,
      pagination: null
    });
  } catch (error) {
    console.error('Get insurance records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInsuranceById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id as string, 10);

    if (isNaN(numericId)) {
      res.status(400).json({ error: 'Invalid insurance id' });
      return;
    }
    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);
    const companyId = elevated ? null : req.user?.CompanyID;

    const result = await pool
      .request()
      .input('InsuranceID', sql.Int, numericId)
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 
          i.*, 
          v.Plate
        FROM InsuranceRecords i
        LEFT JOIN Vehicles v ON i.VehicleID = v.VehicleID
        WHERE i.InsuranceID = @InsuranceID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Insurance record not found' });
      return;
    }

    res.json({ insuranceRecord: result.recordset[0] });
  } catch (error) {
    console.error('Get insurance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createInsuranceRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, type, policyNumber, insuranceCompany, startDate, endDate, cost, notes } = req.body;

    if (!vehicleId || !type || !startDate || !endDate) {
      res.status(400).json({ error: 'VehicleId, type, startDate, and endDate are required' });
      return;
    }

    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
      res.status(400).json({ error: 'Invalid vehicleId' });
      return;
    }

    const parsedStartDate = startDate instanceof Date ? startDate : new Date(startDate);
    const parsedEndDate = endDate instanceof Date ? endDate : new Date(endDate);
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      res.status(400).json({ error: 'Invalid startDate or endDate' });
      return;
    }

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);
    const companyId = elevated ? null : req.user?.CompanyID;

    // Check access
    const check = await pool.request()
      .input('VehicleID', sql.Int, parsedVehicleId)
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 
        FROM Vehicles v
        WHERE v.VehicleID = @VehicleID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (check.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this vehicle' });
      return;
    }

    const parsedCost = parseDecimal10_2(cost);
    const costProvided = !(
      cost === undefined ||
      cost === null ||
      cost === '' ||
      (typeof cost === 'number' && !isFinite(cost))
    );
    if (costProvided && parsedCost === null) {
      res.status(400).json({ error: 'Invalid cost' });
      return;
    }

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, parsedVehicleId)
      .input('Type', sql.NVarChar(30), type)
      .input('PolicyNumber', sql.NVarChar(50), policyNumber || null)
      .input('InsuranceCompany', sql.NVarChar(100), insuranceCompany || null)
      .input('StartDate', sql.DateTime2, parsedStartDate)
      .input('EndDate', sql.DateTime2, parsedEndDate)
      .input('Cost', sql.Decimal(10, 2), parsedCost)
      .input('Notes', sql.NVarChar(500), notes || null)
      .query(`
        INSERT INTO InsuranceRecords (VehicleID, Type, PolicyNumber, InsuranceCompany, StartDate, EndDate, Cost, Notes)
        OUTPUT inserted.*
        VALUES (@VehicleID, @Type, @PolicyNumber, @InsuranceCompany, @StartDate, @EndDate, @Cost, @Notes)
      `);

    const newRecord = result.recordset[0];

    // Audit Log
    await logAudit(
      req.user?.UserID,
      'CREATE_INSURANCE',
      'InsuranceRecords',
      newRecord.InsuranceID,
      { vehicleId, type, policyNumber, cost },
      req.ip || '0.0.0.0'
    );

    res.status(201).json({
      message: 'Insurance record created successfully',
      insuranceRecord: newRecord,
    });
  } catch (error) {
    console.error('Create insurance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateInsuranceRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { type, policyNumber, insuranceCompany, startDate, endDate, cost, notes } = req.body;

    const pool = await connectDB();

    const parsedStartDate = startDate instanceof Date ? startDate : (startDate ? new Date(startDate) : null);
    const parsedEndDate = endDate instanceof Date ? endDate : (endDate ? new Date(endDate) : null);
    if ((parsedStartDate && isNaN(parsedStartDate.getTime())) || (parsedEndDate && isNaN(parsedEndDate.getTime()))) {
      res.status(400).json({ error: 'Invalid startDate or endDate' });
      return;
    }

    // Check access
    const elevated = isElevatedRole(req.user?.Role);
    const companyId = elevated ? null : req.user?.CompanyID;

    const check = await pool.request()
      .input('InsuranceID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 
        FROM InsuranceRecords i
        JOIN Vehicles v ON i.VehicleID = v.VehicleID
        WHERE i.InsuranceID = @InsuranceID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (check.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this insurance record' });
      return;
    }

    const parsedCost = parseDecimal10_2(cost);
    const costProvided = !(
      cost === undefined ||
      cost === null ||
      cost === '' ||
      (typeof cost === 'number' && !isFinite(cost))
    );
    if (costProvided && parsedCost === null) {
      res.status(400).json({ error: 'Invalid cost' });
      return;
    }

    const result = await pool
      .request()
      .input('InsuranceID', sql.Int, Number(id))
      .input('Type', sql.NVarChar(30), type)
      .input('PolicyNumber', sql.NVarChar(50), policyNumber || null)
      .input('InsuranceCompany', sql.NVarChar(100), insuranceCompany || null)
      .input('StartDate', sql.DateTime2, parsedStartDate)
      .input('EndDate', sql.DateTime2, parsedEndDate)
      .input('Cost', sql.Decimal(10, 2), parsedCost)
      .input('Notes', sql.NVarChar(500), notes || null)
      .query(`
        UPDATE InsuranceRecords
        SET Type = @Type,
            PolicyNumber = @PolicyNumber,
            InsuranceCompany = @InsuranceCompany,
            StartDate = @StartDate,
            EndDate = @EndDate,
            Cost = @Cost,
            Notes = @Notes
        OUTPUT inserted.*
        WHERE InsuranceID = @InsuranceID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Insurance record not found' });
      return;
    }

    const updatedRecord = result.recordset[0];

    // Audit Log
    await logAudit(
      req.user?.UserID,
      'UPDATE_INSURANCE',
      'InsuranceRecords',
      Number(id),
      { type, policyNumber, cost, changes: req.body },
      req.ip || '0.0.0.0'
    );

    res.json({
      message: 'Insurance record updated successfully',
      insuranceRecord: updatedRecord,
    });
  } catch (error) {
    console.error('Update insurance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteInsuranceRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);
    const companyId = elevated ? null : req.user?.CompanyID;

    // Check access
    const check = await pool.request()
      .input('InsuranceID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 
        FROM InsuranceRecords i
        JOIN Vehicles v ON i.VehicleID = v.VehicleID
        WHERE i.InsuranceID = @InsuranceID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (check.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this insurance record' });
      return;
    }

    const result = await pool
      .request()
      .input('InsuranceID', sql.Int, Number(id))
      .query('DELETE FROM InsuranceRecords OUTPUT deleted.InsuranceID WHERE InsuranceID = @InsuranceID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Insurance record not found' });
      return;
    }

    // Audit Log
    await logAudit(
      req.user?.UserID,
      'DELETE_INSURANCE',
      'InsuranceRecords',
      Number(id),
      { deletedId: id },
      req.ip || '0.0.0.0'
    );

    res.json({ message: 'Insurance record deleted successfully' });
  } catch (error) {
    console.error('Delete insurance record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInsuranceSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);
    const userCompanyId = elevated ? null : req.user?.CompanyID;

    const query = `
      SELECT
        v.VehicleID,
        v.Plate,
        c.Name as CompanyName,
        d.Name as DepotName,
        ins.NextRenewalDate,
        ins.HasAnyPolicy,
        ins.HasActivePolicy,
        ins.NextTrafficEndDate,
        ins.NextKaskoEndDate,
        ins.HasTrafficPolicy,
        ins.HasActiveTrafficPolicy,
        ins.HasKaskoPolicy,
        ins.HasActiveKaskoPolicy
      FROM Vehicles v
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots d ON v.DepotID = d.DepotID
      OUTER APPLY (
        SELECT
          MIN(CASE WHEN ir.EndDate >= CAST(GETDATE() AS DATE) THEN ir.EndDate END) as NextRenewalDate,
          CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END as HasAnyPolicy,
          CASE WHEN SUM(CASE WHEN ir.EndDate >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END as HasActivePolicy,
          MIN(
            CASE
              WHEN UPPER(ir.Type) IN ('TRAFFIC', 'TRAFIK', 'TRAFİK', 'TRAFIK SIGORTASI', 'TRAFİK SİGORTASI', 'TSP')
                AND ir.EndDate >= CAST(GETDATE() AS DATE)
              THEN ir.EndDate
            END
          ) as NextTrafficEndDate,
          MIN(
            CASE
              WHEN UPPER(ir.Type) IN ('KASKO', 'KASKO SIGORTASI', 'KASKO SİGORTASI', 'KSP')
                AND ir.EndDate >= CAST(GETDATE() AS DATE)
              THEN ir.EndDate
            END
          ) as NextKaskoEndDate,
          CASE
            WHEN SUM(
              CASE
                WHEN UPPER(ir.Type) IN ('TRAFFIC', 'TRAFIK', 'TRAFİK', 'TRAFIK SIGORTASI', 'TRAFİK SİGORTASI', 'TSP')
                THEN 1 ELSE 0
              END
            ) > 0 THEN 1 ELSE 0
          END as HasTrafficPolicy,
          CASE
            WHEN SUM(
              CASE
                WHEN UPPER(ir.Type) IN ('TRAFFIC', 'TRAFIK', 'TRAFİK', 'TRAFIK SIGORTASI', 'TRAFİK SİGORTASI', 'TSP')
                  AND ir.EndDate >= CAST(GETDATE() AS DATE)
                THEN 1 ELSE 0
              END
            ) > 0 THEN 1 ELSE 0
          END as HasActiveTrafficPolicy,
          CASE
            WHEN SUM(
              CASE
                WHEN UPPER(ir.Type) IN ('KASKO', 'KASKO SIGORTASI', 'KASKO SİGORTASI', 'KSP')
                THEN 1 ELSE 0
              END
            ) > 0 THEN 1 ELSE 0
          END as HasKaskoPolicy,
          CASE
            WHEN SUM(
              CASE
                WHEN UPPER(ir.Type) IN ('KASKO', 'KASKO SIGORTASI', 'KASKO SİGORTASI', 'KSP')
                  AND ir.EndDate >= CAST(GETDATE() AS DATE)
                THEN 1 ELSE 0
              END
            ) > 0 THEN 1 ELSE 0
          END as HasActiveKaskoPolicy
        FROM InsuranceRecords ir
        WHERE ir.VehicleID = v.VehicleID
      ) ins
      WHERE (@UserCompanyID IS NULL OR v.CompanyID = @UserCompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      ORDER BY
        CASE WHEN ins.NextRenewalDate IS NULL THEN 1 ELSE 0 END,
        ins.NextRenewalDate ASC,
        v.Plate
    `;

    const request = pool.request()
      .input('UserCompanyID', sql.Int, userCompanyId || null)
      .input('UserID', sql.Int, req.user?.UserID);

    const result = await request.query(query);
    res.json({ data: result.recordset });
  } catch (error) {
    console.error('Get insurance summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
