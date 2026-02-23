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

const runMigration = async () => {
  try {
    const pool = await sql.connect(config);
    const filePath = path.join(process.cwd(), 'src', 'database', 'migrations', '004_add_service_companies.sql');
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    console.log(`\n🔄 Running migration: 004_add_service_companies.sql`);
    
    const statements = sqlContent.split('GO').map(s => s.trim()).filter(s => s);
    
    for (const statement of statements) {
      try {
          await pool.request().query(statement);
      } catch (e: any) {
          console.log("Error or notice:", e.message);
      }
    }
    
    console.log(`✅ Migration completed.`);
    await pool.close();
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
};

runMigration();
