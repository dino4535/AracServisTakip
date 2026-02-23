IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'RiskScore')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [RiskScore] FLOAT DEFAULT 0;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'RiskCategory')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [RiskCategory] NVARCHAR(20) DEFAULT 'Green';
END
