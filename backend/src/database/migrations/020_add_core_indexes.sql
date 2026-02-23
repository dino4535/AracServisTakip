-- Core performance indexes for frequently used queries
-- Vehicles
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_Vehicles_Plate' 
    AND object_id = OBJECT_ID(N'[dbo].[Vehicles]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Vehicles_Plate
  ON Vehicles (Plate);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_Vehicles_CompanyID' 
    AND object_id = OBJECT_ID(N'[dbo].[Vehicles]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Vehicles_CompanyID
  ON Vehicles (CompanyID);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_Vehicles_DepotID' 
    AND object_id = OBJECT_ID(N'[dbo].[Vehicles]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Vehicles_DepotID
  ON Vehicles (DepotID);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_Vehicles_AssignedDriverID' 
    AND object_id = OBJECT_ID(N'[dbo].[Vehicles]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Vehicles_AssignedDriverID
  ON Vehicles (AssignedDriverID);
END;

-- FuelRecords (vehicle + date range queries)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_FuelRecords_VehicleID_FuelDate' 
    AND object_id = OBJECT_ID(N'[dbo].[FuelRecords]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_FuelRecords_VehicleID_FuelDate
  ON FuelRecords (VehicleID, FuelDate);
END;

-- MaintenanceRecords
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_MaintenanceRecords_VehicleID_ServiceDate' 
    AND object_id = OBJECT_ID(N'[dbo].[MaintenanceRecords]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_MaintenanceRecords_VehicleID_ServiceDate
  ON MaintenanceRecords (VehicleID, ServiceDate);
END;

-- InsuranceRecords
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_InsuranceRecords_VehicleID_EndDate' 
    AND object_id = OBJECT_ID(N'[dbo].[InsuranceRecords]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_InsuranceRecords_VehicleID_EndDate
  ON InsuranceRecords (VehicleID, EndDate);
END;

-- VehicleInspections
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_VehicleInspections_VehicleID_InspectionDate' 
    AND object_id = OBJECT_ID(N'[dbo].[VehicleInspections]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_VehicleInspections_VehicleID_InspectionDate
  ON VehicleInspections (VehicleID, InspectionDate);
END;

-- AccidentRecords
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_AccidentRecords_VehicleID_AccidentDate' 
    AND object_id = OBJECT_ID(N'[dbo].[AccidentRecords]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AccidentRecords_VehicleID_AccidentDate
  ON AccidentRecords (VehicleID, AccidentDate);
END;

-- ServiceRequests
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_ServiceRequests_VehicleID_Status_RequestDate' 
    AND object_id = OBJECT_ID(N'[dbo].[ServiceRequests]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_ServiceRequests_VehicleID_Status_RequestDate
  ON ServiceRequests (VehicleID, Status, RequestDate);
END;

-- AuditLogs
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name = 'IX_AuditLogs_UserID_CreatedAt' 
    AND object_id = OBJECT_ID(N'[dbo].[AuditLogs]')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AuditLogs_UserID_CreatedAt
  ON AuditLogs (UserID, CreatedAt);
END;

