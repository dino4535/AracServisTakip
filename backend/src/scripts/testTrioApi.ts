import { trioService } from '../services/trioService';

/**
 * Trio API baglanti testi (DB'ye DOKUNMAZ).
 *   npx tsx src/scripts/testTrioApi.ts
 * Adimlar: token al -> araçları sayfalı çek -> ilk 5 aracın güncel KM'sini getir.
 */
const run = async () => {
  console.log('1) Token alınıyor...');
  const token = await trioService.getToken();
  console.log(`   ✅ Token: ${token.slice(0, 8)}...`);

  console.log('2) Araç listesi çekiliyor (sayfalı)...');
  const vehicles = await trioService.listAllVehicles();
  console.log(`   ✅ Toplam araç: ${vehicles.length}`);
  console.log('   Örnek:', vehicles.slice(0, 3).map(v => ({ _id: v._id, plate: v.licensePlate })));

  console.log('3) İlk 5 aracın son konum/KM raporu...');
  const sample = vehicles.slice(0, 5).map(v => v._id);
  const locations = await trioService.getLatestLocations(sample);
  for (const loc of locations) {
    console.log(`   ${loc.vehicle?.licensePlate} -> KM(mileage)=${loc.mileage}  ts=${loc.ts}  ignition=${loc.ignition}`);
  }

  console.log('\n✅ Trio API çalışıyor ve doğru formatta veri dönüyor.');
  process.exit(0);
};

run().catch(err => {
  console.error('❌ Trio API test hatası:', err);
  process.exit(1);
});
