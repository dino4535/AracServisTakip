IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'LastServiceKm')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [LastServiceKm] INT NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'MaintenanceIntervalKm')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [MaintenanceIntervalKm] INT NULL;
END
GO

-- Mevcut araclar icin bakım araligini varsayilan 15000 KM olarak doldur
UPDATE [dbo].[Vehicles] SET [MaintenanceIntervalKm] = 15000 WHERE [MaintenanceIntervalKm] IS NULL;
GO

-- LastServiceKm'i mevcut bakım kayitlarindan (tarihe gore son) geri doldur
UPDATE v SET v.[LastServiceKm] = mr.Kilometer
FROM [dbo].[Vehicles] v
CROSS APPLY (
    SELECT TOP 1 Kilometer
    FROM [dbo].[MaintenanceRecords]
    WHERE VehicleID = v.VehicleID AND Kilometer IS NOT NULL AND Kilometer > 0
    ORDER BY ServiceDate DESC
) mr
WHERE v.[LastServiceKm] IS NULL;
GO
