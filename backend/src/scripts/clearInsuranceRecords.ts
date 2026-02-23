import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const main = async () => {
  try {
    const pool = await connectDB();

    const result = await pool.request().query(`
      DELETE FROM InsuranceRecords;
      SELECT @@ROWCOUNT AS deletedCount;
    `);

    const deletedCount = result.recordset[result.recordset.length - 1]?.deletedCount ?? 0;
    console.log('Silinen sigorta kaydı sayısı:', deletedCount);

    process.exit(0);
  } catch (error) {
    console.error('Sigorta kayıtlarını silme hatası:', error);
    process.exit(1);
  }
};

main();

