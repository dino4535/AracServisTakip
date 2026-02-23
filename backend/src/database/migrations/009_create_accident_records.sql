
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AccidentRecords]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AccidentRecords](
        [AccidentID] [int] IDENTITY(1,1) NOT NULL,
        [VehicleID] [int] NOT NULL,
        [DriverID] [int] NULL,
        [AccidentDate] [datetime2](7) NOT NULL,
        [ReportNumber] [nvarchar](50) NULL,
        [Description] [nvarchar](MAX) NULL,
        [Cost] [decimal](10, 2) DEFAULT 0,
        [FaultRate] [nvarchar](20) NULL, -- '0', '25', '50', '75', '100', 'TBD'
        [Status] [nvarchar](20) DEFAULT 'OPEN', -- 'OPEN', 'CLOSED', 'IN_PROCESS'
        [Location] [nvarchar](200) NULL,
        [CreatedAt] [datetime2](7) DEFAULT GETDATE(),
        [UpdatedAt] [datetime2](7) DEFAULT GETDATE(),
        PRIMARY KEY CLUSTERED ([AccidentID] ASC),
        CONSTRAINT [FK_AccidentRecords_Vehicles] FOREIGN KEY([VehicleID]) REFERENCES [dbo].[Vehicles] ([VehicleID]),
        CONSTRAINT [FK_AccidentRecords_Users] FOREIGN KEY([DriverID]) REFERENCES [dbo].[Users] ([UserID])
    )
END
