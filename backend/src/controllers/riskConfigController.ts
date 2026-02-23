import { Request, Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';

export const getAllRiskConfig = async (req: Request, res: Response) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query('SELECT ConfigKey, ConfigValue FROM RiskConfig ORDER BY ConfigKey');
    res.json(result.recordset);
  } catch (error) {
    console.error('Get all risk config error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateRiskConfig = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const pool = await connectDB();

    await pool.request()
      .input('Key', sql.NVarChar(100), key)
      .input('Value', sql.NVarChar(100), String(value))
      .query(`
        MERGE RiskConfig AS target
        USING (SELECT @Key AS ConfigKey, @Value AS ConfigValue) AS source
        ON target.ConfigKey = source.ConfigKey
        WHEN MATCHED THEN
          UPDATE SET ConfigValue = source.ConfigValue
        WHEN NOT MATCHED THEN
          INSERT (ConfigKey, ConfigValue) VALUES (source.ConfigKey, source.ConfigValue);
      `);

    res.json({ message: 'Risk config updated successfully', key, value });
  } catch (error) {
    console.error('Update risk config error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

