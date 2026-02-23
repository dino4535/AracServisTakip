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

const runAccidentSeed = async () => {
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

      // Get Drivers (Users with Driver role, or just all users for simplicity)
      const usersResult = await transaction.request().query("SELECT UserID FROM Users");
      const users = usersResult.recordset;

      if (vehicles.length === 0) {
        console.log('❌ No vehicles found. Please seed vehicles first.');
        await transaction.rollback();
        return;
      }

      console.log(`Found ${vehicles.length} vehicles. Seeding accidents...`);

      // Clear existing accidents
      await transaction.request().query("DELETE FROM AccidentRecords");
      console.log('Cleared existing accidents.');

      let count = 0;
      const today = new Date();
      const locations = ['İstanbul E-5', 'Ankara Otoyolu', 'İzmir Çevre Yolu', 'Şehir İçi', 'Park Halinde'];
      const descriptions = ['Arkadan çarpma', 'Park halinde sürtme', 'Zincirleme kaza', 'Bariyerlere sürtme', 'Tekerlek patlaması sonucu kontrol kaybı'];
      const faultRates = ['0%', '25%', '50%', '75%', '100%'];
      const statuses = ['OPEN', 'IN_PROCESS', 'CLOSED'];

      // Seed accidents for random vehicles (about 30% of vehicles)
      for (const vehicle of vehicles) {
        if (Math.random() > 0.3) continue; // Skip 70% of vehicles

        const numAccidents = Math.floor(Math.random() * 2) + 1; // 1-2 accidents

        for (let i = 0; i < numAccidents; i++) {
          const monthsAgo = Math.floor(Math.random() * 24); // 0-24 months ago
          const accidentDate = new Date(today);
          accidentDate.setMonth(today.getMonth() - monthsAgo);

          const cost = Math.floor(Math.random() * 20000) + 1000; // 1000 - 21000 TL
          const driverId = users.length > 0 ? users[Math.floor(Math.random() * users.length)].UserID : null;
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          const location = locations[Math.floor(Math.random() * locations.length)];
          const description = descriptions[Math.floor(Math.random() * descriptions.length)];
          const faultRate = faultRates[Math.floor(Math.random() * faultRates.length)];
          const reportNumber = `${accidentDate.getFullYear()}/${Math.floor(Math.random() * 10000)}`;

          await transaction.request()
            .input('VehicleID', sql.Int, vehicle.VehicleID)
            .input('DriverID', sql.Int, driverId)
            .input('AccidentDate', sql.DateTime2, accidentDate)
            .input('ReportNumber', sql.NVarChar(50), reportNumber)
            .input('Description', sql.NVarChar(sql.MAX), description)
            .input('Cost', sql.Decimal(10, 2), cost)
            .input('FaultRate', sql.NVarChar(20), faultRate)
            .input('Status', sql.NVarChar(20), status)
            .input('Location', sql.NVarChar(200), location)
            .query(`
              INSERT INTO AccidentRecords (VehicleID, DriverID, AccidentDate, ReportNumber, Description, Cost, FaultRate, Status, Location)
              VALUES (@VehicleID, @DriverID, @AccidentDate, @ReportNumber, @Description, @Cost, @FaultRate, @Status, @Location)
            `);
            
          count++;
        }
      }

      await transaction.commit();
      console.log(`✅ Successfully seeded ${count} accident records.`);
      
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

runAccidentSeed();
