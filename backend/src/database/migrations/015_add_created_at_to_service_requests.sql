IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequests]') AND name = 'CreatedAt')
BEGIN
    ALTER TABLE [dbo].[ServiceRequests] ADD [CreatedAt] DATETIME2 DEFAULT GETDATE();
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequests]') AND name = 'UpdatedAt')
BEGIN
    ALTER TABLE [dbo].[ServiceRequests] ADD [UpdatedAt] DATETIME2 DEFAULT GETDATE();
END
