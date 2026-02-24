import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '../../services/auditService';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { RefreshCw } from 'lucide-react';
import Button from '../common/Button';

const ACTIONS = [
  { value: 'LOGIN', label: 'Giriş İşlemi' },
  { value: 'CREATE_VEHICLE', label: 'Araç Ekleme' },
  { value: 'UPDATE_VEHICLE', label: 'Araç Güncelleme' },
  { value: 'DELETE_VEHICLE', label: 'Araç Silme' },
  { value: 'CREATE_ACCIDENT', label: 'Kaza Kaydı Ekleme' },
  { value: 'UPDATE_ACCIDENT', label: 'Kaza Kaydı Güncelleme' },
  { value: 'DELETE_ACCIDENT', label: 'Kaza Kaydı Silme' },
  { value: 'CREATE_MAINTENANCE', label: 'Bakım Kaydı Ekleme' },
  { value: 'UPDATE_MAINTENANCE', label: 'Bakım Kaydı Güncelleme' },
  { value: 'DELETE_MAINTENANCE', label: 'Bakım Kaydı Silme' },
  { value: 'CREATE_INSURANCE', label: 'Sigorta Kaydı Ekleme' },
  { value: 'UPDATE_INSURANCE', label: 'Sigorta Kaydı Güncelleme' },
  { value: 'DELETE_INSURANCE', label: 'Sigorta Kaydı Silme' },
  { value: 'CREATE_INSPECTION', label: 'Muayene Kaydı Ekleme' },
  { value: 'UPDATE_INSPECTION', label: 'Muayene Kaydı Güncelleme' },
  { value: 'DELETE_INSPECTION', label: 'Muayene Kaydı Silme' },
  { value: 'CREATE_FUEL', label: 'Yakıt Kaydı Ekleme' },
  { value: 'UPDATE_FUEL', label: 'Yakıt Kaydı Güncelleme' },
  { value: 'DELETE_FUEL', label: 'Yakıt Kaydı Silme' },
  { value: 'CREATE_SERVICE_REQUEST', label: 'Servis Talebi Ekleme' },
  { value: 'UPDATE_SERVICE_REQUEST', label: 'Servis Talebi Güncelleme' },
  { value: 'DELETE_SERVICE_REQUEST', label: 'Servis Talebi Silme' },
  { value: 'CREATE_USER', label: 'Kullanıcı Ekleme' },
  { value: 'UPDATE_USER', label: 'Kullanıcı Güncelleme' },
  { value: 'DELETE_USER', label: 'Kullanıcı Silme' },
  { value: 'CREATE_COMPANY', label: 'Firma Ekleme' },
  { value: 'UPDATE_COMPANY', label: 'Firma Güncelleme' },
  { value: 'DELETE_COMPANY', label: 'Firma Silme' },
  { value: 'CREATE_ROLE', label: 'Rol Ekleme' },
  { value: 'UPDATE_ROLE', label: 'Rol Güncelleme' },
  { value: 'DELETE_ROLE', label: 'Rol Silme' },
  { value: 'CREATE_DEPOT', label: 'Depo Ekleme' },
  { value: 'UPDATE_DEPOT', label: 'Depo Güncelleme' },
  { value: 'DELETE_DEPOT', label: 'Depo Silme' },
  { value: 'CREATE_SERVICE_COMPANY', label: 'Servis Firması Ekleme' },
  { value: 'UPDATE_SERVICE_COMPANY', label: 'Servis Firması Güncelleme' },
  { value: 'DELETE_SERVICE_COMPANY', label: 'Servis Firması Silme' },
  { value: 'JOB_INSPECTION_REMINDER_EMAIL', label: 'Job Muayene Hatırlatma E-postası' },
  { value: 'JOB_INSPECTION_OVERDUE_EMAIL', label: 'Job Muayene Vizesi Geçmiş E-postası' },
  { value: 'JOB_INSURANCE_REMINDER_EMAIL', label: 'Job Sigorta/Kasko Hatırlatma E-postası' },
].sort((a, b) => a.label.localeCompare(b.label, 'tr'));

const TABLES = [
  { value: 'Users', label: 'Kullanıcılar' },
  { value: 'Vehicles', label: 'Araçlar' },
  { value: 'AccidentRecords', label: 'Kaza Kayıtları' },
  { value: 'MaintenanceRecords', label: 'Bakım Kayıtları' },
  { value: 'InsuranceRecords', label: 'Sigorta Kayıtları' },
  { value: 'VehicleInspections', label: 'Muayene Kayıtları' },
  { value: 'FuelRecords', label: 'Yakıt Kayıtları' },
  { value: 'ServiceRequests', label: 'Servis Talepleri' },
  { value: 'Companies', label: 'Firmalar' },
  { value: 'Roles', label: 'Roller' },
  { value: 'Permissions', label: 'Yetkiler' },
  { value: 'Depots', label: 'Depolar' },
  { value: 'ServiceCompanies', label: 'Servis Firmaları' },
].sort((a, b) => a.label.localeCompare(b.label, 'tr'));

const AuditLogs = () => {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: '',
    tableName: '',
    startDate: '',
    endDate: ''
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auditLogs', page, filters],
    queryFn: () => getAuditLogs({ 
      page, 
      limit: 20, 
      ...filters 
    })
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1); // Reset to first page on filter change
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-end bg-white p-4 rounded-lg shadow-sm">
        <div className="flex flex-wrap gap-4 flex-1">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">İşlem</label>
            <select
              name="action"
              className="border rounded-md px-3 py-2 text-sm bg-white"
              value={filters.action}
              onChange={handleFilterChange}
            >
              <option value="">Tümü</option>
              {ACTIONS.map(action => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tablo</label>
            <select
              name="tableName"
              className="border rounded-md px-3 py-2 text-sm bg-white"
              value={filters.tableName}
              onChange={handleFilterChange}
            >
              <option value="">Tümü</option>
              {TABLES.map(table => (
                <option key={table.value} value={table.value}>
                  {table.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Başlangıç</label>
            <input
              type="date"
              name="startDate"
              className="border rounded-md px-3 py-2 text-sm"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Bitiş</label>
            <input
              type="date"
              name="endDate"
              className="border rounded-md px-3 py-2 text-sm"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="mb-0.5">
          <RefreshCw className="w-4 h-4 mr-2" />
          Yenile
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kullanıcı</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İşlem</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tablo / Kayıt ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detaylar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                data?.logs.map((log) => (
                  <tr key={log.LogID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(log.CreatedAt), 'dd MMM yyyy HH:mm', { locale: tr })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {log.Name ? `${log.Name} ${log.Surname}` : 'Sistem / Bilinmiyor'}
                      {log.Email && <div className="text-xs text-gray-500">{log.Email}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.UserRole || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${log.Action.includes('DELETE') ? 'bg-red-100 text-red-800' : 
                          log.Action.includes('UPDATE') ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-green-100 text-green-800'}`}>
                        {log.Action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{log.TableName}</div>
                      <div className="text-xs">ID: {log.RecordID}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.Details}>
                      {log.Details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Toplam <span className="font-medium">{data.pagination.total}</span> kayıttan <span className="font-medium">{(page - 1) * 20 + 1}</span> - <span className="font-medium">{Math.min(page * 20, data.pagination.total)}</span> arası gösteriliyor
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    Önceki
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    Sonraki
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
