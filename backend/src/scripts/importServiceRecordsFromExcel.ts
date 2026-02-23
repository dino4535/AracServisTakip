import dotenv from 'dotenv';
import path from 'path';
import xlsx from 'xlsx';
import sql from 'mssql';
import { connectDB } from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ExcelRow {
  Plaka?: string;
  Tarih?: number | string;
  'Yapılan İşlem'?: string;
  'Servis Firma '?: string;
  'KDV DAHİL Fatura Tutar'?: number;
}

const excelDateToJSDate = (excelDate: number | string | undefined): Date | null => {
  if (excelDate === undefined || excelDate === null) return null;
  if (typeof excelDate === 'string') {
    const parsed = new Date(excelDate);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const result = new Date(epoch.getTime() + excelDate * 24 * 60 * 60 * 1000);
  return result;
};

const main = async () => {
  try {
    const filePath = path.join(__dirname, '../../../ServisKayıtları.xlsx');
    console.log('Excel dosyası:', filePath);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });

    console.log('Toplam satır:', rows.length);

    if (rows.length === 0) {
      console.log('Sheet boş, işlem yapılmadı.');
      process.exit(0);
    }

    const pool = await connectDB();

    const existingVehiclesResult = await pool.request().query(`
      SELECT VehicleID, Plate FROM Vehicles
    `);
    const vehicleMap = new Map<string, number>();
    for (const v of existingVehiclesResult.recordset) {
      vehicleMap.set((v.Plate as string).toUpperCase().replace(/\s+/g, ''), v.VehicleID as number);
    }

    const existingCompaniesResult = await pool.request().query(`
      SELECT ServiceCompanyID, Name FROM ServiceCompanies
    `);
    const serviceCompanyMap = new Map<string, number>();
    for (const c of existingCompaniesResult.recordset) {
      serviceCompanyMap.set((c.Name as string).toUpperCase().trim(), c.ServiceCompanyID as number);
    }

    let createdRequests = 0;
    let skippedNoVehicle = 0;

    for (const row of rows) {
      const rawPlate = row.Plaka;
      if (!rawPlate) continue;

      const normalizedPlate = rawPlate.toString().toUpperCase().replace(/\s+/g, '');
      const vehicleId = vehicleMap.get(normalizedPlate);
      if (!vehicleId) {
        skippedNoVehicle++;
        continue;
      }

      const serviceDate = excelDateToJSDate(row.Tarih as any);
      if (!serviceDate) continue;

      const description = row['Yapılan İşlem'] || 'Servis işlemi';
      const serviceCompanyNameRaw = row['Servis Firma '] || '';
      const serviceCompanyName = serviceCompanyNameRaw ? serviceCompanyNameRaw.toString().trim() : '';
      const totalAmount = typeof row['KDV DAHİL Fatura Tutar'] === 'number'
        ? row['KDV DAHİL Fatura Tutar']
        : parseFloat(String(row['KDV DAHİL Fatura Tutar'] || '0').replace(',', '.')) || 0;

      let serviceCompanyId: number | null = null;
      if (serviceCompanyName) {
        const key = serviceCompanyName.toUpperCase();
        serviceCompanyId = serviceCompanyMap.get(key) || null;

        if (!serviceCompanyId) {
          const insertRes = await pool.request()
            .input('Name', sql.NVarChar, serviceCompanyName)
            .query(`
              INSERT INTO ServiceCompanies (Name)
              OUTPUT inserted.ServiceCompanyID
              VALUES (@Name)
            `);
          serviceCompanyId = insertRes.recordset[0].ServiceCompanyID as number;
          serviceCompanyMap.set(key, serviceCompanyId);
          console.log('Yeni servis firması eklendi:', serviceCompanyName);
        }
      }

      await pool.request()
        .input('VehicleID', sql.Int, vehicleId)
        .input('RequestedBy', sql.Int, 1)
        .input('ServiceCompanyID', sql.Int, serviceCompanyId)
        .input('ServiceType', sql.NVarChar, null)
        .input('Priority', sql.NVarChar, 'MEDIUM')
        .input('Description', sql.NVarChar, description)
        .input('Status', sql.NVarChar, 'COMPLETED')
        .input('RequestDate', sql.DateTime, serviceDate)
        .input('CompletedDate', sql.DateTime, serviceDate)
        .input('EstimatedCost', sql.Decimal(10, 2), totalAmount)
        .input('ActualCost', sql.Decimal(10, 2), totalAmount)
        .input('ServiceActions', sql.NVarChar, description)
        .query(`
          INSERT INTO ServiceRequests (
            VehicleID, RequestedBy, ServiceCompanyID, ServiceType, Priority, Description,
            Status, RequestDate, CompletedDate, EstimatedCost, ActualCost, ServiceActions
          )
          VALUES (
            @VehicleID, @RequestedBy, @ServiceCompanyID, @ServiceType, @Priority, @Description,
            @Status, @RequestDate, @CompletedDate, @EstimatedCost, @ActualCost, @ServiceActions
          )
        `);

      createdRequests++;
    }

    console.log('Oluşturulan servis talebi sayısı:', createdRequests);
    console.log('Eşleşmeyen plaka nedeniyle atlanan satır sayısı:', skippedNoVehicle);

    process.exit(0);
  } catch (error) {
    console.error('Servis kayıtlarını içe aktarma hatası:', error);
    process.exit(1);
  }
};

main();

