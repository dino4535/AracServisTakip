IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PasswordResetTokens]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PasswordResetTokens](
        [TokenID] [int] IDENTITY(1,1) NOT NULL,
        [UserID] [int] NOT NULL,
        [Token] [nvarchar](200) NOT NULL,
        [ExpiresAt] [datetime2](7) NOT NULL,
        [Used] [bit] NOT NULL CONSTRAINT [DF_PasswordResetTokens_Used] DEFAULT 0,
        [UsedAt] [datetime2](7) NULL,
        [CreatedAt] [datetime2](7) NOT NULL CONSTRAINT [DF_PasswordResetTokens_CreatedAt] DEFAULT GETDATE(),
        CONSTRAINT [PK_PasswordResetTokens] PRIMARY KEY CLUSTERED ([TokenID] ASC),
        CONSTRAINT [FK_PasswordResetTokens_Users] FOREIGN KEY([UserID]) REFERENCES [dbo].[Users] ([UserID]) ON DELETE CASCADE,
        CONSTRAINT [UQ_PasswordResetTokens_Token] UNIQUE([Token])
    );
END
