import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const main = async () => {
  try {
    const pool = await connectDB();

    const result = await pool.request().query(`
      UPDATE Vehicles
      SET FuelType = 'Diesel'
      WHERE Status <> 'Deleted';

      SELECT @@ROWCOUNT AS updatedCount;
    `);

    const updatedCount = result.recordset[result.recordset.length - 1]?.updatedCount ?? 0;
    console.log('Güncellenen araç sayısı (FuelType = Diesel):', updatedCount);

    process.exit(0);
  } catch (error) {
    console.error('Araç yakıt tiplerini güncelleme hatası:', error);
    process.exit(1);
  }
};

main();

