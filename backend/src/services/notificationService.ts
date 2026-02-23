import { connectDB } from '../config/database';
import sql from 'mssql';
import { sendEmail } from './emailService';
import { getTurkeyNow } from '../utils/time';

export const createNotification = async (
  userId: number,
  type: string,
  title: string,
  message: string,
  relatedId?: number
): Promise<void> => {
  try {
    const pool = await connectDB();

    // Insert into DB
    await pool
      .request()
      .input('UserID', sql.Int, userId)
      .input('Type', sql.NVarChar(50), type)
      .input('Title', sql.NVarChar(200), title)
      .input('Message', sql.NVarChar(500), message)
      .input('RelatedID', sql.Int, relatedId || null)
      .input('CreatedAt', sql.DateTime2, getTurkeyNow())
      .query(`
        INSERT INTO Notifications (UserID, Type, Title, Message, RelatedID, CreatedAt)
        VALUES (@UserID, @Type, @Title, @Message, @RelatedID, @CreatedAt)
      `);

    console.log(`Notification created for user ${userId}: ${title}`);

    const emailDisabledTypes = [
      'NEW_SERVICE_REQUEST',
      'SERVICE_REQUEST_CREATED',
      'SERVICE_REQUEST_COMPLETED',
      'SERVICE_REQUEST_RETURNED',
      'SERVICE_REQUEST_APPROVED',
      'SERVICE_REQUEST_APPROVED_MANAGER',
    ];

    if (process.env.EMAIL_HOST && !emailDisabledTypes.includes(type)) {
      const userResult = await pool.request()
        .input('UserID', sql.Int, userId)
        .query('SELECT Email, Name, Surname FROM Users WHERE UserID = @UserID');
      
      if (userResult.recordset.length > 0) {
        const user = userResult.recordset[0];
        if (user.Email) {
          const fullName = [user.Name, user.Surname].filter(Boolean).join(' ');
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
              <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 16px;">
                ${title}
              </h2>
              <p>Sayın ${fullName || 'Yetkili'},</p>
              <p>${message}</p>
              <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d; border-top: 1px solid #eceff1; padding-top: 10px; text-align: center;">
                <p>Bu e-posta sistem tarafından otomatik olarak oluşturulmuştur. Lütfen yanıtlamayınız.</p>
                <p>© ${new Date().getFullYear()} Araç Servis Takip Portalı</p>
              </div>
            </div>
          `;
          await sendEmail(user.Email, title, htmlContent);
        }
      }
    }

  } catch (error) {
    console.error('Create notification error:', error);
  }
};
