import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monthlyKmService, MonthlyKmRecord } from '../services/monthlyKmService';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/layout/Layout';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import { Save, Calendar, RefreshCw, History } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MonthlyKmEntry = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [editedValues, setEditedValues] = useState<Record<number, number>>({});
  const [historyVehicle, setHistoryVehicle] = useState<{ id: number; plate: string } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [year, month] = selectedDate.split('-').map(Number);

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['monthlyKm', month, year, user?.CompanyID, currentPage, searchTerm],
    queryFn: async () => {
      const response = await monthlyKmService.getRecords(month, year, user?.CompanyID, {
        page: currentPage,
        limit: 50,
        search: searchTerm || undefined,
      });
      if (response.pagination) {
        setPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
      return response;
    },
  });

  const records = recordsData?.data || [];

  const { data: historyData } = useQuery({
    queryKey: ['vehicleKmHistory', historyVehicle?.id],
    queryFn: () => historyVehicle ? monthlyKmService.getVehicleHistory(historyVehicle.id) : Promise.resolve([]),
    enabled: !!historyVehicle,
  });

  const saveMutation = useMutation({
    mutationFn: monthlyKmService.saveRecords,
    onSuccess: () => {
      toast.success('Kayıtlar başarıyla güncellendi');
      queryClient.invalidateQueries({ queryKey: ['monthlyKm'] });
      setEditedValues({});
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast.error('Kayıt sırasında bir hata oluştu');
    }
  });

  const handleKmChange = (vehicleId: number, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      setEditedValues(prev => ({ ...prev, [vehicleId]: numValue }));
    } else if (value === '') {
      // Allow clearing the input temporarily, but don't delete from editedValues yet if invalid
       const newValues = { ...editedValues };
       delete newValues[vehicleId];
       setEditedValues(newValues);
    }
  };

  const handleSave = () => {
    const recordsToSave = Object.entries(editedValues).map(([vehicleId, kilometer]) => ({
      vehicleId: Number(vehicleId),
      kilometer
    }));

    if (recordsToSave.length === 0) {
      toast('Değişiklik yapılmadı');
      return;
    }

    saveMutation.mutate({
      month,
      year,
      records: recordsToSave
    });
  };

  const getInputValue = (record: MonthlyKmRecord) => {
    if (editedValues[record.VehicleID] !== undefined) {
      return editedValues[record.VehicleID];
    }
    return record.MonthlyKm || '';
  };

  const copyCurrentKm = (record: MonthlyKmRecord) => {
    setEditedValues(prev => ({
      ...prev,
      [record.VehicleID]: record.CurrentTotalKm
    }));
  };

  const [debounceTimer, setDebounceTimer] = useState<number | null>(null);

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);

    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    const timer = window.setTimeout(() => {
      const trimmed = value.trim();
      setCurrentPage(1);
      setSearchTerm(trimmed.length >= 2 ? trimmed : '');
    }, 500);

    setDebounceTimer(timer);
  };

  return (
    <Layout>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Aylık Kilometre Girişi</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={searchInput}
              onChange={onSearchChange}
              placeholder="Plaka, marka, model..."
              className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={Object.keys(editedValues).length === 0 || saveMutation.isPending}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        {isLoading && (
          <div className="px-6 py-2 text-right text-sm text-gray-500">
            Veriler yükleniyor...
          </div>
        )}
        <table className="min-w-full divide-y divide-gray-200 hidden md:table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Araç</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marka / Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mevcut KM (Sistem)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Geçen Ay KM</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {month}/{year} KM
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fark</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Son Güncelleme</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records?.map((record) => {
              const currentValue = getInputValue(record);
              const currentKm = currentValue !== '' ? Number(currentValue) : null;
              const previousKm = record.PreviousMonthKm;
              const diff = currentKm !== null && previousKm !== null ? currentKm - previousKm : null;

              return (
                <tr key={record.VehicleID} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{record.Plate}</span>
                      <button
                        onClick={() => setHistoryVehicle({ id: record.VehicleID, plate: record.Plate })}
                        className="text-gray-400 hover:text-blue-600"
                        title="Geçmiş Kayıtlar"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.Make} {record.Model}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {record.CurrentTotalKm.toLocaleString()}
                    <button
                      onClick={() => copyCurrentKm(record)}
                      className="ml-2 text-gray-400 hover:text-blue-600 tooltip"
                      title="Güncel KM'yi kopyala"
                    >
                      <RefreshCw className="h-4 w-4 inline" />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.PreviousMonthKm ? record.PreviousMonthKm.toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      value={currentValue}
                      onChange={(e) => handleKmChange(record.VehicleID, e.target.value)}
                      className={`block w-32 rounded-md shadow-sm sm:text-sm ${
                        editedValues[record.VehicleID] !== undefined
                          ? 'border-blue-500 ring-1 ring-blue-500'
                          : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                      placeholder="KM giriniz"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {diff !== null ? (
                      <span className={diff < 0 ? 'text-red-600' : 'text-green-600'}>
                        {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.UpdatedAt ? new Date(record.UpdatedAt).toLocaleDateString() : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="md:hidden divide-y divide-gray-200">
          {records?.map((record) => {
            const currentValue = getInputValue(record);
            const currentKm = currentValue !== '' ? Number(currentValue) : null;
            const previousKm = record.PreviousMonthKm;
            const diff = currentKm !== null && previousKm !== null ? currentKm - previousKm : null;

            return (
              <div key={record.VehicleID} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{record.Plate}</span>
                      <button
                        onClick={() => setHistoryVehicle({ id: record.VehicleID, plate: record.Plate })}
                        className="text-gray-400 hover:text-blue-600"
                        title="Geçmiş Kayıtlar"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {record.Make} {record.Model}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500 space-y-1">
                    <div>
                      Mevcut KM:{' '}
                      <span className="font-semibold text-gray-900">
                        {record.CurrentTotalKm.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      Geçen Ay:{' '}
                      <span className="font-semibold text-gray-900">
                        {record.PreviousMonthKm ? record.PreviousMonthKm.toLocaleString() : '-'}
                      </span>
                    </div>
                    <div>
                      Son Güncelleme:{' '}
                      <span className="font-semibold text-gray-900">
                        {record.UpdatedAt ? new Date(record.UpdatedAt).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex flex-col flex-1">
                    <span className="text-xs text-gray-500 mb-1">
                      {month}/{year} KM
                    </span>
                    <input
                      type="number"
                      value={currentValue}
                      onChange={(e) => handleKmChange(record.VehicleID, e.target.value)}
                      className={`block w-full rounded-md shadow-sm text-sm ${
                        editedValues[record.VehicleID] !== undefined
                          ? 'border-blue-500 ring-1 ring-blue-500'
                          : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                      placeholder="KM giriniz"
                    />
                  </div>
                  <div className="text-xs font-medium">
                    {diff !== null ? (
                      <span className={diff < 0 ? 'text-red-600' : 'text-green-600'}>
                        {diff > 0 ? '+' : ''}
                        {diff.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={pagination.totalPages}
          onPageChange={setCurrentPage}
          totalItems={pagination.total}
          itemsPerPage={50}
        />
        {records?.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Bu ay için görüntülenecek araç bulunamadı.
          </div>
        )}
      </div>

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
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {item.Month}/{item.Year}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {item.Kilometer.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {diff !== null ? (
                        <span className={diff < 0 ? 'text-red-600' : 'text-green-600'}>
                          {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {item.CreatedByName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(item.UpdatedAt).toLocaleDateString('tr-TR')}
                    </td>
                  </tr>
                );
              })}
              {(!historyData || historyData.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
    </Layout>
  );
};

export default MonthlyKmEntry;
