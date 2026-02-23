import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { connectDB } from '../config/database';
import sql from 'mssql';

const parseExcelDate = (value: any): Date | null => {
  if (!value && value !== 0) return null;

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
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

const run = async () => {
  try {
    const filePath = path.resolve(__dirname, '../../..', 'KM LER.xlsx');
    if (!fs.existsSync(filePath)) {
      console.error('Excel dosyası bulunamadı:', filePath);
      process.exit(1);
    }

    const buffer = fs.readFileSync(filePath);
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    if (!ws || !ws['!ref']) {
      console.error('Excel sayfası boş veya geçersiz');
      process.exit(1);
    }

    const range = XLSX.utils.decode_range(ws['!ref']);

    const headerColumns: { colIndex: number; date: Date }[] = [];
    for (let c = range.s.c + 1; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c });
      const cell = ws[cellAddress];
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const date = parseExcelDate(cell.v);
      if (!date) continue;
      headerColumns.push({ colIndex: c, date });
    }

    if (headerColumns.length === 0) {
      console.error('Tarih başlığı bulunan sütun bulunamadı');
      process.exit(1);
    }

    const pool = await connectDB();

    const vehiclesResult = await pool.request().query('SELECT VehicleID, Plate FROM Vehicles');
    const plateMap = new Map<string, number>();
    for (const v of vehiclesResult.recordset as any[]) {
      if (!v.Plate) continue;
      plateMap.set(String(v.Plate).trim().toUpperCase(), v.VehicleID);
    }

    const kmEntriesByDate = new Map<string, { vehicleId: number; date: Date; km: number }>();
    const monthlyMaxMap = new Map<string, number>();
    const vehicleMaxKm = new Map<number, number>();
    const unknownPlates = new Set<string>();
    const errors: string[] = [];

    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const plateCell = ws[XLSX.utils.encode_cell({ r, c: range.s.c })];
      if (!plateCell || plateCell.v === undefined || plateCell.v === null) continue;
      const plateStr = String(plateCell.v).trim().toUpperCase();
      if (!plateStr) continue;

      const vehicleId = plateMap.get(plateStr);
      if (!vehicleId) {
        unknownPlates.add(plateStr);
        continue;
      }

      for (const { colIndex, date } of headerColumns) {
        const cellAddress = XLSX.utils.encode_cell({ r, c: colIndex });
        const cell = ws[cellAddress];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;

        const kmNum = Number(cell.v);
        if (isNaN(kmNum)) {
          errors.push(`Row ${r + 1}, Plate ${plateStr}: KM değeri sayı değil (${cell.v})`);
          continue;
        }

        const km = Math.round(kmNum);
        if (km < 0) {
          errors.push(`Row ${r + 1}, Plate ${plateStr}: KM negatif olamaz (${km})`);
          continue;
        }

        const dateKey = date.toISOString().substring(0, 10);
        const entryKey = `${vehicleId}-${dateKey}`;
        const existingEntry = kmEntriesByDate.get(entryKey);
        if (!existingEntry || km > existingEntry.km) {
          kmEntriesByDate.set(entryKey, { vehicleId, date, km });
        }

        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const monthKey = `${vehicleId}-${month}-${year}`;
        const existingMonthKm = monthlyMaxMap.get(monthKey);
        if (!existingMonthKm || km > existingMonthKm) {
          monthlyMaxMap.set(monthKey, km);
        }

        const existingVehicleMax = vehicleMaxKm.get(vehicleId) || 0;
        if (km > existingVehicleMax) {
          vehicleMaxKm.set(vehicleId, km);
        }
      }
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const updatedByUserId = 1;

      let kmUpdateCount = 0;
      for (const entry of kmEntriesByDate.values()) {
        await transaction.request()
          .input('VehicleID', sql.Int, entry.vehicleId)
          .input('Kilometer', sql.Int, entry.km)
          .input('UpdatedBy', sql.Int, updatedByUserId)
          .input('UpdateDate', sql.DateTime, entry.date)
          .query(`
            INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
            VALUES (@VehicleID, @Kilometer, @UpdatedBy, @UpdateDate)
          `);
        kmUpdateCount++;
      }

      let monthlyLogCount = 0;
      for (const [key, km] of monthlyMaxMap.entries()) {
        const [vehicleIdStr, monthStr, yearStr] = key.split('-');
        const vehicleId = parseInt(vehicleIdStr, 10);
        const month = parseInt(monthStr, 10);
        const year = parseInt(yearStr, 10);

        await transaction.request()
          .input('VehicleID', sql.Int, vehicleId)
          .input('Month', sql.Int, month)
          .input('Year', sql.Int, year)
          .input('Kilometer', sql.Int, km)
          .input('CreatedBy', sql.Int, updatedByUserId)
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
        monthlyLogCount++;
      }

      let vehicleUpdateCount = 0;
      for (const [vehicleId, maxKm] of vehicleMaxKm.entries()) {
        const currentResult = await transaction.request()
          .input('VehicleID', sql.Int, vehicleId)
          .query('SELECT CurrentKm FROM Vehicles WHERE VehicleID = @VehicleID');

        const currentKm = currentResult.recordset.length > 0 && currentResult.recordset[0].CurrentKm != null
          ? currentResult.recordset[0].CurrentKm
          : 0;

        const newKm = Math.max(currentKm, maxKm);

        await transaction.request()
          .input('VehicleID', sql.Int, vehicleId)
          .input('CurrentKm', sql.Int, newKm)
          .query(`
            UPDATE Vehicles 
            SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE()
            WHERE VehicleID = @VehicleID
          `);

        vehicleUpdateCount++;
      }

      await transaction.commit();

      console.log(
        JSON.stringify(
          {
            success: true,
            kmUpdatesInserted: kmUpdateCount,
            monthlyLogsUpserted: monthlyLogCount,
            vehiclesUpdated: vehicleUpdateCount,
            unknownPlates: Array.from(unknownPlates),
            parseErrors: errors,
          },
          null,
          2
        )
      );

      process.exit(0);
    } catch (err) {
      await transaction.rollback();
      console.error('KM import sırasında transaction hatası:', err);
      process.exit(1);
    }
  } catch (error) {
    console.error('KM LER.xlsx içe aktarma sırasında hata:', error);
    process.exit(1);
  }
};

run();

