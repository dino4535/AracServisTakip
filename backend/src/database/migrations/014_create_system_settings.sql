
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
BEGIN
    CREATE TABLE SystemSettings (
        SettingKey NVARCHAR(50) PRIMARY KEY,
        SettingValue NVARCHAR(MAX),
        Description NVARCHAR(255),
        UpdatedAt DATETIME DEFAULT GETDATE()
    );

    -- Insert default Opet settings
    INSERT INTO SystemSettings (SettingKey, SettingValue, Description)
    VALUES ('opet_auto_sync', 'false', 'Opet otomatik veri çekme modu (true/false)');
END
