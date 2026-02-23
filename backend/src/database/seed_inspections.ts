import sql from 'mssql';
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

const runInspectionSeed = async () => {
  try {
    console.log('🔄 Connecting to database...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to database');

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Get Vehicles
      const vehiclesResult = await transaction.request().query("SELECT VehicleID, Plate FROM Vehicles");
      const vehicles = vehiclesResult.recordset;

      if (vehicles.length === 0) {
        console.log('❌ No vehicles found. Please seed vehicles first.');
        await transaction.rollback();
        return;
      }

      console.log(`Found ${vehicles.length} vehicles. Seeding inspections...`);

      // Clear existing inspections
      await transaction.request().query("DELETE FROM VehicleInspections");
      console.log('Cleared existing inspections.');

      let count = 0;
      const today = new Date();

      for (const vehicle of vehicles) {
        // Generate 1-2 past inspections for each vehicle
        const numInspections = Math.floor(Math.random() * 2) + 1;

        for (let i = 0; i < numInspections; i++) {
          // Past inspection date: 6-18 months ago
          const monthsAgo = Math.floor(Math.random() * 12) + 6 + (i * 12);
          const inspectionDate = new Date(today);
          inspectionDate.setMonth(today.getMonth() - monthsAgo);

          // Next inspection date: 1 year or 2 years after inspection date (depending on vehicle type logic, simplified here to 2 years for cars)
          const nextInspectionDate = new Date(inspectionDate);
          nextInspectionDate.setFullYear(inspectionDate.getFullYear() + 2);

          const cost = Math.floor(Math.random() * 500) + 500; // 500 - 1000 TL
          
          await transaction.request()
            .input('VehicleID', sql.Int, vehicle.VehicleID)
            .input('InspectionDate', sql.DateTime2, inspectionDate)
            .input('NextInspectionDate', sql.DateTime2, nextInspectionDate)
            .input('Cost', sql.Decimal(10, 2), cost)
            .input('Notes', sql.NVarChar, 'Periyodik Muayene')
            .query(`
              INSERT INTO VehicleInspections (VehicleID, InspectionDate, NextInspectionDate, Cost, Notes)
              VALUES (@VehicleID, @InspectionDate, @NextInspectionDate, @Cost, @Notes)
            `);
            
          count++;
        }
      }

      await transaction.commit();
      console.log(`✅ Successfully seeded ${count} inspection records.`);
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

runInspectionSeed();
