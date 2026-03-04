
import { Request, Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { runRemindersManually, restartReminderCron, runTestReminders } from '../scheduledJobs/reminderCron';

export const getSetting = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('Key', sql.NVarChar(50), key)
      .query('SELECT SettingValue FROM SystemSettings WHERE SettingKey = @Key');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    res.json({ key, value: result.recordset[0].SettingValue });
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateSetting = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const pool = await connectDB();

    await pool.request()
      .input('Key', sql.NVarChar(50), key)
      .input('Value', sql.NVarChar(sql.MAX), String(value))
      .query(`
        IF EXISTS (SELECT 1 FROM SystemSettings WHERE SettingKey = @Key)
          UPDATE SystemSettings 
          SET SettingValue = @Value, UpdatedAt = GETDATE() 
          WHERE SettingKey = @Key
        ELSE
          INSERT INTO SystemSettings (SettingKey, SettingValue, UpdatedAt)
          VALUES (@Key, @Value, GETDATE())
      `);

    if (key === 'job_reminder_schedule') {
      restartReminderCron().catch(err => console.error('Restart cron failed:', err));
    }

    res.json({ message: 'Setting updated successfully', key, value });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAllSettings = async (req: Request, res: Response) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query('SELECT * FROM SystemSettings');
    res.json(result.recordset);
  } catch (error) {
    console.error('Get all settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const triggerReminders = async (req: Request, res: Response) => {
  try {
    runRemindersManually().catch(err => console.error('Manual trigger failed:', err));
    res.json({ message: 'Job tetiklendi, arka planda çalışıyor.' });
  } catch (error) {
    console.error('Trigger error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const testReminders = async (req: Request, res: Response) => {
  try {
    // Check if user has email
    const userEmail = (req as any).user?.Email;
    if (!userEmail) {
      return res.status(400).json({ message: 'Kullanıcının e-posta adresi bulunamadı.' });
    }

    // Run test reminders in background but await a bit or just fire and forget?
    // User wants to see it, so we should await it if it's fast enough, but sending emails takes time.
    // However, for a "Test" button, user usually expects immediate feedback.
    // Given we send max 4 emails, it might take 4-8 seconds with delays.
    // Let's fire and forget but tell user to check email.
    
    runTestReminders(userEmail).catch(err => console.error('Test trigger failed:', err));
    
    res.json({ message: `Test işlemi başlatıldı. Örnek mailler ${userEmail} adresine gönderilecektir.` });
  } catch (error) {
    console.error('Test trigger error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
