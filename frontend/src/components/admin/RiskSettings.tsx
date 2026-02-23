import { useEffect, useState } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../services/api';

interface RiskConfigItem {
  ConfigKey: string;
  ConfigValue: string;
}

const RiskSettings = () => {
  const [items, setItems] = useState<RiskConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const groupedLabels: Record<string, string> = {
    AgeMaxPoints: 'Yaş Maks Puan',
    KmMaxPoints: 'KM Maks Puan (Genel)',
    KmStepKm: 'KM Adımı (Genel)',
    KmMaxPoints_Passenger: 'Binek KM Maks Puan',
    KmStepKm_Passenger: 'Binek KM Adımı',
    KmMaxPoints_LightCommercial: 'Hafif Ticari KM Maks Puan',
    KmStepKm_LightCommercial: 'Hafif Ticari KM Adımı',
    KmMaxPoints_HeavyCommercial: 'Ağır Ticari KM Maks Puan',
    KmStepKm_HeavyCommercial: 'Ağır Ticari KM Adımı',
    KmMaxPoints_Minibus: 'Minibüs KM Maks Puan',
    KmStepKm_Minibus: 'Minibüs KM Adımı',
    KmMaxPoints_Other: 'Diğer KM Maks Puan',
    KmStepKm_Other: 'Diğer KM Adımı',
    MaintenanceMaxPoints: 'Bakım Maks Puan',
    AccidentMaxPoints: 'Kaza Maks Puan',
    InspectionMaxPoints: 'Muayene Maks Puan',
    InsuranceMaxPoints: 'Sigorta Maks Puan',
    YellowThreshold: 'Sarı Eşik',
    RedThreshold: 'Kırmızı Eşik',
    YearlyKmHighThreshold: 'Yıllık KM Eşiği',
    YearlyKmMaxPoints: 'Yıllık KM Ek Puan',
    CostPerKmHighThreshold: 'KM Başına Maliyet Eşiği',
    CostPerKmMaxPoints: 'KM Başına Maliyet Ek Puan'
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get<RiskConfigItem[]>('/risk-config');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching risk config:', error);
      setMessage({ type: 'error', text: 'Risk ayarları yüklenemedi.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleChange = (key: string, value: string) => {
    setItems(prev =>
      prev.map(item => (item.ConfigKey === key ? { ...item, ConfigValue: value } : item))
    );
  };

  const handleSave = async (key: string) => {
    const item = items.find(i => i.ConfigKey === key);
    if (!item) return;

    try {
      setSavingKey(key);
      setMessage(null);
      await api.put(`/risk-config/${encodeURIComponent(key)}`, { value: item.ConfigValue });
      setMessage({ type: 'success', text: 'Ayar başarıyla güncellendi.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving risk config:', error);
      setMessage({ type: 'error', text: 'Ayar kaydedilirken bir hata oluştu.' });
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="text-neutral-500">Risk ayarları yükleniyor...</div>
      </div>
    );
  }

  const sortedItems = [...items].sort((a, b) => a.ConfigKey.localeCompare(b.ConfigKey));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Risk Ayarları</h2>
      </div>

      {message && (
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedItems.map(item => (
          <div
            key={item.ConfigKey}
            className="flex items-center space-x-3 p-3 border border-neutral-200 rounded-lg"
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-800">
                {groupedLabels[item.ConfigKey] || item.ConfigKey}
              </div>
              <div className="mt-1">
                <Input
                  value={item.ConfigValue}
                  onChange={e => handleChange(item.ConfigKey, e.target.value)}
                />
              </div>
            </div>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSave(item.ConfigKey)}
                disabled={savingKey === item.ConfigKey}
              >
                <Save className="w-4 h-4 mr-1" />
                Kaydet
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiskSettings;

