import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import Pagination from '../components/common/Pagination';
import { ClipboardList, Plus, Edit, Trash2, CheckCircle, PlayCircle, Car as CarIcon } from 'lucide-react';
import { serviceRequestService } from '../services/serviceRequestService';
import { vehicleService } from '../services/vehicleService';
import { adminService } from '../services/adminService';
import { ServiceRequest, ServiceCompany } from '../types';
import { formatCurrency, formatDateTime, getStatusColor, getPriorityColor } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';

const ServiceRequests = () => {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [formData, setFormData] = useState<Partial<ServiceRequest>>({});
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [sortField, setSortField] = useState<'RequestDate' | 'CompletedDate'>('RequestDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [approveId, setApproveId] = useState<number | null>(null);
  const [completeId, setCompleteId] = useState<number | null>(null);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [nextMaintenanceKm, setNextMaintenanceKm] = useState<string>('');
  const [currentKm, setCurrentKm] = useState<string>('');
  const [actualCost, setActualCost] = useState<string>('');
  const [serviceActions, setServiceActions] = useState<string>('');
  const [vehiclePlateInput, setVehiclePlateInput] = useState<string>('');

  // Queries
  const { data: serviceRequestsData, isLoading } = useQuery({
    queryKey: ['serviceRequests', filterStatus, currentPage, sortField, sortDirection, searchTerm],
    queryFn: async () => {
      const response = await serviceRequestService.getAllServiceRequests({
        ...(filterStatus ? { status: filterStatus } : {}),
        page: currentPage,
        limit: 50,
        sortField,
        sortDirection,
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
    placeholderData: (previousData) => previousData,
  });

  const serviceRequests = serviceRequestsData?.data || [];

  const { data: vehicles = [] } = useQuery<import('../types').Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: async () => {
      try {
        const result = await vehicleService.getAllVehicles({ page: 1, limit: 0 });
        if (result && Array.isArray(result.data)) {
          return result.data;
        }
        if (Array.isArray(result)) {
          return result;
        }
        console.warn('Unexpected vehicles response format:', result);
        return [];
      } catch (error) {
        console.error('Error fetching vehicles:', error);
        return [];
      }
    },
  });

  const { data: serviceCompanies = [] } = useQuery<ServiceCompany[]>({
    queryKey: ['serviceCompanies'],
    queryFn: async () => (await adminService.getAllServiceCompanies()).data,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: serviceRequestService.createServiceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
      handleCloseModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; data: Partial<ServiceRequest> }) => 
      serviceRequestService.updateServiceRequest(data.id, data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
      handleCloseModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: serviceRequestService.deleteServiceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
      setDeleteId(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => serviceRequestService.approveServiceRequest(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
      setApproveId(null);
    },
  });

  const returnMutation = useMutation({
    mutationFn: (payload: { id: number; nextMaintenanceKm?: number; currentKm?: number }) => 
      serviceRequestService.markReturnedFromService(payload.id, { 
        nextMaintenanceKm: payload.nextMaintenanceKm,
        currentKm: payload.currentKm
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
      setReturnId(null);
      setNextMaintenanceKm('');
      setCurrentKm('');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data: { id: number; actualCost: number; serviceActions?: string }) => 
      serviceRequestService.completeServiceRequest(data.id, { actualCost: data.actualCost, serviceActions: data.serviceActions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
      setCompleteId(null);
      setActualCost('');
      setServiceActions('');
    },
  });

  // Handlers
  const handleOpenModal = (request?: ServiceRequest) => {
    if (request) {
      setSelectedRequest(request);
      setFormData(request);
      const vehicle = Array.isArray(vehicles) ? vehicles.find(v => v.VehicleID === request.VehicleID) : undefined;
      setVehiclePlateInput(vehicle?.Plate || '');
    } else {
      setSelectedRequest(null);
      setFormData({ Priority: 'MEDIUM' });
      setVehiclePlateInput('');
    }
    setIsModalOpen(true);
  };

// Removed unused handlePrint function

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRequest(null);
    setFormData({});
    setVehiclePlateInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest && !formData.VehicleID) {
      alert('Lütfen geçerli bir araç plakası seçin.');
      return;
    }
    if (selectedRequest) {
      updateMutation.mutate({ id: selectedRequest.RequestID, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCompleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (completeId && actualCost) {
      completeMutation.mutate({ id: completeId, actualCost: parseFloat(actualCost) });
    }
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
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center space-x-3">
            <ClipboardList className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-neutral-900">Servis Talepleri</h1>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:space-x-3">
            <input
              type="text"
              value={searchInput}
              onChange={onSearchChange}
              placeholder="Plaka, açıklama, firma, talep eden..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full md:w-auto px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              <option value="">Tüm Durumlar</option>
              <option value="PENDING">Bekleyen</option>
              <option value="IN_PROGRESS">İşlemde</option>
              <option value="COMPLETED">Tamamlandı</option>
            </select>
            <PermissionGuard permission={PERMISSIONS.SERVICE_REQUESTS.ADD}>
              <Button onClick={() => handleOpenModal()} className="w-full md:w-auto justify-center">
                <Plus className="w-4 h-4 mr-2" />
                Talep Ekle
              </Button>
            </PermissionGuard>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={`bg-white rounded-xl shadow-sm p-6 border border-neutral-200 ${filterStatus === 'PENDING' ? 'ring-2 ring-warning-500' : ''}`}>
            <h3 className="text-sm font-medium text-neutral-600 mb-1">Bekleyen</h3>
            <p className="text-2xl font-bold text-warning-600">
              {serviceRequestsData?.stats?.pending || 0}
            </p>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-6 border border-neutral-200 ${filterStatus === 'IN_PROGRESS' ? 'ring-2 ring-primary-500' : ''}`}>
            <h3 className="text-sm font-medium text-neutral-600 mb-1">İşlemde</h3>
            <p className="text-2xl font-bold text-primary-600">
              {serviceRequestsData?.stats?.inProgress || 0}
            </p>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-6 border border-neutral-200 ${filterStatus === 'COMPLETED' ? 'ring-2 ring-success-500' : ''}`}>
            <h3 className="text-sm font-medium text-neutral-600 mb-1">Tamamlandı</h3>
            <p className="text-2xl font-bold text-success-600">
              {serviceRequestsData?.stats?.completed || 0}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border border-neutral-200">
            <h3 className="text-sm font-medium text-neutral-600 mb-1">Toplam Talep</h3>
            <p className="text-2xl font-bold text-neutral-900">
              {serviceRequestsData?.stats?.total || 0}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          {isLoading && (
            <div className="px-6 py-2 text-right text-sm text-neutral-500">
              Veriler yükleniyor...
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full hidden md:table">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Araç</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Açıklama</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Öncelik</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Talep Eden</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Maliyet</th>
                  <th
                    className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer select-none"
                    onClick={() => {
                      setSortField('RequestDate');
                      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
                    }}
                  >
                    <span className="inline-flex items-center space-x-1">
                      <span>Tarih</span>
                    </span>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {serviceRequests.map((request) => (
                  <tr key={request.RequestID} className="hover:bg-neutral-50">
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                      <div className="flex items-center">
                        <CarIcon className="w-4 h-4 mr-2 text-neutral-500" />
                        {request.Plate || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600 max-w-xs truncate">
                      {request.Description}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getPriorityColor(request.Priority).replace('bg-', 'bg-opacity-50 ')}`}></span>
                      <span className="text-sm text-neutral-600">{request.Priority}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.Status)}`}>
                        {request.Status === 'PENDING' ? 'Bekleyen' :
                         request.Status === 'IN_PROGRESS' ? 'İşlemde' :
                         request.Status === 'COMPLETED' ? 'Tamamlandı' : request.Status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {request.RequesterName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {request.ActualCost ? formatCurrency(request.ActualCost) :
                       request.EstimatedCost ? `~${formatCurrency(request.EstimatedCost)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {formatDateTime(request.RequestDate)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {request.Status === 'PENDING' && hasPermission(PERMISSIONS.SERVICE_REQUESTS.APPROVE) && (
                          <button
                            onClick={() => setApproveId(request.RequestID)}
                            className="p-1.5 hover:bg-success-50 rounded-lg transition-colors"
                            title="Onayla"
                          >
                            <CheckCircle className="w-4 h-4 text-success-600" />
                          </button>
                        )}
                        {request.Status === 'IN_PROGRESS' && hasPermission(PERMISSIONS.SERVICE_REQUESTS.EDIT) && (
                          <button
                            onClick={() => setReturnId(request.RequestID)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Servisten Döndü Olarak İşaretle"
                          >
                            <CarIcon className="w-4 h-4 text-blue-600" />
                          </button>
                        )}
                        {request.Status === 'RETURNED' && hasPermission(PERMISSIONS.SERVICE_REQUESTS.APPROVE) && (
                          <button
                            onClick={() => setCompleteId(request.RequestID)}
                            className="p-1.5 hover:bg-success-50 rounded-lg transition-colors"
                            title="Tamamla ve Maliyet Gir"
                          >
                            <PlayCircle className="w-4 h-4 text-success-600" />
                          </button>
                        )}
                        <PermissionGuard permission={PERMISSIONS.SERVICE_REQUESTS.EDIT}>
                          <button
                            onClick={() => handleOpenModal(request)}
                            className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Düzenle"
                          >
                            <Edit className="w-4 h-4 text-primary-600" />
                          </button>
                        </PermissionGuard>
                        {request.Status !== 'COMPLETED' && (
                          <PermissionGuard permission={PERMISSIONS.SERVICE_REQUESTS.DELETE}>
                            <button
                              onClick={() => setDeleteId(request.RequestID)}
                              className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4 text-danger-600" />
                            </button>
                          </PermissionGuard>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-neutral-100">
            {serviceRequests.map((request) => (
              <div key={request.RequestID} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CarIcon className="w-4 h-4 text-neutral-500" />
                      <span className="text-sm font-semibold text-neutral-900">
                        {request.Plate || '-'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500 space-y-1">
                      <div className="line-clamp-2">
                        {request.Description}
                      </div>
                      <div>
                        Talep Eden: {request.RequesterName || '-'}
                      </div>
                      <div>
                        {formatDateTime(request.RequestDate)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs text-neutral-500 space-y-2">
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.Status)}`}>
                        {request.Status === 'PENDING' ? 'Bekleyen' :
                         request.Status === 'IN_PROGRESS' ? 'İşlemde' :
                         request.Status === 'COMPLETED' ? 'Tamamlandı' : request.Status}
                      </span>
                    </div>
                    <div>
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${getPriorityColor(request.Priority).replace('bg-', 'bg-opacity-50 ')}`}></span>
                      <span className="font-medium text-neutral-800 text-xs">
                        {request.Priority}
                      </span>
                    </div>
                    <div className="font-semibold text-neutral-900">
                      {request.ActualCost ? formatCurrency(request.ActualCost) :
                       request.EstimatedCost ? `~${formatCurrency(request.EstimatedCost)}` : '-'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-neutral-100 mt-2">
                  <div className="flex items-center space-x-2">
                    {request.Status === 'PENDING' && hasPermission(PERMISSIONS.SERVICE_REQUESTS.APPROVE) && (
                      <button
                        onClick={() => setApproveId(request.RequestID)}
                        className="p-1.5 hover:bg-success-50 rounded-lg transition-colors"
                        title="Onayla"
                      >
                        <CheckCircle className="w-4 h-4 text-success-600" />
                      </button>
                    )}
                    {request.Status === 'IN_PROGRESS' && hasPermission(PERMISSIONS.SERVICE_REQUESTS.EDIT) && (
                      <button
                        onClick={() => setReturnId(request.RequestID)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Servisten Döndü Olarak İşaretle"
                      >
                        <CarIcon className="w-4 h-4 text-blue-600" />
                      </button>
                    )}
                    {request.Status === 'RETURNED' && hasPermission(PERMISSIONS.SERVICE_REQUESTS.APPROVE) && (
                      <button
                        onClick={() => setCompleteId(request.RequestID)}
                        className="p-1.5 hover:bg-success-50 rounded-lg transition-colors"
                        title="Tamamla ve Maliyet Gir"
                      >
                        <PlayCircle className="w-4 h-4 text-success-600" />
                      </button>
                    )}
                    <PermissionGuard permission={PERMISSIONS.SERVICE_REQUESTS.EDIT}>
                      <button
                        onClick={() => handleOpenModal(request)}
                        className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Düzenle"
                      >
                        <Edit className="w-4 h-4 text-primary-600" />
                      </button>
                    </PermissionGuard>
                    {request.Status !== 'COMPLETED' && (
                      <PermissionGuard permission={PERMISSIONS.SERVICE_REQUESTS.DELETE}>
                        <button
                          onClick={() => setDeleteId(request.RequestID)}
                          className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4 text-danger-600" />
                        </button>
                      </PermissionGuard>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!isLoading && serviceRequests.length === 0 && (
            <div className="p-8 text-center text-neutral-500">
              Servis talebi bulunmuyor
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            itemsPerPage={50}
          />
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={selectedRequest ? 'Servis Talebini Düzenle' : 'Servis Talebi Oluştur'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Araç *</label>
              <input
                type="text"
                list="vehicle-plates"
                value={vehiclePlateInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setVehiclePlateInput(value);
                  const normalized = value.replace(/\s+/g, '').toUpperCase();
                  const vehicle = Array.isArray(vehicles)
                    ? vehicles.find(v => v.Plate.replace(/\s+/g, '').toUpperCase() === normalized)
                    : undefined;
                  setFormData({
                    ...formData,
                    VehicleID: vehicle?.VehicleID,
                    DriverName: vehicle?.DriverName || formData.DriverName || ''
                  });
                }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
                placeholder="Plaka yazın ve listeden seçin"
                required
              />
              <datalist id="vehicle-plates">
                {Array.isArray(vehicles) && vehicles.map((vehicle) => (
                  <option key={vehicle.VehicleID} value={vehicle.Plate}>
                    {vehicle.Make} {vehicle.Model}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Servis Türü</label>
              <select
                value={formData.ServiceType || ''}
                onChange={(e) => setFormData({ ...formData, ServiceType: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
              >
                <option value="">Seçiniz</option>
                <option value="KM Bakımı">KM Bakımı</option>
                <option value="Mekanik Arıza">Mekanik Arıza</option>
                <option value="Elektrik Arızası">Elektrik Arızası</option>
                <option value="Kaporta Arızası">Kaporta Arızası</option>
                <option value="Lastik Değişimi">Lastik Değişimi</option>
                <option value="Diğer">Diğer</option>
              </select>
            </div>

            {formData.ServiceType === 'KM Bakımı' && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg text-sm flex items-start">
                <div className="mr-2 mt-0.5">ℹ️</div>
                <div>
                  <strong>Hatırlatma:</strong> Bu işlem periyodik bakım (KM Bakımı) olarak seçildi. 
                  Lütfen araç servisten döndüğünde ve işlem tamamlandığında bakım kaydının eksiksiz işlendiğinden emin olun.
                </div>
              </div>
            )}

            <div className="col-span-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Servis Firması</label>
              <select
                value={formData.ServiceCompanyID || ''}
                onChange={(e) => setFormData({ ...formData, ServiceCompanyID: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
              >
                <option value="">Seçiniz</option>
                {serviceCompanies.map((company) => (
                  <option key={company.ServiceCompanyID} value={company.ServiceCompanyID}>
                    {company.Name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Şoför Adı Soyadı</label>
              <input
                type="text"
                value={formData.DriverName || ''}
                onChange={(e) => setFormData({ ...formData, DriverName: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
                placeholder="Şoför adı"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Teslim Eden</label>
              <input
                type="text"
                value={formData.DeliveredBy || ''}
                onChange={(e) => setFormData({ ...formData, DeliveredBy: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
                placeholder="Aracı teslim eden"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Öncelik</label>
              <select
                value={formData.Priority || ''}
                onChange={(e) => setFormData({ ...formData, Priority: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
              >
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
                <option value="URGENT">Acil</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yapılacak İşlemler / Arıza Tanımı *</label>
              <textarea
                value={formData.Description || ''}
                onChange={(e) => setFormData({ ...formData, Description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
                rows={3}
                required
                placeholder="Arıza veya yapılacak işlem detayları..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Ekstra Yapılacaklar (Opsiyonel)</label>
              <textarea
                value={formData.ExtraWork || ''}
                onChange={(e) => setFormData({ ...formData, ExtraWork: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-neutral-900"
                rows={2}
                placeholder="Varsa ekstra talepler..."
              />
            </div>

            {selectedRequest && (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Tahmini Maliyet (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.EstimatedCost || ''}
                    onChange={(e) => setFormData({ ...formData, EstimatedCost: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {(formData.Status === 'COMPLETED' || selectedRequest.Status === 'COMPLETED') && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Gerçek Maliyet (₺)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.ActualCost || ''}
                      onChange={(e) => setFormData({ ...formData, ActualCost: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              İptal
            </Button>
            <Button type="submit">
              {selectedRequest ? 'Güncelle' : 'Talep Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Servis Talebini Sil"
        message="Bu servis talebini silmek istediğinize emin misiniz?"
        type="danger"
        confirmText="Sil"
      />

      <ConfirmationModal
        isOpen={!!approveId}
        onClose={() => setApproveId(null)}
        onConfirm={() => approveId && approveMutation.mutate(approveId)}
        title="Servis Talebini Onayla"
        message="Bu servis talebini onaylamak istiyor musunuz?"
        type="success"
        confirmText="Onayla"
      />

      <Modal
        isOpen={!!returnId}
        onClose={() => { setReturnId(null); setNextMaintenanceKm(''); setCurrentKm(''); }}
        title="Araç Servisten Döndü"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!returnId) return;
            const nextKmVal = nextMaintenanceKm ? parseInt(nextMaintenanceKm, 10) : undefined;
            const currentKmVal = currentKm ? parseInt(currentKm, 10) : undefined;
            returnMutation.mutate({ id: returnId, nextMaintenanceKm: nextKmVal, currentKm: currentKmVal });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-neutral-700">
            Aracın mevcut ve bir sonraki bakım km bilgisini giriniz.
          </p>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Mevcut KM</label>
            <input
              type="number"
              value={currentKm}
              onChange={(e) => setCurrentKm(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Örn: 105000"
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Sonraki Bakım KM</label>
            <input
              type="number"
              value={nextMaintenanceKm}
              onChange={(e) => setNextMaintenanceKm(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Örn: 120000"
              min={0}
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setReturnId(null); setNextMaintenanceKm(''); setCurrentKm(''); }}>
              İptal
            </Button>
            <Button type="submit" variant="primary">
              Kaydet ve İşaretle
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!completeId}
        onClose={() => { setCompleteId(null); setActualCost(''); setServiceActions(''); }}
        title="Servis Talebini Tamamla"
        size="lg"
      >
        <form onSubmit={handleCompleteSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Gerçek Maliyet (₺) *</label>
            <input
              type="number"
              step="0.01"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Yapılan İşlemler *</label>
            <textarea
              value={serviceActions}
              onChange={(e) => setServiceActions(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={4}
              required
              placeholder="Serviste yapılan işlemlerin detayları..."
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setCompleteId(null); setActualCost(''); setServiceActions(''); }}>
              İptal
            </Button>
            <Button type="submit" variant="success">
              Tamamla
            </Button>
          </div>
        </form>
      </Modal>

    </Layout>
  );
};

export default ServiceRequests;
