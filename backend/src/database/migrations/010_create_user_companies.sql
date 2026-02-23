
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UserCompanies]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[UserCompanies](
        [UserCompanyID] [int] IDENTITY(1,1) NOT NULL,
        [UserID] [int] NOT NULL,
        [CompanyID] [int] NOT NULL,
        [CreatedAt] [datetime2](7) DEFAULT GETDATE(),
        PRIMARY KEY CLUSTERED ([UserCompanyID] ASC),
        CONSTRAINT [FK_UserCompanies_Users] FOREIGN KEY([UserID]) REFERENCES [dbo].[Users] ([UserID]) ON DELETE CASCADE,
        CONSTRAINT [FK_UserCompanies_Companies] FOREIGN KEY([CompanyID]) REFERENCES [dbo].[Companies] ([CompanyID]) ON DELETE CASCADE,
        CONSTRAINT [UQ_UserCompanies_User_Company] UNIQUE([UserID], [CompanyID])
    )
END
