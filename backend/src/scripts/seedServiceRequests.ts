import dotenv from 'dotenv';
import path from 'path';

// Load env vars from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { connectDB } from '../config/database';
import sql from 'mssql';

const SERVICE_TYPES = [
  'Mekanik Arıza',
  'Periyodik Bakım',
  'Elektrik Arızası',
  'Lastik Değişimi',
  'Kaporta Boya',
  'Fren Sistemi',
  'Yağ Değişimi'
];

const DESCRIPTIONS = [
  'Motor ses yapıyor kontrol edildi.',
  'Yıllık periyodik bakım yapıldı.',
  'Far ampulü patladı değiştirildi.',
  'Kış lastikleri takıldı.',
  'Ön tampon sürtmesi lokal boya.',
  'Fren balataları bitti değiştirildi.',
  'Yağ ve filtre değişimi yapıldı.',
  'Klima gazı basıldı.',
  'Akü değişimi yapıldı.',
  'Silecekler değiştirildi.'
];

const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const seedServiceRequests = async () => {
  try {
    console.log('Connecting to database...');
    const pool = await connectDB();
    console.log('Connected.');

    // 1. Get or Create Service Company
    let serviceCompanyId: number;
    const companyResult = await pool.request().query("SELECT TOP 1 ServiceCompanyID FROM ServiceCompanies");
    
    if (companyResult.recordset.length > 0) {
      serviceCompanyId = companyResult.recordset[0].ServiceCompanyID;
    } else {
      console.log('Creating default Service Company...');
      const insertCompany = await pool.request()
        .input('Name', sql.NVarChar, 'Oto Pratik Servis')
        .input('Address', sql.NVarChar, 'Sanayi Sitesi No:1')
        .input('Phone', sql.NVarChar, '02125555555')
        .input('Email', sql.NVarChar, 'info@otopratik.com')
        .query(`
          INSERT INTO ServiceCompanies (Name, Address, Phone, Email)
          OUTPUT inserted.ServiceCompanyID
          VALUES (@Name, @Address, @Phone, @Email)
        `);
      serviceCompanyId = insertCompany.recordset[0].ServiceCompanyID;
    }

    // 2. Get All Vehicles
    const vehiclesResult = await pool.request().query("SELECT VehicleID, Plate, CurrentKm FROM Vehicles WHERE Status = 'Active'");
    const vehicles = vehiclesResult.recordset;
    console.log(`Found ${vehicles.length} active vehicles.`);

    // 3. Create Service Requests
    let createdCount = 0;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const today = new Date();

    for (const vehicle of vehicles) {
      // Create 1-3 requests per vehicle
      const numRequests = getRandomInt(1, 3);

      for (let i = 0; i < numRequests; i++) {
        const serviceType = SERVICE_TYPES[getRandomInt(0, SERVICE_TYPES.length - 1)];
        const description = DESCRIPTIONS[getRandomInt(0, DESCRIPTIONS.length - 1)];
        const requestDate = getRandomDate(sixMonthsAgo, today);
        const completedDate = new Date(requestDate);
        completedDate.setDate(completedDate.getDate() + getRandomInt(1, 5)); // Completed 1-5 days later

        // Ensure completed date is not in future
        if (completedDate > today) continue;

        const estimatedCost = getRandomInt(1000, 5000);
        const actualCost = estimatedCost + getRandomInt(-500, 1000); // Slight variation
        
        // Randomly assign a creator (User ID 1 usually Admin)
        const requestedBy = 1; 

        await pool.request()
          .input('VehicleID', sql.Int, vehicle.VehicleID)
          .input('RequestedBy', sql.Int, requestedBy)
          .input('ServiceCompanyID', sql.Int, serviceCompanyId)
          .input('ServiceType', sql.NVarChar, serviceType)
          .input('Priority', sql.NVarChar, 'Normal')
          .input('Description', sql.NVarChar, description)
          .input('Status', sql.NVarChar, 'COMPLETED')
          .input('RequestDate', sql.DateTime, requestDate)
          .input('CompletedDate', sql.DateTime, completedDate)
          .input('EstimatedCost', sql.Decimal(10, 2), estimatedCost)
          .input('ActualCost', sql.Decimal(10, 2), actualCost)
          .input('ServiceActions', sql.NVarChar, 'Parça değişimi ve işçilik yapıldı.')
          .query(`
            INSERT INTO ServiceRequests (
              VehicleID, RequestedBy, ServiceCompanyID, ServiceType, Priority, Description, 
              Status, RequestDate, CompletedDate, EstimatedCost, ActualCost, ServiceActions
            ) VALUES (
              @VehicleID, @RequestedBy, @ServiceCompanyID, @ServiceType, @Priority, @Description, 
              @Status, @RequestDate, @CompletedDate, @EstimatedCost, @ActualCost, @ServiceActions
            )
          `);
        
        createdCount++;
      }
    }

    console.log(`Successfully created ${createdCount} random service requests.`);
    process.exit(0);

  } catch (error) {
    console.error('Error seeding service requests:', error);
    process.exit(1);
  }
};

seedServiceRequests();
