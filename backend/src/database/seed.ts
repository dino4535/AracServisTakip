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

const runSeed = async () => {
  try {
    console.log('🔄 Connecting to database...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to database');

    try {
      const companies = [
        { Name: 'Dino Gıda', TaxNumber: '1234567890', Address: 'İstanbul, Türkiye', Phone: '+90 212 555 0001' },
        { Name: 'Bermer', TaxNumber: '0987654321', Address: 'Ankara, Türkiye', Phone: '+90 312 555 0002' }
      ];

      console.log('🔄 Seeding Companies...');
      const companyResult = await pool.request()
        .input('Name', sql.NVarChar, companies[0].Name)
        .input('TaxNumber', sql.NVarChar, companies[0].TaxNumber)
        .input('Address', sql.NVarChar, companies[0].Address)
        .input('Phone', sql.NVarChar, companies[0].Phone)
        .query(`
          INSERT INTO Companies (Name, TaxNumber, Address, Phone)
          OUTPUT INSERTED.CompanyID
          VALUES (@Name, @TaxNumber, @Address, @Phone)
        `);
      const dinoCompanyId = companyResult.recordset[0].CompanyID;

      const roles = [
        { Name: 'Super Admin', Description: 'Sistem yöneticisi - Tüm yetkilere sahip' },
        { Name: 'Admin', Description: 'Şirket yöneticisi - Şirket bazlı yetkiler' },
        { Name: 'Manager', Description: 'Departman yöneticisi - Departman bazlı yetkiler' },
        { Name: 'Driver', Description: 'Sürücü - Araç bilgilerini görüntüleme' },
        { Name: 'Viewer', Description: 'İzleyici - Sadece okuma yetkisi' }
      ];

      console.log('🔄 Seeding Roles...');
      const superAdminResult = await pool.request()
        .input('Name', sql.NVarChar, roles[0].Name)
        .input('Description', sql.NVarChar, roles[0].Description)
        .query(`
          INSERT INTO Roles (Name, Description)
          OUTPUT INSERTED.RoleID
          VALUES (@Name, @Description)
        `);
      const superAdminRoleId = superAdminResult.recordset[0].RoleID;

      for (let i = 1; i < roles.length; i++) {
        await pool.request()
          .input('Name', sql.NVarChar, roles[i].Name)
          .input('Description', sql.NVarChar, roles[i].Description)
          .query(`
            INSERT INTO Roles (Name, Description)
            VALUES (@Name, @Description)
          `);
      }

      const permissions = [
        { Code: 'vehicles.view', Description: 'Araçları görüntüle', Module: 'vehicles' },
        { Code: 'vehicles.add', Description: 'Araç ekleme', Module: 'vehicles' },
        { Code: 'vehicles.edit', Description: 'Araç düzenleme', Module: 'vehicles' },
        { Code: 'vehicles.delete', Description: 'Araç silme', Module: 'vehicles' },
        { Code: 'maintenance.view', Description: 'Bakım kayıtlarını görüntüle', Module: 'maintenance' },
        { Code: 'maintenance.add', Description: 'Bakım kaydı ekleme', Module: 'maintenance' },
        { Code: 'maintenance.edit', Description: 'Bakım kaydı düzenleme', Module: 'maintenance' },
        { Code: 'maintenance.delete', Description: 'Bakım kaydı silme', Module: 'maintenance' },
        { Code: 'service_requests.view', Description: 'Servis taleplerini görüntüle', Module: 'service_requests' },
        { Code: 'service_requests.add', Description: 'Servis talebi oluşturma', Module: 'service_requests' },
        { Code: 'service_requests.edit', Description: 'Servis talebi düzenleme', Module: 'service_requests' },
        { Code: 'service_requests.delete', Description: 'Servis talebi silme', Module: 'service_requests' },
        { Code: 'service_requests.approve', Description: 'Servis talebini onaylama', Module: 'service_requests' },
        { Code: 'insurance.view', Description: 'Sigorta kayıtlarını görüntüle', Module: 'insurance' },
        { Code: 'insurance.add', Description: 'Sigorta kaydı ekleme', Module: 'insurance' },
        { Code: 'insurance.edit', Description: 'Sigorta kaydı düzenleme', Module: 'insurance' },
        { Code: 'insurance.delete', Description: 'Sigorta kaydı silme', Module: 'insurance' },
        { Code: 'fuel.view', Description: 'Yakıt kayıtlarını görüntüle', Module: 'fuel' },
        { Code: 'fuel.add', Description: 'Yakıt kaydı ekleme', Module: 'fuel' },
        { Code: 'fuel.edit', Description: 'Yakıt kaydı düzenleme', Module: 'fuel' },
        { Code: 'fuel.delete', Description: 'Yakıt kaydı silme', Module: 'fuel' },
        { Code: 'reports.view', Description: 'Raporları görüntüle', Module: 'reports' },
        { Code: 'reports.export', Description: 'Raporları dışa aktar', Module: 'reports' },
        { Code: 'admin.users.view', Description: 'Kullanıcıları görüntüle', Module: 'admin' },
        { Code: 'admin.users.add', Description: 'Kullanıcı ekleme', Module: 'admin' },
        { Code: 'admin.users.edit', Description: 'Kullanıcı düzenleme', Module: 'admin' },
        { Code: 'admin.users.delete', Description: 'Kullanıcı silme', Module: 'admin' },
        { Code: 'admin.roles.view', Description: 'Rolleri görüntüle', Module: 'admin' },
        { Code: 'admin.roles.add', Description: 'Rol ekleme', Module: 'admin' },
        { Code: 'admin.roles.edit', Description: 'Rol düzenleme', Module: 'admin' },
        { Code: 'admin.roles.delete', Description: 'Rol silme', Module: 'admin' },
        { Code: 'admin.roles.permissions', Description: 'Rol yetkilerini yönet', Module: 'admin' },
        { Code: 'admin.settings', Description: 'Sistem ayarları', Module: 'admin' },
      ];

      console.log('🔄 Seeding Permissions...');
      for (const perm of permissions) {
        await pool.request()
          .input('Code', sql.NVarChar, perm.Code)
          .input('Description', sql.NVarChar, perm.Description)
          .input('Module', sql.NVarChar, perm.Module)
          .query(`
            INSERT INTO Permissions (PermissionCode, Description, Module)
            VALUES (@Code, @Description, @Module)
          `);
      }

      console.log('🔄 Seeding Admin User...');
      const hashedPassword = hashPassword('Admin123');
      const adminResult = await pool.request()
        .input('CompanyID', sql.Int, dinoCompanyId)
        .input('Email', sql.NVarChar, 'admin@dino.com')
        .input('PasswordHash', sql.NVarChar, hashedPassword)
        .input('Name', sql.NVarChar, 'Admin')
        .input('Surname', sql.NVarChar, 'User')
        .query(`
          INSERT INTO Users (CompanyID, Email, PasswordHash, Name, Surname)
          OUTPUT INSERTED.UserID
          VALUES (@CompanyID, @Email, @PasswordHash, @Name, @Surname)
        `);
      const adminUserId = adminResult.recordset[0].UserID;

      console.log('🔄 Assigning roles to admin user...');
      await pool.request()
        .input('UserID', sql.Int, adminUserId)
        .input('RoleID', sql.Int, superAdminRoleId)
        .query(`
          INSERT INTO UserRoles (UserID, RoleID)
          VALUES (@UserID, @RoleID)
        `);

      console.log('🔄 Assigning all permissions to Super Admin role...');
      await pool.request()
        .input('RoleID', sql.Int, superAdminRoleId)
        .query(`
          INSERT INTO RolePermissions (RoleID, PermissionID)
          SELECT @RoleID, PermissionID FROM Permissions
        `);

      console.log('\n🎉 All seed data inserted successfully!');
      console.log('📧 Admin Email: admin@dino.com');
      console.log('🔑 Admin Password: Admin123');

      await pool.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Seed error:', err);
      throw err;
    }
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

runSeed();