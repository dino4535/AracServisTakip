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
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const masterConfig = {
  ...config,
  database: 'master',
};

const runMigrations = async () => {
  try {
    console.log('🔄 Connecting to master database...');
    const masterPool = await sql.connect(masterConfig);
    console.log('✅ Connected to master database');

    const dbName = process.env.DB_NAME || 'AracServisTakip';
    
    try {
      console.log(`\n🔄 Dropping existing database: ${dbName}`);
      await masterPool.request().query(`IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'${dbName}') DROP DATABASE [${dbName}]`);
      console.log(`✅ Database dropped`);
    } catch (err: any) {
      console.log(`⚠️  Database did not exist`);
    }

    console.log(`\n🔄 Creating database: ${dbName}`);
    await masterPool.request().query(`CREATE DATABASE [${dbName}]`);
    console.log(`✅ Database created: ${dbName}`);
    
    await masterPool.close();
    
    console.log(`\n🔄 Connecting to database: ${dbName}`);
    const pool = await sql.connect(config);
    console.log('✅ Connected to target database');

    const migrationsDir = path.join(process.cwd(), '..', 'database', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📋 Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      
      console.log(`\n🔄 Running migration: ${file}`);
      
      const statements = sqlContent.split('GO').map(s => s.trim()).filter(s => s);
      
      for (const statement of statements) {
        try {
          await pool.request().query(statement);
        } catch (err: any) {
          if (err.number === 2714 || err.number === 208) {
            console.log(`⚠️  Skipping existing object: ${err.message}`);
          } else {
            throw err;
          }
        }
      }
      
      console.log(`✅ Migration completed: ${file}`);
    }

    console.log('\n🎉 All migrations completed successfully!');
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

runMigrations();