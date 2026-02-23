import * as XLSX from 'xlsx';
import path from 'path';

const run = () => {
  const filePath = path.resolve(__dirname, '../../../driver_mapping_data (002).xlsx');
  console.log('Reading file:', filePath);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

  console.log('Total rows:', data.length);
  console.log('First 5 rows preview:');
  console.log(JSON.stringify(data.slice(0, 5), null, 2));
};

run();

