IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RiskConfig]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[RiskConfig](
        [ConfigKey] NVARCHAR(100) NOT NULL PRIMARY KEY,
        [ConfigValue] NVARCHAR(100) NOT NULL
    );
END;

MERGE RiskConfig AS target
USING (VALUES
    ('AgeMaxPoints', '10'),
    ('KmMaxPoints', '50'),
    ('KmStepKm', '6000'),
    ('MaintenanceMaxPoints', '15'),
    ('AccidentMaxPoints', '15'),
    ('InspectionMaxPoints', '5'),
    ('InsuranceMaxPoints', '5'),
    ('YellowThreshold', '30'),
    ('RedThreshold', '60'),
    ('YearlyKmHighThreshold', '60000'),
    ('YearlyKmMaxPoints', '10'),
    ('CostPerKmHighThreshold', '3'),
    ('CostPerKmMaxPoints', '10')
) AS source(ConfigKey, ConfigValue)
ON target.ConfigKey = source.ConfigKey
WHEN NOT MATCHED THEN
    INSERT (ConfigKey, ConfigValue) VALUES (source.ConfigKey, source.ConfigValue);
