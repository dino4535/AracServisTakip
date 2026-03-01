import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { connectDB } from '../config/database';
import sql from 'mssql';
import * as XLSX from 'xlsx';
import { vehicleSchema } from '../schemas/vehicleSchema';
import { insuranceSchema } from '../schemas/insuranceSchema';
import { fuelSchema } from '../schemas/fuelSchema';
import { hashPassword } from '../utils/password';
import { logAudit } from '../services/auditService';

export const downloadTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const wb = XLSX.utils.book_new();
    let headers: string[] = [];
    let filename = '';

    switch (type) {
      case 'vehicles':
        headers = ['Plate', 'VIN', 'Make', 'Model', 'Year', 'FuelType', 'CurrentKm', 'LicenseSerial', 'LicenseNumber', 'EngineNumber', 'Color', 'RegistrationDate (YYYY-MM-DD)', 'CompanyName', 'DepotName', 'ManagerEmail', 'DriverEmail', 'Status'];
        filename = 'vehicle_template.xlsx';
        break;
      case 'insurance':
        headers = ['Plate', 'Type (Trafik Sigortası/Kasko)', 'Company', 'PolicyNumber', 'StartDate (YYYY-MM-DD)', 'EndDate (YYYY-MM-DD)', 'Cost', 'Description'];
        filename = 'insurance_template.xlsx';
        break;
      case 'fuel':
        headers = ['FuelRecordID (Leave empty for new)', 'Plate', 'Date (YYYY-MM-DD)', 'Liters', 'CostPerLiter', 'TotalCost', 'Station', 'Kilometer', 'FuelType', 'InvoiceNo', 'FilledByEmail'];
        filename = 'fuel_template.xlsx';
        break;
      case 'drivers':
        headers = ['Name', 'Surname', 'Email', 'Phone', 'Password (Optional)'];
        filename = 'driver_template.xlsx';
        break;
      case 'driver_mapping':
        headers = ['Plate', 'DriverEmail'];
        filename = 'driver_mapping_template.xlsx';
        break;
      case 'monthly_km':
        headers = ['Plate', 'Date (YYYY-MM-DD)', 'Kilometer'];
        filename = 'monthly_km_template.xlsx';
        break;
      default:
        return res.status(400).json({ error: 'Invalid template type' });
    }

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const exportData = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const pool = await connectDB();
    const wb = XLSX.utils.book_new();
    let filename = '';
    let data: any[] = [];
    const companyId = req.user?.Role === 'SuperAdmin' ? null : req.user?.CompanyID;
    const userId = req.user?.UserID;

    switch (type) {
      case 'vehicles':
        const vehicles = await pool.request()
          .input('CompanyID', sql.Int, companyId || null)
          .input('UserID', sql.Int, userId)
          .query(`
            SELECT 
              v.Plate, v.VIN, v.Make, v.Model, v.Year, v.FuelType, v.CurrentKm, 
              v.LicenseSerial, v.LicenseNumber, v.EngineNumber, v.Color, 
              FORMAT(v.RegistrationDate, 'yyyy-MM-dd') as 'RegistrationDate (YYYY-MM-DD)',
              c.Name as 'CompanyName',
              d.Name as 'DepotName',
              m.Email as 'ManagerEmail',
              dr.Email as 'DriverEmail',
              v.Status
            FROM Vehicles v
            LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
            LEFT JOIN Depots d ON v.DepotID = d.DepotID
            LEFT JOIN Users m ON v.ManagerID = m.UserID
            LEFT JOIN Users dr ON v.AssignedDriverID = dr.UserID
            WHERE (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
          `);
        data = vehicles.recordset;
        filename = 'vehicles_export.xlsx';
        break;

      case 'insurance':
        const insurance = await pool.request()
          .input('CompanyID', sql.Int, companyId || null)
          .input('UserID', sql.Int, userId)
          .query(`
            SELECT 
              v.Plate,
              i.Type as 'Type (Trafik Sigortası/Kasko)',
              i.InsuranceCompany as 'Company',
              i.PolicyNumber,
              FORMAT(i.StartDate, 'yyyy-MM-dd') as 'StartDate (YYYY-MM-DD)',
              FORMAT(i.EndDate, 'yyyy-MM-dd') as 'EndDate (YYYY-MM-DD)',
              i.Cost,
              i.Notes as 'Description'
            FROM InsuranceRecords i
            JOIN Vehicles v ON i.VehicleID = v.VehicleID
            WHERE (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
          `);
        data = insurance.recordset;
        filename = 'insurance_export.xlsx';
        break;

      case 'fuel':
        const fuel = await pool.request()
          .input('CompanyID', sql.Int, companyId || null)
          .input('UserID', sql.Int, userId)
          .query(`
            SELECT 
              f.FuelRecordID as 'FuelRecordID (Leave empty for new)',
              v.Plate,
              c.Name as 'CompanyName',
              d.Name as 'DepotName',
              FORMAT(f.FuelDate, 'yyyy-MM-dd') as 'Date (YYYY-MM-DD)',
              f.Liters,
              f.CostPerLiter,
              f.TotalCost,
              f.FuelStation as 'Station',
              f.Kilometer,
              f.FuelType,
              f.InvoiceNo,
              u.Email as 'FilledByEmail'
            FROM FuelRecords f
            JOIN Vehicles v ON f.VehicleID = v.VehicleID
            LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
            LEFT JOIN Depots d ON v.DepotID = d.DepotID
            LEFT JOIN Users u ON f.FilledBy = u.UserID
            WHERE (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
          `);
        data = fuel.recordset;
        filename = 'fuel_export.xlsx';
        break;

      case 'drivers':
        const drivers = await pool.request()
          .input('CompanyID', sql.Int, companyId || null)
          .input('UserID', sql.Int, userId)
          .query(`
            SELECT 
              u.Name,
              u.Surname,
              u.Email,
              '' as Phone,
              '' as 'Password (Optional)'
            FROM Users u
            JOIN UserRoles ur ON u.UserID = ur.UserID
            JOIN Roles r ON ur.RoleID = r.RoleID
            WHERE r.Name = 'Driver'
            AND (@CompanyID IS NULL OR u.CompanyID = @CompanyID OR u.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
          `);
        data = drivers.recordset;
        filename = 'drivers_export.xlsx';
        break;

      case 'driver_mapping':
        const driverMapping = await pool.request()
          .input('CompanyID', sql.Int, companyId || null)
          .input('UserID', sql.Int, userId)
          .query(`
            SELECT 
              v.Plate,
              dr.Email as 'DriverEmail'
            FROM Vehicles v
            LEFT JOIN Users dr ON v.AssignedDriverID = dr.UserID
            WHERE (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
          `);
        data = driverMapping.recordset;
        filename = 'driver_mapping_export.xlsx';
        break;

      case 'monthly_km':
        const monthlyKm = await pool.request()
          .input('CompanyID', sql.Int, companyId || null)
          .input('UserID', sql.Int, userId)
          .query(`
            SELECT 
              v.Plate,
              FORMAT(DATEFROMPARTS(mk.Year, mk.Month, 1), 'yyyy-MM-dd') as 'Date (YYYY-MM-DD)',
              mk.Kilometer
            FROM MonthlyKmLog mk
            JOIN Vehicles v ON mk.VehicleID = v.VehicleID
            WHERE (@CompanyID IS NULL OR v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))
          `);
        data = monthlyKm.recordset;
        filename = 'monthly_km_export.xlsx';
        break;

      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadDrivers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    const pool = await connectDB();
    let successCount = 0;
    let errors: string[] = [];

    // Get Driver Role ID
    const roleResult = await pool.request()
      .query("SELECT RoleID FROM Roles WHERE Name = 'Driver'");
    
    let driverRoleId: number;
    if (roleResult.recordset.length > 0) {
      driverRoleId = roleResult.recordset[0].RoleID;
    } else {
      // Fallback if migration failed or role deleted, though we just ran migration
      throw new Error("Driver role not found in system");
    }

    for (const [index, row] of data.entries()) {
      try {
        const name = (row as any)['Name'];
        const surname = (row as any)['Surname'];
        const email = (row as any)['Email'];
        const phone = (row as any)['Phone']; // Currently not in User table, but we read it
        const password = (row as any)['Password (Optional)'] || 'Driver123';

        if (!name || !surname || !email) {
          throw new Error('Name, Surname and Email are required');
        }

        // Check if user exists
        const userCheck = await pool.request()
          .input('Email', sql.NVarChar, email)
          .query('SELECT UserID FROM Users WHERE Email = @Email');

        let userId: number;

        if (userCheck.recordset.length > 0) {
          // User exists, update details
          userId = userCheck.recordset[0].UserID;
          
          await pool.request()
            .input('UserID', sql.Int, userId)
            .input('Name', sql.NVarChar(100), name)
            .input('Surname', sql.NVarChar(100), surname)
            .query(`
              UPDATE Users 
              SET Name = @Name, Surname = @Surname 
              WHERE UserID = @UserID
            `);
            
          if (password && password !== 'Driver123') {
             const passwordHash = hashPassword(password);
             await pool.request()
              .input('UserID', sql.Int, userId)
              .input('PasswordHash', sql.NVarChar(255), passwordHash)
              .query('UPDATE Users SET PasswordHash = @PasswordHash WHERE UserID = @UserID');
          }
        } else {
          // Create User
          const passwordHash = hashPassword(password);
          const insertResult = await pool.request()
            .input('Name', sql.NVarChar(100), name)
            .input('Surname', sql.NVarChar(100), surname)
            .input('Email', sql.NVarChar(100), email)
            .input('PasswordHash', sql.NVarChar(255), passwordHash)
            .input('CompanyID', sql.Int, req.user?.CompanyID || null)
            .query(`
              INSERT INTO Users (Name, Surname, Email, PasswordHash, CompanyID)
              OUTPUT inserted.UserID
              VALUES (@Name, @Surname, @Email, @PasswordHash, @CompanyID)
            `);
          userId = insertResult.recordset[0].UserID;
        }

        // Assign Driver Role if not exists
        const roleCheck = await pool.request()
          .input('UserID', sql.Int, userId)
          .input('RoleID', sql.Int, driverRoleId)
          .query('SELECT 1 FROM UserRoles WHERE UserID = @UserID AND RoleID = @RoleID');

        if (roleCheck.recordset.length === 0) {
          await pool.request()
            .input('UserID', sql.Int, userId)
            .input('RoleID', sql.Int, driverRoleId)
            .query('INSERT INTO UserRoles (UserID, RoleID) VALUES (@UserID, @RoleID)');
        }

        successCount++;
      } catch (error: any) {
        errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      count: successCount,
      errors
    });
  } catch (error) {
    console.error('Upload drivers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


export const uploadDriverMapping = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    const pool = await connectDB();
    let successCount = 0;
    let errors: string[] = [];

    for (const [index, row] of data.entries()) {
      try {
        const plate = (row as any)['Plate'];
        const email = (row as any)['DriverEmail'];

        if (!plate || !email) {
          throw new Error('Plate and DriverEmail are required');
        }

        // Find User
        const userResult = await pool.request()
          .input('Email', sql.NVarChar, email)
          .query('SELECT UserID FROM Users WHERE Email = @Email');

        if (userResult.recordset.length === 0) {
          throw new Error(`User not found: ${email}`);
        }
        const userId = userResult.recordset[0].UserID;

        // Update Vehicle
        const result = await pool.request()
          .input('Plate', sql.NVarChar, plate)
          .input('DriverID', sql.Int, userId)
          .input('CompanyID', sql.Int, req.user?.CompanyID || null)
          .query(`
            UPDATE Vehicles 
            SET AssignedDriverID = @DriverID, UpdatedAt = GETDATE()
            WHERE Plate = @Plate
            AND (CompanyID = @CompanyID OR @CompanyID IS NULL)
          `);

        if (result.rowsAffected[0] === 0) {
          throw new Error(`Vehicle not found or access denied: ${plate}`);
        }

        successCount++;
      } catch (error: any) {
        errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      count: successCount,
      errors
    });
  } catch (error) {
    console.error('Upload driver mapping error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadVehicles = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    const pool = await connectDB();
    let successCount = 0;
    let errors: string[] = [];

    // Pre-fetch lookups
    const companiesResult = await pool.request().query('SELECT CompanyID, Name FROM Companies');
    const companiesMap = new Map(companiesResult.recordset.map((c: any) => [c.Name, c.CompanyID]));

    const depotsResult = await pool.request().query('SELECT DepotID, Name, CompanyID FROM Depots');
    const depots = depotsResult.recordset;

    const usersResult = await pool.request().query('SELECT UserID, Email FROM Users');
    const usersMap = new Map(usersResult.recordset.map((u: any) => [u.Email, u.UserID]));

    const isSuperAdmin = ['superadmin', 'super admin'].includes((req.user?.Role || '').toLowerCase());

    for (const [index, row] of data.entries()) {
      try {
        // Resolve Company
        let companyId = req.user?.CompanyID;
        const companyName = (row as any)['CompanyName'];
        if (isSuperAdmin && companyName) {
            companyId = companiesMap.get(companyName) || null;
            if (!companyId) throw new Error(`Company not found: ${companyName}`);
        }

        // Resolve Depot
        const depotName = (row as any)['DepotName'];
        let depotId = null;
        if (depotName && companyId) {
            const depot = depots.find((d: any) => d.Name === depotName && d.CompanyID === companyId);
            if (depot) depotId = depot.DepotID;
        }

        // Resolve Manager
        const managerEmail = (row as any)['ManagerEmail'];
        const managerId = managerEmail ? usersMap.get(managerEmail) || null : null;
        if (managerEmail && !managerId) throw new Error(`Manager not found: ${managerEmail}`);

        // Resolve Driver
        const driverEmail = (row as any)['DriverEmail'];
        const driverId = driverEmail ? usersMap.get(driverEmail) || null : null;
        if (driverEmail && !driverId) throw new Error(`Driver not found: ${driverEmail}`);

        const vehicleData = {
          plate: (row as any)['Plate'],
          vin: (row as any)['VIN'],
          make: (row as any)['Make'],
          model: (row as any)['Model'],
          year: parseInt((row as any)['Year']),
          fuelType: (row as any)['FuelType'],
          segment: (row as any)['Segment'],
          currentKm: parseInt((row as any)['CurrentKm']) || 0,
          licenseSerial: (row as any)['LicenseSerial'],
          licenseNumber: (row as any)['LicenseNumber'],
          engineNumber: (row as any)['EngineNumber'],
          color: (row as any)['Color'],
          registrationDate: (row as any)['RegistrationDate (YYYY-MM-DD)'],
          status: (row as any)['Status'] || 'Active',
          companyId,
          depotId,
          managerId,
          assignedDriverId: driverId
        };

        // Basic validation check (can be improved)
        if (!vehicleData.plate) throw new Error('Plate is required');

        await pool.request()
          .input('Plate', sql.NVarChar(20), vehicleData.plate)
          .input('CompanyID', sql.Int, vehicleData.companyId || null)
          .input('VIN', sql.NVarChar(17), vehicleData.vin || null)
          .input('Make', sql.NVarChar(50), vehicleData.make || null)
          .input('Model', sql.NVarChar(50), vehicleData.model || null)
          .input('Year', sql.Int, vehicleData.year || null)
          .input('FuelType', sql.NVarChar(20), vehicleData.fuelType || null)
          .input('Segment', sql.NVarChar(50), vehicleData.segment || null)
          .input('CurrentKm', sql.Int, vehicleData.currentKm)
          .input('LicenseSerial', sql.NVarChar(50), vehicleData.licenseSerial || null)
          .input('LicenseNumber', sql.NVarChar(50), vehicleData.licenseNumber || null)
          .input('EngineNumber', sql.NVarChar(50), vehicleData.engineNumber || null)
          .input('Color', sql.NVarChar(30), vehicleData.color || null)
          .input('RegistrationDate', sql.DateTime, vehicleData.registrationDate ? new Date(vehicleData.registrationDate) : null)
          .input('DepotID', sql.Int, vehicleData.depotId || null)
          .input('ManagerID', sql.Int, vehicleData.managerId || null)
          .input('AssignedDriverID', sql.Int, vehicleData.assignedDriverId || null)
          .input('Status', sql.NVarChar(20), vehicleData.status)
          .query(`
            IF EXISTS (SELECT 1 FROM Vehicles WHERE Plate = @Plate)
            BEGIN
              UPDATE Vehicles SET
                VIN = @VIN,
                Make = @Make,
                Model = @Model,
                Year = @Year,
                FuelType = @FuelType,
                Segment = @Segment,
                CurrentKm = @CurrentKm,
                LicenseSerial = @LicenseSerial,
                LicenseNumber = @LicenseNumber,
                EngineNumber = @EngineNumber,
                Color = @Color,
                RegistrationDate = @RegistrationDate,
                DepotID = @DepotID,
                ManagerID = @ManagerID,
                AssignedDriverID = @AssignedDriverID,
                Status = @Status,
                UpdatedAt = GETDATE()
              WHERE Plate = @Plate AND (CompanyID = @CompanyID OR @CompanyID IS NULL)
            END
            ELSE
            BEGIN
              INSERT INTO Vehicles (
                Plate, CompanyID, VIN, Make, Model, Year, FuelType, Segment,
                CurrentKm, LicenseSerial, LicenseNumber, EngineNumber, Color, RegistrationDate,
                DepotID, ManagerID, AssignedDriverID, Status
              )
              VALUES (
                @Plate, @CompanyID, @VIN, @Make, @Model, @Year, @FuelType, @Segment,
                @CurrentKm, @LicenseSerial, @LicenseNumber, @EngineNumber, @Color, @RegistrationDate,
                @DepotID, @ManagerID, @AssignedDriverID, @Status
              )
            END
          `);
        
        successCount++;
      } catch (err: any) {
        errors.push(`Row ${index + 2}: ${err.message}`);
      }
    }

    res.json({ success: true, count: successCount, errors });
  } catch (error) {
    console.error('Upload vehicles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadInsurance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    const pool = await connectDB();
    let successCount = 0;
    let errors: string[] = [];

    for (const [index, row] of data.entries()) {
      try {
        const plate = (row as any)['Plate'];
        if (!plate) throw new Error('Plate is required');

        // Find vehicle ID
        const vehicleResult = await pool.request()
          .input('Plate', sql.NVarChar(20), plate)
          .input('CompanyID', sql.Int, req.user?.Role === 'SuperAdmin' ? null : req.user?.CompanyID || null)
          .input('UserID', sql.Int, req.user?.UserID)
          .query('SELECT VehicleID FROM Vehicles WHERE Plate = @Plate AND (@CompanyID IS NULL OR CompanyID = @CompanyID OR CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))');
        
        if (vehicleResult.recordset.length === 0) {
          throw new Error(`Vehicle with plate ${plate} not found or access denied`);
        }

        const vehicleId = vehicleResult.recordset[0].VehicleID;

        await pool.request()
          .input('VehicleID', sql.Int, vehicleId)
          .input('Type', sql.NVarChar(50), (row as any)['Type (Trafik Sigortası/Kasko)'])
          .input('InsuranceCompany', sql.NVarChar(100), (row as any)['Company'])
          .input('PolicyNumber', sql.NVarChar(50), (row as any)['PolicyNumber'])
          .input('StartDate', sql.DateTime, new Date((row as any)['StartDate (YYYY-MM-DD)']))
          .input('EndDate', sql.DateTime, new Date((row as any)['EndDate (YYYY-MM-DD)']))
          .input('Cost', sql.Decimal(10, 2), (row as any)['Cost'])
          .input('Notes', sql.NVarChar(500), (row as any)['Description'])
          .query(`
            IF EXISTS (SELECT 1 FROM InsuranceRecords WHERE PolicyNumber = @PolicyNumber AND VehicleID = @VehicleID)
            BEGIN
              UPDATE InsuranceRecords SET
                Type = @Type,
                InsuranceCompany = @InsuranceCompany,
                StartDate = @StartDate,
                EndDate = @EndDate,
                Cost = @Cost,
                Notes = @Notes
              WHERE PolicyNumber = @PolicyNumber AND VehicleID = @VehicleID
            END
            ELSE
            BEGIN
              INSERT INTO InsuranceRecords (VehicleID, Type, InsuranceCompany, PolicyNumber, StartDate, EndDate, Cost, Notes)
              VALUES (@VehicleID, @Type, @InsuranceCompany, @PolicyNumber, @StartDate, @EndDate, @Cost, @Notes)
            END
          `);
        
        successCount++;
      } catch (err: any) {
        errors.push(`Row ${index + 2}: ${err.message}`);
      }
    }

    res.json({ success: true, count: successCount, errors });
  } catch (error) {
    console.error('Upload insurance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadFuel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    const pool = await connectDB();
    let successCount = 0;
    let errors: string[] = [];

    // Pre-fetch Users for FilledBy lookup
    const usersResult = await pool.request().query('SELECT UserID, Email FROM Users');
    const usersMap = new Map(usersResult.recordset.map((u: any) => [u.Email, u.UserID]));

    for (const [index, row] of data.entries()) {
      try {
        const plate = (row as any)['Plate'];
        if (!plate) throw new Error('Plate is required');

        const vehicleResult = await pool.request()
          .input('Plate', sql.NVarChar(20), plate)
          .input('CompanyID', sql.Int, req.user?.Role === 'SuperAdmin' ? null : req.user?.CompanyID || null)
          .input('UserID', sql.Int, req.user?.UserID)
          .query('SELECT VehicleID FROM Vehicles WHERE Plate = @Plate AND (@CompanyID IS NULL OR CompanyID = @CompanyID OR CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))');
        
        if (vehicleResult.recordset.length === 0) {
          throw new Error(`Vehicle with plate ${plate} not found or access denied`);
        }

        const vehicleId = vehicleResult.recordset[0].VehicleID;
        const fuelRecordId = (row as any)['FuelRecordID (Leave empty for new)'];

        // Resolve FilledBy
        const filledByEmail = (row as any)['FilledByEmail'];
        const filledBy = filledByEmail ? usersMap.get(filledByEmail) || null : null;

        if (fuelRecordId) {
          // Update existing record
          await pool.request()
            .input('FuelRecordID', sql.Int, fuelRecordId)
            .input('VehicleID', sql.Int, vehicleId)
            .input('FuelDate', sql.DateTime, new Date((row as any)['Date (YYYY-MM-DD)']))
            .input('Liters', sql.Decimal(10, 2), (row as any)['Liters'])
            .input('CostPerLiter', sql.Decimal(10, 2), (row as any)['CostPerLiter'])
            .input('TotalCost', sql.Decimal(10, 2), (row as any)['TotalCost'])
            .input('FuelStation', sql.NVarChar(100), (row as any)['Station'])
            .input('Kilometer', sql.Int, (row as any)['Kilometer'])
            .input('FuelType', sql.NVarChar(50), (row as any)['FuelType'])
            .input('InvoiceNo', sql.NVarChar(50), (row as any)['InvoiceNo'])
            .input('FilledBy', sql.Int, filledBy)
            .query(`
              UPDATE FuelRecords SET
                VehicleID = @VehicleID,
                FuelDate = @FuelDate,
                Liters = @Liters,
                CostPerLiter = @CostPerLiter,
                TotalCost = @TotalCost,
                FuelStation = @FuelStation,
                Kilometer = @Kilometer,
                FuelType = @FuelType,
                InvoiceNo = @InvoiceNo,
                FilledBy = @FilledBy
              WHERE FuelRecordID = @FuelRecordID
            `);
        } else {
          // Create new record
          await pool.request()
            .input('VehicleID', sql.Int, vehicleId)
            .input('FuelDate', sql.DateTime, new Date((row as any)['Date (YYYY-MM-DD)']))
            .input('Liters', sql.Decimal(10, 2), (row as any)['Liters'])
            .input('CostPerLiter', sql.Decimal(10, 2), (row as any)['CostPerLiter'])
            .input('TotalCost', sql.Decimal(10, 2), (row as any)['TotalCost'])
            .input('FuelStation', sql.NVarChar(100), (row as any)['Station'])
            .input('Kilometer', sql.Int, (row as any)['Kilometer'])
            .input('FuelType', sql.NVarChar(50), (row as any)['FuelType'])
            .input('InvoiceNo', sql.NVarChar(50), (row as any)['InvoiceNo'])
            .input('FilledBy', sql.Int, filledBy)
            .query(`
              INSERT INTO FuelRecords (VehicleID, FuelDate, Liters, CostPerLiter, TotalCost, FuelStation, Kilometer, FuelType, InvoiceNo, FilledBy)
              VALUES (@VehicleID, @FuelDate, @Liters, @CostPerLiter, @TotalCost, @FuelStation, @Kilometer, @FuelType, @InvoiceNo, @FilledBy)
            `);
        }

        successCount++;
      } catch (err: any) {
        errors.push(`Row ${index + 2}: ${err.message}`);
      }
    }

    res.json({ success: true, count: successCount, errors });
  } catch (error) {
    console.error('Upload fuel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadMonthlyKm = async (req: AuthRequest, res: Response): Promise<void> => {
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

      for (const [index, row] of data.entries()) {
        const plate = (row as any)['Plate'] || (row as any)['Plaka'] || (row as any)['PLATE'] || (row as any)['PLAKA'];
        let dateVal = (row as any)['Date'] || (row as any)['Tarih'] || (row as any)['DATE'] || (row as any)['TARIH'] || (row as any)['Date (YYYY-MM-DD)'];
        const km = (row as any)['Kilometer'] || (row as any)['KM'] || (row as any)['Km'] || (row as any)['KILOMETER'];

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
          errors.push(`Row ${index + 2}: Invalid date for plate ${plate}: ${dateVal}`);
          continue;
        }

        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        // Get VehicleID
        const vehicleResult = await transaction.request()
          .input('Plate', sql.NVarChar, plate)
          .query('SELECT VehicleID, CurrentKm, CompanyID FROM Vehicles WHERE Plate = @Plate');

        if (vehicleResult.recordset.length === 0) {
          errors.push(`Row ${index + 2}: Vehicle not found: ${plate}`);
          continue;
        }

        const vehicle = vehicleResult.recordset[0];

        // Permission check
        if (req.user?.Role !== 'SuperAdmin' && req.user?.CompanyID && vehicle.CompanyID !== req.user.CompanyID) {
           errors.push(`Row ${index + 2}: Permission denied for vehicle: ${plate}`);
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
        success: true, 
        count: importedCount, 
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
