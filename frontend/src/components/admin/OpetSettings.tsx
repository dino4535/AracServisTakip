
import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import { fuelService } from '../../services/fuelService';
import Button from '../common/Button';
import Input from '../common/Input';
import { Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

const OpetSettings = () => {
  const [autoSync, setAutoSync] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const value = await adminService.getSetting('opet_auto_sync');
      setAutoSync(value === 'true');
    } catch (error) {
      console.error('Error fetching Opet settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      await adminService.updateSetting('opet_auto_sync', String(autoSync));
      setMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving Opet settings:', error);
      setMessage({ type: 'error', text: 'Ayarlar kaydedilirken bir hata oluştu.' });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncLoading(true);
      setMessage(null);
      
      const result = await fuelService.syncOpetData(
        startDate || undefined, 
        endDate || undefined
      );

      const totalCount = Array.isArray(result) 
        ? result.reduce((acc: number, curr: any) => acc + (curr.count || 0), 0)
        : (result.results || []).reduce((acc: number, curr: any) => acc + (curr.count || 0), 0);
      
      setMessage({ 
        type: 'success', 
        text: `Senkronizasyon tamamlandı. Toplam ${totalCount} yeni kayıt eklendi.` 
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      setMessage({ type: 'error', text: 'Senkronizasyon sırasında bir hata oluştu.' });
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-6">Opet Web Servis Ayarları</h2>

      {message && (
        <div className={`p-4 mb-6 rounded-md flex items-center ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} className="mr-2" /> : <AlertCircle size={20} className="mr-2" />}
          {message.text}
        </div>
      )}

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
            
            <Button 
              variant="primary" 
              onClick={handleSaveSettings} 
              disabled={loading}
            >
              <Save size={18} className="mr-2" />
              Kaydet
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Otomatik mod açık olduğunda, sistem her gün belirtilen saatte o güne ait verileri Opet servisinden çeker.
          </p>
        </div>

        {/* Manual Sync Section */}
        <div>
          <h3 className="text-lg font-medium mb-4">Manuel Tetikleme</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <Input
                label="Başlangıç Tarihi"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                label="Bitiş Tarihi"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Button 
                variant="secondary" 
                onClick={handleManualSync} 
                disabled={syncLoading}
              >
                <RefreshCw size={18} className={`mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
                {syncLoading ? 'Çekiliyor...' : 'Verileri Şimdi Çek'}
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Tarih aralığı seçilmezse son 3 günün verileri kontrol edilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpetSettings;
