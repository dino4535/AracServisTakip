import { connectDB } from '../config/database';
import sql from 'mssql';

type SegmentType = 'Passenger' | 'LightCommercial' | 'HeavyCommercial' | 'Minibus' | 'Other';

const detectSegment = (make: string | null, model: string | null): SegmentType => {
  const raw = `${make || ''} ${model || ''}`.toLowerCase();

  if (!model || String(model).trim() === '') {
    return 'LightCommercial';
  }

  if (
    raw.includes('truck') ||
    raw.includes('kamyon') ||
    raw.includes('çekici') ||
    raw.includes('tir') ||
    raw.includes('tır') ||
    raw.includes('actros') ||
    raw.includes('axor') ||
    raw.includes('atego') ||
    raw.includes('stralis') ||
    raw.includes('fh ') ||
    raw.includes('fm ') ||
    raw.includes('xf ') ||
    raw.includes('tgx') ||
    raw.includes('tgs') ||
    raw.includes('npr') ||
    raw.includes('nqr')
  ) {
    return 'HeavyCommercial';
  }

  if (
    raw.includes('minibüs') ||
    raw.includes('minibus') ||
    raw.includes('midibüs') ||
    raw.includes('sprinter') ||
    raw.includes('crafter') ||
    raw.includes('daily') ||
    raw.includes('tourneo') ||
    raw.includes('vito tourer') ||
    raw.includes('trafic') ||
    raw.includes('master')
  ) {
    return 'Minibus';
  }

  if (
    raw.includes('doblo') ||
    raw.includes('fiorino') ||
    raw.includes('combo') ||
    raw.includes('partner') ||
    raw.includes('berlingo') ||
    raw.includes('jumpy') ||
    raw.includes('boxer') ||
    raw.includes('jumper') ||
    raw.includes('transit') ||
    raw.includes('connect') ||
    raw.includes('courier') ||
    raw.includes('caddy') ||
    raw.includes('vito') ||
    raw.includes('transporter') ||
    raw.includes('kangoo') ||
    raw.includes('nemo')
  ) {
    return 'LightCommercial';
  }

  return 'Passenger';
};

const run = async () => {
  try {
    const pool = await connectDB();

    const result = await pool.request().query(`
      SELECT VehicleID, Make, Model, Segment 
      FROM Vehicles
      WHERE Segment IS NULL OR Segment = ''
    `);

    const vehicles = result.recordset as { VehicleID: number; Make: string | null; Model: string | null; Segment: string | null }[];

    let updatedCount = 0;

    for (const v of vehicles) {
      const segment = detectSegment(v.Make, v.Model);

      await pool.request()
        .input('VehicleID', sql.Int, v.VehicleID)
        .input('Segment', sql.NVarChar(50), segment)
        .query(`
          UPDATE Vehicles
          SET Segment = @Segment, UpdatedAt = GETDATE()
          WHERE VehicleID = @VehicleID
        `);

      updatedCount++;
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          totalVehicles: vehicles.length,
          updated: updatedCount
        },
        null,
        2
      )
    );

    process.exit(0);
  } catch (error) {
    console.error('Auto-assign vehicle segments error:', error);
    process.exit(1);
  }
};

run();
