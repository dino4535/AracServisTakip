
import sql from 'mssql';
import { connectDB, closeDB } from '../config/database';

const runHistorySeed = async () => {
  try {
    const pool = await connectDB();
    console.log('✅ Connected to database');

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Get all active vehicles
      const vehicles = await transaction.request().query("SELECT VehicleID, Plate, CurrentKm FROM Vehicles WHERE Status = 'Active'");
      const users = await transaction.request().query("SELECT UserID FROM Users WHERE IsActive = 1");
      
      if (vehicles.recordset.length === 0) {
        console.log('No active vehicles found. Run seed_test_data.ts first.');
        await transaction.rollback();
        return;
      }

      const driverIds = users.recordset.map(u => u.UserID);

      console.log(`Generating history for ${vehicles.recordset.length} vehicles...`);

      for (const vehicle of vehicles.recordset) {
        const vehicleId = vehicle.VehicleID;
        let currentKm = 10000 + Math.floor(Math.random() * 50000); // Start base KM
        const historyDays = 180; // Generate 6 months of history
        const dailyKmBase = 50 + Math.floor(Math.random() * 100); // 50-150 km/day average
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - historyDays);

        let lastKm = currentKm;
        let lastDate = new Date(startDate);

        // Clear existing history for clean slate (optional, but safer for re-runs)
        await transaction.request().input('VehicleID', sql.Int, vehicleId).query("DELETE FROM FuelRecords WHERE VehicleID = @VehicleID");
        await transaction.request().input('VehicleID', sql.Int, vehicleId).query("DELETE FROM KmUpdates WHERE VehicleID = @VehicleID");
        // We keep ServiceRequests/MaintenanceRecords but might need to adjust them if they conflict with new KMs. 
        // For simplicity, we assume existing maintenance records are 'recent' or we just append history *before* them if possible.
        // Actually, best to just wipe and rebuild related records for these vehicles if we want consistency, 
        // but let's just insert Fuel/Km records that lead up to the current KM.

        // Actually, let's simulate day by day
        for (let d = 0; d < historyDays; d++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(currentDate.getDate() + d);

          // Randomly add KM (some days 0, some days high)
          if (Math.random() > 0.2) { // 80% chance of driving
             const dailyKm = Math.floor(dailyKmBase * (0.5 + Math.random()));
             lastKm += dailyKm;
          }

          // Every ~7 days or ~500km, add a Fuel Record
          if (d % 7 === 0 || (d > 0 && Math.random() > 0.8)) {
             const liters = 30 + Math.floor(Math.random() * 30);
             const costPerLiter = 40 + (Math.random() * 5); // ~40-45 TL
             const totalCost = liters * costPerLiter;
             const driverId = driverIds[Math.floor(Math.random() * driverIds.length)];

             await transaction.request()
               .input('VehicleID', sql.Int, vehicleId)
               .input('FuelDate', sql.DateTime, currentDate)
               .input('Kilometer', sql.Int, lastKm)
               .input('Liters', sql.Decimal(10,2), liters)
               .input('TotalCost', sql.Decimal(10,2), totalCost)
               .input('CostPerLiter', sql.Decimal(10,2), costPerLiter)
               .input('FilledBy', sql.Int, driverId)
               .query(`
                 INSERT INTO FuelRecords (VehicleID, FuelDate, Kilometer, Liters, TotalCost, CostPerLiter, FilledBy)
                 VALUES (@VehicleID, @FuelDate, @Kilometer, @Liters, @TotalCost, @CostPerLiter, @FilledBy)
               `);
          }

          // Every ~30 days, add a KmUpdate (manual check)
          if (d % 30 === 0) {
             const driverId = driverIds[Math.floor(Math.random() * driverIds.length)];
             await transaction.request()
               .input('VehicleID', sql.Int, vehicleId)
               .input('Kilometer', sql.Int, lastKm)
               .input('UpdatedBy', sql.Int, driverId)
               .input('UpdateDate', sql.DateTime, currentDate)
               .query(`
                 INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
                 VALUES (@VehicleID, @Kilometer, @UpdatedBy, @UpdateDate)
               `);
          }
        }

        // Update Vehicle's CurrentKm to the final calculated one
        await transaction.request()
          .input('VehicleID', sql.Int, vehicleId)
          .input('CurrentKm', sql.Int, lastKm)
          .query("UPDATE Vehicles SET CurrentKm = @CurrentKm WHERE VehicleID = @VehicleID");
      }

      await transaction.commit();
      console.log('🎉 History generated successfully!');

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await closeDB();
  } catch (error) {
    console.error('❌ History seed error:', error);
    process.exit(1);
  }
};

runHistorySeed();
