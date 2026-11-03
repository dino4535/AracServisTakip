import sql from 'mssql';

/**
 * Bir aracın LastServiceKm ve NextMaintenanceKm değerlerini bakım kayıtlarıyla senkronize eder.
 *
 * - LastServiceKm  : tarihe göre en son bakım kaydının (MaintenanceRecords) KM'si.
 * - NextMaintenanceKm: explicitNextServiceKm verildiyse o; verilmediyse LastServiceKm + bakım aralığı
 *   (Vehicles.MaintenanceIntervalKm, NULL ise varsayılan 15000). Hiç bakım kaydı yoksa mevcut değer korunur.
 *
 * Bakım kaydı oluşturma/güncelleme ve servisten dönüş akışlarından sonra çağrılmalıdır.
 */
export const syncVehicleMaintenanceKm = async (
  pool: sql.ConnectionPool,
  vehicleId: number,
  explicitNextServiceKm?: number | null
): Promise<void> => {
  await pool
    .request()
    .input('VehicleID', sql.Int, vehicleId)
    .input('ExplicitNext', sql.Int, explicitNextServiceKm ?? null)
    .query(`
      DECLARE @lsk INT, @interval INT, @next INT;

      SELECT @lsk = (
        SELECT TOP 1 Kilometer
        FROM MaintenanceRecords
        WHERE VehicleID = @VehicleID AND Kilometer IS NOT NULL AND Kilometer > 0
        ORDER BY ServiceDate DESC
      );

      SELECT @interval = ISNULL(MaintenanceIntervalKm, 15000)
      FROM Vehicles
      WHERE VehicleID = @VehicleID;

      SET @next = CASE
        WHEN @ExplicitNext IS NOT NULL THEN @ExplicitNext
        WHEN @lsk IS NOT NULL THEN @lsk + @interval
        ELSE NULL
      END;

      UPDATE Vehicles
      SET LastServiceKm = @lsk,
          NextMaintenanceKm = ISNULL(@next, NextMaintenanceKm)
      WHERE VehicleID = @VehicleID;
    `);
};
