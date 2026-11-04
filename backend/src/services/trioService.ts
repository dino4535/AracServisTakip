import { connectDB } from '../config/database';
import sql from 'mssql';
import { logAudit } from './auditService';

/**
 * Trio Mobil GPS Tracking Platform API entegrasyonu.
 * Doküman: https://triomobil.stoplight.io/docs/fleet
 *
 * Akış:
 *  1) POST /auth            -> token (48 saat geçerli, Authorization header ile gönderilir)
 *  2) GET  /vehicles        -> sayfalı araç listesi (_id + licensePlate), X-TRIO-Total-Count header
 *  3) GET  /reports/vehicle/locations/latest?vehicleId=a,b,c  -> mileage (KM)
 */

const BASE_URL = process.env.TRIO_API_BASE_URL || 'https://telematik.triomobil.com/fleet/v1';
const VEHICLES_PER_PAGE = 50;      // Trio: sayfa başına maksimum 50 araç
const LOCATIONS_BATCH_SIZE = 50;   // Latest Locations: tek istekte en fazla 50 araç _id
const CANBUS_BATCH_SIZE = 20;      // CAN bus raporu: tek istekte en fazla 20 araç _id

export interface TrioVehicle {
  _id: string;
  licensePlate: string;
  make?: string;
  model?: string;
  mileageOffset?: number;
}

export interface TrioLatestLocation {
  ts: string;
  vehicle: { _id: string; licensePlate?: string };
  mileage?: number;
  speed?: number;
  ignition?: string;
}

/** CAN bus'tan çıkarılan gerçek odometer (km) ve ölçüm zamanı. */
export interface TrioOdometer {
  km: number;
  ts?: string;
}

export interface TrioSyncResult {
  totalVehicles: number;
  canbusReadings: number;
  updated: number;
  skippedLower: number;
  skippedNoChange: number;
  unmatched: string[];
}

/** Plaka normalizasyonu: sadece harf+rakam, büyük harfe çevrilir (Türkçe karakter güvenli). */
export const normalizePlate = (plate?: string | null): string => {
  if (!plate) return '';
  return plate
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'I')
    .replace(/Ş/g, 'S').replace(/ş/g, 'S')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/ü/g, 'U')
    .replace(/Ö/g, 'O').replace(/ö/g, 'O')
    .replace(/Ç/g, 'C').replace(/ç/g, 'C')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
};

class TrioService {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  /** Token alır; geçerli bir cache varsa onu döner. Token 48 saat geçerli, 47 saatte bir yenilenir. */
  async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.token && now < this.tokenExpiresAt) {
      return this.token;
    }

    const username = process.env.TRIO_USERNAME;
    const password = process.env.TRIO_PASSWORD;
    if (!username || !password) {
      throw new Error('Trio credentials missing. Set TRIO_USERNAME and TRIO_PASSWORD in .env');
    }

    const res = await fetch(`${BASE_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Trio auth failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      throw new Error('Trio auth response did not contain a token');
    }

    this.token = data.token;
    this.tokenExpiresAt = now + 47 * 60 * 60 * 1000;
    return this.token;
  }

  /** Authorization header'lı GET. 401 gelirse token yenilenip bir kez tekrar denenir. */
  private async getJson(url: string): Promise<{ body: any; headers: Headers }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken(attempt > 0);
      const res = await fetch(url, { headers: { Authorization: token } });

      if (res.status === 401 && attempt === 0) {
        this.token = null; // süresi dolmuş olabilir, yenile
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Trio GET ${url} failed: ${res.status} ${text}`);
      }
      return { body: await res.json(), headers: res.headers };
    }
    throw new Error(`Trio GET ${url} failed after token refresh`);
  }

  /** Tüm araçları sayfalar halinde çeker. */
  async listAllVehicles(): Promise<TrioVehicle[]> {
    const all: TrioVehicle[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (all.length < total && page <= 200) {
      const url = `${BASE_URL}/vehicles?_perPage=${VEHICLES_PER_PAGE}&_page=${page}`;
      const { body, headers } = await this.getJson(url);

      const totalCountHeader = headers.get('X-TRIO-Total-Count');
      if (totalCountHeader) {
        const parsed = parseInt(totalCountHeader, 10);
        if (!Number.isNaN(parsed)) total = parsed;
      }

      if (!Array.isArray(body) || body.length === 0) break;

      for (const v of body as any[]) {
        if (!v?._id) continue;
        all.push({
          _id: v._id,
          licensePlate: v.licensePlate || '',
          make: v.spec?.make,
          model: v.spec?.model,
          mileageOffset: v.attrs?.mileageOffset,
        });
      }

      if (body.length < VEHICLES_PER_PAGE) break;
      page++;
    }

    return all;
  }

  /** Araç _id listesi için son konum/KM raporunu çeker (50'li gruplar halinde, virgülle ayrılmış). */
  async getLatestLocations(vehicleIds: string[]): Promise<TrioLatestLocation[]> {
    const out: TrioLatestLocation[] = [];
    for (let i = 0; i < vehicleIds.length; i += LOCATIONS_BATCH_SIZE) {
      const chunk = vehicleIds.slice(i, i + LOCATIONS_BATCH_SIZE);
      const url = `${BASE_URL}/reports/vehicle/locations/latest?vehicleId=${chunk.join(',')}`;
      const { body } = await this.getJson(url);
      if (Array.isArray(body)) out.push(...(body as TrioLatestLocation[]));
    }
    return out;
  }

  /**
   * CAN bus "Latest CAN Bus Measurements" raporundan gerçek ECU odometer'ını çeker.
   * `totalVehicleDistance` ölçümü METRE cinsindendir -> /1000 ile km'ye çevrilir.
   * Bu, GPS tabanlı `mileage` alanından çok daha güvenilirdir (kalibrasyondan bağımsız).
   * NOT: CAN bus raporu istek başına en fazla 20 araç döndürür.
   */
  async getLatestCanbusOdometers(vehicleIds: string[]): Promise<Map<string, TrioOdometer>> {
    const out = new Map<string, TrioOdometer>();
    for (let i = 0; i < vehicleIds.length; i += CANBUS_BATCH_SIZE) {
      const chunk = vehicleIds.slice(i, i + CANBUS_BATCH_SIZE);
      const url = `${BASE_URL}/reports/vehicle/canbus/latest?vehicleId=${chunk.join(',')}`;
      let body: any;
      try {
        body = (await this.getJson(url)).body;
      } catch (err) {
        console.error(`⚠️  CAN bus batch (${i}) alınamadı:`, (err as Error).message);
        continue;
      }
      if (!Array.isArray(body)) continue;
      for (const row of body as any[]) {
        const id = row?.vehicle?._id;
        if (!id || !Array.isArray(row.measurement)) continue;
        const m = row.measurement.find((x: any) => x?.key === 'totalVehicleDistance');
        if (!m || typeof m.value !== 'number') continue;
        out.set(id, { km: Math.round(m.value / 1000), ts: m.ts });
      }
    }
    return out;
  }

  /**
   * CAN bus history raporundan, verilen [since,until) aralığındaki İLK (ASC) veya SON (DESC)
   * mutlak odometer okumasını döner. `totalVehicleDistance` METRE -> /1000 km.
   * Geçmiş aylık KM backfill'i için kullanılır (ay içi ilk/son -> aylık mesafe).
   * NOT: canbus/history TEK araç kabul eder (çoklu id yok) ve `_limit>500` için `measurement.key` şart.
   */
  async getCanbusOdometerEdge(
    vehicleId: string,
    sinceIso: string,
    untilIso: string,
    order: 'ASC' | 'DESC',
    retries = 4
  ): Promise<TrioOdometer | null> {
    const url = `${BASE_URL}/reports/vehicle/canbus/history?vehicleId=${vehicleId}`
      + `&ts.since=${sinceIso}&ts.until=${untilIso}`
      + `&measurement.key=totalVehicleDistance&_sortOrder=${order}&_limit=1`;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const body = (await this.getJson(url)).body;
        if (!Array.isArray(body) || body.length === 0) return null; // veri yok (hata değil)
        const row = body[0];
        if (!Array.isArray(row?.measurement)) return null;
        const m = row.measurement.find((x: any) => x?.key === 'totalVehicleDistance');
        if (!m || typeof m.value !== 'number') return null;
        return { km: Math.round(m.value / 1000), ts: row.ts };
      } catch (err) {
        lastErr = err as Error;
        const status = Number(/failed:\s*(\d{3})/.exec(lastErr.message)?.[1] || 0);
        const permanent = status >= 400 && status < 500 && status !== 429 && status !== 403;
        if (permanent || attempt === retries - 1) break; // 400 gibi kalıcı hatada boşuna deneme
        const base = (status === 429 || status === 403) ? 3000 : 900; // rate-limit -> daha uzun bekle
        await new Promise(r => setTimeout(r, base * Math.pow(2, attempt)));
      }
    }
    console.error(`⚠️  canbus/history (${order} ${sinceIso}) alınamadı [${vehicleId}]:`, lastErr?.message);
    return null;
  }

  /** MonthlyKmLog.CreatedBy NOT NULL olduğu için sistem senkronu adına kullanılacak kullanıcıyı bulur. */
  private async getSystemUserId(pool: sql.ConnectionPool): Promise<number | null> {
    const envId = process.env.TRIO_SYNC_USER_ID;
    if (envId && !Number.isNaN(Number(envId))) return Number(envId);

    const result = await pool.request().query(`
      SELECT TOP 1 u.UserID
      FROM Users u
      JOIN UserRoles ur ON u.UserID = ur.UserID
      JOIN Roles r ON ur.RoleID = r.RoleID
      WHERE u.IsActive = 1
      ORDER BY CASE WHEN UPPER(REPLACE(r.Name,' ','')) IN ('SUPERADMIN','ADMIN') THEN 0 ELSE 1 END, u.UserID ASC
    `);
    return result.recordset.length > 0 ? result.recordset[0].UserID : null;
  }

  /**
   * Tüm filonun KM'sini Trio CAN bus raporundan çekip DB'yi günceller.
   * KM kaynağı: CAN bus `totalVehicleDistance` (metre) / 1000 -> gerçek ECU odometer.
   * - Vehicles.CurrentKm: yalnızca yeni değer daha büyükse güncellenir (monoton koruma).
   * - KmUpdates: her gerçek güncellemede geçmiş kaydı.
   * - MonthlyKmLog: içinde bulunulan ay için upsert (yalnızca artarsa).
   */
  async syncAll(): Promise<TrioSyncResult> {
    const vehicles = await this.listAllVehicles();
    const ids = vehicles.map(v => v._id);
    const odometers = await this.getLatestCanbusOdometers(ids);

    const idToVehicle = new Map<string, TrioVehicle>();
    for (const v of vehicles) idToVehicle.set(v._id, v);

    const pool = await connectDB();
    const systemUserId = await this.getSystemUserId(pool);

    // DB araçlarını yükle (TrioVehicleId + normalize plaka indeksleri)
    const dbResult = await pool.request().query(`
      SELECT VehicleID, Plate, CurrentKm, TrioVehicleId, Status
      FROM Vehicles
    `);

    const byTrioId = new Map<string, any>();
    const byPlate = new Map<string, any>();
    for (const row of dbResult.recordset as any[]) {
      if (row.TrioVehicleId) byTrioId.set(row.TrioVehicleId, row);
      const np = normalizePlate(row.Plate);
      if (np && !byPlate.has(np)) byPlate.set(np, row);
    }

    // Europe/Istanbul'a göre güncel ay/yıl
    const now = new Date();
    const istanbul = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const month = istanbul.getMonth() + 1;
    const year = istanbul.getFullYear();

    const result: TrioSyncResult = {
      totalVehicles: vehicles.length,
      canbusReadings: odometers.size,
      updated: 0,
      skippedLower: 0,
      skippedNoChange: 0,
      unmatched: [],
    };

    for (const [trioId, odo] of odometers) {
      const trioVehicle = idToVehicle.get(trioId);
      const plate = trioVehicle?.licensePlate || '';
      const np = normalizePlate(plate);

      const dbVehicle = byTrioId.get(trioId) || byPlate.get(np);
      if (!dbVehicle) {
        result.unmatched.push(plate || trioId);
        continue;
      }

      const newKm = odo.km;
      if (!Number.isFinite(newKm)) continue;

      const currentKm = Number(dbVehicle.CurrentKm) || 0;

      if (newKm < currentKm) {
        // Monoton koruma: KM geriye düşürülmez (stale CAN okuması vb.)
        result.skippedLower++;
        console.warn(`⚠️  Trio CAN KM daha düşük, atlandı: ${plate} (CAN=${newKm}, DB=${currentKm})`);
        continue;
      }

      if (newKm === currentKm) {
        result.skippedNoChange++;
        continue; // değişiklik yok, gereksiz KmUpdates kaydı atmayalım
      }

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // 1) CurrentKm güncelle (yalnızca artarsa)
        await transaction.request()
          .input('VehicleID', sql.Int, dbVehicle.VehicleID)
          .input('Km', sql.Int, newKm)
          .query(`
            UPDATE Vehicles
            SET CurrentKm = @Km, UpdatedAt = GETDATE()
            WHERE VehicleID = @VehicleID AND @Km >= ISNULL(CurrentKm, 0)
          `);

        // 1b) TrioVehicleId henüz bağlı değilse (plaka ile eşleştiyse) kalıcı olarak bağla
        if (!dbVehicle.TrioVehicleId) {
          await transaction.request()
            .input('VehicleID', sql.Int, dbVehicle.VehicleID)
            .input('TrioId', sql.NVarChar(24), trioId)
            .query(`UPDATE Vehicles SET TrioVehicleId = @TrioId WHERE VehicleID = @VehicleID`);
          dbVehicle.TrioVehicleId = trioId;
          byTrioId.set(trioId, dbVehicle);
        }

        // 2) KmUpdates geçmiş kaydı (sistem senkronu -> UpdatedBy NULL)
        await transaction.request()
          .input('VehicleID', sql.Int, dbVehicle.VehicleID)
          .input('Km', sql.Int, newKm)
          .query(`
            INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
            VALUES (@VehicleID, @Km, NULL, GETDATE())
          `);

        // 3) MonthlyKmLog upsert (yalnızca artarsa)
        if (systemUserId) {
          await transaction.request()
            .input('VehicleID', sql.Int, dbVehicle.VehicleID)
            .input('Month', sql.Int, month)
            .input('Year', sql.Int, year)
            .input('Km', sql.Int, newKm)
            .input('CreatedBy', sql.Int, systemUserId)
            .query(`
              MERGE MonthlyKmLog AS target
              USING (SELECT @VehicleID AS VehicleID, @Month AS Month, @Year AS Year) AS source
              ON (target.VehicleID = source.VehicleID AND target.Month = source.Month AND target.Year = source.Year)
              WHEN MATCHED AND @Km > target.Kilometer THEN
                UPDATE SET Kilometer = @Km, UpdatedAt = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (VehicleID, Month, Year, Kilometer, CreatedBy, CreatedAt, UpdatedAt)
                VALUES (@VehicleID, @Month, @Year, @Km, @CreatedBy, GETDATE(), GETDATE());
            `);
        }

        await transaction.commit();
        result.updated++;
        dbVehicle.CurrentKm = newKm;
      } catch (err) {
        await transaction.rollback();
        console.error(`❌ Trio sync DB hatası (${plate}):`, err);
      }
    }

    await logAudit(
      systemUserId || undefined,
      'TRIO_KM_SYNC',
      'Vehicles',
      0,
      { ...result, month, year, source: 'CAN_BUS' },
      '0.0.0.0'
    );

    return result;
  }
}

export const trioService = new TrioService();
