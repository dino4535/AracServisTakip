import dotenv from 'dotenv';
import path from 'path';
import xlsx from 'xlsx';
import sql from 'mssql';
import { connectDB, closeDB } from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ExcelRow {
  [key: string]: any;
}

const normalizePlate = (plate: string) => plate.toUpperCase().replace(/\s+/g, '');

const findColumnKey = (keys: string[], match: (k: string) => boolean): string | null => {
  for (const key of keys) {
    const normalized = key.toLowerCase();
    if (match(normalized)) return key;
  }
  return null;
};

const excelDateToJSDate = (value: any): Date | null => {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 24 * 60 * 60 * 1000);
  }

  const str = String(value).trim();
  if (!str) return null;

  const direct = new Date(str);
  if (!isNaN(direct.getTime())) {
    return direct;
  }

  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10) - 1;
    const year = parseInt(dotMatch[3], 10);
    return new Date(year, month, day);
  }

  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    return new Date(year, month, day);
  }

  return null;
};

const main = async () => {
  try {
    const filePath = path.join(__dirname, '../../../Vize Takip (2).xlsx');
    console.log('Excel dosyası:', filePath);

    const workbook = xlsx.readFile(filePath);
    const excelRows: ExcelRow[] = [];

    workbook.SheetNames.forEach((name) => {
      const sheet = workbook.Sheets[name];
      const rows = xlsx.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });
      excelRows.push(...rows);
    });

    if (excelRows.length === 0) {
      console.log('Excel boş, işlem yapılmadı.');
      return;
    }

    const sampleRow = excelRows[0];
    const columns = Object.keys(sampleRow);
    console.log('Bulunan kolonlar:', columns);

    let plateKey =
      findColumnKey(columns, (k) => k.includes('plaka')) || 'PLAKA';
    let vizeKey =
      findColumnKey(
        columns,
        (k) =>
          k.includes('vize son tarih') ||
          (k.includes('vize') && (k.includes('son') || k.includes('biti') || k.includes('tarih'))) ||
          (k.includes('muayene') && (k.includes('son') || k.includes('biti') || k.includes('tarih')))
      ) || columns.find((k) => k.toLowerCase().includes('tarih')) || null;

    if (!vizeKey && columns.includes('VİZE SON TARİH')) {
      vizeKey = 'VİZE SON TARİH';
    }

    if (!plateKey || !vizeKey) {
      console.error('Plaka veya vize son tarih kolonu tespit edilemedi. Lütfen excel başlıklarını kontrol edin.');
      console.log('Örnek satır:', sampleRow);
      return;
    }

    console.log('Plaka kolonu:', plateKey);
    console.log('Vize son tarih kolonu:', vizeKey);

    const pool = await connectDB();

    // Araçları plakaya göre map'leyelim
    const vehiclesResult = await pool
      .request()
      .query('SELECT VehicleID, Plate FROM Vehicles');

    const vehiclesByPlate = new Map<string, number>();
    for (const row of vehiclesResult.recordset as any[]) {
      const plate = normalizePlate(row.Plate);
      vehiclesByPlate.set(plate, row.VehicleID);
    }

    console.log('Sistemdeki araç sayısı:', vehiclesByPlate.size);

    let insertCount = 0;
    let skipNoVehicle = 0;
    let skipNoDate = 0;

    for (const row of excelRows) {
      const plateRaw = row[plateKey];
      if (!plateRaw) continue;

      const plate = normalizePlate(String(plateRaw));
      const vehicleId = vehiclesByPlate.get(plate);
      if (!vehicleId) {
        skipNoVehicle++;
        continue;
      }

      const vizeRaw = row[vizeKey];
      const nextInspectionDate = excelDateToJSDate(vizeRaw);
      if (!nextInspectionDate) {
        skipNoDate++;
        continue;
      }

      const inspectionDate = new Date(nextInspectionDate);
      inspectionDate.setFullYear(inspectionDate.getFullYear() - 1);

      await pool
        .request()
        .input('VehicleID', sql.Int, vehicleId)
        .input('InspectionDate', sql.DateTime2, inspectionDate)
        .input('NextInspectionDate', sql.DateTime2, nextInspectionDate)
        .input('Cost', sql.Decimal(10, 2), 0)
        .input('Notes', sql.NVarChar(500), 'Vize Takip Excel Import')
        .query(`
          INSERT INTO VehicleInspections (VehicleID, InspectionDate, NextInspectionDate, Cost, Notes)
          VALUES (@VehicleID, @InspectionDate, @NextInspectionDate, @Cost, @Notes)
        `);

      insertCount++;
    }

    console.log('İşlem tamamlandı.');
    console.log('Eklenen muayene kaydı:', insertCount);
    console.log('Eşleşen araç bulunamadığı için atlanan satır:', skipNoVehicle);
    console.log('Tarih bulunamadığı için atlanan satır:', skipNoDate);
  } catch (error) {
    console.error('Vize Excel import hatası:', error);
  } finally {
    await closeDB();
    process.exit(0);
  }
};

main();
