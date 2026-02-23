
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AuditLogs]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AuditLogs](
        [LogID] [int] IDENTITY(1,1) NOT NULL,
        [UserID] [int] NULL,
        [Action] [nvarchar](50) NOT NULL,
        [TableName] [nvarchar](50) NULL,
        [RecordID] [int] NULL,
        [Details] [nvarchar](MAX) NULL,
        [IPAddress] [nvarchar](50) NULL,
        [CreatedAt] [datetime2](7) DEFAULT GETDATE(),
        PRIMARY KEY CLUSTERED ([LogID] ASC)
    )
END

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AccidentFiles]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AccidentFiles](
        [FileID] [int] IDENTITY(1,1) NOT NULL,
        [AccidentID] [int] NOT NULL,
        [FilePath] [nvarchar](500) NOT NULL,
        [FileName] [nvarchar](255) NOT NULL,
        [FileType] [nvarchar](50) NULL,
        [UploadedBy] [int] NOT NULL,
        [CreatedAt] [datetime2](7) DEFAULT GETDATE(),
        PRIMARY KEY CLUSTERED ([FileID] ASC),
        CONSTRAINT [FK_AccidentFiles_AccidentRecords] FOREIGN KEY([AccidentID]) REFERENCES [dbo].[AccidentRecords] ([AccidentID]) ON DELETE CASCADE
    )
END
