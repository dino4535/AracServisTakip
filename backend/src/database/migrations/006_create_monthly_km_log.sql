IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MonthlyKmLog]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[MonthlyKmLog](
	[LogID] [int] IDENTITY(1,1) NOT NULL,
	[VehicleID] [int] NOT NULL,
	[Month] [int] NOT NULL,
	[Year] [int] NOT NULL,
	[Kilometer] [int] NOT NULL,
	[CreatedBy] [int] NOT NULL,
	[CreatedAt] [datetime] DEFAULT GETDATE(),
    [UpdatedAt] [datetime] DEFAULT GETDATE(),
 CONSTRAINT [PK_MonthlyKmLog] PRIMARY KEY CLUSTERED 
(
	[LogID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]

ALTER TABLE [dbo].[MonthlyKmLog]  WITH CHECK ADD  CONSTRAINT [FK_MonthlyKmLog_Vehicles] FOREIGN KEY([VehicleID])
REFERENCES [dbo].[Vehicles] ([VehicleID])

ALTER TABLE [dbo].[MonthlyKmLog] CHECK CONSTRAINT [FK_MonthlyKmLog_Vehicles]

ALTER TABLE [dbo].[MonthlyKmLog]  WITH CHECK ADD  CONSTRAINT [FK_MonthlyKmLog_Users] FOREIGN KEY([CreatedBy])
REFERENCES [dbo].[Users] ([UserID])

ALTER TABLE [dbo].[MonthlyKmLog] CHECK CONSTRAINT [FK_MonthlyKmLog_Users]

-- Add unique constraint to prevent duplicate entries for same vehicle/month/year
ALTER TABLE [dbo].[MonthlyKmLog] ADD CONSTRAINT [UQ_Vehicle_Month_Year] UNIQUE ([VehicleID], [Month], [Year])
END
