import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import SearchableSelect from '../components/common/SearchableSelect';
import { Plus, Edit, Trash2, AlertTriangle, Paperclip } from 'lucide-react';
import { accidentService } from '../services/accidentService';
import { vehicleService } from '../services/vehicleService';
import { userService } from '../services/userService';
import { Vehicle, Accident, User } from '../types';
import { formatCurrency, formatDate } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';
import FileModal from '../components/accidents/FileModal';

const Accidents = () => {
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Accident | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Accident>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchAccidents();
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
      const [vehiclesResponse, driversResponse] = await Promise.all([
        vehicleService.getAllVehicles({ page: 1, limit: 0 }),
        userService.getAllUsers({ limit: 0 })
      ]);
      setVehicles(vehiclesResponse.data);
      const driversData = driversResponse as any;
      setDrivers(driversData?.data || driversData || []);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchAccidents = async () => {
    try {
      setLoading(true);
      const response = await accidentService.getAll({
        page: currentPage,
        limit: 50,
        search: searchTerm || undefined,
      });
      setAccidents(response.data);
      if (response.pagination) {
        setPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching accidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (record?: Accident) => {
    if (record) {
      setSelectedRecord(record);
      setFormData(record);
    } else {
      setSelectedRecord(null);
      setFormData({
        Status: 'OPEN',
        AccidentDate: new Date().toISOString().split('T')[0]
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRecord(null);
    setFormData({});
  };

  const handleOpenFiles = (record: Accident) => {
    setSelectedRecord(record);
    setIsFileModalOpen(true);
  };

  const handleCloseFileModal = () => {
    setIsFileModalOpen(false);
    setSelectedRecord(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.VehicleID) {
      alert('Lütfen bir araç seçiniz.');
      return;
    }

    try {
      const payload = {
        vehicleId: formData.VehicleID,
        driverId: formData.DriverID || null,
        accidentDate: formData.AccidentDate,
        reportNumber: formData.ReportNumber,
        description: formData.Description,
        cost: formData.Cost,
        faultRate: formData.FaultRate,
        status: formData.Status,
        location: formData.Location
      };

      if (selectedRecord) {
        await accidentService.update(selectedRecord.AccidentID, payload);
      } else {
        await accidentService.create(payload);
      }
      await fetchAccidents();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving accident record:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Bu kaza kaydını silmek istediğinize emin misiniz?')) {
      try {
        await accidentService.delete(id);
        await fetchAccidents();
      } catch (error) {
        console.error('Error deleting accident record:', error);
      }
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-red-100 text-red-800';
      case 'IN_PROCESS': return 'bg-yellow-100 text-yellow-800';
      case 'CLOSED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'OPEN': return 'Açık';
      case 'IN_PROCESS': return 'İşlemde';
      case 'CLOSED': return 'Kapalı';
      default: return status;
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Kaza ve Hasar Yönetimi</h1>
          <p className="text-neutral-600 mt-1">Araç kaza kayıtlarını ve hasar süreçlerini buradan takip edebilirsiniz.</p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:space-x-3">
          <div className="w-full md:w-64">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Plaka, sürücü, yer, rapor no..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
          <PermissionGuard permission={PERMISSIONS.ACCIDENTS.ADD}>
            <Button onClick={() => handleOpenModal()} className="w-full md:w-auto justify-center">
              <Plus className="w-4 h-4 mr-2" />
              Yeni Kaza Kaydı
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <div className="flex justify-end mb-2">
        {loading && (
          <span className="text-sm text-neutral-500 mr-2">Veriler yükleniyor...</span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full hidden md:table">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Araç</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Sürücü</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Kaza Yeri</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tarih</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Rapor No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutar</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Durum</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {(accidents || []).map((accident) => (
                <tr key={accident.AccidentID} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-neutral-900">{accident.Plate}</div>
                        <div className="text-sm text-neutral-500">{accident.Make} {accident.Model}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {accident.DriverName || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                    {accident.Location || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                    {formatDate(accident.AccidentDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                    {accident.ReportNumber || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 font-medium">
                    {formatCurrency(accident.Cost || 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(accident.Status || 'OPEN')}`}>
                      {getStatusText(accident.Status || 'OPEN')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleOpenFiles(accident)}
                        className="text-neutral-600 hover:text-neutral-900 p-1"
                        title="Dosyalar"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <PermissionGuard permission={PERMISSIONS.ACCIDENTS.EDIT}>
                        <button
                          onClick={() => handleOpenModal(accident)}
                          className="text-primary-600 hover:text-primary-900 p-1"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </PermissionGuard>
                      <PermissionGuard permission={PERMISSIONS.ACCIDENTS.DELETE}>
                        <button
                          onClick={() => handleDelete(accident.AccidentID)}
                          className="text-danger-600 hover:text-danger-900 p-1"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-neutral-200">
          {(accidents || []).map((accident) => (
            <div key={accident.AccidentID} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 flex-shrink-0 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {accident.Plate}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {accident.Make} {accident.Model}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500 space-y-0.5">
                      <div>{formatDate(accident.AccidentDate)}</div>
                      {accident.Location && <div>{accident.Location}</div>}
                      {accident.ReportNumber && (
                        <div>Rapor No: {accident.ReportNumber}</div>
                      )}
                      {accident.DriverName && (
                        <div>Sürücü: {accident.DriverName}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs space-y-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(accident.Status || 'OPEN')}`}>
                    {getStatusText(accident.Status || 'OPEN')}
                  </span>
                  <div className="font-semibold text-neutral-900">
                    {formatCurrency(accident.Cost || 0)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-neutral-100 mt-2">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenFiles(accident)}
                    className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
                    title="Dosyalar"
                  >
                    <Paperclip className="w-4 h-4 text-neutral-600" />
                  </button>
                  <PermissionGuard permission={PERMISSIONS.ACCIDENTS.EDIT}>
                    <button
                      onClick={() => handleOpenModal(accident)}
                      className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Düzenle"
                    >
                      <Edit className="w-4 h-4 text-primary-600" />
                    </button>
                  </PermissionGuard>
                  <PermissionGuard permission={PERMISSIONS.ACCIDENTS.DELETE}>
                    <button
                      onClick={() => handleDelete(accident.AccidentID)}
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

        {!loading && (accidents || []).length === 0 && (
          <div className="p-8 text-center text-neutral-500">
            Henüz kaza kaydı bulunmuyor.
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

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedRecord ? 'Kaza Kaydını Düzenle' : 'Yeni Kaza Kaydı'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Araç
            </label>
            <SearchableSelect
              required
              value={formData.VehicleID || null}
              onChange={(value) => setFormData({ ...formData, VehicleID: Number(value), DriverID: undefined })}
              options={vehicles.map(v => ({
                value: v.VehicleID,
                label: `${v.Plate} - ${v.Make} ${v.Model}`
              }))}
              placeholder="Araç Seçiniz (Plaka ile arama yapabilirsiniz)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Sürücü
            </label>
            <SearchableSelect
              value={formData.DriverID || null}
              onChange={(value) => setFormData({ ...formData, DriverID: Number(value) })}
              options={drivers.map((driver) => ({
                value: driver.UserID,
                label: `${driver.Name} ${driver.Surname}`
              }))}
              placeholder="Sürücü Seçiniz (Opsiyonel)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Kaza Tarihi
              </label>
              <input
                type="date"
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
                value={formData.AccidentDate ? new Date(formData.AccidentDate).toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, AccidentDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Rapor Numarası
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
                value={formData.ReportNumber || ''}
                onChange={(e) => setFormData({ ...formData, ReportNumber: e.target.value })}
                placeholder="Örn: 2024-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Kusur Oranı
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
                value={formData.FaultRate || ''}
                onChange={(e) => setFormData({ ...formData, FaultRate: Number(e.target.value) })}
              >
                <option value="">Seçiniz</option>
                <option value="0">%0 (Kusursuz)</option>
                <option value="25">%25</option>
                <option value="50">%50</option>
                <option value="75">%75</option>
                <option value="100">%100 (Tam Kusurlu)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Tahmini Tutar (TL)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
                value={formData.Cost || ''}
                onChange={(e) => setFormData({ ...formData, Cost: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Kaza Yeri
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
              value={formData.Location || ''}
              onChange={(e) => setFormData({ ...formData, Location: e.target.value })}
              placeholder="İl / ilçe / adres bilgisi"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Durum
            </label>
            <select
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
              value={formData.Status || 'OPEN'}
              onChange={(e) => setFormData({ ...formData, Status: e.target.value })}
            >
              <option value="OPEN">Açık (İşlem Bekliyor)</option>
              <option value="IN_PROCESS">İşlemde (Tamir/Sigorta Sürecinde)</option>
              <option value="CLOSED">Kapalı (Tamamlandı)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Açıklama
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:ring-primary-500 outline-none transition-colors"
              value={formData.Description || ''}
              onChange={(e) => setFormData({ ...formData, Description: e.target.value })}
              placeholder="Kaza oluş şekli ve hasar detayları..."
            />
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button variant="secondary" onClick={handleCloseModal} type="button">
              İptal
            </Button>
            <Button type="submit">
              Kaydet
            </Button>
          </div>
        </form>
      </Modal>

      {selectedRecord && (
        <FileModal
          isOpen={isFileModalOpen}
          onClose={handleCloseFileModal}
          accidentId={selectedRecord.AccidentID}
          readOnly={false}
        />
      )}
    </Layout>
  );
};

export default Accidents;
