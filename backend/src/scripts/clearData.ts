import { connectDB } from '../config/database';
import sql from 'mssql';

const clearData = async () => {
  try {
    console.log('Connecting to database...');
    const pool = await connectDB();
    console.log('Connected.');

    console.log('Disabling constraints...');
    await pool.request().query('EXEC sp_msforeachtable \"ALTER TABLE ? NOCHECK CONSTRAINT all\"');

    console.log('Deleting dependent records...');
    await pool.request().query(`
      DELETE FROM AccidentFiles;
      DELETE FROM Notifications;
      DELETE FROM AuditLogs;
      DELETE FROM MonthlyKmLog;
      DELETE FROM KmUpdates;
      DELETE FROM FuelRecords;
      DELETE FROM InsuranceRecords;
      DELETE FROM VehicleInspections;
      DELETE FROM AccidentRecords;
      DELETE FROM MaintenanceRecords;
      DELETE FROM ServiceRequests;
      DELETE FROM ReminderSettings;
    `);

    console.log('Deleting vehicles...');
    await pool.request().query('DELETE FROM Vehicles;');

    console.log('Re-enabling constraints...');
    await pool.request().query('EXEC sp_msforeachtable \"ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all\"');

    console.log('Data cleared successfully (users and auth data kept).');
    process.exit(0);
  } catch (error) {
    console.error('Error while clearing data:', error);
    process.exit(1);
  }
};

clearData();

