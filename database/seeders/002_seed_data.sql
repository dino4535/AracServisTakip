-- Seed Data: Companies
USE AracServisTakip;
GO

INSERT INTO Companies (Name, TaxNumber, Address, Phone) VALUES 
('Dino Gıda', '1234567890', 'İstanbul, Türkiye', '+90 212 555 0001'),
('Bermer', '0987654321', 'Ankara, Türkiye', '+90 312 555 0002');
GO

-- Seed Data: Roles
INSERT INTO Roles (Name, Description) VALUES 
('Super Admin', 'Sistem yöneticisi - Tüm yetkilere sahip'),
('Admin', 'Şirket yöneticisi - Şirket bazlı yetkiler'),
('Manager', 'Departman yöneticisi - Departman bazlı yetkiler'),
('Driver', 'Sürücü - Araç bilgilerini görüntüleme'),
('Viewer', 'İzleyici - Sadece okuma yetkisi');
GO

-- Seed Data: Permissions
INSERT INTO Permissions (PermissionCode, Description, Module) VALUES 
-- Vehicle Permissions
('vehicles.view', 'Araçları görüntüle', 'vehicles'),
('vehicles.add', 'Araç ekleme', 'vehicles'),
('vehicles.edit', 'Araç düzenleme', 'vehicles'),
('vehicles.delete', 'Araç silme', 'vehicles'),

-- Maintenance Permissions
('maintenance.view', 'Bakım kayıtlarını görüntüle', 'maintenance'),
('maintenance.add', 'Bakım kaydı ekleme', 'maintenance'),
('maintenance.edit', 'Bakım kaydı düzenleme', 'maintenance'),
('maintenance.delete', 'Bakım kaydı silme', 'maintenance'),

-- Service Request Permissions
('service_requests.view', 'Servis taleplerini görüntüle', 'service_requests'),
('service_requests.add', 'Servis talebi oluşturma', 'service_requests'),
('service_requests.edit', 'Servis talebi düzenleme', 'service_requests'),
('service_requests.delete', 'Servis talebi silme', 'service_requests'),
('service_requests.approve', 'Servis talebini onaylama', 'service_requests'),

-- Insurance Permissions
('insurance.view', 'Sigorta kayıtlarını görüntüle', 'insurance'),
('insurance.add', 'Sigorta kaydı ekleme', 'insurance'),
('insurance.edit', 'Sigorta kaydı düzenleme', 'insurance'),
('insurance.delete', 'Sigorta kaydı silme', 'insurance'),

-- Fuel Permissions
('fuel.view', 'Yakıt kayıtlarını görüntüle', 'fuel'),
('fuel.add', 'Yakıt kaydı ekleme', 'fuel'),
('fuel.edit', 'Yakıt kaydı düzenleme', 'fuel'),
('fuel.delete', 'Yakıt kaydı silme', 'fuel'),

-- Report Permissions
('reports.view', 'Raporları görüntüle', 'reports'),
('reports.export', 'Raporları dışa aktar', 'reports'),

-- Admin Permissions
('admin.users.view', 'Kullanıcıları görüntüle', 'admin'),
('admin.users.add', 'Kullanıcı ekleme', 'admin'),
('admin.users.edit', 'Kullanıcı düzenleme', 'admin'),
('admin.users.delete', 'Kullanıcı silme', 'admin'),
('admin.roles.view', 'Rolleri görüntüle', 'admin'),
('admin.roles.add', 'Rol ekleme', 'admin'),
('admin.roles.edit', 'Rol düzenleme', 'admin'),
('admin.roles.delete', 'Rol silme', 'admin'),
('admin.roles.permissions', 'Rol yetkilerini yönet', 'admin'),
('admin.settings', 'Sistem ayarları', 'admin');
GO

-- Seed Data: Default Admin User (Password: Admin123)
DECLARE @Salt NVARCHAR(100) = 'salt123';
DECLARE @Password NVARCHAR(100) = 'Admin123' + @Salt;
DECLARE @PasswordHash NVARCHAR(255) = CONVERT(NVARCHAR(255), HASHBYTES('SHA2_256', @Password), 2);

INSERT INTO Users (CompanyID, Email, PasswordHash, Name, Surname) VALUES 
(1, 'admin@dino.com', @PasswordHash, 'Admin', 'User');
GO

-- Assign Super Admin Role to Admin User
DECLARE @AdminUserID INT = (SELECT TOP 1 UserID FROM Users WHERE Email = 'admin@dino.com');
DECLARE @SuperAdminRoleID INT = (SELECT RoleID FROM Roles WHERE Name = 'Super Admin');

INSERT INTO UserRoles (UserID, RoleID) VALUES (@AdminUserID, @SuperAdminRoleID);
GO

-- Assign All Permissions to Super Admin Role
INSERT INTO RolePermissions (RoleID, PermissionID)
SELECT @SuperAdminRoleID, PermissionID FROM Permissions;
GO
