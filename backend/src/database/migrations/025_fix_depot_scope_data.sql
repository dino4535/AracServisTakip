-- 025: Depo/şirket kapsamı veri düzeltmeleri + UserDepots UNIQUE kısıtı
-- Yetki denetiminde tespit edilen veri tutarsızlıklarını giderir. Tüm bloklar idempotenttir.

-- 1) Depo adlarındaki fazla boşluklar temizlenir (ör. 'Bermer ').
--    NOT: SQL Server'da 'Bermer ' = 'Bermer' TRUE döner; bu yüzden DATALENGTH ile karşılaştırılır.
UPDATE Depots
SET Name = LTRIM(RTRIM(Name))
WHERE DATALENGTH(Name) <> DATALENGTH(LTRIM(RTRIM(Name)));
GO

-- 2) Aracın şirketi ile bağlı olduğu deponun şirketi farklıysa depo ataması kaldırılır.
--    Bulgu: Dino Gıda (CompanyID 1) araçları Bermer (CompanyID 2) deposuna atanmıştı;
--    depo filtresi şirket filtresinin yerine geçtiği için bu araçlar Bermer kullanıcılarına görünüyordu.
--    Yeni kapsam kuralında DepotID NULL olan araçlar kendi şirketinin kullanıcılarına görünmeye devam eder.
UPDATE v
SET v.DepotID = NULL
FROM Vehicles v
JOIN Depots d ON v.DepotID = d.DepotID
WHERE v.CompanyID <> d.CompanyID;
GO

-- 3) UserDepots: aynı kullanıcı-depo çiftinin birden fazla kez eklenmesini engelleyen UNIQUE kısıtı.
--    Kısıt eklenmeden önce varsa duplicate satırlar temizlenir (en küçük UserDepotID korunur).
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_UserDepots_User_Depot')
BEGIN
    DELETE ud
    FROM UserDepots ud
    WHERE EXISTS (
        SELECT 1 FROM UserDepots x
        WHERE x.UserID = ud.UserID
          AND x.DepotID = ud.DepotID
          AND x.UserDepotID < ud.UserDepotID
    );

    ALTER TABLE dbo.UserDepots ADD CONSTRAINT UQ_UserDepots_User_Depot UNIQUE (UserID, DepotID);
END
GO
