
import sql from 'mssql';
import { connectDB } from '../config/database';

export const riskService = {
  /**
   * Calculate risk score and category for a single vehicle
   */
  async calculateVehicleRisk(vehicleId: number): Promise<{ score: number; category: 'Green' | 'Yellow' | 'Red' }> {
    const pool = await connectDB();
    const defaultConfig = {
      AgeMaxPoints: 10,
      KmMaxPoints: 50,
      KmStepKm: 6000,
      KmMaxPoints_Passenger: 50,
      KmStepKm_Passenger: 5000,
      KmMaxPoints_LightCommercial: 50,
      KmStepKm_LightCommercial: 6000,
      KmMaxPoints_HeavyCommercial: 50,
      KmStepKm_HeavyCommercial: 10000,
      KmMaxPoints_Minibus: 50,
      KmStepKm_Minibus: 7000,
      KmMaxPoints_Other: 50,
      KmStepKm_Other: 6000,
      MaintenanceMaxPoints: 15,
      AccidentMaxPoints: 15,
      InspectionMaxPoints: 5,
      InsuranceMaxPoints: 5,
      YellowThreshold: 30,
      RedThreshold: 60,
      YearlyKmHighThreshold: 60000,
      YearlyKmMaxPoints: 10,
      CostPerKmHighThreshold: 3,
      CostPerKmMaxPoints: 10
    };

    let config = { ...defaultConfig };

    try {
      const configResult = await pool.request().query(`
        IF OBJECT_ID('dbo.RiskConfig', 'U') IS NOT NULL
        SELECT ConfigKey, ConfigValue FROM RiskConfig
      `);
      for (const row of configResult.recordset) {
        if (!row.ConfigKey) continue;
        const key = row.ConfigKey as keyof typeof defaultConfig;
        if (key in defaultConfig) {
          const num = Number(row.ConfigValue);
          if (!isNaN(num)) {
            (config as any)[key] = num;
          }
        }
      }
    } catch {
    }
    
    // 1. Get Vehicle Data (Age, KM)
    const vehicleResult = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        SELECT Year, CurrentKm, Plate, Segment FROM Vehicles WHERE VehicleID = @VehicleID
      `);
    
    if (vehicleResult.recordset.length === 0) {
      throw new Error('Vehicle not found');
    }

    const vehicle = vehicleResult.recordset[0];
    const currentYear = new Date().getFullYear();
    const age = vehicle.Year ? currentYear - vehicle.Year : 0;
    const km = vehicle.CurrentKm || 0;
    const segment: string | null = vehicle.Segment || null;

    // 2. Get Maintenance Data (Last 12 Months)
    const maintenanceResult = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        SELECT COUNT(*) as count, SUM(Cost) as totalCost
        FROM MaintenanceRecords 
        WHERE VehicleID = @VehicleID 
        AND ServiceDate >= DATEADD(year, -1, GETDATE())
      `);
    const maintenanceCount = maintenanceResult.recordset[0].count || 0;
    const maintenanceCost = maintenanceResult.recordset[0].totalCost || 0;

    // 3. Get Accident Count (Last 12 Months)
    const accidentResult = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        SELECT COUNT(*) as count 
        FROM AccidentRecords 
        WHERE VehicleID = @VehicleID 
        AND AccidentDate >= DATEADD(year, -1, GETDATE())
      `);
    const accidentCount = accidentResult.recordset[0].count || 0;

    // 4. Get Latest Inspection Status
    const inspectionResult = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        SELECT TOP 1 NextInspectionDate 
        FROM VehicleInspections 
        WHERE VehicleID = @VehicleID 
        ORDER BY InspectionDate DESC
      `);
    const nextInspectionDate = inspectionResult.recordset.length > 0 ? new Date(inspectionResult.recordset[0].NextInspectionDate) : null;

    // 5. Get Latest Insurance Status (Traffic Insurance or Kasko)
    const insuranceResult = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        SELECT TOP 1 EndDate 
        FROM InsuranceRecords 
        WHERE VehicleID = @VehicleID 
        AND EndDate > GETDATE()
        ORDER BY EndDate DESC
      `);
    const hasValidInsurance = insuranceResult.recordset.length > 0;

    // 6. Get Distance and Cost Per KM (Last 12 Months)
    const performanceResult = await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .query(`
        WITH FuelStats AS (
          SELECT VehicleID, SUM(TotalCost) as FuelCost, SUM(Liters) as TotalLiters
          FROM FuelRecords
          WHERE VehicleID = @VehicleID
          AND FuelDate >= DATEADD(year, -1, GETDATE())
          GROUP BY VehicleID
        ),
        MaintenanceStats AS (
          SELECT VehicleID, SUM(Cost) as MaintenanceCost
          FROM (
              SELECT VehicleID, Cost, ServiceDate FROM MaintenanceRecords
              UNION ALL
              SELECT VehicleID, ActualCost as Cost, COALESCE(ReturnDate, CompletedDate, RequestDate) as ServiceDate 
              FROM ServiceRequests 
              WHERE Status IN ('COMPLETED', 'RETURNED')
          ) AllMaint
          WHERE VehicleID = @VehicleID
          AND ServiceDate >= DATEADD(year, -1, GETDATE())
          GROUP BY VehicleID
        ),
        InsuranceStats AS (
          SELECT 
            VehicleID,
            SUM(Cost) as InsuranceCost
          FROM InsuranceRecords
          WHERE VehicleID = @VehicleID
          AND StartDate >= DATEADD(year, -1, GETDATE())
          GROUP BY VehicleID
        ),
        InspectionStats AS (
          SELECT VehicleID, SUM(Cost) as InspectionCost
          FROM VehicleInspections
          WHERE VehicleID = @VehicleID
          AND InspectionDate >= DATEADD(year, -1, GETDATE())
          GROUP BY VehicleID
        ),
        AccidentStats AS (
          SELECT VehicleID, SUM(Cost) as AccidentCost
          FROM AccidentRecords
          WHERE VehicleID = @VehicleID
          AND AccidentDate >= DATEADD(year, -1, GETDATE())
          GROUP BY VehicleID
        ),
        AllKm AS (
          SELECT VehicleID, FuelDate as Date, Kilometer as Km FROM FuelRecords WHERE VehicleID = @VehicleID
          UNION ALL
          SELECT VehicleID, UpdateDate as Date, Kilometer as Km FROM KmUpdates WHERE VehicleID = @VehicleID
          UNION ALL
          SELECT VehicleID, ServiceDate as Date, Kilometer as Km FROM MaintenanceRecords WHERE VehicleID = @VehicleID
        ),
        KmStats AS (
          SELECT 
            CASE 
              WHEN e.EndKm > ISNULL(s.StartKm, 0) 
                THEN e.EndKm - ISNULL(s.StartKm, 0) 
              ELSE 0 
            END as TotalKm
          FROM Vehicles v
          OUTER APPLY (
            SELECT TOP 1 Km as StartKm
            FROM AllKm ak
            WHERE ak.VehicleID = v.VehicleID AND ak.Date < DATEADD(year, -1, GETDATE())
            ORDER BY ak.Date DESC
          ) s
          OUTER APPLY (
            SELECT TOP 1 Km as EndKm
            FROM AllKm ak
            WHERE ak.VehicleID = v.VehicleID AND ak.Date <= GETDATE()
            ORDER BY ak.Date DESC
          ) e
          WHERE v.VehicleID = @VehicleID
        )
        SELECT 
          ISNULL(ks.TotalKm, 0) as TotalKm,
          (ISNULL(fs.FuelCost, 0) + ISNULL(ms.MaintenanceCost, 0) + ISNULL(is_stats.InsuranceCost, 0) + ISNULL(insp_stats.InspectionCost, 0) + ISNULL(acc_stats.AccidentCost, 0)) as TotalCost,
          CASE 
            WHEN ISNULL(ks.TotalKm, 0) > 0 THEN 
              (ISNULL(fs.FuelCost, 0) + ISNULL(ms.MaintenanceCost, 0) + ISNULL(is_stats.InsuranceCost, 0) + ISNULL(insp_stats.InspectionCost, 0) + ISNULL(acc_stats.AccidentCost, 0)) 
              / ks.TotalKm 
            ELSE 0 
          END as CostPerKm
        FROM KmStats ks
        LEFT JOIN FuelStats fs ON 1 = 1
        LEFT JOIN MaintenanceStats ms ON 1 = 1
        LEFT JOIN InsuranceStats is_stats ON 1 = 1
        LEFT JOIN InspectionStats insp_stats ON 1 = 1
        LEFT JOIN AccidentStats acc_stats ON 1 = 1
      `);

    const performanceRow = performanceResult.recordset[0] || { TotalKm: 0, CostPerKm: 0, TotalCost: 0 };
    const yearlyKm = performanceRow.TotalKm || 0;
    const costPerKm = performanceRow.CostPerKm || 0;

    let score = 0;
    const details = {
      age: 0,
      km: 0,
      maintenance: 0,
      accident: 0,
      inspection: 0,
      insurance: 0,
      yearlyKm: yearlyKm,
      costPerKm: costPerKm
    };
    const now = new Date();

    details.age = Math.min(age, config.AgeMaxPoints);
    score += details.age;

    const baseKmStep = config.KmStepKm > 0 ? config.KmStepKm : defaultConfig.KmStepKm;
    const baseKmMax = config.KmMaxPoints;

    let kmStep = baseKmStep;
    let kmMax = baseKmMax;

    if (segment) {
      const segKey = segment as 'Passenger' | 'LightCommercial' | 'HeavyCommercial' | 'Minibus' | 'Other';
      const segMax = (config as any)[`KmMaxPoints_${segKey}`];
      const segStep = (config as any)[`KmStepKm_${segKey}`];
      if (typeof segMax === 'number' && segMax > 0) kmMax = segMax;
      if (typeof segStep === 'number' && segStep > 0) kmStep = segStep;
    }

    details.km = Math.min(Math.floor(km / kmStep), kmMax);
    score += details.km;

    if (maintenanceCount > 4) details.maintenance += 6;
    else if (maintenanceCount > 2) details.maintenance += 3;

    if (maintenanceCost > 50000) details.maintenance += 9;
    else if (maintenanceCost > 20000) details.maintenance += 3;
    if (details.maintenance > config.MaintenanceMaxPoints) {
      details.maintenance = config.MaintenanceMaxPoints;
    }
    score += details.maintenance;

    details.accident = Math.min(accidentCount * 8, config.AccidentMaxPoints);
    score += details.accident;

    if (!nextInspectionDate) {
        details.inspection += 3;
    } else if (nextInspectionDate < now) {
        details.inspection += config.InspectionMaxPoints;
    } else {
        const daysToInspection = Math.ceil((nextInspectionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysToInspection < 30) details.inspection += 2;
    }
    if (details.inspection > config.InspectionMaxPoints) {
      details.inspection = config.InspectionMaxPoints;
    }
    score += details.inspection;

    if (!hasValidInsurance) {
        details.insurance += config.InsuranceMaxPoints;
    }
    score += details.insurance;

    if (yearlyKm >= config.YearlyKmHighThreshold) {
      details.km += config.YearlyKmMaxPoints;
      score += config.YearlyKmMaxPoints;
    }

    if (costPerKm >= config.CostPerKmHighThreshold) {
      details.maintenance += config.CostPerKmMaxPoints;
      score += config.CostPerKmMaxPoints;
    }

    score = Math.min(score, 100);

    let category: 'Green' | 'Yellow' | 'Red' = 'Green';
    if (score >= config.RedThreshold) category = 'Red';
    else if (score >= config.YellowThreshold) category = 'Yellow';

    // Update Vehicle Record
    await pool.request()
      .input('VehicleID', sql.Int, vehicleId)
      .input('RiskScore', sql.Float, score)
      .input('RiskCategory', sql.NVarChar(20), category)
      .input('RiskDetails', sql.NVarChar(sql.MAX), JSON.stringify(details))
      .query(`
        UPDATE Vehicles 
        SET RiskScore = @RiskScore, RiskCategory = @RiskCategory, RiskDetails = @RiskDetails
        WHERE VehicleID = @VehicleID
      `);

    return { score, category };
  },

  /**
   * Calculate and update risks for ALL vehicles
   */
  async updateAllVehicleRisks(): Promise<{ processed: number }> {
    const pool = await connectDB();
    
    const vehiclesResult = await pool.request().query('SELECT VehicleID FROM Vehicles WHERE Status = \'Active\'');
    const vehicleIds = vehiclesResult.recordset.map((v: any) => v.VehicleID);
    
    let processed = 0;
    for (const id of vehicleIds) {
      try {
        await this.calculateVehicleRisk(id);
        processed++;
      } catch (error) {
        console.error(`Error calculating risk for vehicle ${id}:`, error);
      }
    }

    return { processed };
  }
};
