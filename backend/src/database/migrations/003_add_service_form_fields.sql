ALTER TABLE ServiceRequests ADD ServiceCompany NVARCHAR(255);
ALTER TABLE ServiceRequests ADD DriverName NVARCHAR(100);
ALTER TABLE ServiceRequests ADD DeliveredBy NVARCHAR(100);
ALTER TABLE ServiceRequests ADD ExtraWork NVARCHAR(MAX);
