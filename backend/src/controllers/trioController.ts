import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { trioService } from '../services/trioService';

/**
 * Trio Mobil GPS/KM entegrasyonu yönetim uçları.
 * - syncTrioKm  : CAN bus tabanlı KM senkronunu manuel tetikler.
 * - getTrioStatus: bağlantı + eşleşme durumu özeti.
 */

export const syncTrioKm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!process.env.TRIO_USERNAME || !process.env.TRIO_PASSWORD) {
      res.status(400).json({ error: 'Trio bağlantı bilgileri (.env) tanımlı değil.' });
      return;
    }

    const result = await trioService.syncAll();
    res.json({ message: 'Trio KM senkronizasyonu tamamlandı.', result });
  } catch (error) {
    console.error('Trio sync error:', error);
    res.status(500).json({ error: 'Trio senkronizasyonu sırasında bir hata oluştu.', detail: (error as Error).message });
  }
};

export const getTrioStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const configured = !!(process.env.TRIO_USERNAME && process.env.TRIO_PASSWORD);

    const pool = await connectDB();
    const linkedResult = await pool.request().query(`
      SELECT
        COUNT(*) AS TotalVehicles,
        SUM(CASE WHEN TrioVehicleId IS NOT NULL THEN 1 ELSE 0 END) AS LinkedVehicles
      FROM Vehicles
      WHERE Status != 'Deleted'
    `);

    const autoSyncResult = await pool.request()
      .input('Key', sql.NVarChar(50), 'trio_auto_sync')
      .query('SELECT SettingValue FROM SystemSettings WHERE SettingKey = @Key');

    const autoSync = autoSyncResult.recordset.length > 0
      ? autoSyncResult.recordset[0].SettingValue === 'true'
      : process.env.TRIO_AUTO_SYNC !== 'false';

    // Bağlantı testi (token alınabiliyor mu + Trio araç sayısı)
    let connected = false;
    let trioVehicleCount: number | null = null;
    let connectionError: string | null = null;
    if (configured) {
      try {
        const vehicles = await trioService.listAllVehicles();
        connected = true;
        trioVehicleCount = vehicles.length;
      } catch (err) {
        connectionError = (err as Error).message;
      }
    }

    const row = linkedResult.recordset[0] || {};
    res.json({
      configured,
      connected,
      connectionError,
      autoSync,
      trioVehicleCount,
      totalVehicles: Number(row.TotalVehicles) || 0,
      linkedVehicles: Number(row.LinkedVehicles) || 0,
    });
  } catch (error) {
    console.error('Trio status error:', error);
    res.status(500).json({ error: 'Trio durumu alınamadı.', detail: (error as Error).message });
  }
};
