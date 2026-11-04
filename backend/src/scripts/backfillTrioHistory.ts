import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import sql from 'mssql';
import { connectDB } from '../config/database';
import { trioService } from '../services/trioService';

/**
 * Trio CAN bus GEÇMİŞ KM backfill.
 *
 * Her Trio'ya bağlı araç için seçilen ay aralığında, ayın İLK ve SON mutlak odometer
 * okumasını (canbus/history totalVehicleDistance/1000) çeker ve yazar:
 *   - KmUpdates  : ayın ilk + son okuması (UpdateDate = Istanbul duyar-saati) -> append-only geçmiş
 *   - MonthlyKmLog: ayın SON okuması (ay sonu mutlak KM) -> upsert (yalnızca artarsa)
 *
 * Neden ilk+son? reportController.getTrendAnalysis aylık mesafeyi AY İÇİNDE
 * (son okuma − ilk okuma) hesaplar; tek kayıt olursa mesafe 0 olur. Araç KM Geçmişi
 * (getKmRange) da aralık ilk/son okumasını kullanır.
 *
 * Vehicles.CurrentKm'ye DOKUNMAZ (geçmiş değerler zaten küçüktür).
 * Idempotent: aynı (VehicleID, UpdateDate, Kilometer) KmUpdates varsa tekrar yazmaz;
 * MonthlyKmLog MERGE yalnızca daha büyük KM'de günceller.
 * Sağlamlık: aylık mesafe > --maxkm (varsayılan 40000) veya odometer geri gitmişse ay BOZUK
 * sayılır -> yazılmaz ve (apply ise) o ayın önceki backfill satırları silinir (self-heal).
 *
 * Kullanım (araçlar TEK TEK / sıralı sorgulanır; rate-limit için gecikme + retry):
 *   npx tsx src/scripts/backfillTrioHistory.ts                       # dry-run (DB değişmez)
 *   npx tsx src/scripts/backfillTrioHistory.ts --apply               # prod DB'ye yaz
 *   npx tsx src/scripts/backfillTrioHistory.ts --from=2026-05 --to=2026-11 --apply
 *   npx tsx src/scripts/backfillTrioHistory.ts --plate="35 BYE 110"  # tek araç (test)
 *   npx tsx src/scripts/backfillTrioHistory.ts --limit=3             # ilk 3 araç (hızlı test)
 *   npx tsx src/scripts/backfillTrioHistory.ts --delay=500 --vdelay=1000  # daha nazik
 */

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const getArg = (name: string, def: string): string => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const numArg = (name: string, def: number): number => {
  const v = parseInt(getArg(name, String(def)), 10);
  return Number.isNaN(v) ? def : v;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const istanbulNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
const CURRENT_YM = `${istanbulNow.getFullYear()}-${String(istanbulNow.getMonth() + 1).padStart(2, '0')}`;

const FROM = getArg('from', '2026-05');        // Mayıs: Haziran tüketimi için baz ay
const TO = getArg('to', CURRENT_YM);
const PLATE = getArg('plate', '').trim();
const LIMIT = Math.max(0, numArg('limit', 0));            // >0 ise yalnızca ilk N araç (test)
const CALL_DELAY = Math.max(0, numArg('delay', 350));     // her API çağrısı arası bekleme (ms)
const VEHICLE_DELAY = Math.max(0, numArg('vdelay', 600)); // araçlar arası bekleme (ms)
const MAX_MONTH_KM = Math.max(1000, numArg('maxkm', 40000)); // aylık mesafe bundan büyükse CAN verisi bozuk sayılır

interface MonthSpec { year: number; month: number; }
interface EdgeReading { km: number; tsIso: string; naive: string; }
interface VehicleMonth { ym: MonthSpec; first: EdgeReading | null; last: EdgeReading | null; distance: number | null; corrupt: boolean; }

const pad = (n: number) => String(n).padStart(2, '0');
const nextMonth = (y: number, m: number): MonthSpec => (m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 });

function monthList(fromYm: string, toYm: string): MonthSpec[] {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  const out: MonthSpec[] = [];
  let y = fy, m = fm;
  while ((y < ty || (y === ty && m <= tm)) && out.length < 120) {
    out.push({ year: y, month: m });
    const nm = nextMonth(y, m); y = nm.year; m = nm.month;
  }
  return out;
}

/** Istanbul ay başlangıcını UTC ISO'ya çevirir (API ts.since/ts.until için, +03:00 -> Z). */
function monthWindowUtc(spec: MonthSpec): { since: string; until: string } {
  const sinceLocal = `${spec.year}-${pad(spec.month)}-01T00:00:00+03:00`;
  const nm = nextMonth(spec.year, spec.month);
  const untilLocal = `${nm.year}-${pad(nm.month)}-01T00:00:00+03:00`;
  const toZ = (s: string) => new Date(s).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { since: toZ(sinceLocal), until: toZ(untilLocal) };
}

/** UTC anı -> Istanbul duyar-saati 'YYYY-MM-DDTHH:mm:ss' (SQL CAST ile tz-bağımsız yazım). */
function istanbulNaive(tsIso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(tsIso));
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
}

async function getSystemUserId(pool: sql.ConnectionPool): Promise<number | null> {
  const envId = process.env.TRIO_SYNC_USER_ID;
  if (envId && !Number.isNaN(Number(envId))) return Number(envId);
  const r = await pool.request().query(`
    SELECT TOP 1 u.UserID FROM Users u
    JOIN UserRoles ur ON u.UserID = ur.UserID
    JOIN Roles r ON ur.RoleID = r.RoleID
    WHERE u.IsActive = 1
    ORDER BY CASE WHEN UPPER(REPLACE(r.Name,' ','')) IN ('SUPERADMIN','ADMIN') THEN 0 ELSE 1 END, u.UserID ASC
  `);
  return r.recordset.length > 0 ? r.recordset[0].UserID : null;
}

/** Bir araç için tüm ayların ilk/son CAN odometer okumalarını çeker (her çağrı arası gecikme). */
async function fetchVehicleMonths(trioId: string, months: MonthSpec[]): Promise<VehicleMonth[]> {
  const out: VehicleMonth[] = [];
  for (const ym of months) {
    const { since, until } = monthWindowUtc(ym);
    const firstEdge = await trioService.getCanbusOdometerEdge(trioId, since, until, 'ASC');
    await sleep(CALL_DELAY);
    const lastEdge = await trioService.getCanbusOdometerEdge(trioId, since, until, 'DESC');
    await sleep(CALL_DELAY);
    const first: EdgeReading | null = firstEdge ? { km: firstEdge.km, tsIso: firstEdge.ts!, naive: istanbulNaive(firstEdge.ts!) } : null;
    const last: EdgeReading | null = lastEdge ? { km: lastEdge.km, tsIso: lastEdge.ts!, naive: istanbulNaive(lastEdge.ts!) } : null;
    let distance: number | null = null;
    if (first && last && last.km >= first.km) distance = last.km - first.km;
    // Bozuk CAN verisi: odometer geri gitmiş veya aylık mesafe gerçek dışı büyük
    const corrupt = (!!first && !!last && last.km < first.km) || (distance != null && distance > MAX_MONTH_KM);
    out.push({ ym, first, last, distance, corrupt });
  }
  return out;
}

/** Idempotent KmUpdates insert (aynı VehicleID+UpdateDate+Kilometer varsa atlar). */
async function insertKmUpdate(pool: sql.ConnectionPool, vehicleId: number, km: number, naiveDate: string): Promise<boolean> {
  const res = await pool.request()
    .input('VehicleID', sql.Int, vehicleId)
    .input('Kilometer', sql.Int, km)
    .input('UpdateDateStr', sql.NVarChar(30), naiveDate)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM KmUpdates
        WHERE VehicleID = @VehicleID AND Kilometer = @Kilometer AND UpdateDate = CAST(@UpdateDateStr AS DATETIME)
      )
      BEGIN
        INSERT INTO KmUpdates (VehicleID, Kilometer, UpdatedBy, UpdateDate)
        VALUES (@VehicleID, @Kilometer, NULL, CAST(@UpdateDateStr AS DATETIME));
        SELECT 1 AS Inserted;
      END
      ELSE SELECT 0 AS Inserted;
    `);
  return res.recordset[0]?.Inserted === 1;
}

/** MonthlyKmLog upsert (ay sonu mutlak KM; yalnızca artarsa günceller). */
async function upsertMonthlyKm(pool: sql.ConnectionPool, vehicleId: number, month: number, year: number, km: number, createdBy: number | null): Promise<void> {
  await pool.request()
    .input('VehicleID', sql.Int, vehicleId)
    .input('Month', sql.Int, month)
    .input('Year', sql.Int, year)
    .input('Kilometer', sql.Int, km)
    .input('CreatedBy', sql.Int, createdBy)
    .query(`
      MERGE MonthlyKmLog AS target
      USING (SELECT @VehicleID AS VehicleID, @Month AS Month, @Year AS Year) AS source
      ON (target.VehicleID = source.VehicleID AND target.Month = source.Month AND target.Year = source.Year)
      WHEN MATCHED AND @Kilometer > target.Kilometer THEN
        UPDATE SET Kilometer = @Kilometer, UpdatedAt = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (VehicleID, Month, Year, Kilometer, CreatedBy, CreatedAt, UpdatedAt)
        VALUES (@VehicleID, @Month, @Year, @Kilometer, @CreatedBy, GETDATE(), GETDATE());
    `);
}

/** Bozuk ay için self-heal: bu aracın ilgili aydaki backfill satırlarını siler (KmUpdates NULL + MonthlyKmLog). */
async function deleteVehicleMonth(pool: sql.ConnectionPool, vehicleId: number, ym: MonthSpec, createdBy: number | null): Promise<void> {
  const nm = nextMonth(ym.year, ym.month);
  const startNaive = `${ym.year}-${pad(ym.month)}-01T00:00:00`;
  const endNaive = `${nm.year}-${pad(nm.month)}-01T00:00:00`;
  await pool.request()
    .input('VehicleID', sql.Int, vehicleId)
    .input('MStart', sql.NVarChar(30), startNaive)
    .input('MEnd', sql.NVarChar(30), endNaive)
    .input('Month', sql.Int, ym.month)
    .input('Year', sql.Int, ym.year)
    .input('CreatedBy', sql.Int, createdBy)
    .query(`
      DELETE FROM KmUpdates
      WHERE VehicleID = @VehicleID AND UpdatedBy IS NULL
        AND UpdateDate >= CAST(@MStart AS DATETIME) AND UpdateDate < CAST(@MEnd AS DATETIME);
      DELETE FROM MonthlyKmLog
      WHERE VehicleID = @VehicleID AND Month = @Month AND Year = @Year AND CreatedBy = @CreatedBy;
    `);
}

const run = async () => {
  console.log(`\n🚗 Trio CAN geçmiş KM backfill (SIRALI / tek tek)`);
  console.log(`   MOD        : ${APPLY ? 'APPLY (DB yazılacak)' : 'DRY-RUN (DB değişmez)'}`);
  console.log(`   Aralık     : ${FROM} → ${TO}`);
  console.log(`   Gecikme    : çağrı ${CALL_DELAY}ms, araç arası ${VEHICLE_DELAY}ms`);
  console.log(`   KM tavanı  : ${MAX_MONTH_KM.toLocaleString('tr-TR')} km/ay (üstü bozuk sayılır)`);
  if (PLATE) console.log(`   Plaka      : ${PLATE}`);
  if (LIMIT > 0) console.log(`   Limit      : ilk ${LIMIT} araç`);

  const pool = await connectDB();
  const systemUserId = await getSystemUserId(pool);

  const wherePlate = PLATE
    ? 'AND REPLACE(UPPER(LTRIM(RTRIM(v.Plate))), \' \', \'\') = @PlateNorm'
    : '';
  const dbRes = await pool.request()
    .input('PlateNorm', sql.NVarChar(20), PLATE.replace(/\s/g, '').toUpperCase())
    .query(`
      SELECT v.VehicleID, v.Plate, v.TrioVehicleId
      FROM Vehicles v
      WHERE v.TrioVehicleId IS NOT NULL AND v.Status != 'Deleted' ${wherePlate}
      ORDER BY v.Plate ASC
    `);
  const all = dbRes.recordset as any[];
  const targets = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  console.log(`   Bağlı araç : ${all.length}${LIMIT > 0 ? ` (işlenecek: ${targets.length})` : ''}`);

  if (targets.length === 0) {
    console.log('⚠️  Trio\'ya bağlı araç bulunamadı. Önce trio:link çalıştırın.');
    await pool.close();
    return;
  }

  const months = monthList(FROM, TO);
  console.log(`   Aylar      : ${months.map(m => `${m.year}-${pad(m.month)}`).join(', ')}\n`);

  let vehiclesWithData = 0, corruptMonths = 0;
  let insertedKm = 0, skippedKm = 0, mergedMonth = 0, plannedKmRows = 0, plannedMonthRows = 0;
  const perMonthDistance: Record<string, number> = {};
  const samples: string[] = [];
  const startedAt = Date.now();

  // Araçları TEK TEK (sıralı) işle: çek -> (apply ise) hemen yaz -> ilerleme logla
  for (let i = 0; i < targets.length; i++) {
    const v = targets[i];
    const monthsData = await fetchVehicleMonths(v.TrioVehicleId, months);
    const hasAny = monthsData.some(m => m.first || m.last);
    if (hasAny) vehiclesWithData++;

    for (const m of monthsData) {
      const ymk = `${m.ym.year}-${pad(m.ym.month)}`;

      // Bozuk ay: yazma, (apply ise) varsa eski backfill satırlarını sil
      if (m.corrupt) {
        corruptMonths++;
        if (APPLY) await deleteVehicleMonth(pool, v.VehicleID, m.ym, systemUserId);
        continue;
      }

      if (m.distance != null) perMonthDistance[ymk] = (perMonthDistance[ymk] || 0) + m.distance;

      const readings: EdgeReading[] = [];
      if (m.first) readings.push(m.first);
      if (m.last && (!m.first || m.last.naive !== m.first.naive || m.last.km !== m.first.km)) readings.push(m.last);
      const monthKm = m.last?.km ?? m.first?.km ?? null;

      if (APPLY) {
        for (const rd of readings) {
          const ins = await insertKmUpdate(pool, v.VehicleID, rd.km, rd.naive);
          if (ins) insertedKm++; else skippedKm++;
        }
        if (monthKm != null && systemUserId) {
          await upsertMonthlyKm(pool, v.VehicleID, m.ym.month, m.ym.year, monthKm, systemUserId);
          mergedMonth++;
        }
      } else {
        plannedKmRows += readings.length;
        if (monthKm != null) plannedMonthRows++;
      }
    }

    if (samples.length < 3 && hasAny) {
      samples.push(`   ${v.Plate}: ` + monthsData.map(m =>
        m.corrupt ? `${pad(m.ym.month)}:BOZUK(${m.first?.km}→${m.last?.km})`
        : m.distance != null ? `${pad(m.ym.month)}:${m.distance}km(${m.first?.km}→${m.last?.km})` : `${pad(m.ym.month)}:veri yok`
      ).join('  '));
    }

    const distLog = monthsData.map(m => m.corrupt ? `${pad(m.ym.month)}:BOZUK` : (m.distance != null ? `${pad(m.ym.month)}:${m.distance}` : `${pad(m.ym.month)}:-`)).join(' ');
    console.log(`[${i + 1}/${targets.length}] ${v.Plate} → ${distLog}  (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);

    if (i < targets.length - 1) await sleep(VEHICLE_DELAY);
  }

  console.log('\n===== ÖZET =====');
  console.log(`Veri olan araç      : ${vehiclesWithData}/${targets.length}`);
  console.log(`Bozuk ay (atlandı)  : ${corruptMonths}${APPLY ? ' (eski satırlar temizlendi)' : ''}  [eşik ${MAX_MONTH_KM.toLocaleString('tr-TR')} km/ay]`);
  console.log(`\nFilo toplam aylık mesafe (CAN):`);
  for (const ym of Object.keys(perMonthDistance).sort()) {
    console.log(`   ${ym}: ${perMonthDistance[ym].toLocaleString('tr-TR')} km`);
  }
  console.log('\nÖrnek araçlar (aylık mesafe):');
  samples.forEach(s => console.log(s));

  if (APPLY) {
    console.log('\n===== YAZMA SONUCU =====');
    console.log(`KmUpdates eklenen   : ${insertedKm}`);
    console.log(`KmUpdates atlanan   : ${skippedKm} (zaten var)`);
    console.log(`MonthlyKmLog upsert : ${mergedMonth}`);
    console.log('\n✅ Backfill tamamlandı (DB yazıldı).');
  } else {
    console.log('\n===== DRY-RUN (yazılmadı) =====');
    console.log(`KmUpdates satırı    : ~${plannedKmRows} (ay içi ilk+son)`);
    console.log(`MonthlyKmLog satırı : ~${plannedMonthRows} (ay sonu)`);
    console.log('\n👀 DRY-RUN tamam. DB değişmedi. Yazmak için --apply ekleyin.');
  }

  await pool.close();
};

run().catch(async err => {
  console.error('❌ Backfill hatası:', err);
  process.exitCode = 1;
});
