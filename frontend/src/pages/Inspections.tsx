import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import { Plus, Edit, Trash2, Car as CarIcon, AlertTriangle } from 'lucide-react';
import { getInspections, createInspection, updateInspection, deleteInspection, Inspection } from '../services/inspectionService';
import { vehicleService } from '../services/vehicleService';
import { Vehicle } from '../types';
import { formatCurrency, formatDate, calculateDaysUntil, isExpiringSoon, isExpired } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';

const Inspections = () => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Inspection>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchInspections();
  }, [currentPage, searchTerm]);

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

  const fetchInitialData = async () => {
    try {
      const response = await vehicleService.getAllVehicles();
      setVehicles(response.data);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchInspections = async () => {
    try {
      setLoading(true);
      const response = await getInspections({ page: currentPage, limit: 50, search: searchTerm || undefined });
      setInspections(response.data);
      if (response.pagination) {
        setPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching inspections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (record?: Inspection) => {
    if (record) {
      setSelectedRecord(record);
      setFormData(record);
    } else {
      setSelectedRecord(null);
      setFormData({});
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRecord(null);
    setFormData({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedRecord) {
        await updateInspection(selectedRecord.InspectionID, formData);
      } else {
        await createInspection(formData);
      }
      await fetchInspections();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving inspection record:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Bu muayene kaydını silmek istediğinize emin misiniz?')) {
      try {
        await deleteInspection(id);
        await fetchInspections();
      } catch (error) {
        console.error('Error deleting inspection record:', error);
      }
    }
  };

  const getExpiringRecords = () => {
    return (inspections || []).filter(record => 
      isExpiringSoon(record.NextInspectionDate, 30)
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Araç Muayeneleri</h1>
            <p className="text-neutral-500">Araç muayene takibi ve yönetimi</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-64">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Plaka, marka, model..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <PermissionGuard permission={PERMISSIONS.INSPECTIONS.ADD}>
              <Button onClick={() => handleOpenModal()}>
                <Plus className="w-5 h-5 mr-2" />
                Yeni Muayene Ekle
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Expiring Inspections Alert */}
        {getExpiringRecords().length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Yaklaşan Muayeneler ({getExpiringRecords().length})
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    {getExpiringRecords().length} aracın muayene tarihi yaklaşıyor veya geçmiş.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          {loading && (
            <span className="text-sm text-neutral-500 mr-2">Veriler yükleniyor...</span>
          )}
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Plaka / Araç
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Muayene Tarihi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Gelecek Muayene
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Durum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Tutar
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {inspections.map((record) => {
                  const daysRemaining = calculateDaysUntil(record.NextInspectionDate);
                  const expired = isExpired(record.NextInspectionDate);
                  const expiringSoon = isExpiringSoon(record.NextInspectionDate, 30);
                  
                  return (
                    <tr key={record.InspectionID}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-neutral-100 rounded-full flex items-center justify-center">
                            <CarIcon className="h-5 w-5 text-neutral-500" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-neutral-900">{record.Plate}</div>
                            <div className="text-sm text-neutral-500">{record.Make} {record.Model}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {formatDate(record.InspectionDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                        {formatDate(record.NextInspectionDate)}
                        <div className="text-xs text-neutral-500">
                          {expired 
                            ? `${Math.abs(daysRemaining)} gün geçti` 
                            : `${daysRemaining} gün kaldı`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {expired ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            Süresi Dolmuş
                          </span>
                        ) : expiringSoon ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Yaklaşıyor
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Geçerli
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {formatCurrency(record.Cost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <PermissionGuard permission={PERMISSIONS.INSPECTIONS.EDIT}>
                            <button
                              onClick={() => handleOpenModal(record)}
                              className="text-primary-600 hover:text-primary-900"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                          </PermissionGuard>
                          <PermissionGuard permission={PERMISSIONS.INSPECTIONS.DELETE}>
                            <button
                              onClick={() => handleDelete(record.InspectionID)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-5 w-5" />
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
          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            itemsPerPage={50}
          />
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={selectedRecord ? 'Muayene Kaydını Düzenle' : 'Yeni Muayene Ekle'}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Araç</label>
              {selectedRecord ? (
                <input
                  type="text"
                  disabled
                  className="mt-1 block w-full rounded-md border-neutral-300 bg-neutral-100 shadow-sm sm:text-sm"
                  value={`${selectedRecord.Plate} ${selectedRecord.Make || ''} ${selectedRecord.Model || ''}`.trim()}
                />
              ) : (
                <select
                  required
                  className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  value={formData.VehicleID || ''}
                  onChange={(e) => setFormData({ ...formData, VehicleID: Number(e.target.value) })}
                >
                  <option value="">Seçiniz</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.VehicleID} value={vehicle.VehicleID}>
                      {vehicle.Plate} - {vehicle.Make} {vehicle.Model}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Muayene Tarihi</label>
                <input
                  type="date"
                  required
                  className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  value={formData.InspectionDate ? new Date(formData.InspectionDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData({ ...formData, InspectionDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700">Gelecek Muayene Tarihi</label>
                <input
                  type="date"
                  required
                  className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  value={formData.NextInspectionDate ? new Date(formData.NextInspectionDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => setFormData({ ...formData, NextInspectionDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Tutar</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="block w-full rounded-md border-neutral-300 pl-3 pr-12 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  placeholder="0.00"
                  value={formData.Cost || ''}
                  onChange={(e) => setFormData({ ...formData, Cost: Number(e.target.value) })}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-neutral-500 sm:text-sm">TL</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Notlar</label>
              <textarea
                rows={3}
                className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={formData.Notes || ''}
                onChange={(e) => setFormData({ ...formData, Notes: e.target.value })}
              />
            </div>

            <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
              <Button type="submit" className="w-full sm:col-start-2">
                Kaydet
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full sm:mt-0 sm:col-start-1"
                onClick={handleCloseModal}
              >
                İptal
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
};

export default Inspections;
