import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { vehicleSchema, updateKmSchema } from '../schemas/vehicleSchema';
import { logAudit } from '../services/auditService';
import { riskService } from '../services/riskService';
import { isElevatedRole, companyScopeSql, buildAccessCondition } from '../utils/authScope';

// Depo ataması aracın kendi şirketine ait bir depoya yapılmalıdır. Aksi halde çapraz şirket
// depo kayıtları oluşur (Bulgu: Dino Gıda araçları Bermer deposuna atanmıştı ve bu araçlar
// Bermer kullanıcılarına görünüyordu).
const assertDepotMatchesCompany = async (
  pool: sql.ConnectionPool,
  depotId: unknown,
  companyId: unknown
): Promise<string | null> => {
  const depot = Number(depotId);
  const company = Number(companyId);
  if (!Number.isInteger(depot) || depot <= 0) return null; // depo atanmıyor
  if (!Number.isInteger(company) || company <= 0) return null;

  const r = await pool
    .request()
    .input('DepotID', sql.Int, depot)
    .query('SELECT CompanyID FROM Depots WHERE DepotID = @DepotID');

  if (r.recordset.length === 0) return 'Depot not found';
  if (r.recordset[0].CompanyID !== company) return 'Depot does not belong to the vehicle company';
  return null;
};

export const calculateRisks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await riskService.updateAllVehicleRisks();
    res.json({ message: 'Risk calculations completed successfully', ...result });
  } catch (error) {
    console.error('Risk calculation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateNextMaintenanceKm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nextMaintenanceKm } = req.body;

    if (isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }

    if (nextMaintenanceKm === undefined || nextMaintenanceKm === null || isNaN(Number(nextMaintenanceKm)) || Number(nextMaintenanceKm) < 0) {
       res.status(400).json({ error: 'Valid Next Maintenance KM is required' });
       return;
    }

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);
    const result = await pool.request()
      .input('VehicleID', sql.Int, Number(id))
      .input('NextMaintenanceKm', sql.Int, Number(nextMaintenanceKm))
      .input('UserID', sql.Int, req.user?.UserID)
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .query(`
        UPDATE Vehicles
        SET NextMaintenanceKm = @NextMaintenanceKm
        WHERE VehicleID = @VehicleID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, '')}
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Vehicle not found or access denied' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'UPDATE_VEHICLE_TARGET',
      'Vehicles',
      Number(id),
      { nextMaintenanceKm },
      req.ip || '0.0.0.0'
    );

    res.json({ message: 'Next maintenance target updated successfully' });
  } catch (error) {
    console.error('Update next maintenance km error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllVehicles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { companyId, status, page = 1, limit = 50, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(0, parseInt(limit as string));
    const offset = limitNum > 0 ? (pageNum - 1) * limitNum : 0;

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);

    // Base filtering logic
    let whereClause = "WHERE v.Status != 'Deleted'";
    
    // Check if user has specific depot assignments
    const userDepotsResult = await pool.request()
      .input('UserID', sql.Int, req.user?.UserID)
      .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');
      
    const userDepotIds = userDepotsResult.recordset.map(r => r.DepotID);

    if (!elevated) {
      whereClause += ` AND ${buildAccessCondition(req.user?.Role, req.user?.CompanyID, userDepotIds, 'v', '@UserCompanyID')}`;
    }

    if (companyId) {
      whereClause += ` AND v.CompanyID = @CompanyId`;
    }
    if (status) {
      whereClause += ` AND v.Status = @Status`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        v.Make LIKE '%' + @SearchTerm + '%' OR
        v.Model LIKE '%' + @SearchTerm + '%' OR
        v.VIN LIKE '%' + @SearchTerm + '%' OR
        v.LicenseSerial LIKE '%' + @SearchTerm + '%' OR
        v.LicenseNumber LIKE '%' + @SearchTerm + '%' OR
        v.EngineNumber LIKE '%' + @SearchTerm + '%' OR
        v.Color LIKE '%' + @SearchTerm + '%' OR
        c.Name LIKE '%' + @SearchTerm + '%' OR
        CONCAT(u.Name, ' ', u.Surname) LIKE '%' + @SearchTerm + '%' OR
        CONCAT(m.Name, ' ', m.Surname) LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const baseFromClause = `
      FROM Vehicles v
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots d ON v.DepotID = d.DepotID
      LEFT JOIN Users u ON v.AssignedDriverID = u.UserID
      LEFT JOIN Users m ON v.ManagerID = m.UserID
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      ${baseFromClause}
      ${whereClause}
    `;

    let dataQuery = `
      SELECT 
        v.*, 
        c.Name as CompanyName,
        d.Name as DepotName,
        CONCAT(u.Name, ' ', u.Surname) as DriverName,
        CONCAT(m.Name, ' ', m.Surname) as ManagerName
      ${baseFromClause}
      ${whereClause}
      ORDER BY v.VehicleID DESC
    `;

    if (limitNum > 0) {
      dataQuery += `
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
      `;
    }

    const request = pool.request();
    
    if (!elevated) {
      request.input('UserCompanyID', sql.Int, req.user?.CompanyID || 0);
      request.input('UserID', sql.Int, req.user?.UserID);
    }
    if (companyId) {
      request.input('CompanyId', sql.Int, companyId);
    }
    if (status) {
      request.input('Status', sql.NVarChar(20), status);
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
    const vehicles = (result.recordsets as any)[1];

    res.json({ 
      vehicles,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum > 0 ? limitNum : total,
        totalPages: limitNum > 0 ? Math.ceil(total / (limitNum || 1)) : 1
      }
    });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVehicleFullOverviewByPlate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { plate } = req.query;

    if (!plate || typeof plate !== 'string' || plate.trim() === '') {
      res.status(400).json({ error: 'Plate is required' });
      return;
    }

    const pool = await connectDB();
    const userId = req.user?.UserID;
    const companyId = req.user?.CompanyID;
    const elevated = isElevatedRole(req.user?.Role);

    // Depo ataması olan kullanıcılar için şirket içi depo daraltması burada da uygulanır;
    // aksi halde plaka bilinen herhangi bir şirket aracının tüm detayı okunabiliyordu.
    let userDepotIds: number[] = [];
    if (!elevated && userId) {
      const depotResult = await pool.request()
        .input('UserID', sql.Int, userId)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    const accessCondition = buildAccessCondition(req.user?.Role, companyId, userDepotIds, 'v');

    const request = pool.request();
    request.input('Plate', sql.NVarChar(20), plate.trim());
    if (!elevated) {
      if (companyId != null) {
        request.input('CompanyID', sql.Int, companyId);
      }
      // Kapsam SQL'i her zaman @UserID kullanır; parametre koşulsuz bağlanmalıdır.
      request.input('UserID', sql.Int, userId ?? null);
    }

    const overviewQuery = `
      DECLARE @VehicleID INT;

      SELECT TOP 1 @VehicleID = v.VehicleID
      FROM Vehicles v
      WHERE v.Plate = @Plate
        AND (${accessCondition})
      ORDER BY v.VehicleID;

      SELECT 
        v.VehicleID,
        v.CompanyID,
        v.Plate,
        v.VIN,
        v.Make,
        v.Model,
        v.Year,
        v.FuelType,
        v.CurrentKm,
        v.NextMaintenanceKm,
        v.LastServiceKm,
        v.MaintenanceIntervalKm,
        v.Status,
        v.AssignedDriverID,
        v.LicenseSerial,
        v.LicenseNumber,
        v.EngineNumber,
        v.Color,
        v.RegistrationDate,
        v.DepotID,
        v.ManagerID,
        c.Name as CompanyName,
        d.Name as DepotName,
        CONCAT(dr.Name, ' ', dr.Surname) as DriverName,
        CONCAT(mgr.Name, ' ', mgr.Surname) as ManagerName
      FROM Vehicles v
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots d ON v.DepotID = d.DepotID
      LEFT JOIN Users dr ON v.AssignedDriverID = dr.UserID
      LEFT JOIN Users mgr ON v.ManagerID = mgr.UserID
      WHERE v.VehicleID = @VehicleID;

      SELECT *
      FROM MaintenanceRecords m
      WHERE m.VehicleID = @VehicleID
      ORDER BY m.ServiceDate DESC;

      SELECT *
      FROM InsuranceRecords i
      WHERE i.VehicleID = @VehicleID
      ORDER BY i.EndDate DESC;

      SELECT *
      FROM VehicleInspections ins
      WHERE ins.VehicleID = @VehicleID
      ORDER BY ins.InspectionDate DESC;

      SELECT *
      FROM FuelRecords f
      WHERE f.VehicleID = @VehicleID
      ORDER BY f.FuelDate DESC;

      SELECT *
      FROM AccidentRecords a
      WHERE a.VehicleID = @VehicleID
      ORDER BY a.AccidentDate DESC;

      SELECT *
      FROM ServiceRequests sr
      WHERE sr.VehicleID = @VehicleID
      ORDER BY sr.RequestDate DESC;

      SELECT *
      FROM MonthlyKmLog mk
      WHERE mk.VehicleID = @VehicleID
      ORDER BY mk.Year DESC, mk.Month DESC;
    `;

    const result = await request.query(overviewQuery);

    const recordsets = result.recordsets as any;
    const vehicle = recordsets[0]?.[0] || null;

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found or you do not have access' });
      return;
    }

    res.json({
      vehicle,
      maintenance: recordsets[1] || [],
      insurance: recordsets[2] || [],
      inspections: recordsets[3] || [],
      fuel: recordsets[4] || [],
      accidents: recordsets[5] || [],
      serviceRequests: recordsets[6] || [],
      monthlyKm: recordsets[7] || [],
    });
  } catch (error) {
    console.error('Get vehicle full overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVehicleById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 
          v.*, 
          c.Name as CompanyName,
          d.Name as DepotName,
          CONCAT(u.Name, ' ', u.Surname) as DriverName,
          CONCAT(m.Name, ' ', m.Surname) as ManagerName
        FROM Vehicles v
        LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
        LEFT JOIN Depots d ON v.DepotID = d.DepotID
        LEFT JOIN Users u ON v.AssignedDriverID = u.UserID
        LEFT JOIN Users m ON v.ManagerID = m.UserID
        WHERE v.VehicleID = @VehicleID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    res.json({ vehicle: result.recordset[0] });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body: any = req.body;
    const plate = body.plate ?? body.Plate;
    const vin = body.vin ?? body.VIN;
    const make = body.make ?? body.Make;
    const model = body.model ?? body.Model;
    const year = body.year ?? body.Year;
    const fuelType = body.fuelType ?? body.FuelType;
    let segment = body.segment ?? body.Segment;
    const currentKm = body.currentKm ?? body.CurrentKm;
    const maintenanceIntervalKm = body.maintenanceIntervalKm ?? body.MaintenanceIntervalKm;
    const status = body.status ?? body.Status;
    const assignedDriverId = body.assignedDriverId ?? body.AssignedDriverID;
    const licenseSerial = body.licenseSerial ?? body.LicenseSerial;
    const licenseNumber = body.licenseNumber ?? body.LicenseNumber;
    const engineNumber = body.engineNumber ?? body.EngineNumber;
    const color = body.color ?? body.Color;
    const registrationDate = body.registrationDate ?? body.RegistrationDate;

    const companyId = body.companyId ?? body.CompanyID;
    const depotId = body.depotId ?? body.DepotID;
    const managerId = body.managerId ?? body.ManagerID;

    if (!plate) {
      res.status(400).json({ error: 'Plate is required' });
      return;
    }

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);

    let finalCompanyId = req.user?.CompanyID || companyId || null;

    if (!elevated && !req.user?.CompanyID && finalCompanyId) {
      const accessCheck = await pool.request()
        .input('UserID', sql.Int, req.user?.UserID)
        .input('CompanyID', sql.Int, finalCompanyId)
        .query('SELECT 1 FROM UserCompanies WHERE UserID = @UserID AND CompanyID = @CompanyID');
      
      if (accessCheck.recordset.length === 0) {
        res.status(403).json({ error: 'You do not have permission for this company' });
        return;
      }
    }

    // Depo ataması aracın şirketiyle tutarlı olmalıdır (çapraz şirket depo kaydı engellenir).
    const depotCompanyError = await assertDepotMatchesCompany(pool, depotId, finalCompanyId);
    if (depotCompanyError) {
      res.status(400).json({ error: depotCompanyError });
      return;
    }

    const safeVin = vin && vin.trim() !== '' ? vin : plate;

    if (!segment) {
      const raw = `${make || ''} ${model || ''}`.toLowerCase();
      if (!model || String(model).trim() === '') {
        segment = 'LightCommercial';
      } else if (
        raw.includes('truck') ||
        raw.includes('kamyon') ||
        raw.includes('çekici') ||
        raw.includes('tir') ||
        raw.includes('tır') ||
        raw.includes('actros') ||
        raw.includes('axor') ||
        raw.includes('atego') ||
        raw.includes('stralis') ||
        raw.includes('fh ') ||
        raw.includes('fm ') ||
        raw.includes('xf ') ||
        raw.includes('tgx') ||
        raw.includes('tgs') ||
        raw.includes('npr') ||
        raw.includes('nqr')
      ) {
        segment = 'HeavyCommercial';
      } else if (
        raw.includes('minibüs') ||
        raw.includes('minibus') ||
        raw.includes('midibüs') ||
        raw.includes('sprinter') ||
        raw.includes('crafter') ||
        raw.includes('daily') ||
        raw.includes('trafic') ||
        raw.includes('master') ||
        raw.includes('tourneo') ||
        raw.includes('vito tourer')
      ) {
        segment = 'Minibus';
      } else if (
        raw.includes('doblo') ||
        raw.includes('fiorino') ||
        raw.includes('combo') ||
        raw.includes('partner') ||
        raw.includes('berlingo') ||
        raw.includes('jumpy') ||
        raw.includes('boxer') ||
        raw.includes('jumper') ||
        raw.includes('transit') ||
        raw.includes('connect') ||
        raw.includes('courier') ||
        raw.includes('caddy') ||
        raw.includes('vito') ||
        raw.includes('transporter') ||
        raw.includes('kangoo') ||
        raw.includes('nemo')
      ) {
        segment = 'LightCommercial';
      } else {
        segment = 'Passenger';
      }
    }

    const result = await pool
      .request()
      .input('Plate', sql.NVarChar(20), plate)
      .input('CompanyID', sql.Int, finalCompanyId)
      .input('VIN', sql.NVarChar(17), safeVin)
      .input('Make', sql.NVarChar(50), make || null)
      .input('Model', sql.NVarChar(50), model || null)
      .input('Year', sql.Int, year || null)
      .input('FuelType', sql.NVarChar(30), fuelType || null)
      .input('Segment', sql.NVarChar(50), segment || null)
      .input('CurrentKm', sql.Int, currentKm || 0)
      .input('MaintenanceIntervalKm', sql.Int, Number(maintenanceIntervalKm) || 15000)
      .input('Status', sql.NVarChar(20), status || 'Active')
      .input('AssignedDriverID', sql.Int, assignedDriverId || null)
      .input('LicenseSerial', sql.NVarChar(50), licenseSerial || null)
      .input('LicenseNumber', sql.NVarChar(50), licenseNumber || null)
      .input('EngineNumber', sql.NVarChar(50), engineNumber || null)
      .input('Color', sql.NVarChar(30), color || null)
      .input('RegistrationDate', sql.DateTime, registrationDate ? new Date(registrationDate) : null)
      .input('DepotID', sql.Int, depotId || null)
      .input('ManagerID', sql.Int, managerId || null)
      .query(`
        INSERT INTO Vehicles (Plate, CompanyID, VIN, Make, Model, Year, FuelType, Segment, CurrentKm, MaintenanceIntervalKm, Status, AssignedDriverID, LicenseSerial, LicenseNumber, EngineNumber, Color, RegistrationDate, DepotID, ManagerID)
        OUTPUT inserted.*
        VALUES (@Plate, @CompanyID, @VIN, @Make, @Model, @Year, @FuelType, @Segment, @CurrentKm, @MaintenanceIntervalKm, @Status, @AssignedDriverID, @LicenseSerial, @LicenseNumber, @EngineNumber, @Color, @RegistrationDate, @DepotID, @ManagerID)
      `);

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'CREATE_VEHICLE',
      'Vehicles',
      result.recordset[0].VehicleID,
      { plate, make, model, companyId },
      req.ip || '0.0.0.0'
    );

    res.status(201).json({
      message: 'Vehicle created successfully',
      vehicle: result.recordset[0],
    });
  } catch (error) {
    console.error('Create vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const body: any = req.body;
    const plate = body.plate ?? body.Plate;
    const vin = body.vin ?? body.VIN;
    const make = body.make ?? body.Make;
    const model = body.model ?? body.Model;
    const year = body.year ?? body.Year;
    const fuelType = body.fuelType ?? body.FuelType;
    let segment = body.segment ?? body.Segment;
    const currentKm = body.currentKm ?? body.CurrentKm;
    const nextMaintenanceKm = body.nextMaintenanceKm ?? body.NextMaintenanceKm;
    const maintenanceIntervalKm = body.maintenanceIntervalKm ?? body.MaintenanceIntervalKm;
    const status = body.status ?? body.Status;
    const assignedDriverId = body.assignedDriverId ?? body.AssignedDriverID;
    const licenseSerial = body.licenseSerial ?? body.LicenseSerial;
    const licenseNumber = body.licenseNumber ?? body.LicenseNumber;
    const engineNumber = body.engineNumber ?? body.EngineNumber;
    const color = body.color ?? body.Color;
    const registrationDate = body.registrationDate ?? body.RegistrationDate;

    const companyId = body.companyId ?? body.CompanyID;
    const depotId = body.depotId ?? body.DepotID;
    const managerId = body.managerId ?? body.ManagerID;
    const trioVehicleId = body.trioVehicleId ?? body.TrioVehicleId;

    if (isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }

    const regDate = registrationDate ? new Date(registrationDate) : null;
    if (regDate && isNaN(regDate.getTime())) {
      res.status(400).json({ error: 'Invalid registration date' });
      return;
    }

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);

    if (!segment) {
      const rawUpdate = `${make || ''} ${model || ''}`.toLowerCase();
      if (!model || String(model).trim() === '') {
        segment = 'LightCommercial';
      } else if (
        rawUpdate.includes('truck') ||
        rawUpdate.includes('kamyon') ||
        rawUpdate.includes('çekici') ||
        rawUpdate.includes('tir') ||
        rawUpdate.includes('tır') ||
        rawUpdate.includes('actros') ||
        rawUpdate.includes('axor') ||
        rawUpdate.includes('atego') ||
        rawUpdate.includes('stralis') ||
        rawUpdate.includes('fh ') ||
        rawUpdate.includes('fm ') ||
        rawUpdate.includes('xf ') ||
        rawUpdate.includes('tgx') ||
        rawUpdate.includes('tgs') ||
        rawUpdate.includes('npr') ||
        rawUpdate.includes('nqr')
      ) {
        segment = 'HeavyCommercial';
      } else if (
        rawUpdate.includes('minibüs') ||
        rawUpdate.includes('minibus') ||
        rawUpdate.includes('midibüs') ||
        rawUpdate.includes('sprinter') ||
        rawUpdate.includes('crafter') ||
        rawUpdate.includes('daily') ||
        rawUpdate.includes('trafic') ||
        rawUpdate.includes('master') ||
        rawUpdate.includes('tourneo') ||
        rawUpdate.includes('vito tourer')
      ) {
        segment = 'Minibus';
      } else if (
        rawUpdate.includes('doblo') ||
        rawUpdate.includes('fiorino') ||
        rawUpdate.includes('combo') ||
        rawUpdate.includes('partner') ||
        rawUpdate.includes('berlingo') ||
        rawUpdate.includes('jumpy') ||
        rawUpdate.includes('boxer') ||
        rawUpdate.includes('jumper') ||
        rawUpdate.includes('transit') ||
        rawUpdate.includes('connect') ||
        rawUpdate.includes('courier') ||
        rawUpdate.includes('caddy') ||
        rawUpdate.includes('vito') ||
        rawUpdate.includes('transporter') ||
        rawUpdate.includes('kangoo') ||
        rawUpdate.includes('nemo')
      ) {
        segment = 'LightCommercial';
      } else {
        segment = 'Passenger';
      }
    }

    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT CompanyID, Plate, VIN, CurrentKm, TrioVehicleId, MaintenanceIntervalKm FROM Vehicles v
        WHERE VehicleID = @VehicleID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (vehicleCheck.recordset.length === 0) {
      res.status(404).json({ error: 'Vehicle not found or access denied' });
      return;
    }
    const currentVehicleCompanyId = vehicleCheck.recordset[0].CompanyID;
    const currentPlate = vehicleCheck.recordset[0].Plate;
    const currentVin = vehicleCheck.recordset[0].VIN as string | null;
    const currentCurrentKm = vehicleCheck.recordset[0].CurrentKm as number | null;
    const currentTrioVehicleId = vehicleCheck.recordset[0].TrioVehicleId as string | null;
    const currentMaintenanceIntervalKm = vehicleCheck.recordset[0].MaintenanceIntervalKm as number | null;

    if (companyId && companyId !== currentVehicleCompanyId && !elevated) {
      res.status(403).json({ error: 'Only elevated users can change vehicle company' });
      return;
    }

    // Depo ataması aracın şirketiyle tutarlı olmalıdır (çapraz şirket depo kaydı engellenir).
    const depotCompanyError = await assertDepotMatchesCompany(
      pool,
      depotId,
      elevated && companyId ? companyId : currentVehicleCompanyId
    );
    if (depotCompanyError) {
      res.status(400).json({ error: depotCompanyError });
      return;
    }

    let companyUpdateSql = '';
    if (elevated && companyId !== undefined) {
      companyUpdateSql = 'CompanyID = @CompanyID,';
    }

    const finalPlate = plate && plate.trim() !== '' ? plate : currentPlate;
    let finalVin: string | null;

    if (vin && vin.trim() !== '') {
      finalVin = vin;
    } else if (currentVin && currentVin.trim() !== '') {
      finalVin = currentVin;
    } else {
      finalVin = finalPlate;
    }

    let finalCurrentKm = currentCurrentKm ?? 0;
    if (currentKm !== undefined && currentKm !== null && String(currentKm).trim() !== '') {
      const parsedKm = Number(currentKm);
      if (!isNaN(parsedKm)) {
        finalCurrentKm = parsedKm;
      }
    }

    // Bakim araligi: gonderildiyse guncelle, gonderilmediyse mevcut degeri koru
    let finalIntervalKm = currentMaintenanceIntervalKm ?? null;
    if (maintenanceIntervalKm !== undefined && maintenanceIntervalKm !== null && String(maintenanceIntervalKm).trim() !== '') {
      const parsedInterval = Number(maintenanceIntervalKm);
      if (!isNaN(parsedInterval)) {
        finalIntervalKm = parsedInterval;
      }
    }

    // Trio ID: gönderildiyse güncelle (boş string -> NULL), gönderilmediyse mevcut değeri koru
    let finalTrioVehicleId: string | null = currentTrioVehicleId ?? null;
    if (trioVehicleId !== undefined) {
      const trimmedTrio = trioVehicleId === null ? '' : String(trioVehicleId).trim();
      finalTrioVehicleId = trimmedTrio === '' ? null : trimmedTrio.slice(0, 24);
    }

    // TrioVehicleId benzersiz olmalı (başka bir araçta kullanılamaz)
    if (finalTrioVehicleId) {
      const trioCheck = await pool.request()
        .input('TrioVehicleId', sql.NVarChar(24), finalTrioVehicleId)
        .input('VehicleID', sql.Int, Number(id))
        .query('SELECT VehicleID, Plate FROM Vehicles WHERE TrioVehicleId = @TrioVehicleId AND VehicleID <> @VehicleID');
      if (trioCheck.recordset.length > 0) {
        res.status(409).json({ error: `Bu Trio ID başka bir araca kayıtlı: ${trioCheck.recordset[0].Plate}` });
        return;
      }
    }

    const request = pool.request()
      .input('VehicleID', sql.Int, Number(id))
      .input('Plate', sql.NVarChar(20), finalPlate)
      .input('VIN', sql.NVarChar(17), finalVin)
      .input('Make', sql.NVarChar(50), make || null)
      .input('Model', sql.NVarChar(50), model || null)
      .input('Year', sql.Int, Number(year) || null)
      .input('FuelType', sql.NVarChar(30), fuelType || null)
      .input('Segment', sql.NVarChar(50), segment || null)
      .input('CurrentKm', sql.Int, finalCurrentKm)
      .input('NextMaintenanceKm', sql.Int, Number(nextMaintenanceKm) || null)
      .input('MaintenanceIntervalKm', sql.Int, finalIntervalKm)
      .input('Status', sql.NVarChar(20), status || 'Active')
      .input('AssignedDriverID', sql.Int, Number(assignedDriverId) || null)
      .input('LicenseSerial', sql.NVarChar(50), licenseSerial || null)
      .input('LicenseNumber', sql.NVarChar(50), licenseNumber || null)
      .input('EngineNumber', sql.NVarChar(50), engineNumber || null)
      .input('Color', sql.NVarChar(30), color || null)
      .input('RegistrationDate', sql.DateTime, regDate)
      .input('DepotID', sql.Int, Number(depotId) || null)
      .input('ManagerID', sql.Int, Number(managerId) || null)
      .input('TrioVehicleId', sql.NVarChar(24), finalTrioVehicleId);

    if (elevated && companyId !== undefined) {
      request.input('CompanyID', sql.Int, companyId || null);
    }

    const result = await request.query(`
        UPDATE Vehicles
        SET Plate = @Plate,
            ${companyUpdateSql}
            VIN = @VIN,
            Make = @Make,
            Model = @Model,
            Year = @Year,
            FuelType = @FuelType,
            Segment = @Segment,
            CurrentKm = @CurrentKm,
            NextMaintenanceKm = @NextMaintenanceKm,
            MaintenanceIntervalKm = @MaintenanceIntervalKm,
            Status = @Status,
            AssignedDriverID = @AssignedDriverID,
            LicenseSerial = @LicenseSerial,
            LicenseNumber = @LicenseNumber,
            EngineNumber = @EngineNumber,
            Color = @Color,
            RegistrationDate = @RegistrationDate,
            DepotID = @DepotID,
            ManagerID = @ManagerID,
            TrioVehicleId = @TrioVehicleId,
            UpdatedAt = GETDATE()
        WHERE VehicleID = @VehicleID
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    // Get updated vehicle
    const updatedVehicleResult = await pool.request()
      .input('VehicleID', sql.Int, Number(id))
      .query('SELECT * FROM Vehicles WHERE VehicleID = @VehicleID');

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'UPDATE_VEHICLE',
      'Vehicles',
      Number(id),
      { plate, make, model, companyId },
      req.ip || '0.0.0.0'
    );

    res.json({
      message: 'Vehicle updated successfully',
      vehicle: updatedVehicleResult.recordset[0],
    });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid vehicle ID' });
      return;
    }

    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);

    // Security Check
    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 1 FROM Vehicles v
        WHERE VehicleID = @VehicleID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (vehicleCheck.recordset.length === 0) {
      res.status(404).json({ error: 'Vehicle not found or access denied' });
      return;
    }

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, Number(id))
      .query('UPDATE Vehicles SET Status = \'Deleted\', UpdatedAt = GETDATE() WHERE VehicleID = @VehicleID');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'DELETE_VEHICLE',
      'Vehicles',
      Number(id),
      { vehicleId: id, action: 'Soft Delete' },
      req.ip || '0.0.0.0'
    );

    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkUpdateVehicleManagers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleIds, managerId } = req.body;

    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      res.status(400).json({ error: 'Vehicle IDs array is required' });
      return;
    }

    const pool = await connectDB();
    const validVehicleIds = vehicleIds.filter(id => typeof id === 'number').join(',');

    if (!validVehicleIds) {
       res.status(400).json({ error: 'Invalid vehicle IDs' });
       return;
    }

    // Check permissions: If user has CompanyID, ensure they only update their own vehicles
    const elevated = isElevatedRole(req.user?.Role);
    let accessCheckSql = '';
    if (elevated) {
      accessCheckSql = '';
    } else if (req.user?.CompanyID) {
      accessCheckSql = `AND CompanyID = ${req.user.CompanyID}`;
    } else {
      accessCheckSql = `AND (CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
    }

    await pool.request()
      .input('ManagerID', sql.Int, managerId || null)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        UPDATE Vehicles
        SET ManagerID = @ManagerID, UpdatedAt = GETDATE()
        WHERE VehicleID IN (${validVehicleIds}) ${accessCheckSql}
      `);

    res.json({ message: 'Vehicles updated successfully' });
  } catch (error) {
    console.error('Bulk update vehicle managers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateKm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = updateKmSchema.safeParse(req.body);

    if (!validation.success) {
       res.status(400).json({ error: 'Validation error', details: validation.error.format() });
       return;
    }

    const { kilometer } = validation.data;

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction
        .request()
        .input('VehicleID', sql.Int, Number(id))
        .input('CurrentKm', sql.Int, kilometer)
        .query(`
          UPDATE Vehicles
          SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE()
          WHERE VehicleID = @VehicleID
        `);

      await transaction
        .request()
        .input('VehicleID', sql.Int, Number(id))
        .input('Kilometer', sql.Int, kilometer)
        .input('UpdatedBy', sql.Int, req.user?.UserID)
        .query(`
          INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
          VALUES (@VehicleID, @Kilometer, @UpdatedBy, GETDATE())
        `);

      await transaction.commit();

      res.json({ message: 'Kilometer updated successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Update km error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
