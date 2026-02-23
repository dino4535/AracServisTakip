
import { connectDB } from './src/config/database';
import sql from 'mssql';

async function check() {
  try {
    const pool = await connectDB();
    const res = await pool.request().query("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'CompanyID'");
    console.log('Users.CompanyID IsNullable:', res.recordset[0]);
    
    const res2 = await pool.request().query("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'UserCompanies' AND COLUMN_NAME = 'CompanyID'");
    console.log('UserCompanies.CompanyID IsNullable:', res2.recordset[0]);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
check();
