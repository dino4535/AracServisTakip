import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../services/auditService';

export const getAllInspections = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;
    
    const pool = await connectDB();
    const companyId = req.user?.CompanyID;
    const userId = req.user?.UserID;
    const userRole = req.user?.Role;

    let whereClause = 'WHERE 1=1';

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
      } else if (companyId) {
        whereClause += ` AND v.CompanyID = @CompanyID`;
      } else {
        whereClause += ` AND (v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    if (vehicleId) {
      whereClause += ` AND i.VehicleID = @VehicleID`;
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
      FROM VehicleInspections i
      LEFT JOIN Vehicles v ON i.VehicleID = v.VehicleID
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        i.*, 
        v.Plate,
        v.Make,
        v.Model
      FROM VehicleInspections i
      LEFT JOIN Vehicles v ON i.VehicleID = v.VehicleID
      ${whereClause}
      ORDER BY i.NextInspectionDate ASC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request()
      .input('Offset', sql.Int, offset)
      .input('Limit', sql.Int, limitNum);
    
    if (!isSuperAdmin) {
      if (companyId) {
        request.input('CompanyID', sql.Int, companyId);
      }
      if (userId) {
        request.input('UserID', sql.Int, userId);
      }
    }
    
    if (vehicleId) {
      request.input('VehicleID', sql.Int, vehicleId);
    }
    if (search) {
      request.input('SearchTerm', sql.NVarChar(100), search);
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
    console.error('Get inspections error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInspectionById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();
    const companyId = req.user?.CompanyID;

    const result = await pool
      .request()
      .input('InspectionID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, companyId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 
          i.*, 
          v.Plate
        FROM VehicleInspections i
        LEFT JOIN Vehicles v ON i.VehicleID = v.VehicleID
        WHERE i.InspectionID = @InspectionID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Inspection record not found' });
      return;
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Get inspection record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createInspection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body: any = req.body;

    const vehicleId = body.vehicleId ?? body.VehicleID;
    const inspectionDate = body.inspectionDate ?? body.InspectionDate;
    const nextInspectionDate = body.nextInspectionDate ?? body.NextInspectionDate;
    const cost = body.cost ?? body.Cost;
    const notes = body.notes ?? body.Notes;

    if (!vehicleId || !inspectionDate || !nextInspectionDate) {
      res.status(400).json({ error: 'VehicleId, InspectionDate, and NextInspectionDate are required' });
      return;
    }

    const pool = await connectDB();

    // Verify vehicle access
    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 1 FROM Vehicles v
        WHERE VehicleID = @VehicleID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);
      
    if (vehicleCheck.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this vehicle' });
      return;
    }

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('InspectionDate', sql.DateTime2, inspectionDate)
      .input('NextInspectionDate', sql.DateTime2, nextInspectionDate)
      .input('Cost', sql.Decimal(10, 2), cost || 0)
      .input('Notes', sql.NVarChar(500), notes || null)
      .query(`
        INSERT INTO VehicleInspections (VehicleID, InspectionDate, NextInspectionDate, Cost, Notes)
        OUTPUT inserted.*
        VALUES (@VehicleID, @InspectionDate, @NextInspectionDate, @Cost, @Notes)
      `);

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'CREATE_INSPECTION',
      'VehicleInspections',
      result.recordset[0].InspectionID,
      { vehicleId, inspectionDate, nextInspectionDate },
      req.ip || '0.0.0.0'
    );

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Create inspection record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateInspection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body: any = req.body;

    const inspectionDate = body.inspectionDate ?? body.InspectionDate;
    const nextInspectionDate = body.nextInspectionDate ?? body.NextInspectionDate;
    const cost = body.cost ?? body.Cost;
    const notes = body.notes ?? body.Notes;

    const pool = await connectDB();

    const check = await pool.request()
      .input('InspectionID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT i.*, v.CompanyID
        FROM VehicleInspections i
        JOIN Vehicles v ON i.VehicleID = v.VehicleID
        WHERE i.InspectionID = @InspectionID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (check.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this inspection record' });
      return;
    }

    const existing = check.recordset[0];

    const hasInspectionDate =
      inspectionDate !== undefined && inspectionDate !== null && inspectionDate !== '';
    const hasNextInspectionDate =
      nextInspectionDate !== undefined && nextInspectionDate !== null && nextInspectionDate !== '';

    const finalInspectionDate = hasInspectionDate ? inspectionDate : existing.InspectionDate;
    const finalNextInspectionDate = hasNextInspectionDate
      ? nextInspectionDate
      : existing.NextInspectionDate;
    const finalCost =
      cost !== undefined && cost !== null && cost !== '' ? Number(cost) : existing.Cost || 0;
    const finalNotes = notes !== undefined ? notes : existing.Notes || null;

    const result = await pool
      .request()
      .input('InspectionID', sql.Int, Number(id))
      .input('InspectionDate', sql.DateTime2, finalInspectionDate)
      .input('NextInspectionDate', sql.DateTime2, finalNextInspectionDate)
      .input('Cost', sql.Decimal(10, 2), finalCost)
      .input('Notes', sql.NVarChar(500), finalNotes)
      .query(`
        UPDATE VehicleInspections
        SET InspectionDate = @InspectionDate,
            NextInspectionDate = @NextInspectionDate,
            Cost = @Cost,
            Notes = @Notes
        OUTPUT inserted.*
        WHERE InspectionID = @InspectionID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Inspection record not found' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'UPDATE_INSPECTION',
      'VehicleInspections',
      Number(id),
      { 
        inspectionId: id,
        inspectionDate, 
        nextInspectionDate,
        cost 
      },
      req.ip || '0.0.0.0'
    );

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Update inspection record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteInspection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Check access
    const check = await pool.request()
      .input('InspectionID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 1 
        FROM VehicleInspections i
        JOIN Vehicles v ON i.VehicleID = v.VehicleID
        WHERE i.InspectionID = @InspectionID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (check.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this inspection record' });
      return;
    }

    const result = await pool
      .request()
      .input('InspectionID', sql.Int, Number(id))
      .query('DELETE FROM VehicleInspections OUTPUT deleted.InspectionID WHERE InspectionID = @InspectionID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Inspection record not found' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'DELETE_INSPECTION',
      'VehicleInspections',
      Number(id),
      { inspectionId: id },
      req.ip || '0.0.0.0'
    );

    res.json({ message: 'Inspection record deleted successfully' });
  } catch (error) {
    console.error('Delete inspection record error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
