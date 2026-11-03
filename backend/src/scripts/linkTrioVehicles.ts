import { connectDB } from '../config/database';
import sql from 'mssql';
import { trioService, normalizePlate } from '../services/trioService';

/**
 * Tek seferlik baglama (linking) script'i.
 * Trio'daki araclarin _id degerlerini, normalize edilmis plaka eslesmesiyle
 * Vehicles.TrioVehicleId kolonuna yazar.
 *
 * Kullanim:
 *   npx tsx src/scripts/linkTrioVehicles.ts           -> dry-run (sadece rapor, DB'ye yazmaz)
 *   npx tsx src/scripts/linkTrioVehicles.ts --apply    -> gercekten gunceller
 *
 * NOT: Calistirmadan once 023_add_trio_vehicle_id migration'i uygulanmis olmali.
 */
const run = async () => {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '🔧 MOD: APPLY (DB guncellenecek)' : '👀 MOD: DRY-RUN (DB degismeyecek)');

  const pool = await connectDB();

  console.log('Trio araçları çekiliyor...');
  const trioVehicles = await trioService.listAllVehicles();
  console.log(`Trio'dan ${trioVehicles.length} araç geldi.`);

  const dbResult = await pool.request().query(`
    SELECT VehicleID, Plate, TrioVehicleId, Status FROM Vehicles
  `);
  const dbVehicles = dbResult.recordset as any[];

  const byPlate = new Map<string, any>();
  for (const row of dbVehicles) {
    const np = normalizePlate(row.Plate);
    if (np && !byPlate.has(np)) byPlate.set(np, row);
  }

  let matched = 0;
  let updated = 0;
  const unmatchedTrio: string[] = [];
  const ambiguous: string[] = [];

  for (const tv of trioVehicles) {
    const np = normalizePlate(tv.licensePlate);
    const dbVehicle = byPlate.get(np);

    if (!dbVehicle) {
      unmatchedTrio.push(`${tv.licensePlate} (${tv._id})`);
      continue;
    }

    matched++;

    if (dbVehicle.TrioVehicleId === tv._id) {
      continue; // zaten doğru bağlanmış
    }
    if (dbVehicle.TrioVehicleId && dbVehicle.TrioVehicleId !== tv._id) {
      ambiguous.push(`${tv.licensePlate}: DB'de ${dbVehicle.TrioVehicleId}, Trio'da ${tv._id}`);
    }

    if (apply) {
      await pool.request()
        .input('VehicleID', sql.Int, dbVehicle.VehicleID)
        .input('TrioId', sql.NVarChar(24), tv._id)
        .query(`UPDATE Vehicles SET TrioVehicleId = @TrioId WHERE VehicleID = @VehicleID`);
    }
    updated++;
  }

  const linkedCount = dbVehicles.filter(v => v.TrioVehicleId).length;
  const unlinkedDb = dbVehicles.filter(v => !v.TrioVehicleId).map(v => v.Plate);

  console.log('\n===== ÖZET =====');
  console.log(`Trio aracı          : ${trioVehicles.length}`);
  console.log(`DB aracı            : ${dbVehicles.length}`);
  console.log(`Plaka ile eşleşen   : ${matched}`);
  console.log(`Yazılan/güncellenen : ${updated} ${apply ? '(uygulandı)' : '(dry-run)'}`);
  console.log(`DB'de bağlı (toplam): ${apply ? linkedCount : '(dry-run, değişmedi)'}`);

  if (unmatchedTrio.length) {
    console.log(`\n⚠️  Trio'da olup DB'de eşleşmeyen plakalar (${unmatchedTrio.length}):`);
    unmatchedTrio.forEach(p => console.log('   - ' + p));
  }
  if (ambiguous.length) {
    console.log(`\n⚠️  Çakışan TrioVehicleId (${ambiguous.length}):`);
    ambiguous.forEach(p => console.log('   - ' + p));
  }
  if (unlinkedDb.length) {
    console.log(`\nℹ️  DB'de Trio'ya bağlanmamış araç plakaları (${unlinkedDb.length}):`);
    unlinkedDb.forEach(p => console.log('   - ' + p));
  }

  process.exit(0);
};

run().catch(err => {
  console.error('❌ Linking hatası:', err);
  process.exit(1);
});
