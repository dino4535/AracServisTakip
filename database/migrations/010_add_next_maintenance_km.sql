IF NOT EXISTS (
  SELECT * FROM sys.columns 
  WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') 
    AND name = 'NextMaintenanceKm'
)
BEGIN
  ALTER TABLE [dbo].[Vehicles] ADD [NextMaintenanceKm] INT NULL;
END

