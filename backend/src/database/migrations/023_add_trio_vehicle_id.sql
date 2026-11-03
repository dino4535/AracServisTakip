IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'TrioVehicleId')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [TrioVehicleId] NVARCHAR(24) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Vehicles_TrioVehicleId' AND object_id = OBJECT_ID(N'[dbo].[Vehicles]'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [IX_Vehicles_TrioVehicleId]
        ON [dbo].[Vehicles] ([TrioVehicleId])
        WHERE [TrioVehicleId] IS NOT NULL;
END
GO
