import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '025_fix_depot_scope_data.sql');
    const sqlContent = fs.readFileSync(migrationFile, 'utf-8');

    console.log('Running migration: 025_fix_depot_scope_data.sql');

    const statements = sqlContent.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(s => s.length > 0);
    for (const [index, statement] of statements.entries()) {
      const result = await pool.request().batch(statement);
      console.log(`  batch ${index + 1}/${statements.length} rowsAffected:`, result.rowsAffected);
    }

    const check = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM Vehicles v JOIN Depots d ON v.DepotID = d.DepotID WHERE v.CompanyID <> d.CompanyID) AS CrossCompanyVehicles,
        (SELECT COUNT(*) FROM Depots WHERE DATALENGTH(Name) <> DATALENGTH(LTRIM(RTRIM(Name)))) AS UntrimmedDepotNames,
        (SELECT COUNT(*) FROM sys.key_constraints WHERE name = 'UQ_UserDepots_User_Depot') AS UniqueConstraintExists
    `);
    console.log('Post-migration state:', check.recordset[0]);

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigration();
