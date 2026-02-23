import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';

export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { unreadOnly, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;
    
    const pool = await connectDB();

    let whereClause = 'WHERE UserID = @UserID';

    if (unreadOnly === 'true') {
      whereClause += ` AND IsRead = 0`;
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM Notifications
      ${whereClause}
    `;

    const dataQuery = `
      SELECT *
      FROM Notifications
      ${whereClause}
      ORDER BY CreatedAt DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request()
      .input('UserID', sql.Int, req.user?.UserID)
      .input('Offset', sql.Int, offset)
      .input('Limit', sql.Int, limitNum);

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery)
    ]);

    const total = countResult.recordset[0].total;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      notifications: dataResult.recordset,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    const result = await pool
      .request()
      .input('NotificationID', sql.Int, id)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        UPDATE Notifications
        SET IsRead = 1
        OUTPUT inserted.NotificationID
        WHERE NotificationID = @NotificationID AND UserID = @UserID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();

    await pool
      .request()
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        UPDATE Notifications
        SET IsRead = 1
        WHERE UserID = @UserID AND IsRead = 0
      `);

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pool = await connectDB();

    const result = await pool
      .request()
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT COUNT(*) as UnreadCount
        FROM Notifications
        WHERE UserID = @UserID AND IsRead = 0
      `);

    res.json({ unreadCount: result.recordset[0].UnreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
