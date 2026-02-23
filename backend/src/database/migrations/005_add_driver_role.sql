
IF NOT EXISTS (SELECT 1 FROM Roles WHERE Name = 'Driver')
BEGIN
    INSERT INTO Roles (Name, Description)
    VALUES ('Driver', 'Araç Sürücüsü');
END
