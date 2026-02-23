import * as XLSX from 'xlsx';
import path from 'path';
import sql from 'mssql';
import { connectDB } from '../config/database';
import { hashPassword } from '../utils/password';

const DEFAULT_PASSWORD = 'Deneme11.';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9\.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');

const run = async () => {
  const filePath = path.resolve(__dirname, '../../../driver_mapping_data (002).xlsx');
  console.log('Reading mapping from:', filePath);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
  console.log('Total rows:', rows.length);

  const pool = await connectDB();

  const companiesResult = await pool.request().query('SELECT CompanyID, Name FROM Companies');
  const companies = companiesResult.recordset;

  const depotsResult = await pool.request().query('SELECT DepotID, Name, CompanyID FROM Depots');
  const depots = depotsResult.recordset;

  const dinoCompany = companies.find(
    (c: any) => (c.Name as string).toLowerCase() === 'dino gıda',
  );
  const dinoCompanyId = dinoCompany ? (dinoCompany.CompanyID as number) : null;

  const rolesResult = await pool
    .request()
    .query("SELECT RoleID, Name FROM Roles WHERE Name IN ('Manager', 'Admin', 'Driver')");
  let managerRoleId: number | null = null;
  let adminRoleId: number | null = null;
  let driverRoleId: number | null = null;
  for (const r of rolesResult.recordset) {
    if (r.Name === 'Manager') managerRoleId = r.RoleID;
    if (r.Name === 'Admin') adminRoleId = r.RoleID;
    if (r.Name === 'Driver') driverRoleId = r.RoleID;
  }

  const userResult = await pool
    .request()
    .query('SELECT UserID, Email, Name, Surname, CompanyID FROM Users');
  const usersByEmail = new Map<string, any>();
  const usersByDisplayName = new Map<string, any>();
  for (const u of userResult.recordset) {
    const emailKey = (u.Email as string).toLowerCase();
    usersByEmail.set(emailKey, u);
    const displayKey = `${(u.Name as string).trim()} ${(u.Surname as string).trim()}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (displayKey) {
      usersByDisplayName.set(displayKey, u);
    }
  }

  const passwordHash = hashPassword(DEFAULT_PASSWORD);

  const ensureUser = async (
    displayName: string,
    role: 'Manager' | 'Admin' | 'Driver',
  ): Promise<number> => {
    const trimmedDisplayName = displayName.trim();
    const parts = trimmedDisplayName.split(/\s+/);
    const name = parts[0] || displayName;
    const surname = parts.slice(1).join(' ') || '';
    const emailLocal = slugify(trimmedDisplayName);
    const email = `${emailLocal}@dinogida.com.tr`;
    const emailKey = email.toLowerCase();

    const displayKey = `${name} ${surname}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    let user = usersByEmail.get(emailKey) || usersByDisplayName.get(displayKey);
    if (!user) {
      const insertRes = await pool
        .request()
        .input('Name', sql.NVarChar(100), name)
        .input('Surname', sql.NVarChar(100), surname)
        .input('Email', sql.NVarChar(100), email)
        .input('PasswordHash', sql.NVarChar(255), passwordHash)
        .input('CompanyID', sql.Int, dinoCompanyId || null)
        .query(`
          INSERT INTO Users (Name, Surname, Email, PasswordHash, CompanyID, IsActive)
          OUTPUT inserted.UserID
          VALUES (@Name, @Surname, @Email, @PasswordHash, @CompanyID, 1)
        `);
      const createdId = insertRes.recordset[0].UserID as number;
      user = {
        UserID: createdId,
        Email: email,
        Name: name,
        Surname: surname,
        CompanyID: dinoCompanyId || null,
      };
      usersByEmail.set(emailKey, user);
      if (displayKey) {
        usersByDisplayName.set(displayKey, user);
      }
      console.log(`Created ${role} user: ${displayName} -> ${email}`);
    } else {
      if (user.Email.toLowerCase() !== emailKey) {
        await pool
          .request()
          .input('UserID', sql.Int, user.UserID)
          .input('Email', sql.NVarChar(100), email)
          .query('UPDATE Users SET Email = @Email WHERE UserID = @UserID');
        usersByEmail.delete((user.Email as string).toLowerCase());
        user.Email = email;
        usersByEmail.set(emailKey, user);
        if (displayKey) {
          usersByDisplayName.set(displayKey, user);
        }
        console.log(`Updated ${role} email: ${displayName} -> ${email}`);
      }
      if (!user.CompanyID && dinoCompanyId) {
        await pool
          .request()
          .input('UserID', sql.Int, user.UserID)
          .input('CompanyID', sql.Int, dinoCompanyId)
          .query('UPDATE Users SET CompanyID = @CompanyID WHERE UserID = @UserID');
        user.CompanyID = dinoCompanyId;
      }
    }

    let roleId: number | null = null;
    if (role === 'Manager') roleId = managerRoleId;
    if (role === 'Admin') roleId = adminRoleId;
    if (role === 'Driver') roleId = driverRoleId;

    if (roleId) {
      const existingRole = await pool
        .request()
        .input('UserID', sql.Int, user.UserID)
        .input('RoleID', sql.Int, roleId)
        .query('SELECT 1 FROM UserRoles WHERE UserID = @UserID AND RoleID = @RoleID');

      if (existingRole.recordset.length === 0) {
        await pool
          .request()
          .input('UserID', sql.Int, user.UserID)
          .input('RoleID', sql.Int, roleId)
          .query('INSERT INTO UserRoles (UserID, RoleID) VALUES (@UserID, @RoleID)');
      }
    }

    return user.UserID as number;
  };

  let updatedVehicles = 0;

  for (const row of rows) {
    const plate = row['Plate'] as string;
    const companyName = (row['Şirket'] as string) || '';
    const depotName = (row['Depo'] as string) || '';
    const driverName = (row['Driver'] as string) || '';
    const manager1Name = (row['Manager1'] as string) || '';
    const manager2Name = (row['Manager2'] as string) || '';
    const adminName = (row['Admin'] as string) || '';

    if (!plate) continue;

    const company = companies.find(
      (c: any) => (c.Name as string).toLowerCase() === companyName.toLowerCase(),
    );
    const companyId = company ? (company.CompanyID as number) : null;

    let depotId: number | null = null;
    if (depotName && companyId) {
      const depot = depots.find(
        (d: any) =>
          (d.Name as string).toLowerCase() === depotName.toLowerCase() &&
          d.CompanyID === companyId,
      );
      if (depot) depotId = depot.DepotID as number;
    }

    let managerId: number | null = null;
    if (manager1Name) {
      managerId = await ensureUser(manager1Name, 'Manager');
    }

    if (manager2Name) {
      await ensureUser(manager2Name, 'Manager');
    }

    if (adminName) {
      await ensureUser(adminName, 'Admin');
    }

    let driverId: number | null = null;
    if (driverName) {
      driverId = await ensureUser(driverName, 'Driver');
    }

    const request = pool
      .request()
      .input('Plate', sql.NVarChar(20), plate)
      .input('CompanyID', sql.Int, companyId || null)
      .input('DepotID', sql.Int, depotId || null)
      .input('ManagerID', sql.Int, managerId || null)
      .input('AssignedDriverID', sql.Int, driverId || null);

    const result = await request.query(`
      UPDATE Vehicles
      SET 
        CompanyID = COALESCE(@CompanyID, CompanyID),
        DepotID = COALESCE(@DepotID, DepotID),
        ManagerID = COALESCE(@ManagerID, ManagerID),
        AssignedDriverID = COALESCE(@AssignedDriverID, AssignedDriverID),
        UpdatedAt = GETDATE()
      WHERE Plate = @Plate
    `);

    if (result.rowsAffected[0] > 0) {
      updatedVehicles += result.rowsAffected[0];
    } else {
      console.log('Vehicle not found for plate:', plate);
    }
  }

  console.log('Updated vehicles:', updatedVehicles);
  console.log('Done.');
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Import error:', err);
    process.exit(1);
  });
