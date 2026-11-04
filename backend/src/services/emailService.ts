import nodemailer from 'nodemailer';

// SMTP yapılandırması eksikse transporter hiç oluşturulmaz: sessiz gmail fallback'i yerine
// açık bir uyarı ile gönderim atlanır (notificationService'teki EMAIL_HOST kapısıyla tutarlı).
const SMTP_HOST = process.env.EMAIL_HOST;
const SMTP_PORT = parseInt(process.env.EMAIL_PORT || '587', 10);
const SMTP_USER = process.env.EMAIL_USER;
const SMTP_PASS = process.env.EMAIL_PASSWORD;
// Sertifika doğrulaması: mevcut SMTP sunucusunun (mail.dinogida.com.tr) sertifikası süresi geçmiş
// olduğundan varsayılan KAPALI tutulur; sertifika yenilenince EMAIL_TLS_REJECT_UNAUTHORIZED=true yapılmalı.
const TLS_REJECT_UNAUTHORIZED =
  (process.env.EMAIL_TLS_REJECT_UNAUTHORIZED || 'false').trim().toLowerCase() === 'true';

const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      host: SMTP_HOST,
      port: SMTP_PORT,
      // 465 implicit TLS, 587 STARTTLS gerektirir; port ile secure alanı tutarlı olmalı
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: TLS_REJECT_UNAUTHORIZED,
      },
    })
  : null;

if (!smtpConfigured) {
  console.warn(
    '⚠️ SMTP yapılandırması eksik (EMAIL_HOST / EMAIL_USER / EMAIL_PASSWORD). E-posta gönderimi devre dışı.'
  );
} else if (!TLS_REJECT_UNAUTHORIZED) {
  console.warn(
    '⚠️ SMTP sertifika doğrulaması KAPALI (EMAIL_TLS_REJECT_UNAUTHORIZED=true ile açılabilir). ' +
      'Sunucu sertifikası yenilendiğinde doğrulamayı açmanız önerilir.'
  );
}

export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  if (!transporter) {
    console.warn(`📧 E-posta atlandı (SMTP yapılandırılmamış) → ${to}: ${subject}`);
    return false;
  }

  try {
    // EMAIL_FROM hem "adres" hem "Ad <adres>" biçiminde verilebilir; zaten ad içeriyorsa tekrar sarmalanmaz
    const rawFrom = (process.env.EMAIL_FROM || '').trim();
    const fromName = process.env.EMAIL_FROM_NAME || 'Araç Servis Takip Platformu';
    const from = rawFrom.includes('<')
      ? rawFrom
      : `"${fromName}" <${rawFrom.includes('@') ? rawFrom : (SMTP_USER as string)}>`;

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    console.log(`📧 Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}
