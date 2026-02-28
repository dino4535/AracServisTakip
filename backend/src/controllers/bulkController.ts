
export const uploadMonthlyKm = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let importedCount = 0;
      let errors: string[] = [];

      for (const [index, row] of data.entries()) {
        const plate = (row as any)['Plate'] || (row as any)['Plaka'] || (row as any)['PLATE'] || (row as any)['PLAKA'];
        let dateVal = (row as any)['Date'] || (row as any)['Tarih'] || (row as any)['DATE'] || (row as any)['TARIH'] || (row as any)['Date (YYYY-MM-DD)'];
        const km = (row as any)['Kilometer'] || (row as any)['KM'] || (row as any)['Km'] || (row as any)['KILOMETER'];

        if (!plate || !dateVal || !km) {
          continue; // Skip invalid rows
        }

        // Parse Date
        let date: Date;
        if (typeof dateVal === 'number') {
          // Excel date serial number
          const parsed = XLSX.SSF.parse_date_code(dateVal);
          date = new Date(parsed.y, parsed.m - 1, parsed.d);
        } else {
          date = new Date(dateVal);
        }

        if (isNaN(date.getTime())) {
          errors.push(`Row ${index + 2}: Invalid date for plate ${plate}: ${dateVal}`);
          continue;
        }

        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        // Get VehicleID
        const vehicleResult = await transaction.request()
          .input('Plate', sql.NVarChar, plate)
          .query('SELECT VehicleID, CurrentKm, CompanyID FROM Vehicles WHERE Plate = @Plate');

        if (vehicleResult.recordset.length === 0) {
          errors.push(`Row ${index + 2}: Vehicle not found: ${plate}`);
          continue;
        }

        const vehicle = vehicleResult.recordset[0];

        // Permission check
        if (req.user?.Role !== 'SuperAdmin' && req.user?.CompanyID && vehicle.CompanyID !== req.user.CompanyID) {
           errors.push(`Row ${index + 2}: Permission denied for vehicle: ${plate}`);
           continue;
        }

        // Update MonthlyKmLog (Upsert)
        await transaction.request()
          .input('VehicleID', sql.Int, vehicle.VehicleID)
          .input('Month', sql.Int, month)
          .input('Year', sql.Int, year)
          .input('Kilometer', sql.Int, km)
          .input('CreatedBy', sql.Int, req.user?.UserID)
          .query(`
            MERGE MonthlyKmLog AS target
            USING (SELECT @VehicleID AS VehicleID, @Month AS Month, @Year AS Year) AS source
            ON (target.VehicleID = source.VehicleID AND target.Month = source.Month AND target.Year = source.Year)
            WHEN MATCHED THEN
              UPDATE SET Kilometer = @Kilometer, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (VehicleID, Month, Year, Kilometer, CreatedBy, CreatedAt, UpdatedAt)
              VALUES (@VehicleID, @Month, @Year, @Kilometer, @CreatedBy, GETDATE(), GETDATE());
          `);

        // Insert into KmUpdates (History)
        await transaction.request()
          .input('VehicleID', sql.Int, vehicle.VehicleID)
          .input('Kilometer', sql.Int, km)
          .input('UpdatedBy', sql.Int, req.user?.UserID)
          .input('UpdateDate', sql.DateTime, date)
          .query(`
            INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
            VALUES (@VehicleID, @Kilometer, @UpdatedBy, @UpdateDate)
          `);

        // Update CurrentKm if new value is higher
        if (km > (vehicle.CurrentKm || 0)) {
          await transaction.request()
            .input('VehicleID', sql.Int, vehicle.VehicleID)
            .input('CurrentKm', sql.Int, km)
            .query(`
              UPDATE Vehicles 
              SET CurrentKm = @CurrentKm, UpdatedAt = GETDATE()
              WHERE VehicleID = @VehicleID
            `);
        }

        importedCount++;
      }

      await transaction.commit();

      // Log Audit
      await logAudit(
        req.user?.UserID,
        'IMPORT_MONTHLY_KM',
        'MonthlyKmLog',
        0,
        { importedCount, errors },
        req.ip || '0.0.0.0'
      );

      res.json({ 
        success: true, 
        count: importedCount, 
        errors: errors.length > 0 ? errors : undefined 
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Import monthly KM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
