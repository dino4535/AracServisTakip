import { Response } from 'express';
import { connectDB } from '../config/database';
import sql from 'mssql';
import { AuthRequest } from '../middleware/auth';
import { getTurkeyNow } from '../utils/time';
import { createNotification } from '../services/notificationService';
import { serviceRequestSchema } from '../schemas/serviceRequestSchema';
import { logAudit } from '../services/auditService';
import { sendEmail } from '../services/emailService';
import { isElevatedRole, companyScopeSql } from '../utils/authScope';
import { syncVehicleMaintenanceKm } from '../utils/vehicleMaintenance';

export const getAllServiceRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleId, status, page = 1, limit = 50, sortField, sortDirection, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const pool = await connectDB();

    const userId = req.user?.UserID;
    const companyId = req.user?.CompanyID;

    let accessClause = 'WHERE 1=1';

    const elevated = isElevatedRole(req.user?.Role);

    let userDepotIds: number[] = [];
    if (!elevated && userId) {
      const depotResult = await pool.request()
        .input('UserID', sql.Int, userId)
        .query('SELECT DepotID FROM UserDepots WHERE UserID = @UserID');

      userDepotIds = depotResult.recordset
        .map((row: any) => row.DepotID)
        .filter((id: any) => id !== null && id !== undefined);
    }

    if (!elevated) {
      if (userDepotIds.length > 0) {
        accessClause += ` AND v.DepotID IN (${userDepotIds.join(',')})`;
      } else {
        accessClause += ` AND (v.CompanyID = @CompanyID OR v.CompanyID IN (SELECT CompanyID FROM UserCompanies WHERE UserID = @UserID))`;
      }
    }

    let whereClause = accessClause;

    if (vehicleId) {
      whereClause += ` AND sr.VehicleID = @VehicleID`;
    }
    if (status) {
      whereClause += ` AND sr.Status = @Status`;
    }

    if (search) {
      whereClause += ` AND (
        v.Plate LIKE '%' + @SearchTerm + '%' OR
        sr.Description LIKE '%' + @SearchTerm + '%' OR
        sc.Name LIKE '%' + @SearchTerm + '%' OR
        requester.Name LIKE '%' + @SearchTerm + '%' OR
        requester.Surname LIKE '%' + @SearchTerm + '%' OR
        sr.ServiceType LIKE '%' + @SearchTerm + '%'
      )`;
    }

    const baseFromClause = `
      FROM ServiceRequests sr
      LEFT JOIN Vehicles v ON sr.VehicleID = v.VehicleID
      LEFT JOIN ServiceCompanies sc ON sr.ServiceCompanyID = sc.ServiceCompanyID
      LEFT JOIN Users requester ON sr.RequestedBy = requester.UserID
      LEFT JOIN Users assignee ON sr.AssignedTo = assignee.UserID
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      ${baseFromClause}
      ${whereClause}
    `;

    const statsQuery = `
      SELECT 
        COUNT(*) as Total,
        SUM(CASE WHEN sr.Status = 'PENDING' THEN 1 ELSE 0 END) as Pending,
        SUM(CASE WHEN sr.Status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as InProgress,
        SUM(CASE WHEN sr.Status = 'COMPLETED' THEN 1 ELSE 0 END) as Completed
      ${baseFromClause}
      ${accessClause}
    `;

    let orderBy = 'sr.RequestDate DESC';
    const dir = (String(sortDirection || '').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    if (typeof sortField === 'string') {
      switch (sortField) {
        case 'RequestDate':
          orderBy = `sr.RequestDate ${dir}`;
          break;
        case 'CompletedDate':
          orderBy = `sr.CompletedDate ${dir}`;
          break;
        default:
          orderBy = `sr.RequestDate ${dir}`;
      }
    }

    const dataQuery = `
      SELECT 
        sr.*, 
        v.Plate,
        sc.Name as ServiceCompanyName,
        CONCAT(requester.Name, ' ', requester.Surname) as RequesterName,
        CONCAT(assignee.Name, ' ', assignee.Surname) as AssigneeName
      ${baseFromClause}
      ${whereClause}
      ORDER BY ${orderBy}
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `;

    const request = pool.request()
      .input('Offset', sql.Int, offset)
      .input('Limit', sql.Int, limitNum);
    
    if (!elevated) {
      if (companyId) {
        request.input('CompanyID', sql.Int, companyId);
      }
      if (userId) {
        request.input('UserID', sql.Int, userId);
      }
    }

    if (vehicleId) {
      request.input('VehicleID', sql.Int, vehicleId);
    }
    if (status) {
      request.input('Status', sql.NVarChar(20), status);
    }
    if (search) {
      request.input('SearchTerm', sql.NVarChar(100), search);
    }

    const [countResult, dataResult, statsResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
      request.query(statsQuery)
    ]);

    const total = countResult.recordset[0].total;
    const totalPages = Math.ceil(total / limitNum);
    const stats = statsResult.recordset[0];

    res.json({
      data: dataResult.recordset,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages
      },
      stats: {
        total: stats.Total,
        pending: stats.Pending || 0,
        inProgress: stats.InProgress || 0,
        completed: stats.Completed || 0
      }
    });
  } catch (error) {
    console.error('Get service requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getServiceRequestById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();
    const elevated = isElevatedRole(req.user?.Role);
    const companyId = elevated ? null : (req.user?.CompanyID || null);

    const result = await pool
      .request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, companyId)
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 
          sr.*, 
          v.Plate,
          sc.Name as ServiceCompanyName,
          CONCAT(requester.Name, ' ', requester.Surname) as RequesterName,
          CONCAT(assignee.Name, ' ', assignee.Surname) as AssigneeName
        FROM ServiceRequests sr
        LEFT JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        LEFT JOIN ServiceCompanies sc ON sr.ServiceCompanyID = sc.ServiceCompanyID
        LEFT JOIN Users requester ON sr.RequestedBy = requester.UserID
        LEFT JOIN Users assignee ON sr.AssignedTo = assignee.UserID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    res.json({ serviceRequest: result.recordset[0] });
  } catch (error) {
    console.error('Get service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = serviceRequestSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { vehicleId, description, priority, serviceCompanyId, serviceType } = validation.data;

    const pool = await connectDB();

    // Check vehicle access
    const elevated = isElevatedRole(req.user?.Role);
    const vehicleCheck = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT 
          v.CompanyID, 
          v.Plate,
          c.Name as CompanyName,
          d.Name as DepotName
        FROM Vehicles v
        LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
        LEFT JOIN Depots d ON v.DepotID = d.DepotID
        WHERE v.VehicleID = @VehicleID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (vehicleCheck.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this vehicle' });
      return;
    }

    const result = await pool
      .request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('RequestedBy', sql.Int, req.user?.UserID)
      .input('Description', sql.NVarChar(500), description)
      .input('ServiceType', sql.NVarChar(50), serviceType || null)
      .input('Priority', sql.NVarChar(20), priority || 'MEDIUM')
      .input('ServiceCompanyID', sql.Int, serviceCompanyId || null)
      .input('Status', sql.NVarChar(20), 'PENDING')
      .query(`
        INSERT INTO ServiceRequests (VehicleID, RequestedBy, Description, ServiceType, Priority, ServiceCompanyID, Status)
        OUTPUT inserted.*
        VALUES (@VehicleID, @RequestedBy, @Description, @ServiceType, @Priority, @ServiceCompanyID, @Status)
      `);

    const serviceRequest = result.recordset[0];

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'CREATE_SERVICE_REQUEST',
      'ServiceRequests',
      serviceRequest.RequestID,
      { vehicleId, description, serviceType, priority, serviceCompanyId },
      req.ip || '0.0.0.0'
    );

    await createNotification(
      serviceRequest.RequestedBy,
      'SERVICE_REQUEST_CREATED',
      'Servis Talebi Oluşturuldu',
      'Servis talebiniz başarıyla oluşturuldu ve onay bekliyor.',
      serviceRequest.RequestID
    );
    
    try {
      const vehicleCompanyId = vehicleCheck.recordset[0].CompanyID;
      const vehiclePlate = vehicleCheck.recordset[0].Plate;
      const companyName = vehicleCheck.recordset[0].CompanyName || 'Belirtilmedi';
      const depotName = vehicleCheck.recordset[0].DepotName || 'Belirtilmedi';
      
      const requesterResult = await pool.request()
        .input('UserID', sql.Int, req.user?.UserID)
        .query('SELECT Email, Name, Surname FROM Users WHERE UserID = @UserID');
      const requester = requesterResult.recordset[0];
      const requesterName = requester ? `${requester.Name} ${requester.Surname}` : 'Kullanıcı';

      const adminResult = await pool.request()
        .input('CompanyID', sql.Int, vehicleCompanyId)
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

      for (const admin of adminResult.recordset) {
        await createNotification(
          admin.UserID,
          'NEW_SERVICE_REQUEST',
          'Yeni Servis Talebi',
          `Araç: ${vehiclePlate} için yeni servis talebi oluşturuldu. Onayınız bekleniyor.`,
          serviceRequest.RequestID
        );

        if (admin.Email) {
          const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
              <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Yeni Servis Talebi</h2>
              <p>Sayın ${admin.Name} ${admin.Surname},</p>
              <p>Aşağıda detayları yer alan araç için sistemde yeni bir servis talebi oluşturulmuştur. Talebin incelenerek uygun görüldüğünde onaylanması rica olunur.</p>
              
              <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Şirket</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${companyName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Depo</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${depotName}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Plaka</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${vehiclePlate}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Eden</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${requesterName}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tipi</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${serviceType || 'Belirtilmedi'}</td>
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
              
              <p>Talebi detaylı incelemek ve gerekli işlemleri gerçekleştirmek için lütfen Araç Servis Takip Portalı&apos;na giriş yapınız.</p>
              
              <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
                <p>Bu e-posta, Dino Gıda Araç Servis Takip Platformu tarafından otomatik olarak gönderilmiştir. Lütfen bu mesaja yanıt vermeyiniz.</p>
                <p style="margin-top: 8px;">
                  Saygılarımızla,<br/>
                  Dino Gıda Sanayi ve Ticaret Ltd. Şti.<br/>
                  Araç Servis Takip Platformu
                </p>
                <p style="margin-top: 6px; color: #95a5a6;">Powered by Oğuz EMÜL</p>
              </div>
            </div>
          `;
          await sendEmail(admin.Email, `Yeni Servis Talebi: ${vehiclePlate}`, emailContent);
        }
      }

      if (requester?.Email) {
        const requestDateStr = serviceRequest.RequestDate
          ? new Date(serviceRequest.RequestDate).toLocaleString('tr-TR')
          : '';

        const requesterEmailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Servis Talebiniz Oluşturuldu</h2>
            <p>Sayın ${requesterName},</p>
            <p>Aşağıda detayları yer alan araç için sistemde yeni bir servis talebi oluşturulmuştur. Talebiniz ilgili şirket yöneticisine iletilmiş olup onay sürecindedir.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Şirket</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${companyName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Depo</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${depotName}</td>
              </tr>
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Plaka</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${vehiclePlate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep No</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${serviceRequest.RequestID}</td>
              </tr>
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tarihi</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${requestDateStr}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tipi</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${serviceType || 'Belirtilmedi'}</td>
              </tr>
              <tr style="background-color: #f8f9fa;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Öncelik</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${priority}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Açıklama</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${description}</td>
              </tr>
            </table>

            <p>Talebinizin durumu ile ilgili güncellemeleri sistem üzerinden takip edebilirsiniz. Talebiniz onaylandığında ayrıca bilgilendirme yapılacaktır.</p>
            
            <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
              <p>Bu e-posta, Dino Gıda Araç Servis Takip Platformu tarafından otomatik olarak gönderilmiştir. Lütfen bu mesaja yanıt vermeyiniz.</p>
              <p style="margin-top: 8px;">
                Saygılarımızla,<br/>
                Dino Gıda Sanayi ve Ticaret Ltd. Şti.<br/>
                Araç Servis Takip Platformu
              </p>
              <p style="margin-top: 6px; color: #95a5a6;">Powered by Oğuz EMÜL</p>
            </div>
          </div>
        `;

        await sendEmail(
          requester.Email,
          'Servis Talebiniz Oluşturuldu',
          requesterEmailContent
        );
      }
    } catch (notifyError) {
      console.error('Admin notification error:', notifyError);
    }

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest,
    });
  } catch (error) {
    console.error('Create service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Mevcut kayıtlar için eski 'Normal' önceliğini yeni enum'a uyarlama
    const normalizedBody: any = { ...req.body };
    if (typeof normalizedBody.priority === 'string') {
      if (normalizedBody.priority.toLowerCase() === 'normal') {
        normalizedBody.priority = 'MEDIUM';
      }
    }

    // Partial validation for update
    const validation = serviceRequestSchema.partial().safeParse(normalizedBody);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { description, priority, assignedTo, estimatedCost, actualCost, serviceCompany, serviceCompanyId, driverName, deliveredBy, extraWork, serviceType } = validation.data;

    const pool = await connectDB();

    // Check access
    const elevated = isElevatedRole(req.user?.Role);
    const checkQuery = await pool.request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT sr.RequestID, sr.VehicleID, v.Plate, v.CompanyID
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this service request' });
      return;
    }

    const currentRequest = checkQuery.recordset[0];

    const result = await pool
      .request()
      .input('RequestID', sql.Int, Number(id))
      .input('Description', sql.NVarChar(500), description)
      .input('ServiceType', sql.NVarChar(50), serviceType)
      .input('Priority', sql.NVarChar(20), priority)
      .input('AssignedTo', sql.Int, assignedTo || null)
      .input('EstimatedCost', sql.Decimal(10, 2), estimatedCost || null)
      .input('ActualCost', sql.Decimal(10, 2), actualCost || null)
      .input('ServiceCompany', sql.NVarChar(255), serviceCompany || null)
      .input('ServiceCompanyID', sql.Int, serviceCompanyId || null)
      .input('DriverName', sql.NVarChar(100), driverName || null)
      .input('DeliveredBy', sql.NVarChar(100), deliveredBy || null)
      .input('ExtraWork', sql.NVarChar(sql.MAX), extraWork || null)
      .query(`
        UPDATE ServiceRequests
        SET Description = COALESCE(@Description, Description),
            ServiceType = COALESCE(@ServiceType, ServiceType),
            Priority = COALESCE(@Priority, Priority),
            AssignedTo = COALESCE(@AssignedTo, AssignedTo),
            EstimatedCost = COALESCE(@EstimatedCost, EstimatedCost),
            ActualCost = COALESCE(@ActualCost, ActualCost),
            ServiceCompany = COALESCE(@ServiceCompany, ServiceCompany),
            ServiceCompanyID = COALESCE(@ServiceCompanyID, ServiceCompanyID),
            DriverName = COALESCE(@DriverName, DriverName),
            DeliveredBy = COALESCE(@DeliveredBy, DeliveredBy),
            ExtraWork = COALESCE(@ExtraWork, ExtraWork)
        OUTPUT inserted.*
        WHERE RequestID = @RequestID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'UPDATE_SERVICE_REQUEST',
      'ServiceRequests',
      result.recordset[0].RequestID,
      { description, priority, assignedTo, estimatedCost, actualCost, serviceCompany, driverName, deliveredBy, extraWork, serviceType },
      req.ip || '0.0.0.0'
    );

    res.status(200).json({
      message: 'Service request updated successfully',
      serviceRequest: result.recordset[0],
    });

    // Notify Company Admins (Main + Secondary)
    const adminResult = await pool.request()
      .input('CompanyID', sql.Int, currentRequest.CompanyID)
      .query(`
        SELECT DISTINCT u.UserID, u.Email 
        FROM Users u
        JOIN UserRoles ur ON u.UserID = ur.UserID
        JOIN Roles r ON ur.RoleID = r.RoleID
        LEFT JOIN UserCompanies uc ON u.UserID = uc.UserID
        WHERE 
          (u.CompanyID = @CompanyID OR uc.CompanyID = @CompanyID)
          AND r.Name = 'ADMIN' 
          AND u.IsActive = 1
      `);
    
    for (const admin of adminResult.recordset) {
      await createNotification(
        admin.UserID,
        'NEW_SERVICE_REQUEST',
        'Yeni Servis Talebi',
        `Araç: ${currentRequest.Plate} (ID: ${currentRequest.VehicleID}) için yeni servis talebi oluşturuldu. Öncelik: ${priority}`,
        result.recordset[0].RequestID
      );
    }
  } catch (error) {
    console.error('Update service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const approveServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = serviceRequestSchema.partial().safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { assignedTo, estimatedCost } = validation.data;
    const note: string | undefined = (req.body as any)?.note;

    const pool = await connectDB();

    // Check access
    const elevated = isElevatedRole(req.user?.Role);
    const checkQuery = await pool.request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT sr.RequestID 
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this service request' });
      return;
    }

    const result = await pool
      .request()
      .input('RequestID', sql.Int, Number(id))
      .input('Status', sql.NVarChar(20), 'IN_PROGRESS')
      .input('AssignedTo', sql.Int, assignedTo || req.user?.UserID)
      .input('EstimatedCost', sql.Decimal(10, 2), estimatedCost || null)
      .query(`
        UPDATE ServiceRequests
        SET Status = @Status,
            AssignedTo = COALESCE(@AssignedTo, AssignedTo),
            EstimatedCost = COALESCE(@EstimatedCost, EstimatedCost)
        OUTPUT inserted.*
        WHERE RequestID = @RequestID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    const serviceRequest = result.recordset[0];

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'APPROVE_SERVICE_REQUEST',
      'ServiceRequests',
      serviceRequest.RequestID,
      { status: 'IN_PROGRESS', assignedTo, estimatedCost, note: note || null },
      req.ip || '0.0.0.0'
    );

    // Persist note if provided
    if (note && note.trim().length > 0) {
      await pool.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM sys.objects 
          WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequestNotes]') AND type in (N'U')
        )
        BEGIN
          CREATE TABLE ServiceRequestNotes (
            NoteID INT IDENTITY(1,1) PRIMARY KEY,
            RequestID INT NOT NULL,
            UserID INT NULL,
            Action NVARCHAR(20) NOT NULL,
            Note NVARCHAR(500) NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END
      `);

      await pool.request()
        .input('RequestID', sql.Int, serviceRequest.RequestID)
        .input('UserID', sql.Int, req.user?.UserID || null)
        .input('Action', sql.NVarChar(20), 'APPROVE')
        .input('Note', sql.NVarChar(500), note)
        .input('CreatedAt', sql.DateTime2, getTurkeyNow())
        .query(`
          INSERT INTO ServiceRequestNotes (RequestID, UserID, Action, Note, CreatedAt)
          VALUES (@RequestID, @UserID, @Action, @Note, @CreatedAt)
        `);
    }

    await createNotification(
      serviceRequest.RequestedBy,
      'SERVICE_REQUEST_APPROVED',
      'Servis Talebi Onaylandı',
      'Servis talebiniz onaylandı ve işleme alındı.',
      serviceRequest.RequestID
    );

    // Notify User via Email
    const userResult = await pool.request()
      .input('UserID', sql.Int, serviceRequest.RequestedBy)
      .query('SELECT Email, Name, Surname, ManagerID FROM Users WHERE UserID = @UserID');
    
    const user = userResult.recordset[0];

    const detailsResult = await pool.request()
      .input('RequestID', sql.Int, serviceRequest.RequestID)
      .query(`
        SELECT 
          sr.RequestID,
          sr.Description,
          sr.ServiceType,
          sr.Priority,
          sr.RequestDate,
          v.Plate,
          c.Name as CompanyName,
          d.Name as DepotName
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
        LEFT JOIN Depots d ON v.DepotID = d.DepotID
        WHERE sr.RequestID = @RequestID
      `);

    const details = detailsResult.recordset[0];

    if (user?.Email && details) {
      const requestDateStr = details.RequestDate 
        ? new Date(details.RequestDate).toLocaleString('tr-TR')
        : '';

      const noteBlock = (note && note.trim().length > 0)
        ? `<tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Yönetici Notu</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${note.trim()}</td>
           </tr>`
        : '';

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Servis Talebiniz Onaylandı</h2>
          <p>Sayın ${user.Name} ${user.Surname},</p>
          <p>Aşağıda detayları yer alan araç için oluşturduğunuz servis talebi yönetici tarafından onaylanmış ve işleme alınmıştır.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Şirket</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.CompanyName || 'Belirtilmedi'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Depo</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.DepotName || 'Belirtilmedi'}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Plaka</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.Plate}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep No</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.RequestID}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tarihi</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${requestDateStr}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tipi</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.ServiceType || 'Belirtilmedi'}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Öncelik</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.Priority}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Açıklama</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.Description}</td>
            </tr>
            ${noteBlock}
          </table>
          
          <p>Talebin son durumunu ve detaylarını görüntülemek için lütfen Araç Servis Takip Portalı&apos;na giriş yapınız.</p>
          
          <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
            <p>Bu e-posta, Araç Servis Takip Portalı tarafından otomatik olarak oluşturulmuştur. Lütfen bu mesaja yanıt vermeyiniz.</p>
            <p style="margin-top: 8px;">
              Saygılarımızla,<br/>
              Dino Gıda San. Tic. Ltd. Şti.<br/>
              Araç Servis Takip Portalı
            </p>
            <p style="margin-top: 8px;">Powered by Oğuz EMÜL</p>
          </div>
        </div>
      `;

      await sendEmail(
        user.Email,
        'Servis Talebiniz Onaylandı',
        emailContent
      );
    }

    // Notify Manager via Email (if exists)
    if (user?.ManagerID) {
      const managerResult = await pool.request()
        .input('ManagerID', sql.Int, user.ManagerID)
        .query('SELECT Email, Name, Surname FROM Users WHERE UserID = @ManagerID');
      
      const manager = managerResult.recordset[0];
      if (manager?.Email) {
        await createNotification(
            user.ManagerID,
            'SERVICE_REQUEST_APPROVED_MANAGER',
            'Personel Servis Talebi Onaylandı',
            `${user.Name} ${user.Surname} tarafından açılan servis talebi onaylandı.`,
            serviceRequest.RequestID
        );

        await sendEmail(
          manager.Email,
          'Personel Servis Talebi Onaylandı',
          `<p>Sayın ${manager.Name} ${manager.Surname},</p>
           <p>Sorumluluğunuzdaki ${user.Name} ${user.Surname} adlı personelin servis talebi yönetici tarafından onaylanmıştır.</p>`
        );
      }
    }

    res.json({
      message: 'Service request approved successfully',
      serviceRequest,
    });
  } catch (error) {
    console.error('Approve service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rejectServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const note: string | undefined = (req.body as any)?.note;
    const pool = await connectDB();

    if (!note || note.trim().length === 0) {
      res.status(400).json({ error: 'Rejection note is required' });
      return;
    }

    const elevated = isElevatedRole(req.user?.Role);
    const checkQuery = await pool.request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT sr.RequestID, sr.RequestedBy
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this service request' });
      return;
    }

    const result = await pool
      .request()
      .input('RequestID', sql.Int, Number(id))
      .input('Status', sql.NVarChar(20), 'REJECTED')
      .query(`
        UPDATE ServiceRequests
        SET Status = @Status
        OUTPUT inserted.*
        WHERE RequestID = @RequestID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    const serviceRequest = result.recordset[0];

    await logAudit(
      req.user?.UserID,
      'REJECT_SERVICE_REQUEST',
      'ServiceRequests',
      serviceRequest.RequestID,
      { status: 'REJECTED', note: note || null },
      req.ip || '0.0.0.0'
    );

    if (note && note.trim().length > 0) {
      await pool.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM sys.objects 
          WHERE object_id = OBJECT_ID(N'[dbo].[ServiceRequestNotes]') AND type in (N'U')
        )
        BEGIN
          CREATE TABLE ServiceRequestNotes (
            NoteID INT IDENTITY(1,1) PRIMARY KEY,
            RequestID INT NOT NULL,
            UserID INT NULL,
            Action NVARCHAR(20) NOT NULL,
            Note NVARCHAR(500) NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END
      `);

      await pool.request()
        .input('RequestID', sql.Int, serviceRequest.RequestID)
        .input('UserID', sql.Int, req.user?.UserID || null)
        .input('Action', sql.NVarChar(20), 'REJECT')
        .input('Note', sql.NVarChar(500), note)
        .input('CreatedAt', sql.DateTime2, getTurkeyNow())
        .query(`
          INSERT INTO ServiceRequestNotes (RequestID, UserID, Action, Note, CreatedAt)
          VALUES (@RequestID, @UserID, @Action, @Note, @CreatedAt)
        `);
    }

    await createNotification(
      serviceRequest.RequestedBy,
      'SERVICE_REQUEST_REJECTED',
      'Servis Talebi Reddedildi',
      'Servis talebiniz yönetici tarafından reddedildi.',
      serviceRequest.RequestID
    );

    const userResult = await pool.request()
      .input('UserID', sql.Int, serviceRequest.RequestedBy)
      .query('SELECT Email, Name, Surname, ManagerID FROM Users WHERE UserID = @UserID');
    const user = userResult.recordset[0];

    const detailsResult = await pool.request()
      .input('RequestID', sql.Int, serviceRequest.RequestID)
      .query(`
        SELECT 
          sr.RequestID,
          sr.Description,
          sr.ServiceType,
          sr.Priority,
          sr.RequestDate,
          v.Plate,
          c.Name as CompanyName,
          d.Name as DepotName
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
        LEFT JOIN Depots d ON v.DepotID = d.DepotID
        WHERE sr.RequestID = @RequestID
      `);
    const details = detailsResult.recordset[0];

    if (user?.Email && details) {
      const requestDateStr = details.RequestDate 
        ? new Date(details.RequestDate).toLocaleString('tr-TR')
        : '';
      const noteBlock = (note && note.trim().length > 0)
        ? `<tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Yönetici Notu</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${note.trim()}</td>
           </tr>`
        : '';
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <h2 style="color: #c0392b; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">Servis Talebiniz Reddedildi</h2>
          <p>Sayın ${user.Name} ${user.Surname},</p>
          <p>Aşağıda detayları yer alan servis talebiniz yönetici tarafından reddedilmiştir.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Şirket</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.CompanyName || 'Belirtilmedi'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Depo</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.DepotName || 'Belirtilmedi'}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Plaka</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.Plate}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep No</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.RequestID}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tarihi</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${requestDateStr}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tipi</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.ServiceType || 'Belirtilmedi'}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Öncelik</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.Priority}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Açıklama</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${details.Description}</td>
            </tr>
            ${noteBlock}
          </table>
          
          <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
            <p>Bu e-posta, Araç Servis Takip Portalı tarafından otomatik olarak oluşturulmuştur. Lütfen bu mesaja yanıt vermeyiniz.</p>
            <p style="margin-top: 8px;">
              Saygılarımızla,<br/>
              Dino Gıda San. Tic. Ltd. Şti.<br/>
              Araç Servis Takip Portalı
            </p>
            <p style="margin-top: 8px;">Powered by Oğuz EMÜL</p>
          </div>
        </div>
      `;

      await sendEmail(
        user.Email,
        'Servis Talebiniz Reddedildi',
        emailContent
      );
    }

    if (user?.ManagerID) {
      const managerResult = await pool.request()
        .input('ManagerID', sql.Int, user.ManagerID)
        .query('SELECT Email, Name, Surname FROM Users WHERE UserID = @ManagerID');
      const manager = managerResult.recordset[0];
      if (manager?.Email) {
        await createNotification(
          user.ManagerID,
          'SERVICE_REQUEST_REJECTED_MANAGER',
          'Personel Servis Talebi Reddedildi',
          `${user.Name} ${user.Surname} tarafından açılan servis talebi reddedildi.`,
          serviceRequest.RequestID
        );
        await sendEmail(
          manager.Email,
          'Personel Servis Talebi Reddedildi',
          `<p>Sayın ${manager.Name} ${manager.Surname},</p>
           <p>Sorumluluğunuzdaki ${user.Name} ${user.Surname} adlı personelin servis talebi yönetici tarafından reddedilmiştir.</p>
           ${note ? `<p><strong>Yönetici Notu:</strong> ${note}</p>` : ''}`
        );
      }
    }

    res.json({
      message: 'Service request rejected successfully',
      serviceRequest,
    });
  } catch (error) {
    console.error('Reject service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const completeServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const validation = serviceRequestSchema.partial().safeParse(req.body);
    
    if (!validation.success) {
      res.status(400).json({ error: 'Validation error', details: validation.error.format() });
      return;
    }

    const { actualCost, serviceActions } = validation.data;

    const pool = await connectDB();

    // Check access
    const elevated = isElevatedRole(req.user?.Role);
    const checkQuery = await pool.request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT sr.RequestID 
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this service request' });
      return;
    }

    const result = await pool
      .request()
      .input('RequestID', sql.Int, Number(id))
      .input('Status', sql.NVarChar(20), 'COMPLETED')
      .input('ActualCost', sql.Decimal(10, 2), actualCost || null)
      .input('ServiceActions', sql.NVarChar(sql.MAX), serviceActions || null)
      .input('CompletedDate', sql.DateTime2, getTurkeyNow())
      .query(`
        UPDATE ServiceRequests
        SET Status = @Status,
            ActualCost = @ActualCost,
            ServiceActions = @ServiceActions,
            CompletedDate = @CompletedDate
        OUTPUT inserted.*
        WHERE RequestID = @RequestID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    const serviceRequest = result.recordset[0];

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'COMPLETE_SERVICE_REQUEST',
      'ServiceRequests',
      serviceRequest.RequestID,
      { status: 'COMPLETED', actualCost, serviceActions },
      req.ip || '0.0.0.0'
    );

    await createNotification(
      serviceRequest.RequestedBy,
      'SERVICE_REQUEST_COMPLETED',
      'Servis Talebi Tamamlandı',
      'Servis talebiniz tamamlandı.',
      serviceRequest.RequestID
    );

    res.json({
      message: 'Service request completed successfully',
      serviceRequest,
    });
  } catch (error) {
    console.error('Complete service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markReturnedFromService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nextMaintenanceKm, currentKm } = req.body as { nextMaintenanceKm?: number; currentKm?: number };
    const pool = await connectDB();

    // Check access
    const elevated = isElevatedRole(req.user?.Role);
    const checkQuery = await pool.request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT sr.RequestID 
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this service request' });
      return;
    }

    const result = await pool
      .request()
      .input('RequestID', sql.Int, id)
      .input('Status', sql.NVarChar(20), 'RETURNED')
      .input('ReturnDate', sql.DateTime2, new Date())
      .query(`
        UPDATE ServiceRequests
        SET Status = @Status,
            ReturnDate = @ReturnDate
        OUTPUT deleted.Status as PreviousStatus, inserted.*
        WHERE RequestID = @RequestID
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    const serviceRequest = result.recordset[0];
    const previousStatus = serviceRequest.PreviousStatus;

    const hasCurrentKm = currentKm !== undefined && currentKm !== null && !isNaN(Number(currentKm));
    const hasNextKm = nextMaintenanceKm !== undefined && nextMaintenanceKm !== null && !isNaN(Number(nextMaintenanceKm));
    const serviceKm = hasCurrentKm ? Number(currentKm) : null;

    // Aracın mevcut KM'sini güncelle
    if (hasCurrentKm) {
      await pool.request()
        .input('VehicleID', sql.Int, serviceRequest.VehicleID)
        .input('CurrentKm', sql.Int, Number(currentKm))
        .query('UPDATE Vehicles SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE() WHERE VehicleID = @VehicleID');
    }

    // Servis dönüşünü bakım kaydı olarak işle (tekrarlanan dönüşlerde kayıt çoğaltma)
    if (previousStatus !== 'RETURNED' && serviceKm !== null && serviceKm > 0) {
      const maintenanceDescription = (serviceRequest.ServiceActions || serviceRequest.Description || 'Servis talebi dönüşü').toString().slice(0, 500);
      await pool.request()
        .input('VehicleID', sql.Int, serviceRequest.VehicleID)
        .input('Type', sql.NVarChar(50), serviceRequest.ServiceType || 'Servis')
        .input('Description', sql.NVarChar(500), maintenanceDescription)
        .input('Kilometer', sql.Int, serviceKm)
        .input('Cost', sql.Decimal(10, 2), serviceRequest.ActualCost != null ? Number(serviceRequest.ActualCost) : null)
        .input('ServiceDate', sql.DateTime2, serviceRequest.ReturnDate || getTurkeyNow())
        .input('CreatedBy', sql.Int, req.user?.UserID ?? null)
        .query(`
          INSERT INTO MaintenanceRecords (VehicleID, Type, Description, Kilometer, Cost, ServiceDate, CreatedBy)
          VALUES (@VehicleID, @Type, @Description, @Kilometer, @Cost, @ServiceDate, @CreatedBy)
        `);
    }

    // LastServiceKm + NextMaintenanceKm senkronu (manuel sonraki bakım KM verildiyse o kullanılır)
    await syncVehicleMaintenanceKm(pool, serviceRequest.VehicleID, hasNextKm ? Number(nextMaintenanceKm) : null);

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'RETURN_SERVICE_REQUEST',
      'ServiceRequests',
      serviceRequest.RequestID,
      { status: 'RETURNED', nextMaintenanceKm: nextMaintenanceKm ?? null, currentKm: currentKm ?? null },
      req.ip || '0.0.0.0'
    );

    await createNotification(
      serviceRequest.RequestedBy,
      'SERVICE_REQUEST_RETURNED',
      'Araç Servisten Döndü',
      'Araç servisten döndü. KM bilgileri güncellendi.',
      serviceRequest.RequestID
    );

    try {
      const detailsResult = await pool.request()
        .input('RequestID', sql.Int, serviceRequest.RequestID)
        .query(`
          SELECT 
            sr.RequestID,
            sr.Description,
            sr.ServiceType,
            sr.Priority,
            sr.RequestDate,
            sr.VehicleID,
            v.Plate,
            v.CompanyID,
            c.Name as CompanyName,
            d.Name as DepotName
          FROM ServiceRequests sr
          JOIN Vehicles v ON sr.VehicleID = v.VehicleID
          LEFT JOIN Companies c ON v.CompanyID = c.CompanyID
          LEFT JOIN Depots d ON v.DepotID = d.DepotID
          WHERE sr.RequestID = @RequestID
        `);

      const details = detailsResult.recordset[0];

      if (details && details.CompanyID) {
        const adminResult = await pool.request()
          .input('CompanyID', sql.Int, details.CompanyID)
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

        const requestDateStr = details.RequestDate 
          ? new Date(details.RequestDate).toLocaleString('tr-TR')
          : '';

        for (const admin of adminResult.recordset) {
          if (!admin.Email) continue;

          const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
              <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Araç Servisten Döndü - İşlem Gerekiyor</h2>
              <p>Sayın ${admin.Name} ${admin.Surname},</p>
              <p>Aşağıda detayları yer alan araç için daha önce açılmış olan servis talebine ilişkin olarak, aracın servisten dönüş işlemi sistemde tamamlanmıştır.</p>
              
              <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Şirket</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.CompanyName || 'Belirtilmedi'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Depo</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.DepotName || 'Belirtilmedi'}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Plaka</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.Plate}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep No</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.RequestID}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tarihi</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${requestDateStr}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Talep Tipi</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.ServiceType || 'Belirtilmedi'}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Öncelik</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.Priority}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Açıklama</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${details.Description}</td>
                </tr>
              </table>

              <p>İş süreçlerinin tamamlanabilmesi için aşağıdaki adımların ilgili şirket yetkilisi tarafından yerine getirilmesi gerekmektedir:</p>
              <ol style="margin: 10px 0 20px 20px; padding: 0;">
                <li style="margin-bottom: 6px;">İlgili servis talebinin sistem üzerinden incelenmesi ve kapatılması.</li>
                <li style="margin-bottom: 6px;">Gerçekleşen servis maliyetinin (işçilik, parça vb.) <strong>“Maliyet”</strong> alanına eksiksiz olarak girilmesi.</li>
                <li style="margin-bottom: 6px;">Varsa yapılan işlemlerin <strong>“Yapılan İşlemler / Açıklama”</strong> alanında detaylandırılması.</li>
              </ol>

            <p>Talep detaylarına erişmek ve gerekli güncellemeleri yapmak için lütfen Araç Servis Takip Portalı&apos;na giriş yapınız.</p>
              
              <div style="margin-top: 24px; font-size: 12px; color: #7f8c8d;">
                <p>Bu e-posta, Dino Gıda Araç Servis Takip Platformu tarafından otomatik olarak gönderilmiştir. Lütfen bu mesaja yanıt vermeyiniz.</p>
                <p style="margin-top: 8px;">
                  Saygılarımızla,<br/>
                  Dino Gıda Sanayi ve Ticaret Ltd. Şti.<br/>
                  Araç Servis Takip Platformu
                </p>
                <p style="margin-top: 6px; color: #95a5a6;">Powered by Oğuz EMÜL</p>
              </div>
            </div>
          `;

          await sendEmail(
            admin.Email,
            `Araç Servisten Döndü: ${details.Plate}`,
            emailContent
          );
        }
      }
    } catch (notifyError) {
      console.error('Admin return-from-service notification error:', notifyError);
    }

    res.json({
      message: 'Service request marked as returned',
      serviceRequest,
    });
  } catch (error) {
    console.error('Mark returned service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await connectDB();

    // Check access
    const elevated = isElevatedRole(req.user?.Role);
    const checkQuery = await pool.request()
      .input('RequestID', sql.Int, Number(id))
      .input('CompanyID', sql.Int, elevated ? null : (req.user?.CompanyID || null))
      .input('UserID', sql.Int, req.user?.UserID)
      .query(`
        SELECT sr.RequestID 
        FROM ServiceRequests sr
        JOIN Vehicles v ON sr.VehicleID = v.VehicleID
        WHERE sr.RequestID = @RequestID
        AND ${companyScopeSql(req.user?.Role, req.user?.CompanyID, 'v')}
      `);

    if (checkQuery.recordset.length === 0) {
      res.status(403).json({ error: 'You do not have permission for this service request' });
      return;
    }

    const result = await pool
      .request()
      .input('RequestID', sql.Int, id)
      .query('DELETE FROM ServiceRequests OUTPUT deleted.RequestID WHERE RequestID = @RequestID');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    // Log Audit
    await logAudit(
      req.user?.UserID,
      'DELETE_SERVICE_REQUEST',
      'ServiceRequests',
      Number(id),
      { id },
      req.ip || '0.0.0.0'
    );

    res.json({ message: 'Service request deleted successfully' });
  } catch (error) {
    console.error('Delete service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
