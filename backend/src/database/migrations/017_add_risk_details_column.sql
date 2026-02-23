
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'RiskDetails')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [RiskDetails] NVARCHAR(MAX) NULL;
END
