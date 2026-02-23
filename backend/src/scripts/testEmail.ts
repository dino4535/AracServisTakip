import dotenv from 'dotenv';
import path from 'path';
import nodemailer from 'nodemailer';

// Load env vars from root .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testEmail() {
  console.log('Testing email configuration with detailed debugging...');
  
  const config = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false
    },
    debug: true, // show debug output
    logger: true // log information to console
  };

  console.log('Config Host:', config.host);
  console.log('Config User:', config.auth.user);
  console.log('Config Pass Length:', config.auth.pass?.length);

  const transporter = nodemailer.createTransport(config);

  const testRecipient = process.env.EMAIL_USER || 'oguz@trae.ai';
  
  try {
    console.log(`Attempting to send email to ${testRecipient}...`);
    await transporter.verify();
    console.log('Transporter verification successful. Server is ready to take our messages');

    await transporter.sendMail({
      from: `"Test" <${process.env.EMAIL_FROM || config.auth.user}>`,
      to: testRecipient,
      subject: 'Test Email (Debug Mode)',
      html: '<h1>Test Successful</h1><p>Debug mode active.</p>',
    });
    console.log('Test email sent successfully.');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testEmail();
