import { trioService } from '../services/trioService';

/**
 * Manuel Trio KM senkronizasyonu (test/bakim icin).
 * Cron'u beklemeden bir kez calistirir.
 *   npx tsx src/scripts/runTrioSync.ts
 */
const run = async () => {
  console.log('🚀 Trio KM senkronizasyonu manuel olarak başlatılıyor...');
  const result = await trioService.syncAll();
  console.log('✅ Senkronizasyon tamamlandı:');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
};

run().catch(err => {
  console.error('❌ Trio senkronizasyon hatası:', err);
  process.exit(1);
});
