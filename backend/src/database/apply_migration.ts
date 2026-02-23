import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  server: process.env.DB_SERVER || '77.83.37.248',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'OGUZ',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'AracServisTakip',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

const applyMigration = async () => {
  try {
    console.log('🔄 Connecting to database...');
    const pool = await sql.connect(config);
    console.log('✅ Connected');

    const migrationFile = path.join(process.cwd(), '..', 'database', 'migrations', '010_add_next_maintenance_km.sql');
    console.log(`Reading migration file: ${migrationFile}`);
    const sqlContent = fs.readFileSync(migrationFile, 'utf8');

    console.log('Executing migration...');
    await pool.request().query(sqlContent);
    console.log('✅ Migration applied successfully');

    await pool.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

applyMigration();
