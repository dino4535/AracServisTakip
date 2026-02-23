import dotenv from 'dotenv';
import path from 'path';
import sql from 'mssql';
import { connectDB } from '../config/database';
import { sendEmail } from '../services/emailService';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const TARGET_EMAIL = process.env.EMAIL_TEST_TO || 'test@example.com';

async function sendSampleEmails() {
  console.log('Starting sample email generation...');
  
  try {
    const pool = await connectDB();
    console.log('Database connected.');

    // 1. Fetch Summary Stats
    const statsResult = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Vehicles WHERE Status = 'Active') as ActiveVehicles,
        (SELECT COUNT(*) FROM ServiceRequests WHERE Status = 'PENDING') as PendingRequests,
        (SELECT COUNT(*) FROM MaintenanceRecords WHERE NextServiceDate BETWEEN GETDATE() AND DATEADD(day, 7, GETDATE())) as UpcomingMaintenance
    `);
    const stats = statsResult.recordset[0];

    // 2. Fetch Recent Service Requests
    const requestsResult = await pool.request().query(`
      SELECT TOP 5 
        sr.RequestID,
        v.Plate,
        v.Make,
        v.Model,
        sr.Description,
        sr.RequestDate,
        u.Name + ' ' + u.Surname as Requester
      FROM ServiceRequests sr
      JOIN Vehicles v ON sr.VehicleID = v.VehicleID
      JOIN Users u ON sr.RequestedBy = u.UserID
      ORDER BY sr.RequestDate DESC
    `);
    const recentRequests = requestsResult.recordset;

    // 3. Fetch Upcoming Maintenance
    const maintenanceResult = await pool.request().query(`
      SELECT TOP 5
        v.Plate,
        v.Make,
        v.Model,
        mr.NextServiceDate,
        v.NextMaintenanceKm as NextServiceKm
      FROM MaintenanceRecords mr
      JOIN Vehicles v ON mr.VehicleID = v.VehicleID
      WHERE mr.NextServiceDate >= GETDATE()
      ORDER BY mr.NextServiceDate ASC
    `);
    const upcomingMaintenance = maintenanceResult.recordset;

    // --- Prepare Email Content ---

    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Araç Servis Takip - Günlük Özet</h2>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #2c3e50;">Genel Durum</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="padding: 5px 0;">🚗 <strong>Aktif Araç Sayısı:</strong> ${stats.ActiveVehicles}</li>
            <li style="padding: 5px 0;">⏳ <strong>Bekleyen Servis Talepleri:</strong> ${stats.PendingRequests}</li>
            <li style="padding: 5px 0;">🔧 <strong>Yaklaşan Bakımlar (7 Gün):</strong> ${stats.UpcomingMaintenance}</li>
          </ul>
        </div>
    `;

    if (recentRequests.length > 0) {
      htmlContent += `
        <h3 style="color: #2c3e50;">Son Servis Talepleri</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #3498db; color: white;">
              <th style="padding: 8px; text-align: left;">Plaka</th>
              <th style="padding: 8px; text-align: left;">Talep</th>
              <th style="padding: 8px; text-align: left;">Tarih</th>
            </tr>
          </thead>
          <tbody>
            ${recentRequests.map((req: any) => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${req.Plate}</td>
                <td style="padding: 8px;">${req.Description}</td>
                <td style="padding: 8px;">${new Date(req.RequestDate).toLocaleDateString('tr-TR')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    if (upcomingMaintenance.length > 0) {
      htmlContent += `
        <h3 style="color: #2c3e50;">Yaklaşan Bakımlar</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #e67e22; color: white;">
              <th style="padding: 8px; text-align: left;">Plaka</th>
              <th style="padding: 8px; text-align: left;">Tarih</th>
              <th style="padding: 8px; text-align: left;">KM</th>
            </tr>
          </thead>
          <tbody>
            ${upcomingMaintenance.map((m: any) => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${m.Plate}</td>
                <td style="padding: 8px;">${new Date(m.NextServiceDate).toLocaleDateString('tr-TR')}</td>
                <td style="padding: 8px;">${m.NextServiceKm}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    htmlContent += `
        <div style="margin-top: 30px; font-size: 12px; color: #7f8c8d; text-align: center;">
          <p>Bu e-posta sistem tarafından otomatik olarak oluşturulmuştur.</p>
          <p>© ${new Date().getFullYear()} Araç Servis Takip Portalı</p>
        </div>
      </div>
    `;

    // --- Send Email ---
    console.log(`Sending summary email to ${TARGET_EMAIL}...`);
    await sendEmail(
      TARGET_EMAIL,
      `Sistem Durum Raporu - ${new Date().toLocaleDateString('tr-TR')}`,
      htmlContent
    );
    console.log('Summary email sent successfully.');

  } catch (error) {
    console.error('Error in sendSampleEmails:', error);
  } finally {
    process.exit();
  }
}

sendSampleEmails();
