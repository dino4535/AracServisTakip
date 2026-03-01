import { useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { vehicleService } from '../services/vehicleService';
import { usePermissions } from '../hooks/usePermissions';
import { useAuthStore } from '../store/authStore';
import { Car, Wrench, Shield, ClipboardCheck, Fuel, AlertTriangle, ClipboardList, Gauge, Search } from 'lucide-react';
import { formatCurrency, formatDate, formatKm } from '../utils/formatUtils';

type OverviewMaintenance = any;
type OverviewInsurance = any;
type OverviewInspection = any;
type OverviewFuel = any;
type OverviewAccident = any;
type OverviewServiceRequest = any;
type OverviewMonthlyKm = any;

interface OverviewVehicle {
  VehicleID: number;
  Plate: string;
  Make?: string;
  Model?: string;
  Year?: number;
  FuelType?: string;
  CurrentKm?: number;
  LastServiceKm?: number;
  Status?: string;
  CompanyName?: string;
  DepotName?: string;
  DriverName?: string;
  ManagerName?: string;
}

interface VehicleOverviewResponse {
  vehicle: OverviewVehicle | null;
  maintenance: OverviewMaintenance[];
  insurance: OverviewInsurance[];
  inspections: OverviewInspection[];
  fuel: OverviewFuel[];
  accidents: OverviewAccident[];
  serviceRequests: OverviewServiceRequest[];
  monthlyKm: OverviewMonthlyKm[];
}

const VehicleOverview = () => {
  const { isSuperAdmin } = usePermissions();
  const { user } = useAuthStore();

  const isCompanyAdmin = (() => {
    const roles = user?.Roles || [];
    if (Array.isArray(roles)) {
      return roles.some(r => r === 'Admin' || r === 'ADMIN' || r === 'admin');
    }
    if (typeof roles === 'string') {
      return roles === 'Admin' || roles === 'ADMIN' || roles === 'admin';
    }
    return false;
  })();

  const [plateInput, setPlateInput] = useState('');
  const [data, setData] = useState<VehicleOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAccess = isSuperAdmin || isCompanyAdmin;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const plate = plateInput.trim();
    if (!plate) {
      setError('Lütfen bir plaka girin');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await vehicleService.getVehicleOverviewByPlate(plate);
      setData(result);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setData(null);
        setError('Araç bulunamadı veya bu araca erişim yetkiniz yok');
      } else {
        setError('Veri alınırken bir hata oluştu');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canAccess) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-neutral-500 text-center">
            Bu sayfayı sadece şirket yöneticileri ve Super Adminler görüntüleyebilir.
          </div>
        </div>
      </Layout>
    );
  }

  const vehicle = data?.vehicle || null;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Car className="w-6 h-6 text-primary-600" />
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Araç Bilgi Kartı</h1>
              <p className="text-neutral-500 text-sm">
                Plakaya göre sistemdeki tüm modüllerden araç bilgilerini görüntüle
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 flex items-center space-x-3">
          <div className="relative w-64">
            <input
              type="text"
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              placeholder="Örn: 34ABC123"
              className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm uppercase"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Yükleniyor...' : 'Araç Getir'}
          </Button>
          {error && (
            <span className="text-sm text-danger-600 ml-3">
              {error}
            </span>
          )}
        </form>

        {vehicle && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Car className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Plaka</div>
                    <div className="text-2xl font-bold tracking-wide">{vehicle.Plate}</div>
                    <div className="text-sm text-neutral-600 mt-1">
                      {vehicle.Make} {vehicle.Model} {vehicle.Year ? `• ${vehicle.Year}` : ''}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-neutral-500">Şirket</div>
                    <div className="font-medium text-neutral-900">{vehicle.CompanyName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Depo</div>
                    <div className="font-medium text-neutral-900">{vehicle.DepotName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Durum</div>
                    <div className="font-medium text-neutral-900">{vehicle.Status || '-'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Yakıt Tipi</div>
                    <div className="font-medium text-neutral-900">{vehicle.FuelType || '-'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Güncel KM</div>
                    <div className="font-medium text-neutral-900">{vehicle.CurrentKm ? formatKm(vehicle.CurrentKm) : '-'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Son Servis KM</div>
                    <div className="font-medium text-neutral-900">{vehicle.LastServiceKm ? formatKm(vehicle.LastServiceKm) : '-'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Sürücü / Yönetici</div>
                    <div className="font-medium text-neutral-900">
                      {vehicle.DriverName || '-'}
                      {vehicle.ManagerName ? ` • ${vehicle.ManagerName}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wrench className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Bakım Geçmişi</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.maintenance?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.maintenance?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tarih</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tip</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Açıklama</th>
                          <th className="px-4 py-2 text-right font-medium text-neutral-700">Tutar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.maintenance.map((m: any) => (
                          <tr key={m.MaintenanceID}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(m.ServiceDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{m.Type}</td>
                            <td className="px-4 py-2 truncate max-w-[200px]">{m.Description}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">
                              {m.Cost ? formatCurrency(m.Cost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Bakım kaydı bulunmuyor
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Sigortalar</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.insurance?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.insurance?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tip</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Şirket</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Poliçe No</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Başlangıç</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Bitiş</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.insurance.map((i: any) => (
                          <tr key={i.InsuranceID}>
                            <td className="px-4 py-2 whitespace-nowrap">{i.Type}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{i.InsuranceCompany}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{i.PolicyNumber}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(i.StartDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(i.EndDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Sigorta kaydı bulunmuyor
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ClipboardCheck className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Muayeneler</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.inspections?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.inspections?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Muayene Tarihi</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Sonraki Muayene</th>
                          <th className="px-4 py-2 text-right font-medium text-neutral-700">Tutar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.inspections.map((ins: any) => (
                          <tr key={ins.InspectionID}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(ins.InspectionDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(ins.NextInspectionDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">
                              {ins.Cost ? formatCurrency(ins.Cost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Muayene kaydı bulunmuyor
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Fuel className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Yakıt Kayıtları</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.fuel?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.fuel?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tarih</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">İstasyon</th>
                          <th className="px-4 py-2 text-right font-medium text-neutral-700">Litre</th>
                          <th className="px-4 py-2 text-right font-medium text-neutral-700">Tutar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.fuel.map((f: any) => (
                          <tr key={f.FuelRecordID}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(f.FuelDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{f.FuelStation}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">{f.Liters ?? '-'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">
                              {f.TotalCost ? formatCurrency(f.TotalCost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Yakıt kaydı bulunmuyor
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Kaza & Hasar</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.accidents?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.accidents?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tarih</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Yer</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Rapor No</th>
                          <th className="px-4 py-2 text-right font-medium text-neutral-700">Tutar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.accidents.map((a: any) => (
                          <tr key={a.AccidentID}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(a.AccidentDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{a.Location}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{a.ReportNumber}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">
                              {a.Cost ? formatCurrency(a.Cost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Kaza / hasar kaydı bulunmuyor
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ClipboardList className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Servis Talepleri</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.serviceRequests?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.serviceRequests?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tarih</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Tip</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Durum</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.serviceRequests.map((sr: any) => (
                          <tr key={sr.RequestID}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(sr.RequestDate)}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{sr.ServiceType}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{sr.Status}</td>
                            <td className="px-4 py-2 truncate max-w-[220px]">{sr.Description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Servis talebi bulunmuyor
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Gauge className="w-4 h-4 text-primary-600" />
                    <h2 className="text-sm font-semibold text-neutral-900">Aylık KM Kayıtları</h2>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {data?.monthlyKm?.length || 0} kayıt
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {data?.monthlyKm?.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Yıl</th>
                          <th className="px-4 py-2 text-left font-medium text-neutral-700">Ay</th>
                          <th className="px-4 py-2 text-right font-medium text-neutral-700">KM</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {data.monthlyKm.map((mk: any) => (
                          <tr key={`${mk.Year}-${mk.Month}`}>
                            <td className="px-4 py-2 whitespace-nowrap">{mk.Year}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{mk.Month}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-right">{mk.Kilometer ?? mk.Km ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs text-neutral-500 text-center">
                      Aylık km kaydı bulunmuyor
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default VehicleOverview;

