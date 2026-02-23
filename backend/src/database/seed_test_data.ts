import sql from 'mssql';
import dotenv from 'dotenv';
import crypto from 'crypto';

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
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const runTestDataSeed = async () => {
  try {
    console.log('🔄 Connecting to database...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to database');

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Get Companies
      const companiesResult = await transaction.request().query("SELECT CompanyID, Name FROM Companies");
      const companies = companiesResult.recordset;
      
      let dinoId = companies.find(c => c.Name === 'Dino Gıda')?.CompanyID;
      let bermerId = companies.find(c => c.Name === 'Bermer')?.CompanyID;

      // Ensure companies exist if not found (fallback)
      if (!dinoId) {
         const res = await transaction.request().query("INSERT INTO Companies (Name, TaxNumber, Address, Phone) OUTPUT INSERTED.CompanyID VALUES ('Dino Gıda', '1234567890', 'İstanbul', '5551112233')");
         dinoId = res.recordset[0].CompanyID;
      }
      if (!bermerId) {
         const res = await transaction.request().query("INSERT INTO Companies (Name, TaxNumber, Address, Phone) OUTPUT INSERTED.CompanyID VALUES ('Bermer', '9876543210', 'Ankara', '5554445566')");
         bermerId = res.recordset[0].CompanyID;
      }

      // 2. Get Roles
      const rolesResult = await transaction.request().query("SELECT RoleID, Name FROM Roles");
      const roles = rolesResult.recordset;
      const adminRole = roles.find(r => r.Name === 'Admin')?.RoleID;
      const managerRole = roles.find(r => r.Name === 'Manager')?.RoleID;
      const driverRole = roles.find(r => r.Name === 'Driver')?.RoleID;

      // 3. Configure Permissions for Manager and Driver (if not already set)
      // Manager Permissions
      const managerPerms = await transaction.request().query("SELECT PermissionID FROM Permissions WHERE Module IN ('vehicles', 'maintenance', 'service_requests', 'insurance', 'fuel', 'reports')");
      for (const p of managerPerms.recordset) {
         await transaction.request().query(`
            IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE RoleID = ${managerRole} AND PermissionID = ${p.PermissionID})
            INSERT INTO RolePermissions (RoleID, PermissionID) VALUES (${managerRole}, ${p.PermissionID})
         `);
      }
      
      // Driver Permissions
      const driverPerms = await transaction.request().query("SELECT PermissionID FROM Permissions WHERE PermissionCode IN ('vehicles.view', 'service_requests.add', 'service_requests.view')");
      for (const p of driverPerms.recordset) {
         await transaction.request().query(`
            IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE RoleID = ${driverRole} AND PermissionID = ${p.PermissionID})
            INSERT INTO RolePermissions (RoleID, PermissionID) VALUES (${driverRole}, ${p.PermissionID})
         `);
      }

      // 4. Create Service Companies
      const serviceCompaniesData = [
        { Name: 'Hızlı Oto Servis', Address: 'Sanayi Mah. 1. Sok. No:5', Phone: '02125551001', Contact: 'Ahmet Usta' },
        { Name: 'Güvenilir Tamir A.Ş.', Address: 'Oto Sanayi Sitesi C Blok', Phone: '02125551002', Contact: 'Mehmet Kalfa' },
        { Name: 'Yetkili Servis Merkezi', Address: 'E-5 Yanyol Üzeri', Phone: '02125551003', Contact: 'Ayşe Hanım' }
      ];

      const serviceCompanyIds = [];
      for (const sc of serviceCompaniesData) {
        const res = await transaction.request()
          .input('Name', sql.NVarChar, sc.Name)
          .input('Address', sql.NVarChar, sc.Address)
          .input('Phone', sql.NVarChar, sc.Phone)
          .input('Contact', sql.NVarChar, sc.Contact)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM ServiceCompanies WHERE Name = @Name)
            BEGIN
              INSERT INTO ServiceCompanies (Name, Address, Phone, ContactPerson)
              OUTPUT INSERTED.ServiceCompanyID
              VALUES (@Name, @Address, @Phone, @Contact)
            END
            ELSE
            BEGIN
              SELECT ServiceCompanyID FROM ServiceCompanies WHERE Name = @Name
            END
          `);
        serviceCompanyIds.push(res.recordset[0].ServiceCompanyID);
      }

      // 5. Create Users & Depots
      // Helper to create user
      const createUser = async (companyId: number, roleId: number, emailPrefix: string, count: number, depotIds: number[] = []) => {
        const userIds = [];
        const passwordHash = hashPassword('123456'); // Default password for all test users
        
        for (let i = 1; i <= count; i++) {
          const email = `${emailPrefix}${i}@test.com`;
          const name = `${emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)} ${i}`;
          
          const userRes = await transaction.request()
            .input('CompanyID', sql.Int, companyId)
            .input('Email', sql.NVarChar, email)
            .input('PasswordHash', sql.NVarChar, passwordHash)
            .input('Name', sql.NVarChar, name)
            .input('Surname', sql.NVarChar, 'User')
            .query(`
              IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = @Email)
              BEGIN
                INSERT INTO Users (CompanyID, Email, PasswordHash, Name, Surname, IsActive)
                OUTPUT INSERTED.UserID
                VALUES (@CompanyID, @Email, @PasswordHash, @Name, @Surname, 1)
              END
              ELSE
              BEGIN
                SELECT UserID FROM Users WHERE Email = @Email
              END
            `);
          
          const userId = userRes.recordset[0].UserID;
          userIds.push(userId);

          // Assign Role
          await transaction.request().query(`
            IF NOT EXISTS (SELECT 1 FROM UserRoles WHERE UserID = ${userId} AND RoleID = ${roleId})
            INSERT INTO UserRoles (UserID, RoleID) VALUES (${userId}, ${roleId})
          `);

          // Assign Depots (for Managers)
          if (depotIds.length > 0) {
             for (const dId of depotIds) {
                await transaction.request().query(`
                   IF NOT EXISTS (SELECT 1 FROM UserDepots WHERE UserID = ${userId} AND DepotID = ${dId})
                   INSERT INTO UserDepots (UserID, DepotID) VALUES (${userId}, ${dId})
                `);
             }
          }
        }
        return userIds;
      };

      // Get Depots
      const dinoDepotsRes = await transaction.request().query(`SELECT DepotID FROM Depots WHERE CompanyID = ${dinoId}`);
      const dinoDepotIds = dinoDepotsRes.recordset.map(r => r.DepotID);
      
      const bermerDepotsRes = await transaction.request().query(`SELECT DepotID FROM Depots WHERE CompanyID = ${bermerId}`);
      const bermerDepotIds = bermerDepotsRes.recordset.map(r => r.DepotID);

      // Create Users
      console.log('Creating users...');
      await createUser(dinoId, adminRole, 'admin_dino', 1);
      const dinoManagers = await createUser(dinoId, managerRole, 'manager_dino', 3, dinoDepotIds);
      const dinoDrivers = await createUser(dinoId, driverRole, 'driver_dino', 10);
      
      await createUser(bermerId, adminRole, 'admin_bermer', 1);
      const bermerManagers = await createUser(bermerId, managerRole, 'manager_bermer', 2, bermerDepotIds);
      const bermerDrivers = await createUser(bermerId, driverRole, 'driver_bermer', 5);

      // 6. Create Vehicles
      const fuelTypes = ['Gasoline', 'Diesel', 'LPG', 'Electric', 'Hybrid'];
      const vehicleMakes = ['Toyota', 'Ford', 'Renault', 'Fiat', 'Volkswagen'];
      
      const createVehicles = async (companyId: number, depotIds: number[], driverIds: number[], count: number, prefix: string) => {
        const vehicleIds = [];
        for (let i = 1; i <= count; i++) {
          const plate = `${prefix} ${Math.floor(100 + Math.random() * 900)}`;
          const make = vehicleMakes[Math.floor(Math.random() * vehicleMakes.length)];
          const fuelType = fuelTypes[Math.floor(Math.random() * fuelTypes.length)];
          const depotId = depotIds[Math.floor(Math.random() * depotIds.length)];
          const driverId = driverIds[Math.floor(Math.random() * driverIds.length)];
          const vin = crypto.randomBytes(9).toString('hex').toUpperCase().slice(0, 17); // Random unique VIN

          const res = await transaction.request()
            .input('Plate', sql.NVarChar, plate)
            .input('VIN', sql.NVarChar, vin)
            .input('Make', sql.NVarChar, make)
            .input('Model', sql.NVarChar, 'Test Model')
            .input('Year', sql.Int, 2020 + Math.floor(Math.random() * 4))
            .input('FuelType', sql.NVarChar, fuelType)
            .input('Status', sql.NVarChar, 'Active')
            .input('CurrentKm', sql.Int, Math.floor(Math.random() * 100000))
            .input('CompanyID', sql.Int, companyId)
            .input('DepotID', sql.Int, depotId)
            .input('AssignedDriverID', sql.Int, driverId)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM Vehicles WHERE Plate = @Plate)
              BEGIN
                INSERT INTO Vehicles (Plate, VIN, Make, Model, Year, FuelType, Status, CurrentKm, CompanyID, DepotID, AssignedDriverID)
                OUTPUT INSERTED.VehicleID
                VALUES (@Plate, @VIN, @Make, @Model, @Year, @FuelType, @Status, @CurrentKm, @CompanyID, @DepotID, @AssignedDriverID)
              END
              ELSE
              BEGIN
                SELECT VehicleID FROM Vehicles WHERE Plate = @Plate
              END
            `);
          vehicleIds.push(res.recordset[0].VehicleID);
        }
        return vehicleIds;
      };

      console.log('Creating vehicles...');
      const dinoVehicles = await createVehicles(dinoId, dinoDepotIds, dinoDrivers, 20, '34 DN');
      const bermerVehicles = await createVehicles(bermerId, bermerDepotIds, bermerDrivers, 10, '06 BR');
      
      const allVehicles = [...dinoVehicles, ...bermerVehicles];
      const allDrivers = [...dinoDrivers, ...bermerDrivers]; // Not quite right mapping but okay for generating requests

      // 7. Create Service Requests & Records
      console.log('Creating service requests and records...');
      const statuses = ['PENDING', 'APPROVED', 'IN_PROGRESS', 'RETURNED', 'COMPLETED'];
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

      for (const vehicleId of allVehicles) {
        // Create 1-3 service requests per vehicle
        const requestCount = Math.floor(Math.random() * 3) + 1;
        
        for (let k = 0; k < requestCount; k++) {
           const status = statuses[Math.floor(Math.random() * statuses.length)];
           const priority = priorities[Math.floor(Math.random() * priorities.length)];
           const serviceCompanyId = serviceCompanyIds[Math.floor(Math.random() * serviceCompanyIds.length)];
           const driverId = allDrivers[Math.floor(Math.random() * allDrivers.length)]; // Random driver
           
           // Dates
           const requestDate = new Date();
           requestDate.setDate(requestDate.getDate() - Math.floor(Math.random() * 60)); // Last 60 days
           
           let returnDate = null;
           let actualCost = null;
           let serviceActions = null;

           if (['RETURNED', 'COMPLETED'].includes(status)) {
             returnDate = new Date(requestDate);
             returnDate.setDate(returnDate.getDate() + 2);
           }
           
           if (status === 'COMPLETED') {
             actualCost = Math.floor(Math.random() * 5000) + 500;
             serviceActions = 'Yağ değişimi, filtre kontrolü, genel bakım yapıldı.';
           }

           await transaction.request()
             .input('VehicleID', sql.Int, vehicleId)
             .input('ServiceCompanyID', sql.Int, serviceCompanyId)
             .input('Description', sql.NVarChar, 'Periyodik bakım ve kontrol')
             .input('Priority', sql.NVarChar, priority)
             .input('Status', sql.NVarChar, status)
             .input('RequestDate', sql.DateTime, requestDate)
             .input('RequestedBy', sql.Int, driverId)
             .input('ReturnDate', sql.DateTime, returnDate)
             .input('ActualCost', sql.Decimal(10,2), actualCost)
             .input('ServiceActions', sql.NVarChar, serviceActions)
             .query(`
               INSERT INTO ServiceRequests (VehicleID, ServiceCompanyID, Description, Priority, Status, RequestDate, RequestedBy, ReturnDate, ActualCost, ServiceActions)
               VALUES (@VehicleID, @ServiceCompanyID, @Description, @Priority, @Status, @RequestDate, @RequestedBy, @ReturnDate, @ActualCost, @ServiceActions)
             `);
        }

        // Create Fuel Records
          for (let f = 0; f < 5; f++) {
             const liters = Math.floor(Math.random() * 50) + 10;
             const totalCost = Math.floor(Math.random() * 2000) + 500;
             const costPerLiter = totalCost / liters;
             const driverId = allDrivers[Math.floor(Math.random() * allDrivers.length)];
             
             await transaction.request()
             .input('VehicleID', sql.Int, vehicleId)
             .input('FuelDate', sql.DateTime, new Date(Date.now() - Math.floor(Math.random() * 100000000)))
             .input('Liters', sql.Decimal(10,2), liters)
             .input('TotalCost', sql.Decimal(10,2), totalCost)
             .input('CostPerLiter', sql.Decimal(10,2), costPerLiter)
             .input('Kilometer', sql.Int, Math.floor(Math.random() * 50000))
             .input('FilledBy', sql.Int, driverId)
             .query(`
               INSERT INTO FuelRecords (VehicleID, FuelDate, Liters, TotalCost, CostPerLiter, Kilometer, FilledBy)
               VALUES (@VehicleID, @FuelDate, @Liters, @TotalCost, @CostPerLiter, @Kilometer, @FilledBy)
             `);
        }
      }

      await transaction.commit();
      console.log('🎉 Test data seeded successfully!');
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

runTestDataSeed();
