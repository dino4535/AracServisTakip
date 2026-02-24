
import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { accidentSchema } from '../schemas/accidentSchema';
import { logAudit } from '../services/auditService';
import { createNotification } from '../services/notificationService';
import { sendEmail } from '../services/emailService';

export const getAllAccidents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, status, page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;
    
    const pool = await connectDB();
    const companyId = req.user?.CompanyID;

    let whereClause = 'WHERE 1=1';

    if (req.user?.Role !== 'SuperAdmin') {
      whereClause += ` AND (v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
    }

    if (vehicleId) {
      whereClause += ` AND a.VehicleID = @VehicleID`;
    }
    if (status) {
      whereClause += ` AND a.Status = @Status`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        v.Make LIKE '%' + @SearchTerm + '%' OR
        v.Model LIKE '%' + @SearchTerm + '%' OR
        a.Location LIKE '%' + @SearchTerm + '%' OR
        a.ReportNumber LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const baseFromClause = `
      FROM AccidentRecords a
      LEFT JOIN Vehicles v ON a.VehicleID = v.VehicleID
      LEFT JOIN Users u ON a.DriverID = u.UserID
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      ${baseFromClause}
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        a.*, 
        v.Plate,
        v.Make,
        v.Model,
        CONCAT(u.Name, ' ', u.Surname) as DriverName
      ${baseFromClause}
      ${whereClause}
      ORDER BY a.AccidentDate DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request()
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Offset', sql.Int, offset)
      .input('Limit', sql.Int, limitNum);
    
    if (req.user?.Role !== 'SuperAdmin') {
      request.input('CompanyID', sql.Int, companyId || 0);
    }
    
    if (vehicleId) {
      request.input('VehicleID', sql.Int, vehicleId);
    }
    if (status) {
      request.input('Status', sql.NVarChar(20), status);
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
    console.error('Get accidents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAccidentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();
    const companyId = req.user?.CompanyID;

    const result = await pool
      .request()
      .input('AccidentID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, companyId || 0)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT 
          a.*, 
          v.Plate,
          v.Make,
          v.Model,
          CONCAT(u.Name, ' ', u.Surname) as DriverName
        FROM AccidentRecords a
        LEFT JOIN Vehicles v ON a.VehicleID = v.VehicleID
        LEFT JOIN Users u ON a.DriverID = u.UserID
        WHERE a.AccidentID = @AccidentID
        AND (@Role = 'SuperAdmin' OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Accident record not found' });
      return;
    }

    res.json({ accident: result.recordset[0] });
  } catch (error) {
    console.error('Get accident error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAccident = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Handle empty driverId
    if (req.body.driverId === 0 || req.body.driverId === '') {
      req.body.driverId = null;
    }

    const validation = accidentSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { vehicleId, driverId, accidentDate, reportNumber, description, cost, faultRate, status, location } = validation.data;
    const pool = await connectDB();

    // Verify vehicle access
    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT CompanyID FROM Vehicles v
        WHERE VehicleID = @VehicleID
        AND (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);
      
    if (vehicleCheck.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this vehicle' });
      return;
    }

    const vehicleCompanyId = vehicleCheck.recordset[0].CompanyID;

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('DriverID', sql.Int, driverId)
      .input('AccidentDate', sql.DateTime2, new Date(accidentDate))
      .input('ReportNumber', sql.NVarChar(50), reportNumber || null)
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('Cost', sql.Decimal(10, 2), cost || null)
      .input('FaultRate', sql.NVarChar(20), faultRate !== null && faultRate !== undefined ? String(faultRate) : null)
      .input('Status', sql.NVarChar(20), status || 'OPEN')
      .input('Location', sql.NVarChar(200), location || null)
      .query(`
        INSERT INTO AccidentRecords (VehicleID, DriverID, AccidentDate, ReportNumber, Description, Cost, FaultRate, Status, Location)
        OUTPUT inserted.*
        VALUES (@VehicleID, @DriverID, @AccidentDate, @ReportNumber, @Description, @Cost, @FaultRate, @Status, @Location)
      `);

    const newAccident = result.recordset[0];

    // Log Audit (safe to fail, but good to keep)
    try {
      await logAudit(
        req.user?.UserID,
        'CREATE_ACCIDENT',
        'AccidentRecords',
        newAccident.AccidentID,
        { vehicleId, driverId, status },
        req.ip || '0.0.0.0'
      );
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    // Notifications (safe to fail)
    try {
      // Notify driver if assigned
      if (driverId) {
        await createNotification(
          driverId,
          'ACCIDENT_CREATED',
          'Kaza Kaydı Oluşturuldu',
          'Adınıza yeni bir kaza kaydı oluşturuldu.',
          newAccident.AccidentID
        );
        
        // Get driver email
        const driverResult = await pool.request()
          .input('UserID', sql.Int, driverId)
          .query('SELECT Email FROM Users WHERE UserID = @UserID');
        
        if (driverResult.recordset[0]?.Email) {
          await sendEmail(
            driverResult.recordset[0].Email,
            'Yeni Kaza Kaydı',
            'Adınıza yeni bir kaza kaydı oluşturuldu.'
          );
        }
      }

      // Notify Company Admins
      const adminResult = await pool.request()
        .input('CompanyID', sql.Int, vehicleCompanyId)
        .query(`
          SELECT DISTINCT u.UserID, u.Email 
          FROM Users u
          JOIN UserRoles ur ON u.UserID = ur.UserID
          JOIN Roles r ON ur.RoleID = r.RoleID
          LEFT JOIN UserCompanies uc ON u.UserID = uc.UserID
          WHERE 
            (u.CompanyID = @CompanyID OR uc.CompanyID = @CompanyID)
            AND r.Name = 'ADMIN' 
            AND u.IsActive = 1
        `);
      
      for (const admin of adminResult.recordset) {
        await createNotification(
          admin.UserID,
          'NEW_ACCIDENT',
          'Yeni Kaza Kaydı',
          `Araç ID: ${vehicleId} için yeni kaza kaydı oluşturuldu.`,
          newAccident.AccidentID
        );
        
        if (admin.Email) {
          await sendEmail(
            admin.Email,
            'Yeni Kaza Bildirimi',
            `Araç ID: ${vehicleId} için yeni kaza kaydı sisteme girildi.`
          );
        }
      }
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
    }

    res.status(201).json({ accident: newAccident });
  } catch (error) {
    console.error('Create accident error:', error);
    res.status(500).json({ error: 'Internal server error', details: (error as Error).message });
  }
};

export const updateAccident = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = accidentSchema.partial().safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { vehicleId, driverId, accidentDate, reportNumber, description, cost, faultRate, status, location } = validation.data;
    const pool = await connectDB();

    // Check access
    const checkQuery = await pool.request()
      .input('AccidentID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Role', sql.NVarChar(50), req.user?.Role)
      .query(`
        SELECT a.AccidentID, a.VehicleID, a.Status, a.DriverID
        FROM AccidentRecords a
        JOIN Vehicles v ON a.VehicleID = v.VehicleID
        WHERE a.AccidentID = @AccidentID
        AND (@Role = 'SuperAdmin' OR @CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this accident record' });
      return;
    }

    const currentAccident = checkQuery.recordset[0];

    const result = await pool
      .request()
      .input('AccidentID', sql.Int, Number(id))
      .input('VehicleID', sql.Int, vehicleId)
      .input('DriverID', sql.Int, driverId)
      .input('AccidentDate', sql.DateTime2, accidentDate ? new Date(accidentDate) : null)
      .input('ReportNumber', sql.NVarChar(50), reportNumber || null)
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('Cost', sql.Decimal(10, 2), cost || null)
      .input('FaultRate', sql.NVarChar(20), faultRate !== null && faultRate !== undefined ? String(faultRate) : null)
      .input('Status', sql.NVarChar(20), status || null)
      .input('Location', sql.NVarChar(200), location || null)
      .query(`
        UPDATE AccidentRecords
        SET 
          VehicleID = COALESCE(@VehicleID, VehicleID),
          DriverID = COALESCE(@DriverID, DriverID),
          AccidentDate = COALESCE(@AccidentDate, AccidentDate),
          ReportNumber = COALESCE(@ReportNumber, ReportNumber),
          Description = COALESCE(@Description, Description),
          Cost = COALESCE(@Cost, Cost),
          FaultRate = COALESCE(@FaultRate, FaultRate),
          Status = COALESCE(@Status, Status),
          Location = COALESCE(@Location, Location),
          UpdatedAt = GETDATE()
        OUTPUT inserted.*
        WHERE AccidentID = @AccidentID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Accident record not found' });
      return;
    }

    const updatedAccident = result.recordset[0];

    // Log Audit
    try {
      await logAudit(
        req.user?.UserID,
        'UPDATE_ACCIDENT',
        'AccidentRecords',
        Number(id),
        { 
          vehicleId: updatedAccident.VehicleID, 
          status: updatedAccident.Status,
          changes: validation.data 
        },
        req.ip || '0.0.0.0'
      );
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    // Notify driver if status changed or just notify about update
    try {
      if (updatedAccident.DriverID) {
        // Get vehicle info
        const vehicleResult = await pool.request()
          .input('VehicleID', sql.Int, updatedAccident.VehicleID)
          .query('SELECT Plate, Make, Model FROM Vehicles WHERE VehicleID = @VehicleID');
        
        const vehicle = vehicleResult.recordset[0];
        const vehicleInfo = vehicle ? `${vehicle.Plate}` : 'Araç';
        const message = `${vehicleInfo} plakalı araç için kaza kaydı güncellendi. Yeni Durum: ${updatedAccident.Status}`;

        await createNotification(
          updatedAccident.DriverID,
          'ACCIDENT_UPDATED',
          'Kaza Kaydı Güncellendi',
          message,
          updatedAccident.AccidentID
        );
        
        // Get driver email
        const driverResult = await pool.request()
          .input('UserID', sql.Int, updatedAccident.DriverID)
          .query('SELECT Email FROM Users WHERE UserID = @UserID');
          
        const driverEmail = driverResult.recordset[0]?.Email;
        if (driverEmail) {
          await sendEmail(driverEmail, 'Kaza Kaydı Güncellendi', message);
        }
      }
    } catch (notificationError) {
      console.error('Notification error:', notificationError);
    }

    res.json({
      message: 'Accident record updated successfully',
      accident: updatedAccident,
    });
  } catch (error) {
    console.error('Update accident error:', error);
    res.status(500).json({ error: 'Internal server error', details: (error as Error).message });
  }
};

export const deleteAccident = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Check access before delete
    const check = await pool.request()
      .input('AccidentID', sql.Int, id)
      .input('CompanyID', sql.Int, req.user?.CompanyID)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT a.AccidentID 
        FROM AccidentRecords a
        JOIN Vehicles v ON a.VehicleID = v.VehicleID
        WHERE a.AccidentID = @AccidentID
        AND (@CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (check.recordset.length === 0) {
      res.status(404).json({ error: 'Accident record not found or access denied' });
      return;
    }

    const result = await pool
      .request()
      .input('AccidentID', sql.Int, id)
      .query('DELETE FROM AccidentRecords OUTPUT deleted.AccidentID WHERE AccidentID = @AccidentID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Accident record not found' });
      return;
    }

    res.json({ message: 'Accident record deleted successfully' });
  } catch (error) {
    console.error('Delete accident error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadAccidentFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const pool = await connectDB();

    // Check access
    const check = await pool.request()
      .input('AccidentID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 
        FROM AccidentRecords a
        JOIN Vehicles v ON a.VehicleID = v.VehicleID
        WHERE a.AccidentID = @AccidentID
        AND (@CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (check.recordset.length === 0) {
      res.status(404).json({ error: 'Accident record not found or access denied' });
      return;
    }

    // Insert file record
    const result = await pool.request()
      .input('AccidentID', sql.Int, id)
      .input('FilePath', sql.NVarChar(500), req.file.path)
      .input('FileName', sql.NVarChar(255), req.file.originalname)
      .input('FileType', sql.NVarChar(50), req.file.mimetype)
      .input('UploadedBy', sql.Int, req.user?.UserID)
      .query(`
        INSERT INTO AccidentFiles (AccidentID, FilePath, FileName, FileType, UploadedBy)
        OUTPUT inserted.*
        VALUES (@AccidentID, @FilePath, @FileName, @FileType, @UploadedBy)
      `);

    await logAudit(
      req.user?.UserID,
      'UPLOAD_ACCIDENT_FILE',
      'AccidentFiles',
      result.recordset[0].FileID,
      { accidentId: id, fileName: req.file.originalname },
      req.ip || '0.0.0.0'
    );

    res.status(201).json({
      message: 'File uploaded successfully',
      file: result.recordset[0]
    });

  } catch (error) {
    console.error('Upload accident file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAccidentFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Check access
    const check = await pool.request()
      .input('AccidentID', sql.Int, id)
      .input('CompanyID', sql.Int, req.user?.CompanyID || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 
        FROM AccidentRecords a
        JOIN Vehicles v ON a.VehicleID = v.VehicleID
        WHERE a.AccidentID = @AccidentID
        AND (@CompanyID IS NULL 
          OR v.CompanyID = @CompanyID 
          OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
      `);

    if (check.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this accident record' });
      return;
    }

    const result = await pool.request()
      .input('AccidentID', sql.Int, id)
      .query(`
        SELECT af.*, u.Name, u.Surname 
        FROM AccidentFiles af
        LEFT JOIN Users u ON af.UploadedBy = u.UserID
        WHERE af.AccidentID = @AccidentID
        ORDER BY af.CreatedAt DESC
      `);

    res.json({ files: result.recordset });
  } catch (error) {
    console.error('Get accident files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
