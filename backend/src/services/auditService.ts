
import { connectDB } from '../config/database';
import sql from 'mssql';

export const logAudit = async (
  userId: number | undefined,
  action: string,
  tableName: string,
  recordId: number,
  details: any,
  ipAddress: string
): Promise<void> => {
  try {
    const pool = await connectDB();
    const detailsJson = JSON.stringify(details);

    await pool
      .request()
      .input('UserID', sql.Int, userId || null)
      .input('Action', sql.NVarChar(50), action)
      .input('TableName', sql.NVarChar(50), tableName)
      .input('RecordID', sql.Int, recordId)
      .input('Details', sql.NVarChar(sql.MAX), detailsJson)
      .input('IPAddress', sql.NVarChar(50), ipAddress || null)
      .query(`
        INSERT INTO AuditLogs (UserID, Action, TableName, RecordID, Details, IPAddress)
        VALUES (@UserID, @Action, @TableName, @RecordID, @Details, @IPAddress)
      `);
      
    // Console log for dev
    console.log(`📝 Audit Log: [${action}] on ${tableName} (ID: ${recordId}) by User ${userId}`);
  } catch (error) {
    // Fail silently to not block main flow, but log error
    console.error('❌ Audit Log Error:', error);
  }
};
