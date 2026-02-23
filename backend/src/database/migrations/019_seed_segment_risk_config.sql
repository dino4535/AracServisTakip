MERGE RiskConfig AS target
USING (VALUES
    ('KmMaxPoints_Passenger', '50'),
    ('KmStepKm_Passenger', '5000'),
    ('KmMaxPoints_LightCommercial', '50'),
    ('KmStepKm_LightCommercial', '6000'),
    ('KmMaxPoints_HeavyCommercial', '50'),
    ('KmStepKm_HeavyCommercial', '10000'),
    ('KmMaxPoints_Minibus', '50'),
    ('KmStepKm_Minibus', '7000'),
    ('KmMaxPoints_Other', '50'),
    ('KmStepKm_Other', '6000')
) AS source(ConfigKey, ConfigValue)
ON target.ConfigKey = source.ConfigKey
WHEN NOT MATCHED THEN
    INSERT (ConfigKey, ConfigValue) VALUES (source.ConfigKey, source.ConfigValue);

