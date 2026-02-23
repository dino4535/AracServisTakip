import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';

export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, startDate, endDate, action, tableName, userId } = req.query;
    const pool = await connectDB();
    
    const requesterRole = req.user?.Role;
    const requesterCompanyId = req.user?.CompanyID;
    const requesterId = req.user?.UserID;

    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT 
        a.*, 
        u.Name, 
        u.Surname, 
        u.Email,
        r.Name as UserRole
      FROM AuditLogs a
      LEFT JOIN Users u ON a.UserID = u.UserID
      LEFT JOIN UserRoles ur ON u.UserID = ur.UserID
      LEFT JOIN Roles r ON ur.RoleID = r.RoleID
      WHERE 1=1
    `;

    // Access Control
    const isSuperAdmin = ['SuperAdmin', 'Super Admin', 'SUPER ADMIN', 'SUPERADMIN'].includes(requesterRole || '');
    
    if (!isSuperAdmin) {
      // Admins can see logs for users in their company
      // This covers both primary company and assigned companies
      query += ` AND (
        u.CompanyID = @RequesterCompanyID 
        OR u.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @RequesterID)
        OR u.UserID IN (SELECT UserID FROM UserCompanies WHERE CompanyID = @RequesterCompanyID)
      )`;
    }

    if (startDate) {
      query += ` AND a.CreatedAt >= @StartDate`;
    }
    if (endDate) {
      query += ` AND a.CreatedAt <= @EndDate`;
    }
    if (action) {
      query += ` AND a.Action = @Action`;
    }
    if (tableName) {
      query += ` AND a.TableName = @TableName`;
    }
    if (userId) {
      query += ` AND a.UserID = @TargetUserID`;
    }

    // Sorting and Pagination
    query += ` ORDER BY a.CreatedAt DESC OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`;

    // Count Query for Pagination Metadata
    let countQuery = `
      SELECT COUNT(*) as total
      FROM AuditLogs a
      LEFT JOIN Users u ON a.UserID = u.UserID
      WHERE 1=1
    `;
    
    // Repeat filters for count
    if (!isSuperAdmin) {
      countQuery += ` AND (
        u.CompanyID = @RequesterCompanyID  
        OR u.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @RequesterID)
        OR u.UserID IN (SELECT UserID FROM UserCompanies WHERE CompanyID = @RequesterCompanyID)
      )`;
    }
    if (startDate) countQuery += ` AND a.CreatedAt >= @StartDate`;
    if (endDate) countQuery += ` AND a.CreatedAt <= @EndDate`;
    if (action) countQuery += ` AND a.Action = @Action`;
    if (tableName) countQuery += ` AND a.TableName = @TableName`;
    if (userId) countQuery += ` AND a.UserID = @TargetUserID`;

    const requestLogs = pool.request();
    
    if (!isSuperAdmin) {
      requestLogs.input('RequesterCompanyID', sql.Int, requesterCompanyId);
      requestLogs.input('RequesterID', sql.Int, requesterId);
    }

    requestLogs.input('Offset', sql.Int, offset);
    requestLogs.input('Limit', sql.Int, Number(limit));

    if (startDate) requestLogs.input('StartDate', sql.DateTime2, new Date(String(startDate)));
    if (endDate) requestLogs.input('EndDate', sql.DateTime2, new Date(String(endDate)));
    if (action) requestLogs.input('Action', sql.NVarChar(50), String(action));
    if (tableName) requestLogs.input('TableName', sql.NVarChar(50), String(tableName));
    if (userId) requestLogs.input('TargetUserID', sql.Int, Number(userId));

    const logsResult = await requestLogs.query(query);

    const requestCount = pool.request();
    if (!isSuperAdmin) {
      requestCount.input('RequesterCompanyID', sql.Int, requesterCompanyId);
      requestCount.input('RequesterID', sql.Int, requesterId);
    }
    if (startDate) requestCount.input('StartDate', sql.DateTime2, new Date(String(startDate)));
    if (endDate) requestCount.input('EndDate', sql.DateTime2, new Date(String(endDate)));
    if (action) requestCount.input('Action', sql.NVarChar(50), String(action));
    if (tableName) requestCount.input('TableName', sql.NVarChar(50), String(tableName));
    if (userId) requestCount.input('TargetUserID', sql.Int, Number(userId));
    const countResult = await requestCount.query(countQuery);

    res.json({
      logs: logsResult.recordset,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
