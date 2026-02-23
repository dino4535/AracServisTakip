import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '008_create_vehicle_inspections.sql');
    const migrationSql = fs.readFileSync(migrationFile, 'utf8');
    const statements = migrationSql.split('GO').map(s => s.trim()).filter(s => s.length > 0);

    console.log(`Running migration 008 (${statements.length} batches)...`);
    
    for (const statement of statements) {
      await pool.request().query(statement);
    }
    
    console.log('Migration 008 completed successfully.');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigration();
