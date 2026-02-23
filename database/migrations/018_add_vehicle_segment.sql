IF NOT EXISTS (
  SELECT * FROM sys.columns 
  WHERE object_id = OBJECT_ID(N'[dbo].[Vehicles]') 
    AND name = 'Segment'
)
BEGIN
  ALTER TABLE [dbo].[Vehicles] ADD [Segment] NVARCHAR(50) NULL;
END

