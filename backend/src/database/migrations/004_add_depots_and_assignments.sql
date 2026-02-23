-- Create Depots table
CREATE TABLE Depots (
    DepotID INT IDENTITY(1,1) PRIMARY KEY,
    CompanyID INT NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    City NVARCHAR(50),
    Address NVARCHAR(255),
    FOREIGN KEY (CompanyID) REFERENCES Companies(CompanyID)
);

-- Add DepotID to Vehicles table
ALTER TABLE Vehicles ADD DepotID INT;
ALTER TABLE Vehicles ADD CONSTRAINT FK_Vehicles_Depots FOREIGN KEY (DepotID) REFERENCES Depots(DepotID);

-- Create UserDepots table for assigning users to depots
CREATE TABLE UserDepots (
    UserDepotID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    DepotID INT NOT NULL,
    FOREIGN KEY (UserID) REFERENCES Users(UserID),
    FOREIGN KEY (DepotID) REFERENCES Depots(DepotID)
);

-- Insert 'Bermer' company if not exists
IF NOT EXISTS (SELECT 1 FROM Companies WHERE Name = 'Bermer')
BEGIN
    INSERT INTO Companies (Name, TaxNumber, Address, Phone)
    VALUES ('Bermer', '0987654321', 'Ankara, Türkiye', '+90 312 555 0002');
END

-- Insert sample depots for Dino Gıda (assuming CompanyID 1, but we'll lookup)
DECLARE @DinoID INT;
SELECT @DinoID = CompanyID FROM Companies WHERE Name = 'Dino Gıda';

IF @DinoID IS NOT NULL
BEGIN
    INSERT INTO Depots (CompanyID, Name, City) VALUES 
    (@DinoID, 'Dino Merkez Depo', 'İstanbul'),
    (@DinoID, 'Dino Anadolu Depo', 'İstanbul'),
    (@DinoID, 'Dino Avrupa Depo', 'İstanbul'),
    (@DinoID, 'Dino İzmir Depo', 'İzmir'),
    (@DinoID, 'Dino Ankara Depo', 'Ankara');
END

-- Insert sample depots for Bermer
DECLARE @BermerID INT;
SELECT @BermerID = CompanyID FROM Companies WHERE Name = 'Bermer';

IF @BermerID IS NOT NULL
BEGIN
    INSERT INTO Depots (CompanyID, Name, City) VALUES 
    (@BermerID, 'Bermer Merkez Depo', 'Ankara'),
    (@BermerID, 'Bermer İstanbul Depo', 'İstanbul');
END
