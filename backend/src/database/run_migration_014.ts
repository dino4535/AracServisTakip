
import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '014_create_system_settings.sql');
    const migrationScript = fs.readFileSync(migrationFile, 'utf8');

    console.log('Running migration: 014_create_system_settings.sql');
    await pool.request().query(migrationScript);
    console.log('Migration completed successfully.');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
