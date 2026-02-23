
-- Add ManagerID to Users table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND name = 'ManagerID')
BEGIN
    ALTER TABLE [dbo].[Users] ADD [ManagerID] INT NULL;
    ALTER TABLE [dbo].[Users] ADD CONSTRAINT [FK_Users_Manager] FOREIGN KEY ([ManagerID]) REFERENCES [dbo].[Users]([UserID]);
END

-- Add ManagerID to Vehicles table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') AND name = 'ManagerID')
BEGIN
    ALTER TABLE [dbo].[Vehicles] ADD [ManagerID] INT NULL;
    ALTER TABLE [dbo].[Vehicles] ADD CONSTRAINT [FK_Vehicles_Manager] FOREIGN KEY ([ManagerID]) REFERENCES [dbo].[Users]([UserID]);
END
