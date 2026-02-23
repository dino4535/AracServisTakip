
import { connectDB } from '../config/database';

const checkCompanies = async () => {
  try {
    const pool = await connectDB();
    // Try to find a table with companies
    // It might be ServiceCompanies or just Companies or maybe hardcoded?
    // Let's check tables first
    const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES");
    console.log('Tables:', tables.recordset.map(t => t.TABLE_NAME));

    // If UserCompanies exists, maybe companies are stored somewhere?
    // Let's check Vehicles table distinct CompanyID
    const vehicles = await pool.request().query("SELECT DISTINCT CompanyID FROM Vehicles");
    console.log('Vehicle CompanyIDs:', vehicles.recordset);

    // If there is a Companies table
    try {
        const companies = await pool.request().query("SELECT * FROM Companies");
        console.log('Companies:', companies.recordset);
    } catch (e) {
        console.log('No Companies table found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkCompanies();
