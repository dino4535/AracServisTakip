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
  'KDV DAHİL Fatura Tutar'?: number | string;
}

const main = async () => {
  try {
    const filePath = path.join(__dirname, '../../../ServisKayıtları.xlsx');
    console.log('Excel dosyası:', filePath);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });

    console.log('Toplam satır:', rows.length);

    const pool = await connectDB();

    const uniquePlates = new Set<string>();
    for (const row of rows) {
      if (!row.Plaka) continue;
      const normalized = row.Plaka.toString().toUpperCase().replace(/\s+/g, '');
      if (normalized) uniquePlates.add(normalized);
    }

    const existingPlates = new Set<string>();

    for (const plate of uniquePlates) {
      const result = await pool
        .request()
        .input('Plate', sql.NVarChar, plate)
        .query(`
          SELECT TOP 1 Plate 
          FROM Vehicles 
          WHERE REPLACE(UPPER(Plate), ' ', '') = @Plate
        `);

      if (result.recordset.length > 0) {
        existingPlates.add(plate);
      }
    }

    const skipped: ExcelRow[] = [];

    for (const row of rows) {
      const rawPlate = row.Plaka;
      if (!rawPlate) {
        skipped.push(row);
        continue;
      }

      const normalized = rawPlate.toString().toUpperCase().replace(/\s+/g, '');
      if (!existingPlates.has(normalized)) {
        skipped.push(row);
      }
    }

    console.log('Atlanan satır sayısı:', skipped.length);

    const outWb = xlsx.utils.book_new();
    const outSheet = xlsx.utils.json_to_sheet(skipped);
    xlsx.utils.book_append_sheet(outWb, outSheet, 'Atlananlar');

    const outPath = path.join(__dirname, '../../../ServisKayıtları_Atlananlar.xlsx');
    xlsx.writeFile(outWb, outPath);

    console.log('Atlanan satırlar dosyaya yazıldı:', outPath);

    process.exit(0);
  } catch (error) {
    console.error('Atlanan servis satırlarını dışa aktarma hatası:', error);
    process.exit(1);
  }
};

main();
