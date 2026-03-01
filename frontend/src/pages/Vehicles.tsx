import { useState, useMemo, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Pagination from '../components/common/Pagination';
import { Car, Plus, Edit, Trash2, Fuel as FuelIcon, Activity } from 'lucide-react';
import { vehicleService } from '../services/vehicleService';
import { adminService } from '../services/adminService';
import { userService } from '../services/userService';
import { Vehicle, Depot, User, PaginatedResponse } from '../types';
import { formatKm } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';

const Vehicles = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = Array.isArray(user?.Roles)
    ? user.Roles.some(role => role === 'SuperAdmin' || role === 'Super Admin')
    : (user as any)?.Roles === 'SuperAdmin' || (user as any)?.Roles === 'Super Admin';
  
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<Partial<Vehicle>>({});
  
  // KM Update Modal State
  const [isKmModalOpen, setIsKmModalOpen] = useState(false);
  const [kmFormValue, setKmFormValue] = useState<number>(0);

  // Bulk Selection State
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [isBulkManagerModalOpen, setIsBulkManagerModalOpen] = useState(false);
  const [bulkManagerId, setBulkManagerId] = useState<number | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      const value = searchInput.trim();
      setCurrentPage(1);
      setSearchTerm(value.length >= 2 ? value : '');
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchInput]);

  const { data: vehiclesData, isLoading } = useQuery<PaginatedResponse<Vehicle>, Error>({
    queryKey: ['vehicles', currentPage, searchTerm],
    queryFn: () =>
      vehicleService.getAllVehicles({
        page: currentPage,
        limit,
        search: searchTerm || undefined,
      }),
    placeholderData: (previousData) => previousData ?? {
      data: [],
      pagination: {
        total: 0,
        page: currentPage,
        limit,
        totalPages: 1,
      },
    },
  });

  const vehicles = vehiclesData?.data || [];
  const pagination = vehiclesData?.pagination || { total: 0, page: 1, limit: 50, totalPages: 1 };

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => adminService.getAllCompanies(),
    enabled: isSuperAdmin,
  });

  const { data: depotsResponse } = useQuery({
    queryKey: ['depots'],
    queryFn: () => adminService.getAllDepots(),
  });
  const depots: Depot[] = (depotsResponse as any)?.data || depotsResponse || [];

  const { data: usersResponse } = useQuery({
    queryKey: ['users'],
    queryFn: () => userService.getAllUsers(),
    enabled: isModalOpen, // Fetch only when modal is open to save resources
  });
  const users: User[] = (usersResponse as any)?.data || usersResponse || [];

  // Filtered lists
  const filteredDepots = useMemo(() => {
    if (isSuperAdmin) {
      return formData.CompanyID ? depots.filter(d => d.CompanyID === formData.CompanyID) : [];
    }
    return depots.filter(d => d.CompanyID === user?.CompanyID);
  }, [depots, formData.CompanyID, user]);

  const filteredManagers = useMemo(() => {
    const targetCompanyId = isSuperAdmin ? formData.CompanyID : user?.CompanyID;
    if (!targetCompanyId) return [];
    return users.filter(u => u.CompanyID === targetCompanyId && (u.Roles.includes('Manager') || u.Roles.includes('Admin')));
  }, [users, formData.CompanyID, user]);

  const filteredDrivers = useMemo(() => {
    const targetCompanyId = isSuperAdmin ? formData.CompanyID : user?.CompanyID;
    if (!targetCompanyId) return [];
    return users.filter(u => u.CompanyID === targetCompanyId && u.Roles.includes('Driver'));
  }, [users, formData.CompanyID, user]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<Vehicle>) => vehicleService.createVehicle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      handleCloseModal();
    },
    onError: (error) => {
      console.error('Error creating vehicle:', error);
      alert('Araç eklenirken bir hata oluştu.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Vehicle> }) => vehicleService.updateVehicle(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      handleCloseModal();
    },
    onError: (error) => {
      console.error('Error updating vehicle:', error);
      alert('Araç güncellenirken bir hata oluştu.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vehicleService.deleteVehicle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (error) => {
      console.error('Error deleting vehicle:', error);
      alert('Araç silinirken bir hata oluştu.');
    }
  });

  const updateKmMutation = useMutation({
    mutationFn: ({ id, km }: { id: number; km: number }) => vehicleService.updateKm(id, km),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      handleCloseKmModal();
    },
    onError: (error) => {
      console.error('Error updating km:', error);
      alert('KM güncellenirken bir hata oluştu.');
    }
  });

  const bulkManagerMutation = useMutation({
    mutationFn: ({ ids, managerId }: { ids: number[]; managerId: number | null }) => 
      vehicleService.bulkUpdateManagers(ids, managerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setIsBulkManagerModalOpen(false);
      setSelectedVehicleIds([]);
      setBulkManagerId(null);
      alert('Araç yöneticileri başarıyla güncellendi.');
    },
    onError: (error) => {
      console.error('Error updating managers:', error);
      alert('Yöneticiler güncellenirken bir hata oluştu.');
    }
  });

  const calculateRiskMutation = useMutation({
    mutationFn: () => vehicleService.calculateRisks(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      alert(`Risk analizi tamamlandı. ${data.processed} araç güncellendi.`);
    },
    onError: (error) => {
      console.error('Error calculating risks:', error);
      alert('Risk analizi sırasında bir hata oluştu.');
    }
  });

  const handleOpenModal = (vehicle?: Vehicle) => {
    if (vehicle) {
      setSelectedVehicle(vehicle);
      setFormData(vehicle);
    } else {
      setSelectedVehicle(null);
      setFormData({ 
        CurrentKm: 0, 
        Status: 'Active',
        CompanyID: isSuperAdmin ? undefined : user?.CompanyID 
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVehicle(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVehicle) {
      updateMutation.mutate({ id: selectedVehicle.VehicleID, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Bu aracı silmek istediğinize emin misiniz?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenKmModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setKmFormValue(vehicle.CurrentKm);
    setIsKmModalOpen(true);
  };

  const handleCloseKmModal = () => {
    setIsKmModalOpen(false);
    setSelectedVehicle(null);
    setKmFormValue(0);
  };

  const handleKmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVehicle) {
      updateKmMutation.mutate({ id: selectedVehicle.VehicleID, km: kmFormValue });
    }
  };

  const toggleSelectAll = () => {
    if (selectedVehicleIds.length === vehicles.length) {
      setSelectedVehicleIds([]);
    } else {
      setSelectedVehicleIds(vehicles.map((v: Vehicle) => v.VehicleID));
    }
  };

  const toggleSelectVehicle = (id: number) => {
    if (selectedVehicleIds.includes(id)) {
      setSelectedVehicleIds(selectedVehicleIds.filter(vId => vId !== id));
    } else {
      setSelectedVehicleIds([...selectedVehicleIds, id]);
    }
  };

  const handleBulkManagerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    bulkManagerMutation.mutate({ ids: selectedVehicleIds, managerId: bulkManagerId });
  };

  const getRegistrationDateInputValue = () => {
    if (!formData.RegistrationDate) return '';
    const date = new Date(formData.RegistrationDate);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Car className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-neutral-900">Araçlar</h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-64">
              <Input
                label="Araçlarda Ara"
                placeholder="Plaka, marka, model, şirket..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <PermissionGuard permission={PERMISSIONS.VEHICLES.ADD}>
              <div className="flex space-x-2">
                <Button onClick={() => calculateRiskMutation.mutate()} variant="outline" disabled={calculateRiskMutation.isPending}>
                  <Activity className="w-4 h-4 mr-2" />
                  {calculateRiskMutation.isPending ? 'Hesaplanıyor...' : 'Risk Analizi'}
                </Button>
                <Button onClick={() => handleOpenModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Araç Ekle
                </Button>
              </div>
            </PermissionGuard>
          </div>
        </div>

        <div className="flex justify-end">
          {isLoading && (
            <span className="text-sm text-neutral-500 mr-2">Veriler yükleniyor...</span>
          )}
        </div>

        {selectedVehicleIds.length > 0 && (
          <div className="bg-primary-50 p-4 rounded-lg flex items-center justify-between border border-primary-100">
            <span className="text-primary-700 font-medium">{selectedVehicleIds.length} araç seçildi</span>
            <div className="flex space-x-2">
              <PermissionGuard permission={PERMISSIONS.VEHICLES.EDIT}>
                <Button onClick={() => setIsBulkManagerModalOpen(true)} variant="outline" className="bg-white border-primary-200 text-primary-700 hover:bg-primary-50">
                  Toplu Yönetici Atama
                </Button>
              </PermissionGuard>
              <Button onClick={() => setSelectedVehicleIds([])} variant="outline" className="text-primary-600 hover:text-primary-700 hover:bg-primary-100">
                İptal
              </Button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <table className="w-full hidden md:table">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={vehicles.length > 0 && selectedVehicleIds.length === vehicles.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Plaka</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Marka/Model</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Şirket</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Depo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Yönetici</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">KM</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Son Servis KM</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Risk</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {vehicles.map((vehicle: Vehicle) => (
                <tr key={vehicle.VehicleID} className="hover:bg-neutral-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.includes(vehicle.VehicleID)}
                      onChange={() => toggleSelectVehicle(vehicle.VehicleID)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-neutral-900">{vehicle.Plate}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {vehicle.Make} {vehicle.Model} {vehicle.Year}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{vehicle.CompanyName || '-'}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{vehicle.DepotName || '-'}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{vehicle.ManagerName || '-'}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{formatKm(vehicle.CurrentKm)}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {vehicle.LastServiceKm ? formatKm(vehicle.LastServiceKm) : '-'}
                  </td>
                  <td className="px-6 py-4 overflow-visible">
                    {vehicle.RiskScore !== undefined ? (
                      <div className="relative group flex justify-start">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium cursor-help ${
                          vehicle.RiskCategory === 'Red' ? 'bg-red-100 text-red-700' :
                          vehicle.RiskCategory === 'Yellow' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {vehicle.RiskScore} ({vehicle.RiskCategory === 'Red' ? 'Yüksek' : vehicle.RiskCategory === 'Yellow' ? 'Orta' : 'Düşük'})
                        </span>
                        {vehicle.RiskDetails && (
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-48">
                            <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-xl">
                              <div className="font-semibold mb-2 border-b border-gray-600 pb-1">Risk Detayları</div>
                              {(() => {
                                try {
                                  const details = JSON.parse(vehicle.RiskDetails || '{}');
                                  return (
                                    <div className="space-y-1">
                                      <div className="flex justify-between"><span>Yaş:</span> <span>+{details.age}</span></div>
                                      <div className="flex justify-between"><span>KM:</span> <span>+{details.km}</span></div>
                                      <div className="flex justify-between"><span>Bakım:</span> <span>+{details.maintenance}</span></div>
                                      <div className="flex justify-between"><span>Kaza:</span> <span>+{details.accident}</span></div>
                                      <div className="flex justify-between"><span>Muayene:</span> <span>+{details.inspection}</span></div>
                                      <div className="flex justify-between"><span>Sigorta:</span> <span>+{details.insurance}</span></div>
                                    </div>
                                  );
                                } catch {
                                  return <div>Detay yok</div>;
                                }
                              })()}
                              <div className="absolute bottom-0 left-4 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      vehicle.Status === 'Active' ? 'bg-success-100 text-success-700' :
                      vehicle.Status === 'InMaintenance' ? 'bg-warning-100 text-warning-700' :
                      'bg-neutral-100 text-neutral-700'
                    }`}>
                      {vehicle.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenKmModal(vehicle)}
                        className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="KM Güncelle"
                      >
                        <FuelIcon className="w-4 h-4 text-neutral-600" />
                      </button>
                      <PermissionGuard permission={PERMISSIONS.VEHICLES.EDIT}>
                        <button
                          onClick={() => handleOpenModal(vehicle)}
                          className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4 text-primary-600" />
                        </button>
                      </PermissionGuard>
                      <PermissionGuard permission={PERMISSIONS.VEHICLES.DELETE}>
                        <button
                          onClick={() => handleDelete(vehicle.VehicleID)}
                          className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Mobile View */}
          <div className="md:hidden divide-y divide-neutral-100">
            {vehicles.map((vehicle: Vehicle) => (
              <div key={vehicle.VehicleID} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-neutral-900">{vehicle.Plate}</div>
                    <div className="text-sm text-neutral-500">{vehicle.Make} {vehicle.Model}</div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    vehicle.Status === 'Active' ? 'bg-success-100 text-success-700' :
                    vehicle.Status === 'InMaintenance' ? 'bg-warning-100 text-warning-700' :
                    'bg-neutral-100 text-neutral-700'
                  }`}>
                    {vehicle.Status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm text-neutral-600">
                  <div>
                    <span className="text-neutral-400">Şirket:</span> {vehicle.CompanyName || '-'}
                  </div>
                  <div>
                    <span className="text-neutral-400">Depo:</span> {vehicle.DepotName || '-'}
                  </div>
                  <div>
                    <span className="text-neutral-400">KM:</span> {formatKm(vehicle.CurrentKm)}
                  </div>
                  <div>
                    <span className="text-neutral-400">Yönetici:</span> {vehicle.ManagerName || '-'}
                  </div>
                </div>

                <div className="flex justify-end items-center space-x-2 pt-2">
                  <button
                    onClick={() => handleOpenKmModal(vehicle)}
                    className="p-2 bg-neutral-50 rounded-lg text-neutral-600"
                    title="KM Güncelle"
                  >
                    <FuelIcon className="w-4 h-4" />
                  </button>
                  <PermissionGuard permission={PERMISSIONS.VEHICLES.EDIT}>
                    <button
                      onClick={() => handleOpenModal(vehicle)}
                      className="p-2 bg-primary-50 rounded-lg text-primary-600"
                      title="Düzenle"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </PermissionGuard>
                  <PermissionGuard permission={PERMISSIONS.VEHICLES.DELETE}>
                    <button
                      onClick={() => handleDelete(vehicle.VehicleID)}
                      className="p-2 bg-red-50 rounded-lg text-red-600"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </PermissionGuard>
                </div>
              </div>
            ))}
          </div>

          {vehicles.length === 0 && (
            <div className="p-8 text-center text-neutral-500">
              Araç bulunmuyor
            </div>
          )}
        </div>
        
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setCurrentPage}
          totalItems={pagination.total}
          itemsPerPage={limit}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={selectedVehicle ? 'Araç Düzenle' : 'Araç Ekle'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Şirket *</label>
              <select
                value={formData.CompanyID || ''}
                onChange={(e) => setFormData({ ...formData, CompanyID: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              >
                <option value="">Seçiniz</option>
                {companies.map((company) => (
                  <option key={company.CompanyID} value={company.CompanyID}>
                    {company.Name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Plaka *</label>
            <input
              type="text"
              value={formData.Plate || ''}
              onChange={(e) => setFormData({ ...formData, Plate: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Depo</label>
              <select
                value={formData.DepotID || ''}
                onChange={(e) => setFormData({ ...formData, DepotID: Number(e.target.value) || null })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                {filteredDepots.map((depot) => (
                  <option key={depot.DepotID} value={depot.DepotID}>
                    {depot.Name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yönetici</label>
              <select
                value={formData.ManagerID || ''}
                onChange={(e) => setFormData({ ...formData, ManagerID: Number(e.target.value) || null })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                {filteredManagers.map((manager) => (
                  <option key={manager.UserID} value={manager.UserID}>
                    {manager.Name} {manager.Surname}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Marka</label>
              <input
                type="text"
                value={formData.Make || ''}
                onChange={(e) => setFormData({ ...formData, Make: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Model</label>
              <input
                type="text"
                value={formData.Model || ''}
                onChange={(e) => setFormData({ ...formData, Model: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yıl</label>
              <input
                type="number"
                value={formData.Year || ''}
                onChange={(e) => setFormData({ ...formData, Year: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yakıt Tipi</label>
              <select
                value={formData.FuelType || ''}
                onChange={(e) => setFormData({ ...formData, FuelType: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                <option value="Gasoline">Benzin</option>
                <option value="Diesel">Dizel</option>
                <option value="LPG">LPG</option>
                <option value="Electric">Elektrik</option>
                <option value="Hybrid">Hibrit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Segment</label>
              <select
                value={formData.Segment || ''}
                onChange={(e) => setFormData({ ...formData, Segment: e.target.value || null })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                <option value="Passenger">Binek</option>
                <option value="LightCommercial">Hafif Ticari</option>
                <option value="HeavyCommercial">Ağır Ticari</option>
                <option value="Minibus">Minibüs</option>
                <option value="Other">Diğer</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Mevcut KM</label>
              <input
                type="number"
                value={formData.CurrentKm || ''}
                onChange={(e) => setFormData({ ...formData, CurrentKm: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Sonraki Bakım (Hedef) KM</label>
              <input
                type="number"
                value={formData.NextMaintenanceKm || ''}
                onChange={(e) => setFormData({ ...formData, NextMaintenanceKm: parseInt(e.target.value) || null })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Otomatik hesaplanır veya manuel giriniz"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Durum</label>
              <select
                value={formData.Status || ''}
                onChange={(e) => setFormData({ ...formData, Status: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="Active">Aktif</option>
                <option value="InMaintenance">Bakımda</option>
                <option value="Retired">Emekli</option>
                <option value="Sold">Satıldı</option>
              </select>
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-neutral-700 mb-1">Sürücü</label>
             <select
               value={formData.AssignedDriverID || ''}
               onChange={(e) => setFormData({ ...formData, AssignedDriverID: Number(e.target.value) || null })}
               className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
             >
               <option value="">Sürücü Yok</option>
               {filteredDrivers.map((driver) => (
                 <option key={driver.UserID} value={driver.UserID}>
                   {driver.Name} {driver.Surname}
                 </option>
               ))}
             </select>
           </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">VIN (Şasi No)</label>
              <input
                type="text"
                value={formData.VIN || ''}
                onChange={(e) => setFormData({ ...formData, VIN: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                maxLength={17}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Motor No</label>
              <input
                type="text"
                value={formData.EngineNumber || ''}
                onChange={(e) => setFormData({ ...formData, EngineNumber: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Ruhsat Seri No</label>
              <input
                type="text"
                value={formData.LicenseSerial || ''}
                onChange={(e) => setFormData({ ...formData, LicenseSerial: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Ruhsat No</label>
              <input
                type="text"
                value={formData.LicenseNumber || ''}
                onChange={(e) => setFormData({ ...formData, LicenseNumber: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Renk</label>
              <input
                type="text"
                value={formData.Color || ''}
                onChange={(e) => setFormData({ ...formData, Color: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Tescil Tarihi</label>
              <input
                type="date"
                value={getRegistrationDateInputValue()}
                onChange={(e) => setFormData({ ...formData, RegistrationDate: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              İptal
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Kaydediliyor...' : (selectedVehicle ? 'Güncelle' : 'Kaydet')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isKmModalOpen} onClose={handleCloseKmModal} title="KM Güncelle">
        <form onSubmit={handleKmSubmit} className="space-y-4">
          <Input
            label="Yeni Kilometre"
            type="number"
            value={kmFormValue}
            onChange={(e) => setKmFormValue(parseInt(e.target.value))}
            min={0}
            required
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseKmModal}>
              İptal
            </Button>
            <Button type="submit" disabled={updateKmMutation.isPending}>
              {updateKmMutation.isPending ? 'Güncelleniyor...' : 'Güncelle'}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal isOpen={isBulkManagerModalOpen} onClose={() => setIsBulkManagerModalOpen(false)} title="Toplu Yönetici Atama">
        <form onSubmit={handleBulkManagerSubmit} className="space-y-4">
          <p className="text-sm text-neutral-600 mb-4">
            Seçili {selectedVehicleIds.length} araç için yönetici seçiniz:
          </p>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Yönetici</label>
            <select
              value={bulkManagerId || ''}
              onChange={(e) => setBulkManagerId(Number(e.target.value) || null)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Yönetici Yok (Seçimi Kaldır)</option>
              {filteredManagers.map((manager) => (
                <option key={manager.UserID} value={manager.UserID}>
                  {manager.Name} {manager.Surname}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setIsBulkManagerModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit">
              Güncelle
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Vehicles;
