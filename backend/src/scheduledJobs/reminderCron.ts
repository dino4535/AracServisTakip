
import cron from 'node-cron';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { createNotification } from '../services/notificationService';
import { sendEmail } from '../services/emailService';
import { logAudit } from '../services/auditService';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getJobEmailSettings = async (pool: sql.ConnectionPool) => {
  const result = await pool
    .request()
    .query(
      "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('job_inspection_reminder_emails','job_inspection_overdue_emails','job_insurance_reminder_emails')"
    );

  const map: Record<string, string> = {};
  for (const row of result.recordset as any[]) {
    map[row.SettingKey] = row.SettingValue;
  }

  return {
    inspectionReminderEmails: map['job_inspection_reminder_emails'] !== 'false',
    inspectionOverdueEmails: map['job_inspection_overdue_emails'] !== 'false',
    insuranceReminderEmails: map['job_insurance_reminder_emails'] !== 'false',
  };
};

// Helper to get admins of a company (Main company OR Secondary company assignment)
const getCompanyAdmins = async (pool: sql.ConnectionPool, companyId: number) => {
  const result = await pool.request()
    .input('CompanyID', sql.Int, companyId)
    .query(`
      SELECT DISTINCT u.UserID, u.Email, u.Name, u.Surname
      FROM Users u
      JOIN UserRoles ur ON u.UserID = ur.UserID
      JOIN Roles r ON ur.RoleID = r.RoleID
      LEFT JOIN UserCompanies uc ON u.UserID = uc.UserID
      WHERE 
        (u.CompanyID = @CompanyID OR uc.CompanyID = @CompanyID)
        AND r.Name = 'ADMIN' 
        AND u.IsActive = 1
    `);
  return result.recordset;
};

// 1. Vehicle Inspection Reminders (Muayene)
// Recipients: Driver, Manager, Company Admin
const checkInspectionReminders = async () => {
  try {
    console.log('🔍 Checking inspection reminders...');
    const pool = await connectDB();

    const emailSettings = await getJobEmailSettings(pool);
    if (!emailSettings.inspectionReminderEmails) {
      console.log('Inspection reminder emails disabled by settings. Skipping.');
      return;
    }

    const result = await pool.request().query(`
      SELECT 
        vi.InspectionID,
        vi.NextInspectionDate,
        vi.Cost,
        v.VehicleID,
        v.Plate,
        v.CompanyID,
        c.Name as CompanyName,
        v.DepotID,
        dp.Name as DepotName,
        v.AssignedDriverID as DriverID,
        v.ManagerID,
        d.Email as DriverEmail, d.Name as DriverName, d.Surname as DriverSurname,
        m.Email as ManagerEmail, m.Name as ManagerName, m.Surname as ManagerSurname
      FROM VehicleInspections vi
      JOIN Vehicles v ON vi.VehicleID = v.VehicleID
      JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots dp ON v.DepotID = dp.DepotID
      LEFT JOIN Users d ON v.AssignedDriverID = d.UserID
      LEFT JOIN Users m ON v.ManagerID = m.UserID
      WHERE vi.NextInspectionDate > GETDATE()
        AND vi.NextInspectionDate <= DATEADD(DAY, 30, GETDATE())
    `);

    const adminNotifications: Record<number, any[]> = {}; // CompanyID -> List of inspections

    for (const record of result.recordset as any[]) {
      const daysUntil = Math.ceil(
        (new Date(record.NextInspectionDate).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const dateStr = new Date(record.NextInspectionDate).toLocaleDateString('tr-TR');
      const message = `Araç ${record.Plate} için muayene tarihine ${daysUntil} gün kaldı (tarih: ${dateStr}). Yoğunluk ve ceza risklerini önlemek için en kısa sürede muayene randevusu alınması gerekmektedir.`;
      
      // Driver emails removed as per user request
      
      if (record.ManagerID) {
          await createNotification(
            record.ManagerID,
            'INSPECTION_REMINDER',
            'Muayene Hatırlatması',
            message,
            record.InspectionID
          );
          if (record.ManagerEmail) {
            const success = await sendEmail(record.ManagerEmail, 'Muayene Hatırlatması', message);
            await delay(1000); // Prevent SMTP rate limiting
            await logAudit(
              undefined,
              'JOB_INSPECTION_REMINDER_EMAIL',
              'JobEmails',
              record.InspectionID,
              {
                jobType: 'INSPECTION_REMINDER',
                recipientType: 'MANAGER',
                recipientEmail: record.ManagerEmail,
                companyId: record.CompanyID,
                plate: record.Plate,
                daysUntil,
                success
              },
              'SYSTEM_CRON'
            );
          }
      }

      if (!adminNotifications[record.CompanyID]) adminNotifications[record.CompanyID] = [];
      adminNotifications[record.CompanyID].push({ ...record, daysUntil });
    }

    // Send Bulk to Admins
    for (const [companyId, inspections] of Object.entries(adminNotifications)) {
        const admins = await getCompanyAdmins(pool, parseInt(companyId));
        if (admins.length === 0 || inspections.length === 0) continue;

        const companyName = inspections[0].CompanyName;
        const htmlTable = `
            <h3>${companyName} - Yaklaşan Muayeneler</h3>
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <tr style="background-color: #f2f2f2;">
                    <th>Plaka</th>
                    <th>Şirket</th>
                    <th>Depo</th>
                    <th>Tarih</th>
                    <th>Kalan Gün</th>
                    <th>Sürücü</th>
                    <th>Maliyet</th>
                </tr>
                ${inspections.map((i: any) => `
                    <tr>
                        <td>${i.Plate}</td>
                        <td>${i.CompanyName}</td>
                        <td>${i.DepotName || '-'}</td>
                        <td>${new Date(i.NextInspectionDate).toLocaleDateString('tr-TR')}</td>
                        <td>${i.daysUntil}</td>
                        <td>${i.DriverName ? i.DriverName + ' ' + (i.DriverSurname || '') : '-'}</td>
                        <td>${i.Cost ? i.Cost + ' TL' : '-'}</td>
                    </tr>
                `).join('')}
            </table>
        `;

        for (const admin of admins) {
            await createNotification(admin.UserID, 'BULK_INSPECTION_REMINDER', 'Haftalık Muayene Raporu', `${inspections.length} aracın muayenesi yaklaşıyor.`, undefined);
            const success = await sendEmail(admin.Email, `${companyName} - Haftalık Muayene Hatırlatmaları`, htmlTable);
            await delay(1000); // Prevent SMTP rate limiting
            await logAudit(
              undefined,
              'JOB_INSPECTION_REMINDER_EMAIL',
              'JobEmails',
              inspections[0].InspectionID,
              {
                jobType: 'INSPECTION_REMINDER_ADMIN_BULK',
                recipientType: 'ADMIN',
                recipientEmail: admin.Email,
                companyId: inspections[0].CompanyID,
                count: inspections.length,
                success
              },
              'SYSTEM_CRON'
            );
        }
    }

    console.log('✅ Inspection reminders checked successfully');
  } catch (error) {
    console.error('❌ Error checking inspection reminders:', error);
  }
};

// 1.b Vizesi Geçmiş Muayeneler
// Recipients: Araç Yöneticisi (Manager) + Şirket Adminleri (her zaman)
const checkInspectionOverdue = async () => {
  try {
    console.log('🔍 Checking overdue inspections...');
    const pool = await connectDB();

    const emailSettings = await getJobEmailSettings(pool);
    if (!emailSettings.inspectionOverdueEmails) {
      console.log('Overdue inspection emails disabled by settings. Skipping.');
      return;
    }

    const result = await pool.request().query(`
      SELECT 
        vi.InspectionID,
        vi.NextInspectionDate,
        v.VehicleID,
        v.Plate,
        v.CompanyID,
        c.Name as CompanyName,
        v.DepotID,
        dp.Name as DepotName,
        v.ManagerID,
        m.Email as ManagerEmail,
        m.Name as ManagerName,
        m.Surname as ManagerSurname
      FROM VehicleInspections vi
      JOIN Vehicles v ON vi.VehicleID = v.VehicleID
      JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots dp ON v.DepotID = dp.DepotID
      LEFT JOIN Users m ON v.ManagerID = m.UserID
      WHERE vi.NextInspectionDate < GETDATE()
    `);

    const adminOverdue: Record<number, any[]> = {};

    for (const record of result.recordset as any[]) {
      const daysOverdue = Math.ceil(
        (new Date().getTime() - new Date(record.NextInspectionDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const dateStr = new Date(record.NextInspectionDate).toLocaleDateString('tr-TR');
      const message = `Araç ${record.Plate} için muayene vize tarihi ${dateStr} itibarıyla geçmiştir. Yasal yükümlülükler ve olası ceza riskleri nedeniyle en kısa sürede muayene randevusu alınması ve işlemlerin tamamlanması gerekmektedir. (Gecikme: ${daysOverdue} gün)`;

      // Manager notification removed for overdue inspections as per user request (only Admins)

      // 2. Adminler için listeye ekle (manager olsun olmasın)
      if (!adminOverdue[record.CompanyID]) {
        adminOverdue[record.CompanyID] = [];
      }
      adminOverdue[record.CompanyID].push({ ...record, daysOverdue, dateStr });
    }

    // 3. Şirket adminlerine toplu mail
    for (const [companyId, records] of Object.entries(adminOverdue)) {
      const admins = await getCompanyAdmins(pool, parseInt(companyId, 10));
      if (admins.length === 0 || records.length === 0) continue;

      const companyName = records[0].CompanyName;
      const htmlTable = `
        <h3>${companyName} - Vizesi Geçmiş Araçlar</h3>
        <p>Aşağıda yer alan araçların muayene vize tarihleri geçmiştir. Muayene randevularının alınarak işlemlerin en kısa sürede tamamlanması gerekmektedir.</p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            <th>Plaka</th>
            <th>Şirket</th>
            <th>Depo</th>
            <th>Vize Tarihi</th>
            <th>Gecikme (Gün)</th>
            <th>Yönetici</th>
          </tr>
          ${records
            .map(
              (r: any) => `
            <tr>
              <td>${r.Plate}</td>
              <td>${r.CompanyName}</td>
              <td>${r.DepotName || '-'}</td>
              <td>${r.dateStr}</td>
              <td>${r.daysOverdue}</td>
              <td>${r.ManagerName ? r.ManagerName + ' ' + (r.ManagerSurname || '') : '-'}</td>
            </tr>
          `
            )
            .join('')}
        </table>
      `;

      for (const admin of admins) {
        await createNotification(
          admin.UserID,
          'BULK_INSPECTION_OVERDUE',
          'Vizesi Geçmiş Araçlar',
          `${records.length} aracın muayene vizesi geçmiştir.`,
          undefined
        );
        const success = await sendEmail(
          admin.Email,
          `${companyName} - Vizesi Geçmiş Araçlar - Haftalık Muayene Raporu`,
          htmlTable
        );
        await delay(1000); // Prevent SMTP rate limiting
        await logAudit(
          undefined,
          'JOB_INSPECTION_OVERDUE_EMAIL',
          'JobEmails',
          records[0].InspectionID,
          {
            jobType: 'INSPECTION_OVERDUE_ADMIN_BULK',
            recipientType: 'ADMIN',
            recipientEmail: admin.Email,
            companyId: records[0].CompanyID,
            count: records.length,
            success
          },
          'SYSTEM_CRON'
        );
      }
    }

    console.log('✅ Overdue inspections checked successfully');
  } catch (error) {
    console.error('❌ Error checking overdue inspections:', error);
  }
};

// 2. Insurance Reminders (Sigorta/Kasko)
// Recipients: Company Admin (Bulk List)
const checkInsuranceReminders = async () => {
  try {
    console.log('🔍 Checking insurance reminders...');
    const pool = await connectDB();

    const emailSettings = await getJobEmailSettings(pool);
    if (!emailSettings.insuranceReminderEmails) {
      console.log('Insurance reminder emails disabled by settings. Skipping.');
      return;
    }

    const result = await pool.request().query(`
      SELECT 
        i.InsuranceID,
        i.EndDate,
        i.Type,
        i.InsuranceCompany,
        i.Cost,
        v.VehicleID,
        v.Plate,
        v.CompanyID,
        c.Name as CompanyName,
        v.DepotID,
        dp.Name as DepotName
      FROM InsuranceRecords i
      JOIN Vehicles v ON i.VehicleID = v.VehicleID
      JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots dp ON v.DepotID = dp.DepotID
      WHERE i.EndDate > GETDATE()
        AND i.EndDate <= DATEADD(DAY, 30, GETDATE())
    `);

    const adminNotifications: Record<number, any[]> = {}; // CompanyID -> List

    for (const record of result.recordset) {
      const daysUntil = Math.ceil((new Date(record.EndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

      if (!adminNotifications[record.CompanyID]) adminNotifications[record.CompanyID] = [];
      adminNotifications[record.CompanyID].push({ ...record, daysUntil });
    }

    for (const [companyId, records] of Object.entries(adminNotifications)) {
      const admins = await getCompanyAdmins(pool, parseInt(companyId));
      if (admins.length === 0 || records.length === 0) continue;

      const companyName = records[0].CompanyName;
      const rowsHtml = records
        .map(
          (r: any, index: number) => `
            <tr style="border-bottom: 1px solid #e0e0e0; background-color: ${
              index % 2 === 0 ? '#ffffff' : '#f9fafb'
            };">
              <td style="padding: 8px 10px; font-size: 13px;">${r.Plate}</td>
              <td style="padding: 8px 10px; font-size: 13px;">${r.CompanyName}</td>
              <td style="padding: 8px 10px; font-size: 13px;">${r.DepotName || '-'}</td>
              <td style="padding: 8px 10px; font-size: 13px;">${r.Type}</td>
              <td style="padding: 8px 10px; font-size: 13px;">${r.InsuranceCompany || '-'}</td>
              <td style="padding: 8px 10px; font-size: 13px;">${new Date(r.EndDate).toLocaleDateString('tr-TR')}</td>
              <td style="padding: 8px 10px; font-size: 13px; text-align: right;">${r.daysUntil}</td>
              <td style="padding: 8px 10px; font-size: 13px; text-align: right;">${r.Cost ? r.Cost + ' TL' : '-'}</td>
            </tr>
          `
        )
        .join('');

      for (const admin of admins) {
        const fullName = [admin.Name, admin.Surname].filter(Boolean).join(' ');
        const subject = `${companyName} - Haftalık Sigorta/Kasko Hatırlatmaları`;

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 16px;">
              ${companyName} - Haftalık Sigorta/Kasko Hatırlatmaları
            </h2>
            <p>Sayın ${fullName || 'Yetkili'},</p>
            <p>Şirketinize ait aşağıdaki araçların sigorta/kasko bitiş tarihleri yaklaşmaktadır. Bitiş tarihleri öncesinde poliçe yenileme işlemlerinin tamamlanması önemlidir.</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
              <thead>
                <tr style="background-color: #f1f5f9; color: #111827;">
                  <th style="padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">Plaka</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">Şirket</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">Depo</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">Tip</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">Sigorta Şirketi</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">Bitiş Tarihi</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: right; border-bottom: 1px solid #e0e0e0;">Kalan Gün</th>
                  <th style="padding: 8px 10px; font-size: 12px; text-align: right; border-bottom: 1px solid #e0e0e0;">Maliyet</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <p style="font-size: 12px; color: #6b7280;">
              Bu liste, önümüzdeki 30 gün içerisinde bitişi olan poliçeler için oluşturulmuştur.
            </p>
            <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d; border-top: 1px solid #eceff1; padding-top: 10px; text-align: center;">
              <p>Bu e-posta sistem tarafından otomatik olarak oluşturulmuştur. Lütfen yanıtlamayınız.</p>
              <p>© ${new Date().getFullYear()} Araç Servis Takip Portalı</p>
            </div>
          </div>
        `;

        await createNotification(
          admin.UserID,
          'BULK_INSURANCE_REMINDER',
          'Haftalık Sigorta Raporu',
          `${records.length} aracın sigortası bitiyor.`,
          undefined
        );
        const success = await sendEmail(admin.Email, subject, htmlContent);
        await delay(1000); // Prevent SMTP rate limiting
        await logAudit(
          undefined,
          'JOB_INSURANCE_REMINDER_EMAIL',
          'JobEmails',
          records[0].InsuranceID,
          {
            jobType: 'INSURANCE_REMINDER_ADMIN_BULK',
            recipientType: 'ADMIN',
            recipientEmail: admin.Email,
            companyId: records[0].CompanyID,
            count: records.length,
            success
          },
          'SYSTEM_CRON'
        );
      }
    }

    console.log('✅ Insurance reminders checked successfully');
  } catch (error) {
    console.error('❌ Error checking insurance reminders:', error);
  }
};

// 3. Maintenance Reminders (Bakım)
// Recipients: Vehicle Manager (Araç Yöneticisi)
// Trigger: Estimated 7 days remaining based on daily average usage
const checkMaintenanceReminders = async () => {
  try {
    console.log('🔍 Checking maintenance reminders...');
    const pool = await connectDB();

    const query = `
      WITH AllKm AS (
          SELECT VehicleID, FuelDate as Date, Kilometer as Km FROM FuelRecords WHERE Kilometer > 0
          UNION ALL
          SELECT VehicleID, UpdateDate as Date, Kilometer as Km FROM KmUpdates WHERE Kilometer > 0
          UNION ALL
          SELECT VehicleID, ServiceDate as Date, Kilometer as Km FROM MaintenanceRecords WHERE Kilometer > 0
          UNION ALL
          SELECT VehicleID, DATEFROMPARTS(Year, Month, 1) as Date, Kilometer as Km FROM MonthlyKmLog WHERE Kilometer > 0
      ),
      KmStats AS (
          SELECT 
              VehicleID,
              -- Overall Stats
              MIN(Date) as FirstDate,
              MAX(Date) as LastDate,
              MIN(Km) as FirstKm,
              MAX(Km) as LastKm,
              -- Recent Stats (Last 90 Days)
              MIN(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Date END) as RecentFirstDate,
              MAX(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Date END) as RecentLastDate,
              MIN(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Km END) as RecentFirstKm,
              MAX(CASE WHEN Date >= DATEADD(day, -90, GETDATE()) THEN Km END) as RecentLastKm
          FROM AllKm
          GROUP BY VehicleID
      ),
      LastMaintenance AS (
          SELECT 
              VehicleID,
              MAX(ServiceDate) as LastServiceDate,
              MAX(Kilometer) as LastServiceKm
          FROM MaintenanceRecords
          GROUP BY VehicleID
      )
      SELECT 
          v.VehicleID,
          v.Plate,
          v.CurrentKm,
          v.NextMaintenanceKm,
          v.Make,
          v.Model,
          v.CompanyID,
          c.Name as CompanyName,
          v.DepotID,
          dp.Name as DepotName,
          v.ManagerID,
          m.Email as ManagerEmail,
          m.Name as ManagerName,
          m.Surname as ManagerSurname,
          ks.FirstDate,
          ks.LastDate,
          ks.FirstKm,
          ks.LastKm,
          ks.RecentFirstDate,
          ks.RecentLastDate,
          ks.RecentFirstKm,
          ks.RecentLastKm,
          DATEDIFF(day, ks.FirstDate, ks.LastDate) as DaysTracked,
          (ks.LastKm - ks.FirstKm) as KmDiff,
          DATEDIFF(day, ks.RecentFirstDate, ks.RecentLastDate) as RecentDaysTracked,
          (ks.RecentLastKm - ks.RecentFirstKm) as RecentKmDiff,
          lm.LastServiceDate,
          lm.LastServiceKm
      FROM Vehicles v
      LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
      LEFT JOIN Depots dp ON v.DepotID = dp.DepotID
      LEFT JOIN Users m ON v.ManagerID = m.UserID
      LEFT JOIN KmStats ks ON v.VehicleID = ks.VehicleID
      LEFT JOIN LastMaintenance lm ON v.VehicleID = lm.VehicleID
      WHERE v.Status = 'Active'
    `;

    const result = await pool.request().query(query);

    for (const record of result.recordset as any[]) {
      // Only send if Manager exists
      if (!record.ManagerID || !record.ManagerEmail) continue;

      let avgDailyKm = 0;
      
      // Calculate Overall Average
      let overallAvg = 0;
      if (record.DaysTracked > 0 && record.KmDiff > 0) {
        overallAvg = record.KmDiff / record.DaysTracked;
      }

      // Calculate Recent Average (Last 90 Days)
      let recentAvg = 0;
      if (record.RecentDaysTracked > 7 && record.RecentKmDiff > 0) {
        recentAvg = record.RecentKmDiff / record.RecentDaysTracked;
      }

      // Decision Logic
      if (recentAvg > 0) {
        avgDailyKm = recentAvg;
      } else {
        avgDailyKm = overallAvg;
      }

      if (avgDailyKm <= 0) continue; // Cannot predict

      // Default maintenance interval: 15,000 KM
      const MAINTENANCE_INTERVAL = 15000;
      const lastServiceKm = record.LastServiceKm || 0;
      const nextServiceKmCalculated = lastServiceKm + MAINTENANCE_INTERVAL;
      const nextServiceKm = record.NextMaintenanceKm ? record.NextMaintenanceKm : nextServiceKmCalculated;
      const remainingKm = nextServiceKm - record.CurrentKm;
      
      const estDaysRemaining = Math.ceil(remainingKm / avgDailyKm);

      // Check if within 7 days (including overdue up to a point? No, user said "7 days before")
      // We check 0 <= estDaysRemaining <= 7 to catch them when they are approaching.
      if (estDaysRemaining >= 0 && estDaysRemaining <= 7) {
        const today = new Date();
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + estDaysRemaining);
        const dateStr = targetDate.toLocaleDateString('tr-TR');

        const message = `Araç ${record.Plate} için bakıma tahmini ${estDaysRemaining} gün kaldı. (Mevcut KM: ${record.CurrentKm}, Hedef KM: ${nextServiceKm}, Tahmini Tarih: ${dateStr}). Lütfen bakım randevusu alınız.`;
        
        // Notification
        await createNotification(
            record.ManagerID,
            'MAINTENANCE_REMINDER',
            'Bakım Hatırlatması',
            message,
            record.VehicleID // Linking to VehicleID
        );

        // Email
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h3 style="color: #2c3e50;">Araç Bakım Hatırlatması</h3>
                <p>Sayın ${record.ManagerName},</p>
                <p>Yöneticisi olduğunuz <b>${record.Plate}</b> plakalı aracın periyodik bakımı yaklaşmaktadır.</p>
                <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border-color: #e0e0e0;">
                    <tr><td style="background-color: #f9fafb;"><b>Plaka</b></td><td>${record.Plate}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Şirket</b></td><td>${record.CompanyName}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Mevcut KM</b></td><td>${record.CurrentKm}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Hedef Bakım KM</b></td><td>${nextServiceKm}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Kalan KM</b></td><td>${remainingKm}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Günlük Ort. KM</b></td><td>${Math.round(avgDailyKm * 10) / 10}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Tahmini Kalan Gün</b></td><td>${estDaysRemaining}</td></tr>
                    <tr><td style="background-color: #f9fafb;"><b>Tahmini Bakım Tarihi</b></td><td>${dateStr}</td></tr>
                </table>
                <p style="margin-top: 20px;">Lütfen servis randevusu alarak bakım işlemlerini planlayınız.</p>
                <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d; border-top: 1px solid #eceff1; padding-top: 10px; text-align: center;">
                    <p>Bu e-posta sistem tarafından otomatik olarak oluşturulmuştur.</p>
                </div>
            </div>
        `;

        const success = await sendEmail(record.ManagerEmail, `Bakım Hatırlatması - ${record.Plate}`, htmlContent);
        await delay(1000); // Prevent SMTP rate limiting

        await logAudit(
            undefined,
            'JOB_MAINTENANCE_REMINDER_EMAIL',
            'JobEmails',
            record.VehicleID,
            {
                jobType: 'MAINTENANCE_REMINDER',
                recipientType: 'MANAGER',
                recipientEmail: record.ManagerEmail,
                plate: record.Plate,
                estDaysRemaining,
                success
            },
            'SYSTEM_CRON'
        );
      }
    }
    console.log('✅ Maintenance reminders checked successfully');
  } catch (error) {
    console.error('❌ Error checking maintenance reminders:', error);
  }
};

export const runRemindersManually = async () => {
  console.log('🚀 Manually triggering reminder cron job...');
  await checkInspectionReminders();
  await checkInspectionOverdue();
  await checkInsuranceReminders();
  await checkMaintenanceReminders();
  console.log('✅ Manual reminder job completed.');
};

let reminderTask: cron.ScheduledTask | null = null;

export const startReminderCron = async () => {
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input('Key', sql.NVarChar(50), 'job_reminder_schedule')
      .query('SELECT SettingValue FROM SystemSettings WHERE SettingKey = @Key');
    
    let schedule = '0 23 * * 0'; 
    let timeStr = '23:00';

    if (result.recordset.length > 0 && result.recordset[0].SettingValue) {
      timeStr = result.recordset[0].SettingValue;
      const [hour, minute] = timeStr.split(':');
      if (hour && minute) {
        schedule = `${parseInt(minute)} ${parseInt(hour)} * * 0`;
      }
    }

    console.log(`⏰ Starting weekly reminder cron job (Sundays) at ${timeStr} (${schedule})...`);
    
    if (reminderTask) {
      reminderTask.stop();
    }

    reminderTask = cron.schedule(schedule, async () => {
      console.log('⏰ Running weekly reminder cron job...');
      await checkInspectionReminders();
      await checkInspectionOverdue();
      await checkInsuranceReminders();
      await checkMaintenanceReminders();
    });
  } catch (error) {
    console.error('Failed to start reminder cron:', error);
    // Fallback to default
    reminderTask = cron.schedule('0 23 * * 0', async () => {
        await checkInspectionReminders();
        await checkInspectionOverdue();
        await checkInsuranceReminders();
        await checkMaintenanceReminders();
    });
  }
};

export const restartReminderCron = async () => {
  console.log('🔄 Restarting reminder cron job...');
  await startReminderCron();
};
