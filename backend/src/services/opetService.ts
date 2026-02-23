
import { parseStringPromise, processors } from 'xml2js';
import { connectDB } from '../config/database';
import sql from 'mssql';

interface OpetCredentials {
  companyId: number;
  companyName: string;
  username: string;
  password: string;
  fleetCode: number;
  customerCode: number;
}

const OPET_CONFIGS: OpetCredentials[] = [
  {
    companyId: 2, // Bermer (Assuming ID 2, need to verify or fetch from DB by name)
    companyName: 'Bermer',
    username: '169975',
    password: process.env.OPET_BERMER_PASSWORD || 'Dino3545.',
    fleetCode: 279362,
    customerCode: 169975
  },
  {
    companyId: 1, // Dino (Assuming ID 1)
    companyName: 'Dino Gıda',
    username: '169973',
    password: process.env.OPET_DINO_PASSWORD || 'Dino3545.',
    fleetCode: 279363,
    customerCode: 169973
  }
];

const SOAP_URL = 'https://rapor.otobil.com/OtobilWebService/Reports.asmx';

export class OpetService {
  
  /**
   * Tüm tanımlı şirketler için yakıt verilerini senkronize eder
   */
  async syncAllCompanies(startDate: Date, endDate: Date) {
    console.log('Starting Opet sync for all companies...');
    const results = [];
    
    for (const config of OPET_CONFIGS) {
      try {
        console.log(`Processing company: ${config.companyName}`);
        const result = await this.syncCompany(config, startDate, endDate);
        results.push({ company: config.companyName, ...result });
      } catch (error: any) {
        console.error(`Error processing company ${config.companyName}:`, error.message);
        results.push({ company: config.companyName, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Tek bir şirket için senkronizasyon yapar
   */
  private async syncCompany(config: OpetCredentials, startDate: Date, endDate: Date) {
    // 1. Login to get token
    const token = await this.login(config);
    if (!token) {
      throw new Error('Login failed: No token received');
    }
    console.log(`Login successful for ${config.companyName}, token received.`);

    // 2. Fetch transactions
    const transactions = await this.getTransactions(config, token, startDate, endDate);
    console.log(`Fetched ${transactions.length} transactions for ${config.companyName}`);

    // 3. Save to database
    const savedCount = await this.processFuelData(transactions, config.companyId);
    
    return { success: true, count: savedCount };
  }

  private async login(config: OpetCredentials): Promise<string> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <Login xmlns="http://tempuri.org/">
      <userName>${config.username}</userName>
      <password>${config.password}</password>
    </Login>
  </soap12:Body>
</soap12:Envelope>`;

    try {
      const response = await fetch(SOAP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': 'http://tempuri.org/Login'
        },
        body: xml
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Login SOAP request failed: ${response.status} ${text}`);
      }

      const text = await response.text();
      const result = await parseStringPromise(text, { 
        explicitArray: false, 
        ignoreAttrs: true,
        tagNameProcessors: [processors.stripPrefix]
      });

      // Envelope.Body.LoginResponse.LoginResult
      const token = result?.Envelope?.Body?.LoginResponse?.LoginResult;
      
      console.log('Login Result:', token);

      if (!token) {
        throw new Error('Login response did not contain a token');
      }

      if (token.startsWith('Hata')) {
         throw new Error(`Opet Login Error: ${token}`);
      }

      return token;
    } catch (error) {
      console.error('Login Error:', error);
      throw error;
    }
  }

  private async getTransactions(config: OpetCredentials, token: string, startDate: Date, endDate: Date): Promise<any[]> {
    // Format dates as YYYY-MM-DDTHH:mm:ss
    const startStr = startDate.toISOString().split('.')[0];
    const endStr = endDate.toISOString().split('.')[0];

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <Sales xmlns="http://tempuri.org/">
      <fromDate>${startStr}</fromDate>
      <toDate>${endStr}</toDate>
      <fleetCode>${config.fleetCode}</fleetCode>
      <tokenKey>${token}</tokenKey>
    </Sales>
  </soap12:Body>
</soap12:Envelope>`;

    try {
      const response = await fetch(SOAP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': 'http://tempuri.org/Sales'
        },
        body: xml
      });

      if (!response.ok) {
          const text = await response.text();
          throw new Error(`SOAP request failed: ${response.status} ${response.statusText} - ${text}`);
      }

      const text = await response.text();
      // Explicitly handle namespaces and arrays
      const result = await parseStringPromise(text, { 
        explicitArray: false, 
        ignoreAttrs: true,
        tagNameProcessors: [processors.stripPrefix]
      });
      
      // Navigate response: Envelope.Body.SalesResponse.SalesResult
      const body = result.Envelope.Body;
      const responseBody = body.SalesResponse;
      const salesResult = responseBody.SalesResult;
      
      // The result contains a diffgram.
      // With stripPrefix, diffgr:diffgram becomes diffgram
      const diffgram = salesResult.diffgram;
      
      if (!diffgram || !diffgram.NewDataSet || !diffgram.NewDataSet.Table) {
          return [];
      }

      let items = diffgram.NewDataSet.Table;
      if (!Array.isArray(items)) {
          items = [items];
      }
      
      // Map to standard format expected by processFuelData
      return items.map((item: any) => ({
        PlateNr: item.LicensePlateNr,
        TrxDate: item.SaleEnd,
        Volume: item.Volume,
        UnitPrice: item.UnitPrice,
        TotalAmount: item.Total,
        StationName: item.StationName,
        ProductName: item.ProductName,
        Odometer: item.Odometer,
        TransactionID: `OPET-${item.LicensePlateNr}-${item.SaleEnd}-${item.ECRReceiptNr}`
      }));
    } catch (error) {
      console.error('SOAP Call Error:', error);
      throw error;
    }
  }

  async processFuelData(data: any[], companyId: number) {
    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);
    let savedCount = 0;
    
    try {
      await transaction.begin();

      for (const record of data) {
        // Record format from WSDL:
        // PlateNr, Volume (Liters), TotalAmount, UnitPrice, StationName, TransactionID, TrxDate
        
        const plate = record.PlateNr?.replace(/\s+/g, '').toUpperCase();
        const transactionId = record.TransactionID;
        
        if (!plate || !transactionId) continue;

        // 1. Check if record already exists
        const existingCheck = await transaction.request()
          .input('ExternalID', sql.NVarChar(100), transactionId)
          .query('SELECT FuelRecordID FROM FuelRecords WHERE ExternalID = @ExternalID');
          
        if (existingCheck.recordset.length > 0) {
          continue; // Skip existing
        }

        // 2. Find vehicle
        const vehicleCheck = await transaction.request()
          .input('Plate', sql.NVarChar(20), plate)
          .query('SELECT VehicleID, CompanyID FROM Vehicles WHERE REPLACE(Plate, \' \', \'\') = @Plate');

        let vehicleId: number;

        if (vehicleCheck.recordset.length === 0) {
          console.log(`Vehicle not found for plate: ${plate}. Creating new vehicle...`);
          
          // Create new vehicle
          const insertVehicle = await transaction.request()
            .input('Plate', sql.NVarChar(20), plate)
            .input('CompanyID', sql.Int, companyId)
            .input('CurrentKm', sql.Int, record.Odometer ? parseInt(record.Odometer) : 0)
            .query(`
              INSERT INTO Vehicles (Plate, CompanyID, Status, CurrentKm, CreatedAt, UpdatedAt, VIN)
              VALUES (@Plate, @CompanyID, 'Active', @CurrentKm, GETDATE(), GETDATE(), @Plate);
              SELECT SCOPE_IDENTITY() AS VehicleID;
            `);
            
           vehicleId = insertVehicle.recordset[0].VehicleID;
        } else {
           vehicleId = vehicleCheck.recordset[0].VehicleID;
        }

        // 3. Insert record
        await transaction.request()
          .input('VehicleID', sql.Int, vehicleId)
          .input('FuelDate', sql.DateTime2, new Date(record.TrxDate))
          .input('Liters', sql.Decimal(10, 2), parseFloat(record.Volume.replace(',', '.')))
          .input('CostPerLiter', sql.Decimal(10, 2), parseFloat(record.UnitPrice.replace(',', '.')))
          .input('TotalCost', sql.Decimal(10, 2), parseFloat(record.TotalAmount.replace(',', '.')))
          .input('FuelStation', sql.NVarChar(100), record.StationName)
          .input('Kilometer', sql.Int, record.Odometer ? parseInt(record.Odometer) : 0)
            .input('ExternalID', sql.NVarChar(100), transactionId)
            .input('Source', sql.NVarChar(50), 'Opet')
            .input('ProductName', sql.NVarChar(100), record.ProductName || '')
            .query(`
              INSERT INTO FuelRecords (
              VehicleID, FuelDate, Liters, CostPerLiter, TotalCost, 
              FuelStation, Kilometer, ExternalID, Source, ProductName
            )
            VALUES (
              @VehicleID, @FuelDate, @Liters, @CostPerLiter, @TotalCost, 
              @FuelStation, @Kilometer, @ExternalID, @Source, @ProductName
            )
          `);
          
        savedCount++;
      }

      await transaction.commit();
      return savedCount;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export const opetService = new OpetService();
