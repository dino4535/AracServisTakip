import '../config/database';
import { sendEmail } from '../services/emailService';

const TARGET_EMAIL = process.env.EMAIL_TEST_TO || 'test@example.com';

async function sendAdminNotificationSample() {
  console.log('Sending sample Admin Notification email...');
  
  try {
    // Dummy Data mimicking a real request
    const vehiclePlate = '34 ABC 123';
    const requesterName = 'Ahmet Yılmaz';
    const serviceType = 'Periyodik Bakım';
    const priority = 'HIGH';
    const description = 'Araç 15.000 bakımı geldi, fren balatalarından ses geliyor.';
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Yeni Servis Talebi</h2>
        <p>Sayın Yönetici,</p>
        <p>Aşağıdaki araç için yeni bir servis talebi oluşturulmuştur ve onayınızı beklemektedir.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Plaka</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${vehiclePlate}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Eden</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${requesterName}</td>
          </tr>
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tipi</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${serviceType}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Öncelik</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${priority}</td>
          </tr>
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Açıklama</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${description}</td>
          </tr>
        </table>
        
        <p>Talebi incelemek ve onaylamak için lütfen sisteme giriş yapınız.</p>
        <p style="font-size: 12px; color: #7f8c8d; margin-top: 20px;">Bu otomatik bir bildirimdir (Örnek Gönderim).</p>
      </div>
    `;

    console.log(`Sending email to ${TARGET_EMAIL}...`);
    await sendEmail(
      TARGET_EMAIL, 
      `Yeni Servis Talebi: ${vehiclePlate} (Örnek)`, 
      emailContent
    );
    console.log('Sample Admin Notification email sent successfully.');

  } catch (error) {
    console.error('Error sending sample email:', error);
  }
}

sendAdminNotificationSample();
