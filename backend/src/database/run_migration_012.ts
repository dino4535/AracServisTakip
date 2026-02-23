
import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '012_add_fuel_external_fields.sql');
    const migrationScript = fs.readFileSync(migrationFile, 'utf-8');

    console.log('Running migration: 012_add_fuel_external_fields.sql');
    await pool.request().query(migrationScript);
    console.log('Migration completed successfully.');

    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigration();
