USE AracServisTakip;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VehicleInspections')
BEGIN
    CREATE TABLE VehicleInspections (
        InspectionID INT IDENTITY(1,1) PRIMARY KEY,
        VehicleID INT NOT NULL,
        InspectionDate DATETIME2 NOT NULL,
        NextInspectionDate DATETIME2 NOT NULL,
        Cost DECIMAL(10, 2) DEFAULT 0,
        Notes NVARCHAR(500),
        CreatedDate DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_VehicleInspections_Vehicles FOREIGN KEY (VehicleID) REFERENCES Vehicles(VehicleID)
    );
END
GO

-- Add permissions for inspections
IF NOT EXISTS (SELECT * FROM Permissions WHERE PermissionCode = 'inspections.view')
BEGIN
    INSERT INTO Permissions (PermissionCode, Description, Module) VALUES 
    ('inspections.view', 'Muayene kayıtlarını görüntüle', 'inspections'),
    ('inspections.add', 'Muayene kaydı ekleme', 'inspections'),
    ('inspections.edit', 'Muayene kaydı düzenleme', 'inspections'),
    ('inspections.delete', 'Muayene kaydı silme', 'inspections');
END
GO
