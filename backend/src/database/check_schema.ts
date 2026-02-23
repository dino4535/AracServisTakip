
import { connectDB } from '../config/database';

const checkSchema = async () => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Permissions'
    `);
    console.log('Permissions Columns:', result.recordset);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkSchema();
