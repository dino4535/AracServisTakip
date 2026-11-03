import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import { trioService, TrioStatus } from '../../services/trioService';
import Button from '../common/Button';
import { Save, RefreshCw, CheckCircle, AlertCircle, Radio } from 'lucide-react';

const TrioSettings = () => {
  const [autoSync, setAutoSync] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [status, setStatus] = useState<TrioStatus | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [settingValue, statusData] = await Promise.all([
        adminService.getSetting('trio_auto_sync').catch(() => null),
        trioService.getStatus().catch(() => null),
      ]);
      setAutoSync(settingValue === null ? (statusData?.autoSync ?? false) : settingValue === 'true');
      setStatus(statusData);
    } catch (error) {
      console.error('Error fetching Trio settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      await adminService.updateSetting('trio_auto_sync', String(autoSync));
      setMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving Trio settings:', error);
      setMessage({ type: 'error', text: 'Ayarlar kaydedilirken bir hata oluştu.' });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncLoading(true);
      setMessage(null);
      const { result } = await trioService.syncKm();
      setMessage({
        type: 'success',
        text: `Senkron tamamlandı. ${result.updated} araç güncellendi, ${result.skippedLower} atlandı (daha düşük), ${result.canbusReadings}/${result.totalVehicles} CAN okuması.`,
      });
      await fetchAll();
    } catch (error: any) {
      console.error('Trio sync error:', error);
      const detail = error?.response?.data?.error || error?.response?.data?.detail;
      setMessage({ type: 'error', text: detail || 'Senkronizasyon sırasında bir hata oluştu.' });
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-6">Trio Mobil GPS / KM Ayarları</h2>

      {message && (
        <div className={`p-4 mb-6 rounded-md flex items-center ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} className="mr-2" /> : <AlertCircle size={20} className="mr-2" />}
          {message.text}
        </div>
      )}

      {/* Connection Status */}
      <div className="border-b pb-6 mb-6">
        <h3 className="text-lg font-medium mb-4">Bağlantı Durumu</h3>
        {status ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex items-center text-sm text-gray-500 mb-1">
                <Radio size={16} className="mr-2" /> API Bağlantısı
              </div>
              <div className={`text-lg font-semibold ${status.connected ? 'text-green-600' : 'text-red-600'}`}>
                {status.configured ? (status.connected ? 'Bağlı' : 'Bağlanamadı') : 'Tanımlı Değil'}
              </div>
              {status.connectionError && (
                <div className="text-xs text-red-500 mt-1 break-words">{status.connectionError}</div>
              )}
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-sm text-gray-500 mb-1">Trio Araç Sayısı</div>
              <div className="text-lg font-semibold text-neutral-900">
                {status.trioVehicleCount ?? '-'}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-sm text-gray-500 mb-1">DB Eşleşmesi</div>
              <div className="text-lg font-semibold text-neutral-900">
                {status.linkedVehicles} / {status.totalVehicles}
              </div>
              <div className="text-xs text-gray-500 mt-1">araç Trio ID ile bağlı</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Durum yükleniyor...</div>
        )}
      </div>

      <div className="space-y-8">
        {/* Automatic Sync Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-medium mb-4">Otomatik Senkronizasyon</h3>
          <div className="flex items-center space-x-4">
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                />
                <div className={`block w-14 h-8 rounded-full ${autoSync ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${autoSync ? 'transform translate-x-6' : ''}`}></div>
              </div>
              <div className="ml-3 text-gray-700 font-medium">
                Her gün 23:55'te otomatik çalıştır
              </div>
            </label>

            <Button variant="primary" onClick={handleSaveSettings} disabled={loading}>
              <Save size={18} className="mr-2" />
              Kaydet
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Otomatik mod açık olduğunda, sistem her gün 23:55'te tüm filonun güncel KM değerini Trio CAN bus raporundan çeker.
            KM yalnızca mevcut değerden büyükse güncellenir (monoton koruma).
          </p>
        </div>

        {/* Manual Sync Section */}
        <div>
          <h3 className="text-lg font-medium mb-4">Manuel Tetikleme</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <Button variant="secondary" onClick={handleManualSync} disabled={syncLoading || !status?.configured}>
              <RefreshCw size={18} className={`mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
              {syncLoading ? 'Senkronize ediliyor...' : 'KM\'leri Şimdi Senkronize Et'}
            </Button>
            <p className="text-sm text-gray-500 mt-2">
              Tüm araçların güncel kilometre değerini Trio CAN bus (gerçek ECU odometer) raporundan çekip veritabanına yazar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrioSettings;
