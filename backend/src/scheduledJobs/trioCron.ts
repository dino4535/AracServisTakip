import cron from 'node-cron';
import { connectDB } from '../config/database';
import { trioService } from '../services/trioService';
import sql from 'mssql';

/**
 * Trio Mobil GPS senkronizasyonu.
 * Her gün 23:55 (Europe/Istanbul) araçların güncel KM değerlerini Trio API'den çekip DB'ye yazar.
 * Aç/kapa: SystemSettings.trio_auto_sync (yoksa TRIO_AUTO_SYNC env, varsayılan: açık)
 */
export const initTrioCron = () => {
  cron.schedule('55 23 * * *', async () => {
    console.log('Running Trio KM Auto Sync Job...');

    try {
      const pool = await connectDB();

      // SystemSettings üzerinden override var mı?
      let enabled = process.env.TRIO_AUTO_SYNC !== 'false'; // varsayılan açık
      try {
        const settingResult = await pool.request()
          .input('Key', sql.NVarChar(50), 'trio_auto_sync')
          .query('SELECT SettingValue FROM SystemSettings WHERE SettingKey = @Key');

        if (settingResult.recordset.length > 0) {
          enabled = settingResult.recordset[0].SettingValue === 'true';
        }
      } catch {
        // SystemSettings tablosu yoksa env değerine güven
      }

      if (!enabled) {
        console.log('Trio Auto Sync is disabled. Skipping.');
        return;
      }

      const result = await trioService.syncAll();
      console.log('Trio KM Auto Sync completed:', result);
    } catch (error) {
      console.error('Trio KM Auto Sync failed:', error);
    }
  }, {
    timezone: 'Europe/Istanbul',
  });
};
