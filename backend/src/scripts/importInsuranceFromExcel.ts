import dotenv from 'dotenv';
import path from 'path';
import xlsx from 'xlsx';
import sql from 'mssql';
import { connectDB } from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ExcelRow {
  'POLİÇE TİPİ'?: string;
  'POLİÇE NO'?: number | string;
  'SİGORTA ŞİRKETİ'?: string;
  ACENTE?: string;
  PLAKA?: string;
  'DÜZENLEME TARİH'?: number | string;
  'POL.BŞL.TARİH'?: number | string;
  'POL.BİT.TARİH'?: number | string;
  'PRİM TUTARI'?: number | string;
  'ÖDEME BANKA'?: string;
  'K.KART NO'?: string;
  'ÖDEME ŞEKLİ'?: string;
}

interface ExistingPolicy {
  InsuranceID: number;
  VehicleID: number;
  Type: string | null;
  PolicyNumber: string | null;
  StartDate: Date;
  EndDate: Date;
}

const normalizeType = (type: string | null | undefined): string => {
  if (!type) return '';
  const t = type.toString().trim().toUpperCase();
  if (['TSP', 'TRAFFIC', 'TRAFIK', 'TRAFİK SİGORTASI', 'TRAFIK SIGORTASI'].includes(t)) {
    return 'TRAFFIC';
  }
  if (['KSP', 'KASKO', 'KASKO SİGORTASI', 'KASKO SIGORTASI'].includes(t)) {
    return 'KASKO';
  }
  return t;
};

const makePolicyKey = (vehicleId: number, policyNumber: string | null, type: string | null | undefined): string => {
  const num = policyNumber || '';
  const t = normalizeType(type);
  return `${vehicleId}|${num}|${t}`;
};

const excelDateToJSDate = (excelDate: number | string | undefined): Date | null => {
  if (excelDate === undefined || excelDate === null) return null;
  if (typeof excelDate === 'string') {
    const parsed = new Date(excelDate);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const result = new Date(epoch.getTime() + excelDate * 24 * 60 * 60 * 1000);
  return result;
};

const main = async () => {
  try {
    const filePath = path.join(__dirname, '../../../SigortaKasko.xlsx');
    console.log('Excel dosyası:', filePath);

    const workbook = xlsx.readFile(filePath);
    const rows: ExcelRow[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetRows = xlsx.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });
      console.log(`Sheet: ${sheetName}, satır: ${sheetRows.length}`);
      rows.push(...sheetRows);
    }

    console.log('Toplam satır (tüm sayfalar):', rows.length);

    if (rows.length === 0) {
      console.log('Sheet boş, işlem yapılmadı.');
      process.exit(0);
    }

    const pool = await connectDB();

    const vehiclesResult = await pool.request().query(`
      SELECT VehicleID, Plate FROM Vehicles
    `);
    const vehicleMap = new Map<string, number>();
    for (const v of vehiclesResult.recordset) {
      vehicleMap.set((v.Plate as string).toUpperCase().replace(/\s+/g, ''), v.VehicleID as number);
    }

    const existingPoliciesResult = await pool.request().query(`
      SELECT InsuranceID, VehicleID, Type, PolicyNumber, StartDate, EndDate
      FROM InsuranceRecords
    `);
    const existingPoliciesByKey = new Map<string, ExistingPolicy[]>();
    for (const r of existingPoliciesResult.recordset as any[]) {
      const vehicleId = r.VehicleID as number;
      const policyNumber = r.PolicyNumber ? String(r.PolicyNumber) : null;
      const type = r.Type as string | null;
      const key = makePolicyKey(vehicleId, policyNumber, type);
      if (!existingPoliciesByKey.has(key)) {
        existingPoliciesByKey.set(key, []);
      }
      existingPoliciesByKey.get(key)!.push({
        InsuranceID: r.InsuranceID,
        VehicleID: vehicleId,
        Type: type,
        PolicyNumber: policyNumber,
        StartDate: r.StartDate,
        EndDate: r.EndDate,
      });
    }

    const existingCompaniesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.InsuranceCompanies', 'U') IS NOT NULL
      BEGIN
        SELECT Name FROM InsuranceCompanies
      END
      ELSE
      BEGIN
        SELECT DISTINCT InsuranceCompany as Name FROM InsuranceRecords WHERE InsuranceCompany IS NOT NULL
      END
    `);
    const companySet = new Set<string>();
    for (const c of existingCompaniesResult.recordset) {
      if (c.Name) {
        companySet.add((c.Name as string).toUpperCase().trim());
      }
    }

    const typeSet = new Set<string>();
    const existingTypesResult = await pool.request().query(`
      SELECT DISTINCT Type FROM InsuranceRecords WHERE Type IS NOT NULL
    `);
    for (const t of existingTypesResult.recordset) {
      if (t.Type) {
        typeSet.add((t.Type as string).toUpperCase().trim());
      }
    }

    let createdRecords = 0;
    let updatedRecords = 0;
    let skippedNoVehicle = 0;
    let skippedOlderOrSame = 0;

    for (const row of rows) {
      const rawPlate = row.PLAKA;
      if (!rawPlate) {
        continue;
      }

      const normalizedPlate = rawPlate.toString().toUpperCase().replace(/\s+/g, '');
      const vehicleId = vehicleMap.get(normalizedPlate);
      if (!vehicleId) {
        skippedNoVehicle++;
        continue;
      }

      const policyNumberRaw = row['POLİÇE NO'];
      const policyNumber = policyNumberRaw !== undefined && policyNumberRaw !== null ? String(policyNumberRaw) : null;

      const typeRaw = row['POLİÇE TİPİ'] || '';
      const companyRaw = row['SİGORTA ŞİRKETİ'] || '';

      const type = typeRaw ? typeRaw.toString().trim() : '';
      const insuranceCompany = companyRaw ? companyRaw.toString().trim() : '';

      const startDate = excelDateToJSDate(row['POL.BŞL.TARİH'] as any);
      const endDate = excelDateToJSDate(row['POL.BİT.TARİH'] as any);

      const costRaw = row['PRİM TUTARI'];
      const cost = typeof costRaw === 'number'
        ? costRaw
        : parseFloat(String(costRaw || '0').replace(',', '.')) || 0;

      const notesParts: string[] = [];
      if (row.ACENTE) notesParts.push(`Acente: ${row.ACENTE}`);
      if (row['ÖDEME BANKA']) notesParts.push(`Banka: ${row['ÖDEME BANKA']}`);
      if (row['ÖDEME ŞEKLİ']) notesParts.push(`Ödeme Şekli: ${row['ÖDEME ŞEKLİ']}`);
      if (row['K.KART NO']) notesParts.push(`Kart: ${row['K.KART NO']}`);
      const notes = notesParts.join(' | ') || null;

      if (type) {
        const key = type.toUpperCase();
        if (!typeSet.has(key)) {
          typeSet.add(key);
        }
      }

      if (insuranceCompany) {
        const key = insuranceCompany.toUpperCase();
        if (!companySet.has(key)) {
          companySet.add(key);
        }
      }

      if (!startDate || !endDate) {
        continue;
      }

      // Eğer poliçe numarası yoksa, sadece yeni kayıt olarak ekle (eskiyi silemeyiz)
      if (!policyNumber) {
        const insertResult = await pool.request()
          .input('VehicleID', sql.Int, vehicleId)
          .input('Type', sql.NVarChar(50), type || null)
          .input('PolicyNumber', sql.NVarChar(50), policyNumber)
          .input('InsuranceCompany', sql.NVarChar(100), insuranceCompany || null)
          .input('StartDate', sql.DateTime2, startDate)
          .input('EndDate', sql.DateTime2, endDate)
          .input('Cost', sql.Decimal(10, 2), cost)
          .input('Notes', sql.NVarChar(500), notes)
          .query(`
            INSERT INTO InsuranceRecords (VehicleID, Type, PolicyNumber, InsuranceCompany, StartDate, EndDate, Cost, Notes)
            OUTPUT inserted.InsuranceID, inserted.VehicleID, inserted.Type, inserted.PolicyNumber, inserted.StartDate, inserted.EndDate
            VALUES (@VehicleID, @Type, @PolicyNumber, @InsuranceCompany, @StartDate, @EndDate, @Cost, @Notes)
          `);

        const inserted = insertResult.recordset[0] as ExistingPolicy;
        createdRecords++;
        continue;
      }

      const key = makePolicyKey(vehicleId, policyNumber, type || null);
      const existingList = existingPoliciesByKey.get(key) || [];

      let latestExisting: ExistingPolicy | null = null;
      for (const p of existingList) {
        if (!latestExisting || new Date(p.EndDate).getTime() < new Date(p.EndDate).getTime()) {
          latestExisting = p;
        }
      }

      if (latestExisting && endDate.getTime() <= new Date(latestExisting.EndDate).getTime()) {
        skippedOlderOrSame++;
        continue;
      }

      if (existingList.length > 0) {
        const ids = existingList.map((p) => p.InsuranceID).filter((id) => !!id);
        if (ids.length > 0) {
          await pool.request().query(`DELETE FROM InsuranceRecords WHERE InsuranceID IN (${ids.join(',')})`);
        }
      }

      const insertResult = await pool.request()
        .input('VehicleID', sql.Int, vehicleId)
        .input('Type', sql.NVarChar(50), type || null)
        .input('PolicyNumber', sql.NVarChar(50), policyNumber)
        .input('InsuranceCompany', sql.NVarChar(100), insuranceCompany || null)
        .input('StartDate', sql.DateTime2, startDate)
        .input('EndDate', sql.DateTime2, endDate)
        .input('Cost', sql.Decimal(10, 2), cost)
        .input('Notes', sql.NVarChar(500), notes)
        .query(`
          INSERT INTO InsuranceRecords (VehicleID, Type, PolicyNumber, InsuranceCompany, StartDate, EndDate, Cost, Notes)
          OUTPUT inserted.InsuranceID, inserted.VehicleID, inserted.Type, inserted.PolicyNumber, inserted.StartDate, inserted.EndDate
          VALUES (@VehicleID, @Type, @PolicyNumber, @InsuranceCompany, @StartDate, @EndDate, @Cost, @Notes)
        `);

      const inserted = insertResult.recordset[0] as ExistingPolicy;
      existingPoliciesByKey.set(key, [inserted]);
      if (latestExisting) {
        updatedRecords++;
      } else {
        createdRecords++;
      }
    }

    console.log('Oluşturulan yeni sigorta kaydı sayısı:', createdRecords);
    console.log('Güncellenen (eski poliçe silinip yenisi eklenen) kayıt sayısı:', updatedRecords);
    console.log('Eşleşmeyen plaka nedeniyle atlanan satır sayısı:', skippedNoVehicle);
    console.log('Daha eski veya aynı tarihli olduğu için atlanan poliçe satırı sayısı:', skippedOlderOrSame);

    process.exit(0);
  } catch (error) {
    console.error('Sigorta kayıtlarını içe aktarma hatası:', error);
    process.exit(1);
  }
};

main();
