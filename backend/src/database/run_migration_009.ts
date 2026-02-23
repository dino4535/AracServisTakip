
import { connectDB } from '../config/database';
import fs from 'fs';
import path from 'path';

const runMigration = async () => {
  try {
    const pool = await connectDB();
    const migrationFile = path.join(__dirname, 'migrations', '009_create_accident_records.sql');
    const migrationScript = fs.readFileSync(migrationFile, 'utf-8');

    console.log('Running migration: 009_create_accident_records.sql');
    await pool.request().query(migrationScript);
    console.log('Migration completed successfully.');
    
    // Also insert permissions if they don't exist
    // This is a quick fix to ensure permissions exist without a separate migration for data
    const permissionScript = `
      IF NOT EXISTS (SELECT * FROM Permissions WHERE PermissionCode = 'ACCIDENTS.VIEW')
        INSERT INTO Permissions (PermissionCode, Description, Module) VALUES ('ACCIDENTS.VIEW', 'View accident records', 'ACCIDENTS');
      
      IF NOT EXISTS (SELECT * FROM Permissions WHERE PermissionCode = 'ACCIDENTS.ADD')
        INSERT INTO Permissions (PermissionCode, Description, Module) VALUES ('ACCIDENTS.ADD', 'Add accident records', 'ACCIDENTS');
        
      IF NOT EXISTS (SELECT * FROM Permissions WHERE PermissionCode = 'ACCIDENTS.EDIT')
        INSERT INTO Permissions (PermissionCode, Description, Module) VALUES ('ACCIDENTS.EDIT', 'Edit accident records', 'ACCIDENTS');
        
      IF NOT EXISTS (SELECT * FROM Permissions WHERE PermissionCode = 'ACCIDENTS.DELETE')
        INSERT INTO Permissions (PermissionCode, Description, Module) VALUES ('ACCIDENTS.DELETE', 'Delete accident records', 'ACCIDENTS');

      -- Give permissions to Admin (RoleID 1) and Super Admin (usually 1 or handled via check)
      -- Assuming Admin is 1. Let's find out roles first or just insert for all admins.
      
      DECLARE @AdminRoleID INT = (SELECT RoleID FROM Roles WHERE Name = 'Admin');
      DECLARE @SuperAdminRoleID INT = (SELECT RoleID FROM Roles WHERE Name = 'Super Admin');

      IF @AdminRoleID IS NOT NULL
      BEGIN
        INSERT INTO RolePermissions (RoleID, PermissionID)
        SELECT @AdminRoleID, PermissionID FROM Permissions WHERE Module = 'ACCIDENTS'
        AND PermissionID NOT IN (SELECT PermissionID FROM RolePermissions WHERE RoleID = @AdminRoleID);
      END

      IF @SuperAdminRoleID IS NOT NULL
      BEGIN
        INSERT INTO RolePermissions (RoleID, PermissionID)
        SELECT @SuperAdminRoleID, PermissionID FROM Permissions WHERE Module = 'ACCIDENTS'
        AND PermissionID NOT IN (SELECT PermissionID FROM RolePermissions WHERE RoleID = @SuperAdminRoleID);
      END
    `;
    
    console.log('Adding permissions...');
    await pool.request().query(permissionScript);
    console.log('Permissions added successfully.');

    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigration();
