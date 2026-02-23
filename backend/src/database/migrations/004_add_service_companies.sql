
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ServiceCompanies]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ServiceCompanies](
        [ServiceCompanyID] [int] IDENTITY(1,1) NOT NULL,
        [Name] [nvarchar](100) NOT NULL,
        [Address] [nvarchar](255) NULL,
        [Phone] [nvarchar](20) NULL,
        [Email] [nvarchar](100) NULL,
        [ContactPerson] [nvarchar](100) NULL,
        [IsActive] [bit] DEFAULT 1,
        [CreatedAt] [datetime2](7) DEFAULT GETDATE(),
        PRIMARY KEY CLUSTERED ([ServiceCompanyID] ASC)
    )
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequests]') AND name = 'ServiceCompanyID')
BEGIN
    ALTER TABLE [dbo].[ServiceRequests] ADD [ServiceCompanyID] [int] NULL;
    ALTER TABLE [dbo].[ServiceRequests] ADD CONSTRAINT [FK_ServiceRequests_ServiceCompanies] FOREIGN KEY([ServiceCompanyID]) REFERENCES [dbo].[ServiceCompanies] ([ServiceCompanyID]);
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequests]') AND name = 'ReturnDate')
BEGIN
    ALTER TABLE [dbo].[ServiceRequests] ADD [ReturnDate] [datetime2](7) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequests]') AND name = 'ServiceActions')
BEGIN
    ALTER TABLE [dbo].[ServiceRequests] ADD [ServiceActions] [nvarchar](MAX) NULL;
END
