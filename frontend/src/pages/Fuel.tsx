import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import Select from '../components/common/Select';
import Input from '../components/common/Input';
import { Plus, Edit, Trash2, Car as CarIcon, Droplets, Download } from 'lucide-react';
import { fuelService } from '../services/fuelService';
import { vehicleService } from '../services/vehicleService';
import { FuelRecord } from '../types';
import { formatCurrency, formatDate } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ConfirmationModal from '../components/common/ConfirmationModal';

// Zod schema for frontend validation
const fuelSchema = z.object({
  vehicleId: z.number().min(1, 'Araç seçimi zorunludur'),
  fuelDate: z.string().min(1, 'Tarih zorunludur'),
  liters: z.number().min(0.01, 'Litre 0\'dan büyük olmalıdır'),
  costPerLiter: z.number().min(0, 'Litre fiyatı 0\'dan küçük olamaz').optional(),
  totalCost: z.number().min(0.01, 'Toplam tutar 0\'dan büyük olmalıdır'),
  fuelStation: z.string().optional(),
  kilometer: z.number().min(0).optional(),
});

type FuelFormData = z.infer<typeof fuelSchema>;

const Fuel = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FuelRecord | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;

  // Filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState<number>(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // React Hook Form setup
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FuelFormData>({
    resolver: zodResolver(fuelSchema),
    defaultValues: {
      vehicleId: 0,
      fuelDate: new Date().toISOString().split('T')[0],
      liters: 0,
      costPerLiter: 0,
      totalCost: 0,
      fuelStation: '',
      kilometer: 0,
    }
  });

  // Queries
  const { data: fuelData, isLoading: isLoadingRecords } = useQuery({
    queryKey: ['fuelRecords', currentPage, filterStartDate, filterEndDate, filterVehicleId, searchTerm],
    queryFn: () =>
      fuelService.getAllFuelRecords({
        page: currentPage,
        limit,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        vehicleId: filterVehicleId || undefined,
        search: searchTerm || undefined,
      }),
    placeholderData: (previousData) => previousData,
  });

  const fuelRecords = fuelData?.data || [];
  const pagination = fuelData?.pagination || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehicleService.getAllVehicles({ page: 1, limit: 0 }),
  });

  const vehicles = vehiclesData?.data || [];
  
  const vehicleOptions = [
    { value: 0, label: 'Tüm Araçlar' },
    ...vehicles.map(v => ({ value: v.VehicleID, label: `${v.Plate} - ${v.Make} ${v.Model}` }))
  ];

  const handleExport = async () => {
    try {
      const data = await fuelService.getAllFuelRecords({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        vehicleId: filterVehicleId || undefined,
        export: true
      });

      const formattedData = data.map((item: any) => ({
        'Plaka': item.Plate,
        'Şirket': item.CompanyName || '-',
        'Depo': item.DepotName || '-',
        'Tarih': formatDate(item.FuelDate),
        'İstasyon': item.FuelStation,
        'Litre': item.Liters,
        'Birim Fiyat': item.CostPerLiter,
        'Toplam Tutar': item.TotalCost,
        'KM': item.Kilometer,
        'Dolduran': item.FilledByName || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(formattedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Yakıt Kayıtları");
      XLSX.writeFile(wb, "yakit-kayitlari.xlsx");
    } catch (error) {
      console.error('Export error:', error);
      alert('Dışa aktarma sırasında bir hata oluştu.');
    }
  };


  // Mutations
  const createMutation = useMutation({
    mutationFn: fuelService.createFuelRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuelRecords'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FuelRecord> }) => 
      fuelService.updateFuelRecord(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuelRecords'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: fuelService.deleteFuelRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuelRecords'] });
      setDeleteId(null);
    },
  });

  const handleOpenModal = (record?: FuelRecord) => {
    if (record) {
      setSelectedRecord(record);
      // Populate form with record data
      setValue('vehicleId', record.VehicleID);
      setValue('fuelDate', record.FuelDate ? record.FuelDate.split('T')[0] : '');
      setValue('liters', record.Liters || 0);
      setValue('costPerLiter', record.CostPerLiter || 0);
      setValue('totalCost', record.TotalCost || 0);
      setValue('fuelStation', record.FuelStation || '');
      setValue('kilometer', record.Kilometer || 0);
    } else {
      setSelectedRecord(null);
      reset({
        vehicleId: 0,
        fuelDate: new Date().toISOString().split('T')[0],
        liters: 0,
        costPerLiter: 0,
        totalCost: 0,
        fuelStation: '',
        kilometer: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRecord(null);
    reset();
  };

  const onSubmit: SubmitHandler<FuelFormData> = (data) => {
    const payload: Partial<FuelRecord> = {
      VehicleID: data.vehicleId,
      FuelDate: data.fuelDate,
      Liters: data.liters,
      CostPerLiter: data.costPerLiter || 0,
      TotalCost: data.totalCost,
      FuelStation: data.fuelStation,
      Kilometer: data.kilometer,
    };

    if (selectedRecord) {
      updateMutation.mutate({ id: selectedRecord.FuelRecordID, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
  };
  
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  const [debounceTimer, setDebounceTimer] = useState<number | null>(null);

  const onSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    handleSearchChange(value);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Droplets className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-neutral-900">Yakıt Kayıtları</h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-64">
              <Input
                label=""
                placeholder="Plaka, istasyon, fatura no..."
                value={searchInput}
                onChange={onSearchInputChange}
              />
            </div>
            <PermissionGuard permission={PERMISSIONS.FUEL.ADD}>
              <Button onClick={() => handleOpenModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Yakıt Ekle
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <Input
              label="Başlangıç Tarihi"
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
            <Input
              label="Bitiş Tarihi"
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
            <Select
              label="Araç"
              options={vehicleOptions}
              value={filterVehicleId}
              onChange={(e) => setFilterVehicleId(Number(e.target.value))}
            />
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterVehicleId(0);
              }} className="flex-1">
                Temizle
              </Button>
              <Button variant="secondary" onClick={handleExport} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          {isLoadingRecords && (
            <div className="px-6 py-2 text-right text-sm text-neutral-500">
              Veriler yükleniyor...
            </div>
          )}
          <table className="w-full hidden md:table">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Araç</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Tarih</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İstasyon</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Litre</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Birim Fiyat</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Toplam</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">KM</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {fuelRecords.map((record: FuelRecord) => (
                <tr key={record.FuelRecordID} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                    <div className="flex items-center">
                      <CarIcon className="w-4 h-4 mr-2 text-neutral-500" />
                      {record.Plate || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {formatDate(record.FuelDate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {record.FuelStation || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {record.Liters} L
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {record.CostPerLiter ? formatCurrency(record.CostPerLiter) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                    {record.TotalCost ? formatCurrency(record.TotalCost) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {record.Kilometer ? `${record.Kilometer} km` : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <PermissionGuard permission={PERMISSIONS.FUEL.EDIT}>
                        <button
                          onClick={() => handleOpenModal(record)}
                          className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4 text-primary-600" />
                        </button>
                      </PermissionGuard>
                      <PermissionGuard permission={PERMISSIONS.FUEL.DELETE}>
                        <button
                          onClick={() => handleDelete(record.FuelRecordID)}
                          className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4 text-danger-600" />
                        </button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="md:hidden divide-y divide-neutral-100">
            {fuelRecords.map((record: FuelRecord) => (
              <div key={record.FuelRecordID} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CarIcon className="w-4 h-4 text-neutral-500" />
                      <span className="text-sm font-semibold text-neutral-900">
                        {record.Plate || '-'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {formatDate(record.FuelDate)}
                    </div>
                    {record.FuelStation && (
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {record.FuelStation}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-neutral-500 space-y-1">
                    <div>
                      Litre:{' '}
                      <span className="font-semibold text-neutral-800">
                        {record.Liters}
                      </span>
                    </div>
                    <div>
                      Birim:{' '}
                      <span className="font-semibold text-neutral-800">
                        {record.CostPerLiter
                          ? formatCurrency(record.CostPerLiter)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      Toplam:{' '}
                      <span className="font-semibold text-neutral-800">
                        {record.TotalCost
                          ? formatCurrency(record.TotalCost)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      KM:{' '}
                      <span className="font-semibold text-neutral-800">
                        {record.Kilometer ? `${record.Kilometer} km` : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-neutral-100 mt-1">
                  <div className="flex items-center space-x-2">
                    <PermissionGuard permission={PERMISSIONS.FUEL.EDIT}>
                      <button
                        onClick={() => handleOpenModal(record)}
                        className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Düzenle"
                      >
                        <Edit className="w-4 h-4 text-primary-600" />
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permission={PERMISSIONS.FUEL.DELETE}>
                      <button
                        onClick={() => handleDelete(record.FuelRecordID)}
                        className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4 text-danger-600" />
                      </button>
                    </PermissionGuard>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {fuelRecords.length === 0 && (
            <div className="p-8 text-center text-neutral-500">
              Yakıt kaydı bulunmuyor
            </div>
          )}
          
          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            itemsPerPage={limit}
          />
        </div>
      </div>

      {/* Edit/Add Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={selectedRecord ? 'Yakıt Kaydı Düzenle' : 'Yakıt Ekle'} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Araç *</label>
              <select
                {...register('vehicleId', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="0">Seçiniz</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.VehicleID} value={vehicle.VehicleID}>
                    {vehicle.Plate} - {vehicle.Make} {vehicle.Model}
                  </option>
                ))}
              </select>
              {errors.vehicleId && <span className="text-xs text-danger-600">{errors.vehicleId.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Tarih *</label>
              <input
                type="date"
                {...register('fuelDate')}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {errors.fuelDate && <span className="text-xs text-danger-600">{errors.fuelDate.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">İstasyon</label>
              <input
                type="text"
                {...register('fuelStation')}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Litre *</label>
              <input
                type="number"
                step="0.01"
                {...register('liters', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {errors.liters && <span className="text-xs text-danger-600">{errors.liters.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Birim Fiyat (₺)</label>
              <input
                type="number"
                step="0.01"
                {...register('costPerLiter', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Toplam Tutar (₺) *</label>
              <input
                type="number"
                step="0.01"
                {...register('totalCost', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {errors.totalCost && <span className="text-xs text-danger-600">{errors.totalCost.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Güncel KM</label>
              <input
                type="number"
                {...register('kilometer', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              İptal
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Kaydediliyor...' : (selectedRecord ? 'Güncelle' : 'Kaydet')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Yakıt Kaydını Sil"
        message="Bu yakıt kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Sil"
        cancelText="İptal"
        type="danger"
      />
    </Layout>
  );
};

export default Fuel;
