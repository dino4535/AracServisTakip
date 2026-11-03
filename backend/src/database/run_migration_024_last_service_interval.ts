import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '024_add_last_service_and_interval.sql');
    const sqlContent = fs.readFileSync(migrationFile, 'utf-8');

    console.log('Running migration: 024_add_last_service_and_interval.sql');

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
