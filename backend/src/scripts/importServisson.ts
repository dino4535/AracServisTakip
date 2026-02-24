
import xlsx from 'xlsx';
import path from 'path';
import sql from 'mssql';
import { connectDB } from '../config/database';

const EXCEL_PATH = path.join('c:\\Users\\Oguz\\Traeai', 'Servisson.xlsx');

function getJsDateFromExcel(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  const total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  const minutes = Math.floor(total_seconds / 60) % 60;
  const hours = Math.floor(total_seconds / (60 * 60));
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}

async function importRecords() {
  console.log('Starting import from:', EXCEL_PATH);
  
  try {
    const pool = await connectDB();
    const workbook = xlsx.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log(`Found ${data.length} records.`);

    // Find a fallback user (System Admin or first user)
    const userResult = await pool.query('SELECT TOP 1 UserID FROM Users ORDER BY UserID ASC');
    const defaultUserId = userResult.recordset[0]?.UserID;
    
    if (!defaultUserId) {
      console.error('No users found in database. Cannot set RequestedBy.');
      process.exit(1);
    }
    console.log(`Using UserID ${defaultUserId} for RequestedBy.`);

    for (const row of data as any[]) {
      const plate = row['Plaka']?.toString().replace(/\s+/g, '').toUpperCase();
      const excelDate = row['Tarih'];
      const description = row['Yapılan İşlem'];
      const companyName = row['Servis Firma ']?.toString().trim(); // Note the space in key
      const cost = parseFloat(row['KDV DAHİL Fatura Tutar']);

      if (!plate) {
        console.log('Skipping row without plate:', row);
        continue;
      }

      console.log(`Processing ${plate} - ${description}`);

      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        // 1. Find Vehicle
        const vehicleResult = await transaction.request()
          .input('Plate', sql.NVarChar, plate)
          .query('SELECT VehicleID FROM Vehicles WHERE Plate = @Plate');

        if (vehicleResult.recordset.length === 0) {
          console.warn(`Vehicle not found: ${plate}`);
          await transaction.rollback();
          continue;
        }
        const vehicle = vehicleResult.recordset[0];

        // 2. Find or Create Service Company
        let companyId = null;
        if (companyName) {
          const companyResult = await transaction.request()
            .input('Name', sql.NVarChar, companyName)
            .query('SELECT ServiceCompanyID FROM ServiceCompanies WHERE Name = @Name');
          
          if (companyResult.recordset.length > 0) {
            companyId = companyResult.recordset[0].ServiceCompanyID;
          } else {
            const createCompany = await transaction.request()
              .input('Name', sql.NVarChar, companyName)
              .query('INSERT INTO ServiceCompanies (Name, IsActive) OUTPUT inserted.ServiceCompanyID VALUES (@Name, 1)');
            companyId = createCompany.recordset[0].ServiceCompanyID;
            console.log(`Created new service company: ${companyName}`);
          }
        }

        const date = typeof excelDate === 'number' ? getJsDateFromExcel(excelDate) : new Date();

        // 3. Create Service Request (Completed)
        await transaction.request()
          .input('VehicleID', sql.Int, vehicle.VehicleID)
          .input('ServiceType', sql.NVarChar, 'Maintenance')
          .input('Priority', sql.NVarChar, 'Medium')
          .input('Status', sql.NVarChar, 'Completed')
          .input('Description', sql.NVarChar, description || '')
          .input('ServiceCompanyID', sql.Int, companyId)
          .input('RequestDate', sql.DateTime2, date)
          .input('CompletedDate', sql.DateTime2, date)
          .input('ActualCost', sql.Decimal(10, 2), cost || 0)
          .input('RequestedBy', sql.Int, defaultUserId)
          .query(`
            INSERT INTO ServiceRequests 
            (VehicleID, ServiceType, Priority, Status, Description, ServiceCompanyID, RequestDate, CompletedDate, ActualCost, RequestedBy)
            VALUES 
            (@VehicleID, @ServiceType, @Priority, @Status, @Description, @ServiceCompanyID, @RequestDate, @CompletedDate, @ActualCost, @RequestedBy)
          `);

        await transaction.commit();
        console.log(`Successfully imported record for ${plate}`);

      } catch (err) {
        console.error(`Error processing ${plate}:`, err);
        await transaction.rollback();
      }
    }

    console.log('Import completed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

importRecords();
