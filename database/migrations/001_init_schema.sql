-- Araç Servis Takip Portalı - MSSQL Database Schema
-- Created for Dino Gıda & Bermer

-- 1. Şirketler (Dino Gıda & Bermer)
CREATE TABLE Companies (
    CompanyID INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(100) NOT NULL UNIQUE,
    TaxNumber NVARCHAR(20),
    Address NVARCHAR(255),
    Phone NVARCHAR(20),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 2. Kullanıcılar
CREATE TABLE Users (
    UserID INT PRIMARY KEY IDENTITY(1,1),
    CompanyID INT FOREIGN KEY REFERENCES Companies(CompanyID),
    Email NVARCHAR(100) UNIQUE NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Surname NVARCHAR(100) NOT NULL,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 3. Roller (Esnek rol sistemi)
CREATE TABLE Roles (
    RoleID INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(50) UNIQUE NOT NULL,
    Description NVARCHAR(255),
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 4. Kullanıcı-Rol İlişkisi
CREATE TABLE UserRoles (
    UserRoleID INT PRIMARY KEY IDENTITY(1,1),
    UserID INT FOREIGN KEY REFERENCES Users(UserID),
    RoleID INT FOREIGN KEY REFERENCES Roles(RoleID),
    AssignedAt DATETIME2 DEFAULT GETDATE(),
    UNIQUE(UserID, RoleID)
);
GO

-- 5. Yetkiler (Permission codes)
CREATE TABLE Permissions (
    PermissionID INT PRIMARY KEY IDENTITY(1,1),
    PermissionCode NVARCHAR(50) UNIQUE NOT NULL,
    Description NVARCHAR(255),
    Module NVARCHAR(50)
);
GO

-- 6. Rol-Yetki İlişkisi
CREATE TABLE RolePermissions (
    RolePermissionID INT PRIMARY KEY IDENTITY(1,1),
    RoleID INT FOREIGN KEY REFERENCES Roles(RoleID),
    PermissionID INT FOREIGN KEY REFERENCES Permissions(PermissionID),
    UNIQUE(RoleID, PermissionID)
);
GO

-- 7. Araçlar
CREATE TABLE Vehicles (
    VehicleID INT PRIMARY KEY IDENTITY(1,1),
    CompanyID INT FOREIGN KEY REFERENCES Companies(CompanyID),
    Plate NVARCHAR(20) UNIQUE NOT NULL,
    VIN NVARCHAR(17) UNIQUE,
    Make NVARCHAR(50),
    Model NVARCHAR(50),
    Year INT,
    FuelType NVARCHAR(30),
    CurrentKm INT DEFAULT 0,
    Status NVARCHAR(20),
    AssignedDriverID INT FOREIGN KEY REFERENCES Users(UserID),
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 8. Bakım Kayıtları
CREATE TABLE MaintenanceRecords (
    MaintenanceID INT PRIMARY KEY IDENTITY(1,1),
    VehicleID INT FOREIGN KEY REFERENCES Vehicles(VehicleID),
    Type NVARCHAR(50),
    Description NVARCHAR(500),
    Kilometer INT,
    Cost DECIMAL(10,2),
    ServiceDate DATETIME2,
    NextServiceDate DATETIME2,
    CreatedBy INT FOREIGN KEY REFERENCES Users(UserID),
    CreatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 9. Sigorta Kayıtları
CREATE TABLE InsuranceRecords (
    InsuranceID INT PRIMARY KEY IDENTITY(1,1),
    VehicleID INT FOREIGN KEY REFERENCES Vehicles(VehicleID),
    Type NVARCHAR(30),
    PolicyNumber NVARCHAR(50),
    InsuranceCompany NVARCHAR(100),
    StartDate DATETIME2,
    EndDate DATETIME2,
    Cost DECIMAL(10,2),
    Notes NVARCHAR(500),
    CreatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 10. Yakıt Kayıtları
CREATE TABLE FuelRecords (
    FuelRecordID INT PRIMARY KEY IDENTITY(1,1),
    VehicleID INT FOREIGN KEY REFERENCES Vehicles(VehicleID),
    Kilometer INT,
    Liters DECIMAL(10,2),
    CostPerLiter DECIMAL(10,2),
    TotalCost DECIMAL(10,2),
    FuelStation NVARCHAR(100),
    FilledBy INT FOREIGN KEY REFERENCES Users(UserID),
    FuelDate DATETIME2 DEFAULT GETDATE()
);
GO

-- 11. KM Güncellemeleri
CREATE TABLE KmUpdates (
    KmUpdateID INT PRIMARY KEY IDENTITY(1,1),
    VehicleID INT FOREIGN KEY REFERENCES Vehicles(VehicleID),
    Kilometer INT NOT NULL,
    UpdatedBy INT FOREIGN KEY REFERENCES Users(UserID),
    UpdateDate DATETIME2 DEFAULT GETDATE()
);
GO

-- 12. Servis Talep Formları
CREATE TABLE ServiceRequests (
    RequestID INT PRIMARY KEY IDENTITY(1,1),
    VehicleID INT FOREIGN KEY REFERENCES Vehicles(VehicleID),
    RequestedBy INT FOREIGN KEY REFERENCES Users(UserID),
    Description NVARCHAR(500),
    Priority NVARCHAR(20),
    Status NVARCHAR(20),
    AssignedTo INT FOREIGN KEY REFERENCES Users(UserID),
    EstimatedCost DECIMAL(10,2),
    ActualCost DECIMAL(10,2),
    RequestDate DATETIME2 DEFAULT GETDATE(),
    CompletedDate DATETIME2
);
GO

-- 13. Bildirimler
CREATE TABLE Notifications (
    NotificationID INT PRIMARY KEY IDENTITY(1,1),
    UserID INT FOREIGN KEY REFERENCES Users(UserID),
    Type NVARCHAR(50),
    Title NVARCHAR(200),
    Message NVARCHAR(500),
    RelatedID INT,
    IsRead BIT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- 14. Hatırlatıcı Ayarları
CREATE TABLE ReminderSettings (
    SettingID INT PRIMARY KEY IDENTITY(1,1),
    VehicleID INT FOREIGN KEY REFERENCES Vehicles(VehicleID),
    ReminderType NVARCHAR(50),
    ReminderDays INT,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE()
);
GO
