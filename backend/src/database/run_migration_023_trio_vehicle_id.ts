import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '023_add_trio_vehicle_id.sql');
    const sqlContent = fs.readFileSync(migrationFile, 'utf-8');

    console.log('Running migration: 023_add_trio_vehicle_id.sql');

    const statements = sqlContent.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(s => s.length > 0);
    for (const statement of statements) {
      await pool.request().query(statement);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigration();
