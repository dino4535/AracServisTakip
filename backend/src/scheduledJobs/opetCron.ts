
import cron from 'node-cron';
import { connectDB } from '../config/database';
import { opetService } from '../services/opetService';
import sql from 'mssql';

export const initOpetCron = () => {
  // Schedule: Every day at 23:55 Europe/Istanbul time
  cron.schedule('55 23 * * *', async () => {
    console.log('Running Opet Auto Sync Job...');
    
    try {
      const pool = await connectDB();
      
      // Check if auto sync is enabled
      const settingResult = await pool.request()
        .input('Key', sql.NVarChar(50), 'opet_auto_sync')
        .query('SELECT SettingValue FROM SystemSettings WHERE SettingKey = @Key');
      
      const isEnabled = settingResult.recordset.length > 0 && settingResult.recordset[0].SettingValue === 'true';
      
      if (!isEnabled) {
        console.log('Opet Auto Sync is disabled. Skipping.');
        return;
      }

      // Define today's range (start of day to end of day)
      const now = new Date();
      const startDate = new Date(now.setHours(0, 0, 0, 0));
      const endDate = new Date(now.setHours(23, 59, 59, 999));

      console.log(`Syncing Opet data for date: ${startDate.toLocaleDateString()}`);
      
      const results = await opetService.syncAllCompanies(startDate, endDate);
      
      console.log('Opet Auto Sync completed:', results);

    } catch (error) {
      console.error('Opet Auto Sync failed:', error);
    }
  }, {
    timezone: "Europe/Istanbul"
  });
};
