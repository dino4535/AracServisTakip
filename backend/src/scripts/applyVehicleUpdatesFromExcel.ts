import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { connectDB } from '../config/database';
import sql from 'mssql';

const run = async () => {
  try {
    const filePath = path.resolve(__dirname, '../../..', 'update vehicles_data.xlsx');
    if (!fs.existsSync(filePath)) {
      console.error('Excel dosyası bulunamadı:', filePath);
      process.exit(1);
    }

    const buffer = fs.readFileSync(filePath);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws) as any[];

    const pool = await connectDB();
    let successCount = 0;
    const errors: string[] = [];

    const companiesResult = await pool.request().query('SELECT CompanyID, Name FROM Companies');
    const companiesMap = new Map(companiesResult.recordset.map((c: any) => [c.Name, c.CompanyID]));

    const depotsResult = await pool.request().query('SELECT DepotID, Name, CompanyID FROM Depots');
    const depots = depotsResult.recordset;

    const usersResult = await pool.request().query('SELECT UserID, Email FROM Users');
    const usersMap = new Map(usersResult.recordset.map((u: any) => [u.Email, u.UserID]));

    for (const [index, row] of data.entries()) {
      try {
        let companyId: number | null = null;
        const companyName = (row as any)['CompanyName'];
        if (companyName) {
          companyId = companiesMap.get(companyName) || null;
          if (!companyId) throw new Error(`Company not found: ${companyName}`);
        }

        const depotName = (row as any)['DepotName'];
        let depotId: number | null = null;
        if (depotName && companyId) {
          const depot = depots.find((d: any) => d.Name === depotName && d.CompanyID === companyId);
          if (depot) depotId = depot.DepotID;
        }

        const managerEmail = (row as any)['ManagerEmail'];
        const managerId = managerEmail ? usersMap.get(managerEmail) || null : null;
        if (managerEmail && !managerId) throw new Error(`Manager not found: ${managerEmail}`);

        const driverEmail = (row as any)['DriverEmail'];
        const driverId = driverEmail ? usersMap.get(driverEmail) || null : null;
        if (driverEmail && !driverId) throw new Error(`Driver not found: ${driverEmail}`);

        const plate = (row as any)['Plate'];
        if (!plate) throw new Error('Plate is required');


        const yearValue = (row as any)['Year'];
        const year = yearValue !== undefined && yearValue !== null && String(yearValue).trim() !== ''
          ? parseInt(String(yearValue), 10)
          : null;

        const currentKmValue = (row as any)['CurrentKm'];
        const currentKm = currentKmValue !== undefined && currentKmValue !== null && String(currentKmValue).trim() !== ''
          ? parseInt(String(currentKmValue), 10)
          : 0;

        const registrationDateCell = (row as any)['RegistrationDate (YYYY-MM-DD)'];
        const registrationDate = registrationDateCell ? new Date(registrationDateCell) : null;

        const status = (row as any)['Status'] || 'Active';
        const segment = (row as any)['Segment'];

        const licenseSerialCell = (row as any)['LicenseSerial'];
        const licenseSerial =
          licenseSerialCell === undefined || licenseSerialCell === null || String(licenseSerialCell).trim() === ''
            ? null
            : String(licenseSerialCell);

        const licenseNumberCell = (row as any)['LicenseNumber'];
        const licenseNumber =
          licenseNumberCell === undefined || licenseNumberCell === null || String(licenseNumberCell).trim() === ''
            ? null
            : String(licenseNumberCell);

        const engineNumberCell = (row as any)['EngineNumber'];
        const engineNumber =
          engineNumberCell === undefined || engineNumberCell === null || String(engineNumberCell).trim() === ''
            ? null
            : String(engineNumberCell);

        const colorCell = (row as any)['Color'];
        const color =
          colorCell === undefined || colorCell === null || String(colorCell).trim() === ''
            ? null
            : String(colorCell);

        const vinCell = (row as any)['VIN'];
        const vinStr = vinCell !== undefined && vinCell !== null ? String(vinCell).trim() : '';
        let finalVin = vinStr !== '' ? vinStr : plate;
        if (finalVin.length > 17) {
          finalVin = finalVin.substring(0, 17);
        }

        if (finalVin) {
          const vinCheck = await pool
            .request()
            .input('VIN', sql.NVarChar(17), finalVin)
            .input('Plate', sql.NVarChar(20), plate)
            .query('SELECT TOP 1 Plate FROM Vehicles WHERE VIN = @VIN AND Plate <> @Plate');

          if (vinCheck.recordset.length > 0) {
            finalVin = plate;
          }
        }

        await pool
          .request()
          .input('Plate', sql.NVarChar(20), plate)
          .input('CompanyID', sql.Int, companyId || null)
          .input('VIN', sql.NVarChar(17), finalVin)
          .input('Make', sql.NVarChar(50), (row as any)['Make'] || null)
          .input('Model', sql.NVarChar(50), (row as any)['Model'] || null)
          .input('Year', sql.Int, year)
          .input('FuelType', sql.NVarChar(20), (row as any)['FuelType'] || null)
          .input('Segment', sql.NVarChar(50), segment || null)
          .input('CurrentKm', sql.Int, currentKm)
          .input('LicenseSerial', sql.NVarChar(50), licenseSerial)
          .input('LicenseNumber', sql.NVarChar(50), licenseNumber)
          .input('EngineNumber', sql.NVarChar(50), engineNumber)
          .input('Color', sql.NVarChar(30), color)
          .input('RegistrationDate', sql.DateTime, registrationDate)
          .input('DepotID', sql.Int, depotId || null)
          .input('ManagerID', sql.Int, managerId || null)
          .input('AssignedDriverID', sql.Int, driverId || null)
          .input('Status', sql.NVarChar(20), status)
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
        errors.push(`Row ${index + 2} (Plate: ${(row as any)['Plate'] || 'UNKNOWN'}): ${err.message}`);
      }
    }

    console.log(
      JSON.stringify(
        {
          success: errors.length === 0,
          updatedOrInserted: successCount,
          errors,
        },
        null,
        2
      )
    );

    process.exit(0);
  } catch (error) {
    console.error('Excelden araç güncelleme sırasında hata:', error);
    process.exit(1);
  }
};

run();
