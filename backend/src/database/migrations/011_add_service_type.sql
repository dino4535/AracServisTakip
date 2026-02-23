IF NOT EXISTS (
  SELECT * FROM sys.columns 
  WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequests]') 
    AND name = 'ServiceType'
)
BEGIN
  ALTER TABLE [dbo].[ServiceRequests] ADD [ServiceType] NVARCHAR(50) NULL;
END
