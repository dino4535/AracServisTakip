import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import { Wrench, Plus, Edit, Trash2, Car as CarIcon } from 'lucide-react';
import { maintenanceService } from '../services/maintenanceService';
import { vehicleService } from '../services/vehicleService';
import { MaintenanceRecord, Vehicle } from '../types';
import { formatCurrency, formatDate, calculateDaysUntil, isExpiringSoon } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ConfirmationModal from '../components/common/ConfirmationModal';

// Zod schema for frontend validation
const maintenanceSchema = z.object({
  vehicleId: z.number().min(1, 'Araç seçimi zorunludur'),
  type: z.string().min(1, 'Bakım tipi zorunludur'),
  description: z.string().optional(),
  kilometer: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  serviceDate: z.string().min(1, 'Bakım tarihi zorunludur'),
  nextServiceDate: z.string().optional().nullable(),
  nextServiceKm: z.number().min(0).optional().nullable(),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

const Maintenance = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'records' | 'predictions'>('records');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [selectedVehicleForTarget, setSelectedVehicleForTarget] = useState<any | null>(null);
  const [newTargetKm, setNewTargetKm] = useState<number>(0);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // React Hook Form setup
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      vehicleId: 0,
      type: '',
      description: '',
      kilometer: 0,
      cost: 0,
      serviceDate: new Date().toISOString().split('T')[0],
      nextServiceDate: '',
      nextServiceKm: 0,
    }
  });

  // Queries
  const { data: maintenanceData, isLoading: isLoadingRecords } = useQuery({
    queryKey: ['maintenanceRecords', currentPage, searchTerm],
    queryFn: () =>
      maintenanceService.getAllMaintenanceRecords({
        page: currentPage,
        limit,
        search: searchTerm || undefined,
      }),
    placeholderData: (previousData) => previousData,
  });

  const maintenanceRecords = maintenanceData?.data || [];
  const pagination = maintenanceData?.pagination || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehicleService.getAllVehicles(),
  });

  const vehicles: Vehicle[] = vehiclesData?.data || [];

  const { data: predictions = [], isLoading: isLoadingPredictions } = useQuery<any[]>({
    queryKey: ['maintenancePredictions', searchTerm],
    queryFn: () => maintenanceService.getMaintenancePredictions(searchTerm || undefined),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: maintenanceService.createMaintenanceRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MaintenanceRecord> }) => 
      maintenanceService.updateMaintenanceRecord(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
      handleCloseModal();
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: ({ id, nextMaintenanceKm }: { id: number; nextMaintenanceKm: number }) => 
      vehicleService.updateNextMaintenanceKm(id, nextMaintenanceKm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenancePredictions'] });
      setIsTargetModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: maintenanceService.deleteMaintenanceRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
      setDeleteId(null);
    },
  });

  const onSubmit: SubmitHandler<MaintenanceFormData> = (data) => {
    if (selectedRecord) {
      updateMutation.mutate({ id: selectedRecord.MaintenanceID, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenModal = (record?: MaintenanceRecord) => {
    if (record) {
      setSelectedRecord(record);
      setValue('vehicleId', record.VehicleID);
      setValue('type', record.Type);
      setValue('description', record.Description || '');
      setValue('kilometer', record.Kilometer || 0);
      setValue('cost', record.Cost || 0);
      setValue('serviceDate', record.ServiceDate.split('T')[0]);
      setValue('nextServiceDate', record.NextServiceDate ? record.NextServiceDate.split('T')[0] : '');
      setValue('nextServiceKm', record.NextServiceKm ?? 0);
    } else {
      setSelectedRecord(null);
      reset();
      setValue('serviceDate', new Date().toISOString().split('T')[0]);
      setValue('nextServiceKm', 0);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRecord(null);
    reset();
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
  };

  const handleOpenTargetModal = (prediction: any) => {
    setSelectedVehicleForTarget(prediction);
    setNewTargetKm(prediction.NextServiceKm || 0);
    setIsTargetModalOpen(true);
  };

  const handleUpdateTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVehicleForTarget && newTargetKm >= 0) {
      updateVehicleMutation.mutate({
        id: selectedVehicleForTarget.VehicleID,
        nextMaintenanceKm: newTargetKm
      });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  // Debounce search
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
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center space-x-3">
            <Wrench className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-neutral-900">Bakım Yönetimi</h1>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:space-x-3">
            <div className="w-full md:w-64">
              <input
                type="text"
                value={searchInput}
                onChange={onSearchInputChange}
                placeholder="Plaka, tip, açıklama..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <PermissionGuard permission={PERMISSIONS.MAINTENANCE.ADD}>
              <Button onClick={() => handleOpenModal()} className="w-full md:w-auto justify-center">
                <Plus className="w-4 h-4 mr-2" />
                Bakım Ekle
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('records')}
              className={`${
                activeTab === 'records'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Bakım Geçmişi
            </button>
            <button
              onClick={() => setActiveTab('predictions')}
              className={`${
                activeTab === 'predictions'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Bakım Tahminleri & Durumu
            </button>
          </nav>
        </div>

        {activeTab === 'records' ? (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            {isLoadingRecords && (
              <div className="px-6 py-2 text-right text-sm text-neutral-500">
                Veriler yükleniyor...
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full hidden md:table">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Araç</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Tip</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Açıklama</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Tarih</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Maliyet</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Sonraki Bakım</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {maintenanceRecords.map((record) => {
                    const daysUntil = record.NextServiceDate ? calculateDaysUntil(record.NextServiceDate) : null;
                    const isUpcoming = record.NextServiceDate && isExpiringSoon(record.NextServiceDate, 30);

                    return (
                      <tr key={record.MaintenanceID} className={`hover:bg-neutral-50 ${isUpcoming ? 'bg-warning-50' : ''}`}>
                        <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                          <div className="flex items-center">
                            <CarIcon className="w-4 h-4 mr-2 text-neutral-500" />
                            {record.Plate || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">{record.Type}</td>
                        <td className="px-6 py-4 text-sm text-neutral-600 max-w-xs truncate">
                          {record.Description || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {formatDate(record.ServiceDate)}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {record.Cost ? formatCurrency(record.Cost) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          {record.NextServiceDate ? (
                            <div>
                              <span className={`text-sm ${daysUntil !== null && daysUntil <= 7 ? 'text-danger-600 font-medium' : 'text-neutral-600'}`}>
                                {formatDate(record.NextServiceDate)}
                              </span>
                              {daysUntil !== null && daysUntil >= 0 && (
                                <span className={`text-xs ml-2 px-2 py-0.5 rounded-full ${
                                  daysUntil <= 7 ? 'bg-danger-100 text-danger-700' :
                                  daysUntil <= 30 ? 'bg-warning-100 text-warning-700' :
                                  'bg-neutral-100 text-neutral-700'
                                }`}>
                                  {daysUntil} gün
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <PermissionGuard permission={PERMISSIONS.MAINTENANCE.EDIT}>
                              <button
                                onClick={() => handleOpenModal(record)}
                                className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Düzenle"
                              >
                                <Edit className="w-4 h-4 text-primary-600" />
                              </button>
                            </PermissionGuard>
                            <PermissionGuard permission={PERMISSIONS.MAINTENANCE.DELETE}>
                              <button
                                onClick={() => handleDelete(record.MaintenanceID)}
                                className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                                title="Sil"
                              >
                                <Trash2 className="w-4 h-4 text-danger-600" />
                              </button>
                            </PermissionGuard>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-neutral-100">
              {maintenanceRecords.map((record) => {
                const daysUntil = record.NextServiceDate ? calculateDaysUntil(record.NextServiceDate) : null;
                const isUpcoming = record.NextServiceDate && isExpiringSoon(record.NextServiceDate, 30);

                return (
                  <div
                    key={record.MaintenanceID}
                    className={`p-4 flex flex-col gap-3 ${isUpcoming ? 'bg-warning-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CarIcon className="w-4 h-4 text-neutral-500" />
                          <span className="text-sm font-semibold text-neutral-900">
                            {record.Plate || '-'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {record.Type}
                        </div>
                        <div className="mt-2 text-xs text-neutral-500 space-y-1">
                          <div>Bakım Tarihi: {formatDate(record.ServiceDate)}</div>
                          {record.Description && (
                            <div className="line-clamp-2">
                              {record.Description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-neutral-500 space-y-2">
                        <div className="font-semibold text-neutral-900">
                          {record.Cost ? formatCurrency(record.Cost) : '-'}
                        </div>
                        {record.NextServiceDate && (
                          <div className="space-y-1">
                            <div>{formatDate(record.NextServiceDate)}</div>
                            {daysUntil !== null && daysUntil >= 0 && (
                              <div
                                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                  daysUntil <= 7
                                    ? 'bg-danger-100 text-danger-700'
                                    : daysUntil <= 30
                                    ? 'bg-warning-100 text-warning-700'
                                    : 'bg-neutral-100 text-neutral-700'
                                }`}
                              >
                                {daysUntil} gün
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-neutral-100 mt-2">
                      <div className="flex items-center space-x-2">
                        <PermissionGuard permission={PERMISSIONS.MAINTENANCE.EDIT}>
                          <button
                            onClick={() => handleOpenModal(record)}
                            className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Düzenle"
                          >
                            <Edit className="w-4 h-4 text-primary-600" />
                          </button>
                        </PermissionGuard>
                        <PermissionGuard permission={PERMISSIONS.MAINTENANCE.DELETE}>
                          <button
                            onClick={() => handleDelete(record.MaintenanceID)}
                            className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4 text-danger-600" />
                          </button>
                        </PermissionGuard>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isLoadingRecords && maintenanceRecords.length === 0 && (
              <div className="p-8 text-center text-neutral-500">
                Bakım kaydı bulunmuyor
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
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            {isLoadingPredictions ? (
              <div className="p-8 text-center text-neutral-500">Yükleniyor...</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full hidden md:table">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Araç</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Mevcut KM</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Günlük Ort. KM</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Son Bakım KM</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Sonraki Bakım (Hedef)</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Kalan KM</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Tahmini Tarih</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {predictions.map((p) => (
                        <tr key={p.VehicleID} className="hover:bg-neutral-50">
                          <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                            <div className="flex flex-col">
                              <span>{p.Plate}</span>
                              <span className="text-xs text-neutral-500">{p.Make} {p.Model}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-600">{p.CurrentKm?.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-neutral-600">{p.AvgDailyKm?.toLocaleString() || '-'}</td>
                          <td className="px-6 py-4 text-sm text-neutral-600">
                            {p.LastServiceKm ? (
                              <div className="flex flex-col">
                                <span>{p.LastServiceKm.toLocaleString()}</span>
                                <span className="text-xs text-neutral-500">{p.LastServiceDate ? formatDate(p.LastServiceDate) : ''}</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-600">
                            <div className="flex items-center gap-2">
                              <span>{p.NextServiceKm?.toLocaleString()}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenTargetModal(p)}
                                className="p-1 text-neutral-400 hover:text-primary-600 rounded-full hover:bg-neutral-100 transition-colors"
                                title="Hedefi Düzenle"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-600">{p.RemainingKm?.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-neutral-600">
                            {p.EstServiceDate ? (
                              <div className="flex flex-col">
                                <span>{formatDate(p.EstServiceDate)}</span>
                                <span className="text-xs text-neutral-500">{p.EstDaysRemaining} gün kaldı</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              p.Status === 'Overdue' ? 'bg-danger-100 text-danger-700' :
                              p.Status === 'Due Soon' ? 'bg-warning-100 text-warning-700' :
                              'bg-success-100 text-success-700'
                            }`}>
                              {p.Status === 'Overdue' ? 'Gecikmiş' : 
                              p.Status === 'Due Soon' ? 'Yaklaşıyor' : 'İyi Durumda'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-neutral-100">
                  {predictions.map((p) => (
                    <div key={p.VehicleID} className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">
                            {p.Plate}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {p.Make} {p.Model}
                          </div>
                          <div className="mt-2 text-xs text-neutral-500 space-y-1">
                            <div>Mevcut KM: {p.CurrentKm?.toLocaleString() ?? '-'}</div>
                            <div>Günlük Ort. KM: {p.AvgDailyKm?.toLocaleString() ?? '-'}</div>
                            {p.LastServiceKm && (
                              <div>
                                Son Bakım: {p.LastServiceKm.toLocaleString()} km
                                {p.LastServiceDate && (
                                  <span> ({formatDate(p.LastServiceDate)})</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-xs text-neutral-500 space-y-2">
                          <div className="flex items-center justify-end gap-2">
                            <span>Hedef KM: {p.NextServiceKm?.toLocaleString() ?? '-'}</span>
                            <button
                              type="button"
                              onClick={() => handleOpenTargetModal(p)}
                              className="p-1 text-neutral-400 hover:text-primary-600 rounded-full hover:bg-neutral-100 transition-colors"
                              title="Hedefi Düzenle"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                          <div>
                            Kalan KM: {p.RemainingKm?.toLocaleString() ?? '-'}
                          </div>
                          {p.EstServiceDate && (
                            <div className="space-y-1">
                              <div>{formatDate(p.EstServiceDate)}</div>
                              <div className="text-[11px]">
                                {p.EstDaysRemaining} gün kaldı
                              </div>
                            </div>
                          )}
                          <div>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.Status === 'Overdue' ? 'bg-danger-100 text-danger-700' :
                              p.Status === 'Due Soon' ? 'bg-warning-100 text-warning-700' :
                              'bg-success-100 text-success-700'
                            }`}>
                              {p.Status === 'Overdue' ? 'Gecikmiş' : 
                              p.Status === 'Due Soon' ? 'Yaklaşıyor' : 'İyi Durumda'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {predictions.length === 0 && !isLoadingPredictions && (
              <div className="p-8 text-center text-neutral-500">
                Veri bulunamadı.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit/Add Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={selectedRecord ? 'Bakım Düzenle' : 'Bakım Ekle'} size="lg">
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
              <label className="block text-sm font-medium text-neutral-700 mb-1">Bakım Tipi *</label>
              <select
                {...register('type')}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                <option value="Periodic">Periyodik Bakım</option>
                <option value="Inspection">Muayene</option>
                <option value="Repair">Tamir</option>
                <option value="Tire Change">Lastik Değişimi</option>
                <option value="Oil Change">Yağ Değişimi</option>
                <option value="Other">Diğer</option>
              </select>
              {errors.type && <span className="text-xs text-danger-600">{errors.type.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">KM</label>
              <input
                type="number"
                {...register('kilometer', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Açıklama</label>
              <textarea
                {...register('description')}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Bakım Tarihi *</label>
              <input
                type="date"
                {...register('serviceDate')}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
               {errors.serviceDate && <span className="text-xs text-danger-600">{errors.serviceDate.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Maliyet (₺)</label>
              <input
                type="number"
                step="0.01"
                {...register('cost', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Sonraki Bakım Tarihi</label>
              <input
                type="date"
                {...register('nextServiceDate')}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Sonraki Bakım Hedefi (KM)</label>
              <input
                type="number"
                {...register('nextServiceKm', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Boş bırakılırsa otomatik hesaplanır"
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

      <Modal isOpen={isTargetModalOpen} onClose={() => setIsTargetModalOpen(false)} title="Sonraki Bakım Hedefini Düzenle" size="sm">
        <form onSubmit={handleUpdateTarget} className="space-y-4">
          <div>
            <div className="mb-2 text-sm text-neutral-600">
              <span className="font-medium">{selectedVehicleForTarget?.Plate}</span> plakalı araç için yeni bakım hedefi:
            </div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Yeni Hedef KM</label>
            <input
              type="number"
              value={newTargetKm}
              onChange={(e) => setNewTargetKm(Number(e.target.value))}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsTargetModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={updateVehicleMutation.isPending}>
              {updateVehicleMutation.isPending ? 'Kaydediliyor...' : 'Güncelle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Bakım Kaydını Sil"
        message="Bu bakım kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Sil"
        cancelText="İptal"
        type="danger"
      />
    </Layout>
  );
};

export default Maintenance;
