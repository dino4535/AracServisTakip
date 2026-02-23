import { connectDB } from '../config/database';
import sql from 'mssql';

const INSURANCE_COMPANIES = ['Allianz', 'Axa Sigorta', 'Anadolu Sigorta', 'Sompo Sigorta', 'Mapfre', 'Türkiye Sigorta'];
const INSURANCE_TYPES = ['Trafik Sigortası', 'Kasko'];

const getRandomElement = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const generatePolicyNumber = () => {
  return `${getRandomInt(10000000, 99999999)}`;
};

const addYear = (date: Date, years: number) => {
  const newDate = new Date(date);
  newDate.setFullYear(newDate.getFullYear() + years);
  return newDate;
};

const seedInsuranceRecords = async () => {
  try {
    console.log('Connecting to database...');
    const pool = await connectDB();
    console.log('Connected.');

    // 1. Get all vehicles
    console.log('Fetching vehicles...');
    const vehiclesResult = await pool.request().query('SELECT VehicleID, Plate FROM Vehicles');
    const vehicles = vehiclesResult.recordset;

    if (vehicles.length === 0) {
      console.log('No vehicles found. Please seed vehicles first.');
      process.exit(0);
    }

    console.log(`Found ${vehicles.length} vehicles. Generating insurance records...`);

    let addedCount = 0;

    for (const vehicle of vehicles) {
      // Create one Traffic Insurance and one Kasko for each vehicle
      for (const type of INSURANCE_TYPES) {
        // Check if active insurance already exists to avoid duplicates (optional, but good for idempotency)
        // For simplicity, we'll just add new ones or check if any exists for this vehicle/type
        
        // Let's create a record that started 1-6 months ago and expires in 6-11 months
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - getRandomInt(1, 6));
        const endDate = addYear(startDate, 1);
        
        const company = getRandomElement(INSURANCE_COMPANIES);
        const policyNumber = generatePolicyNumber();
        const cost = type === 'Kasko' ? getRandomInt(10000, 50000) : getRandomInt(3000, 10000);
        
        try {
            await pool.request()
            .input('VehicleID', sql.Int, vehicle.VehicleID)
            .input('Type', sql.NVarChar(50), type)
            .input('PolicyNumber', sql.NVarChar(50), policyNumber)
            .input('InsuranceCompany', sql.NVarChar(100), company)
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .input('Cost', sql.Decimal(10, 2), cost)
            .input('Notes', sql.NVarChar(sql.MAX), 'Demo veri')
            .query(`
                INSERT INTO InsuranceRecords (VehicleID, Type, PolicyNumber, InsuranceCompany, StartDate, EndDate, Cost, Notes)
                VALUES (@VehicleID, @Type, @PolicyNumber, @InsuranceCompany, @StartDate, @EndDate, @Cost, @Notes)
            `);
            
            console.log(`Added ${type} for ${vehicle.Plate} (${company}, ${cost} TL)`);
            addedCount++;
        } catch (err) {
            console.error(`Failed to add ${type} for ${vehicle.Plate}:`, err);
        }
      }
    }

    console.log(`Successfully added ${addedCount} insurance records.`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding insurance records:', error);
    process.exit(1);
  }
};

seedInsuranceRecords();
