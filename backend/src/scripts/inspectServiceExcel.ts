import dotenv from 'dotenv';
import path from 'path';
import xlsx from 'xlsx';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const main = () => {
  try {
    const filePath = path.join(__dirname, '../../../ServisKayıtları.xlsx');
    console.log('Reading file:', filePath);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });

    console.log('Sheet name:', sheetName);
    console.log('Toplam satır:', rows.length);

    if (rows.length === 0) {
      console.log('Sheet is empty');
      process.exit(0);
    }

    const firstRow = rows[0];
    const columns = Object.keys(firstRow);

    console.log('Kolonlar:', columns);
    console.log('İlk 5 satır önizleme:');
    console.log(rows.slice(0, 5));

    process.exit(0);
  } catch (error) {
    console.error('Excel inceleme hatası:', error);
    process.exit(1);
  }
};

main();
