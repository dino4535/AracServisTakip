import dotenv from 'dotenv';
import path from 'path';
import xlsx from 'xlsx';
import { connectDB } from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ExcelRow {
  PLAKA?: string;
  [key: string]: any;
}

const normalizePlate = (plate: string) => plate.toUpperCase().replace(/\s+/g, '');

const main = async () => {
  try {
    const filePath = path.join(__dirname, '../../../SigortaKasko.xlsx');
    console.log('Excel dosyası:', filePath);

    const workbook = xlsx.readFile(filePath);
    const excelRows: ExcelRow[] = [];

    workbook.SheetNames.forEach((name) => {
      const sheet = workbook.Sheets[name];
      const rows = xlsx.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });
      excelRows.push(...rows);
    });

    console.log('Toplam excel satırı:', excelRows.length);

    const excelByPlate = new Map<string, ExcelRow[]>();
    for (const row of excelRows) {
      if (!row.PLAKA) continue;
      const normalized = normalizePlate(row.PLAKA.toString());
      if (!excelByPlate.has(normalized)) {
        excelByPlate.set(normalized, []);
      }
      excelByPlate.get(normalized)!.push(row);
    }

    console.log('Plakaya göre gruplanmış excel kaydı sayısı:', excelByPlate.size);

    const pool = await connectDB();

    const noPolicyResult = await pool.request().query(`
      SELECT v.VehicleID, v.Plate
      FROM Vehicles v
      LEFT JOIN InsuranceRecords ir ON ir.VehicleID = v.VehicleID
      WHERE ir.InsuranceID IS NULL
      ORDER BY v.Plate
    `);

    const missingWithExcel: {
      vehicleId: number;
      plate: string;
      excelCount: number;
    }[] = [];

    for (const row of noPolicyResult.recordset as any[]) {
      const plate: string = row.Plate;
      const vehicleId: number = row.VehicleID;
      const normalized = normalizePlate(plate);
      const excelMatches = excelByPlate.get(normalized) || [];
      if (excelMatches.length > 0) {
        missingWithExcel.push({
          vehicleId,
          plate,
          excelCount: excelMatches.length,
        });
      }
    }

    console.log('Poliçesi olmayan araç sayısı (DB):', noPolicyResult.recordset.length);
    console.log('Excelde kaydı olup DBde poliçesi olmayan araç sayısı:', missingWithExcel.length);

    if (missingWithExcel.length > 0) {
      console.log('Excelde kaydı olup sistemde poliçesi olmayan ilk 50 araç:');
      missingWithExcel.slice(0, 50).forEach((item) => {
        console.log(`AraçID: ${item.vehicleId}, Plaka: ${item.plate}, Excel kayıt adedi: ${item.excelCount}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Sigorta Excel inceleme hatası:', error);
    process.exit(1);
  }
};

main();

