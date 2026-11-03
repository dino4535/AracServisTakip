import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { monthlyKmService, KmRangeRecord } from '../services/monthlyKmService';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/layout/Layout';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import { Calendar, History, Gauge, AlertTriangle } from 'lucide-react';

const isoDate = (d: Date) => d.toISOString().split('T')[0];

const VehicleKmHistory = () => {
  const { user } = useAuth();

  const today = new Date();
  const [startDate, setStartDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`);
  const [endDate, setEndDate] = useState(isoDate(today));

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'history' | 'missing'>('history');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [historyVehicle, setHistoryVehicle] = useState<{ id: number; plate: string } | null>(null);
  const [debounceTimer, setDebounceTimer] = useState<number | null>(null);

  const onlyMissing = activeTab === 'missing';

  const { data: rangeData, isLoading } = useQuery({
    queryKey: ['kmRange', startDate, endDate, user?.CompanyID, searchTerm, activeTab, currentPage],
    queryFn: async () => {
      const response = await monthlyKmService.getKmRange({
        startDate,
        endDate,
        companyId: user?.CompanyID,
        search: searchTerm || undefined,
        onlyMissing,
        page: currentPage,
        limit: 50,
      });
      if (response.pagination) {
        setPagination({ total: response.pagination.total, totalPages: response.pagination.totalPages });
      }
      return response;
    },
  });

  const records: KmRangeRecord[] = rangeData?.data || [];

  const { data: historyData } = useQuery({
    queryKey: ['vehicleKmHistory', historyVehicle?.id],
    queryFn: () => (historyVehicle ? monthlyKmService.getVehicleHistory(historyVehicle.id) : Promise.resolve([])),
    enabled: !!historyVehicle,
  });

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    if (debounceTimer) window.clearTimeout(debounceTimer);
    const timer = window.setTimeout(() => {
      const trimmed = value.trim();
      setCurrentPage(1);
      setSearchTerm(trimmed.length >= 2 ? trimmed : '');
    }, 500);
    setDebounceTimer(timer);
  };

  const switchTab = (tab: 'history' | 'missing') => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const fmt = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString());

  const kmColor = (km: number | null) => {
    if (km == null) return 'text-gray-400';
    if (km > 0) return 'text-green-600';
    if (km < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Başlık + filtreler */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div className="flex items-center space-x-3">
            <Gauge className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Araç KM Geçmişi</h1>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Başlangıç</label>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bitiş</label>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ara</label>
              <input
                type="text"
                value={searchInput}
                onChange={onSearchChange}
                placeholder="Plaka, marka, model..."
                className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Sekmeler */}
        <div className="bg-white rounded-xl shadow-sm p-1 overflow-hidden border border-gray-100">
          <nav className="flex space-x-4 px-4" aria-label="Tabs">
            <button
              onClick={() => switchTab('history')}
              className={`${activeTab === 'history' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'} px-3 py-2 font-medium text-sm rounded-md`}
            >
              KM Geçmişi
            </button>
            <button
              onClick={() => switchTab('missing')}
              className={`${activeTab === 'missing' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'} px-3 py-2 font-medium text-sm rounded-md flex items-center`}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              KM Verisi Alınamayanlar
            </button>
          </nav>
        </div>

        <div className="text-sm text-gray-500">
          {startDate} – {endDate} aralığı · {pagination.total} araç
        </div>

        {activeTab === 'history' ? (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            {isLoading && <div className="px-6 py-2 text-right text-sm text-gray-500">Veriler yükleniyor...</div>}
            <table className="min-w-full divide-y divide-gray-200 hidden md:table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Araç</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marka / Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mevcut Güncel KM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aralık Başı KM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aralık Sonu KM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aralıkta Yapılan KM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Son Okuma</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((r) => (
                  <tr key={r.VehicleID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">{r.Plate}</span>
                        <button
                          onClick={() => setHistoryVehicle({ id: r.VehicleID, plate: r.Plate })}
                          className="text-gray-400 hover:text-blue-600"
                          title="Aylık geçmiş kayıtları"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        {r.TrioVehicleId && (
                          <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded" title={`Trio ID: ${r.TrioVehicleId}`}>Trio</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.Make} {r.Model}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{fmt(r.CurrentKm)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{fmt(r.StartKm)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{fmt(r.EndKm)}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${kmColor(r.KmInRange)}`}>
                      {r.KmInRange != null && r.KmInRange > 0 ? '+' : ''}{fmt(r.KmInRange)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {r.LastReadingDate ? new Date(r.LastReadingDate).toLocaleDateString('tr-TR') : '-'}
                    </td>
                  </tr>
                ))}
                {!isLoading && records.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">Bu aralıkta KM kaydı bulunan araç yok.</td></tr>
                )}
              </tbody>
            </table>

            {/* Mobil */}
            <div className="md:hidden divide-y divide-gray-200">
              {records.map((r) => (
                <div key={r.VehicleID} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-gray-900">{r.Plate}</div>
                      <div className="text-xs text-gray-500">{r.Make} {r.Model}</div>
                    </div>
                    <div className={`text-sm font-semibold ${kmColor(r.KmInRange)}`}>
                      {r.KmInRange != null && r.KmInRange > 0 ? '+' : ''}{fmt(r.KmInRange)} km
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                    <div>Mevcut: <span className="font-semibold text-gray-900">{fmt(r.CurrentKm)}</span></div>
                    <div>Başı: <span className="text-gray-900">{fmt(r.StartKm)}</span></div>
                    <div>Sonu: <span className="text-gray-900">{fmt(r.EndKm)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            {isLoading && <div className="px-6 py-4 text-center text-sm text-gray-500">Veriler yükleniyor...</div>}
            <table className="min-w-full divide-y divide-gray-200 hidden md:table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plaka</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marka / Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Şirket</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Depo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mevcut KM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trio Bağlantısı</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((r) => (
                  <tr key={r.VehicleID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.Plate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.Make} {r.Model}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.CompanyName || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.DepotName || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{fmt(r.CurrentKm)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {r.TrioVehicleId ? (
                        <span className="text-green-600">Bağlı</span>
                      ) : (
                        <span className="text-red-500">Bağlı değil</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && records.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">Bu aralıkta KM verisi alınamayan araç yok. 🎉</td></tr>
                )}
              </tbody>
            </table>

            <div className="md:hidden divide-y divide-gray-200">
              {records.map((r) => (
                <div key={r.VehicleID} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-gray-900">{r.Plate}</div>
                      <div className="text-xs text-gray-500">{r.Make} {r.Model}</div>
                    </div>
                    <span className={`text-xs ${r.TrioVehicleId ? 'text-green-600' : 'text-red-500'}`}>
                      {r.TrioVehicleId ? 'Trio bağlı' : 'Trio yok'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {r.CompanyName || '-'} / {r.DepotName || '-'} · Mevcut KM: <span className="font-semibold text-gray-900">{fmt(r.CurrentKm)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            itemsPerPage={50}
          />
        </div>
      </div>

      {/* Aylık geçmiş modalı */}
      <Modal
        isOpen={!!historyVehicle}
        onClose={() => setHistoryVehicle(null)}
        title={`${historyVehicle?.plate} - Geçmiş KM Kayıtları`}
        size="lg"
      >
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dönem</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kilometre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fark</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kayıt Eden</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {historyData?.map((item, index) => {
                const prevItem = historyData[index + 1];
                const diff = prevItem ? item.Kilometer - prevItem.Kilometer : null;
                return (
                  <tr key={item.LogID} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{item.Month}/{item.Year}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{item.Kilometer.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      {diff !== null ? (
                        <span className={diff < 0 ? 'text-red-600' : 'text-green-600'}>{diff > 0 ? '+' : ''}{diff.toLocaleString()}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.CreatedByName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(item.UpdatedAt).toLocaleDateString('tr-TR')}</td>
                  </tr>
                );
              })}
              {(!historyData || historyData.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Kayıt bulunamadı.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </Layout>
  );
};

export default VehicleKmHistory;
