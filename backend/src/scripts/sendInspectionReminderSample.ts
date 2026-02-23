import dotenv from 'dotenv';
import path from 'path';
import nodemailer from 'nodemailer';

// Env'yi önce yükle
dotenv.config({ path: path.join(__dirname, '../../.env') });

const TARGET_EMAIL = 'info@dinogida.com.tr';

const main = async () => {
  try {
    const todayStr = new Date().toLocaleDateString('tr-TR');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #2c3e50;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
          Araç Muayene Hatırlatma Örneği
        </h2>

        <p>Bu e-posta, sistemde tanımlı otomatik <strong>muayene hatırlatma</strong> ve <strong>vize geçmiş araç bildirimi</strong> yapısının örnek formatını göstermek amacıyla gönderilmiştir.</p>

        <h3 style="margin-top: 24px; color: #34495e;">1) Yaklaşan Muayeneler (Örnek)</h3>
        <p>Aşağıdaki tabloda, muayene vizesine belirli günler kalmış araçlar için gönderilen e-posta formatı örneklenmiştir.</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Plaka</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Muayene Tarihi</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Kalan Gün</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Sürücü</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">35ABC123</td>
              <td style="border: 1px solid #ddd; padding: 8px;">15.03.2026</td>
              <td style="border: 1px solid #ddd; padding: 8px;">10</td>
              <td style="border: 1px solid #ddd; padding: 8px;">Ahmet Yılmaz</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">34XYZ789</td>
              <td style="border: 1px solid #ddd; padding: 8px;">20.03.2026</td>
              <td style="border: 1px solid #ddd; padding: 8px;">15</td>
              <td style="border: 1px solid #ddd; padding: 8px;">-</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 13px; color: #555;">
          Bu tablodaki veriler örnek amaçlıdır. Gerçek çalışmada, her gün saat 09:00'da sistemdeki araçlar kontrol edilerek
          muayene vizesine <strong>30, 20, 15, 10, 7, 5, 3, 2 ve 1</strong> gün kalan araçlar için benzer liste oluşturulur ve ilgili yöneticilere gönderilir.
        </p>

        <h3 style="margin-top: 24px; color: #34495e;">2) Vizesi Geçmiş Araçlar (Örnek)</h3>
        <p>Muayene vize tarihi geçmiş araçlar için şirket adminlerine gönderilen toplu e-posta formatı aşağıdaki gibidir.</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Plaka</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Vize Tarihi</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Gecikme (Gün)</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Yönetici</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">35DEF456</td>
              <td style="border: 1px solid #ddd; padding: 8px;">01.03.2026</td>
              <td style="border: 1px solid #ddd; padding: 8px;">3</td>
              <td style="border: 1px solid #ddd; padding: 8px;">Mehmet Demir</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 13px; color: #555;">
          Bu tabloda, muayene vize tarihi geçmiş araçlar listelenir. Gerçek çalışmada her gün saat 09:00'da son 30 gün içinde vizesi geçen araçlar kontrol edilir
          ve ilgili şirket adminlerine gönderilir. Araç için atanmış bir yönetici varsa, ayrıca yöneticinin e-posta adresine de bireysel bilgilendirme yapılır.
        </p>

        <p style="font-size: 12px; color: #7f8c8d; border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px;">
          Tarih: ${todayStr} &mdash; Bu e-posta, Araç Servis Takip sistemi muayene bildirim tasarımlarını örneklemek için gönderilmiştir.
        </p>
      </div>
    `;

    const config = {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
    };

    console.log('Sample mail config host:', config.host);
    console.log('Sample mail config user:', config.auth.user);

    const transporter = nodemailer.createTransport(config);

    await transporter.verify();
    console.log('Sample transporter verification successful.');

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Araç Servis Takip'}" <${process.env.EMAIL_FROM || config.auth.user}>`,
      to: TARGET_EMAIL,
      subject: 'Araç Muayene Bildirimleri - Örnek E-posta',
      html,
    });

    console.log(`Örnek muayene e-postası ${TARGET_EMAIL} adresine gönderildi.`);
  } catch (error) {
    console.error('Örnek muayene e-postası gönderim hatası:', error);
  }
};

main();
