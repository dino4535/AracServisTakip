import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import { Shield, Plus, Edit, Trash2, Car as CarIcon, Download, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { insuranceService } from '../services/insuranceService';
import { vehicleService } from '../services/vehicleService';
import { adminService } from '../services/adminService';
import { InsuranceRecord, Vehicle, InsuranceCompany, InsuranceSummary } from '../types';
import { formatCurrency, formatDate, calculateDaysUntil, isExpiringSoon, isExpired } from '../utils/formatUtils';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';

const Insurance = () => {
  const [insuranceRecords, setInsuranceRecords] = useState<InsuranceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<InsuranceCompany[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<InsuranceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<InsuranceRecord>>({});

  const [insuranceSummary, setInsuranceSummary] = useState<InsuranceSummary[]>([]);
  const [upcomingRecords, setUpcomingRecords] = useState<InsuranceRecord[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [mainTab, setMainTab] = useState<'all' | 'noPolicy' | 'upcoming' | 'expired'>('all');
  const [sortField, setSortField] = useState<'Plate' | 'Type' | 'InsuranceCompany' | 'PolicyNumber' | 'StartDate' | 'EndDate' | 'Cost'>('EndDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const formatInsuranceType = (type?: string) => {
    if (!type) return '';
    switch (type.toUpperCase()) {
      case 'TSP':
        return 'Trafik Sigortası';
      case 'KSP':
        return 'Kasko';
      case 'KOLSP':
        return 'Koltuk Sigorta Poliçesi';
      default:
        return type;
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchInsuranceRecords();
  }, [currentPage, sortField, sortDirection, searchTerm]);

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
      const [vehiclesData, companiesData, summaryData, upcomingData] = await Promise.all([
        vehicleService.getAllVehicles({ page: 1, limit: 0 }),
        adminService.getAllInsuranceCompanies({ limit: 100 }),
        insuranceService.getInsuranceSummary(),
        insuranceService.getUpcomingInsuranceRecords(30)
      ]);
      setVehicles(vehiclesData.data);
      setInsuranceCompanies(companiesData.data);
      setInsuranceSummary(summaryData);
      setUpcomingRecords(upcomingData);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchInsuranceRecords = async () => {
    try {
      setLoading(true);
      const response = await insuranceService.getAllInsuranceRecords({
        page: currentPage,
        limit: 50,
        sortField,
        sortDirection,
        search: searchTerm || undefined
      });
      setInsuranceRecords(response.data);
      if (response.pagination) {
        setPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching insurance records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (record?: InsuranceRecord) => {
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
        await insuranceService.updateInsuranceRecord(selectedRecord.InsuranceID, formData);
      } else {
        await insuranceService.createInsuranceRecord(formData);
      }
      await fetchInsuranceRecords();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving insurance record:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Bu sigorta kaydını silmek istediğinize emin misiniz?')) {
      try {
        await insuranceService.deleteInsuranceRecord(id);
        await fetchInsuranceRecords();
      } catch (error) {
        console.error('Error deleting insurance record:', error);
      }
    }
  };

  const sortRecords = (records: InsuranceRecord[]) => {
    const sorted = [...records].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const getVal = (r: InsuranceRecord): any => {
        switch (sortField) {
          case 'Plate':
            return (r.Plate || '').toString();
          case 'Type':
            return (r.Type || '').toString();
          case 'InsuranceCompany':
            return (r.InsuranceCompany || '').toString();
          case 'PolicyNumber':
            return (r.PolicyNumber || '').toString();
          case 'StartDate':
            return new Date(r.StartDate).getTime();
          case 'EndDate':
            return new Date(r.EndDate).getTime();
          case 'Cost':
            return Number(r.Cost || 0);
          default:
            return 0;
        }
      };

      const va = getVal(a);
      const vb = getVal(b);

      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return sorted;
  };

  const getFilteredInsuranceRecords = () => {
    let base: InsuranceRecord[] = [];
    if (mainTab === 'upcoming') {
      base = upcomingRecords;
    } else if (mainTab === 'expired') {
      base = (insuranceRecords || []).filter(record => isExpired(record.EndDate));
    } else if (mainTab === 'all') {
      base = insuranceRecords;
    }
    return sortRecords(base || []);
  };

  const getNoPolicyVehicles = () => {
    const normalizedSearch = (searchTerm || '').trim().toLowerCase();
    return insuranceSummary
      .filter(item => !item.HasActiveTrafficPolicy || !item.HasActiveKaskoPolicy)
      .filter(item => {
        if (!normalizedSearch) return true;
        const plate = (item.Plate || '').toLowerCase();
        const company = (item.CompanyName || '').toLowerCase();
        const depot = (item.DepotName || '').toLowerCase();
        return (
          plate.includes(normalizedSearch) ||
          company.includes(normalizedSearch) ||
          depot.includes(normalizedSearch)
        );
      });
  };

  const getMissingPolicyText = (item: InsuranceSummary) => {
    const missing: string[] = [];
    if (!item.HasActiveTrafficPolicy) {
      missing.push('Aktif trafik sigorta poliçesi yok');
    }
    if (!item.HasActiveKaskoPolicy) {
      missing.push('Aktif kasko poliçesi yok');
    }
    if (missing.length === 0) {
      return 'Tüm poliçeler mevcut';
    }
    return missing.join(' ve ');
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExportExcel = async () => {
    if (mainTab === 'noPolicy') {
      const data = getNoPolicyVehicles().map(item => ({
        'Plaka': item.Plate,
        'Şirket': item.CompanyName || '-',
        'Depo': item.DepotName || '-',
        'Durum': getMissingPolicyText(item),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Poliçesi Olmayan Araçlar');
      XLSX.writeFile(wb, 'policesi-olmayan-araclar.xlsx');
      return;
    }

    let records: InsuranceRecord[] = [];

    if (mainTab === 'upcoming') {
      records = upcomingRecords;
    } else {
      const response = await insuranceService.getAllInsuranceRecords({
        page: 1,
        limit: 0,
        sortField,
        sortDirection
      });
      let all = response.data || [];

      if (mainTab === 'expired') {
        all = all.filter(record => isExpired(record.EndDate));
      }

      records = sortRecords(all);
    }

    const data = records.map(record => ({
      'Plaka': record.Plate || '',
      'Tip': formatInsuranceType(record.Type) || '',
      'Şirket': record.InsuranceCompany || '',
      'Poliçe No': record.PolicyNumber || '',
      'Başlangıç': formatDate(record.StartDate),
      'Bitiş': formatDate(record.EndDate),
      'Maliyet': record.Cost ?? 0,
      'Durum': isExpired(record.EndDate) ? 'Pasif' : 'Aktif',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    let sheetName = 'Sigortalar';
    let fileName = 'sigortalar.xlsx';
    if (mainTab === 'upcoming') {
      sheetName = 'Yaklaşan Sigortalar';
      fileName = 'yaklasan-sigortalar.xlsx';
    } else if (mainTab === 'expired') {
      sheetName = 'Pasif Sigortalar';
      fileName = 'pasif-sigortalar.xlsx';
    } else if (mainTab === 'all') {
      sheetName = 'Tum Sigortalar';
      fileName = 'tum-sigortalar.xlsx';
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-neutral-900">Sigorta & Kasko</h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-64">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Plaka, poliçe no, şirket, tür..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <PermissionGuard permission={PERMISSIONS.INSURANCE.ADD}>
              <Button onClick={() => handleOpenModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Sigorta Ekle
              </Button>
            </PermissionGuard>
          </div>
        </div>

        <div className="flex justify-end">
          {loading && (
            <span className="text-sm text-neutral-500 mr-2">Veriler yükleniyor...</span>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-neutral-200">
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setMainTab('noPolicy')}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  mainTab === 'noPolicy'
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Eksik Trafik / Kasko Poliçeleri
              </button>
              <button
                type="button"
                onClick={() => setMainTab('upcoming')}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  mainTab === 'upcoming'
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Yaklaşan Sigorta Yenilemeleri
              </button>
              <button
                type="button"
                onClick={() => setMainTab('expired')}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  mainTab === 'expired'
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Pasif Sigortalar
              </button>
              <button
                type="button"
                onClick={() => setMainTab('all')}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  mainTab === 'all'
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Tümü
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="secondary" onClick={handleExportExcel}>
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
          {mainTab === 'noPolicy' ? (
            <>
              <table className="w-full hidden md:table">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Araç</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Firma</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Depo</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {getNoPolicyVehicles().map((item) => (
                    <tr key={item.VehicleID} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                        <div className="flex items-center">
                          <CarIcon className="w-4 h-4 mr-2 text-neutral-500" />
                          {item.Plate}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                        {item.CompanyName || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                        {item.DepotName || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-danger-700">
                        {getMissingPolicyText(item)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="md:hidden divide-y divide-neutral-100">
                {getNoPolicyVehicles().map((item) => (
                  <div key={item.VehicleID} className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CarIcon className="w-4 h-4 text-neutral-500" />
                          <span className="text-sm font-semibold text-neutral-900">
                            {item.Plate}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {item.CompanyName || '-'}
                          {item.DepotName ? ` • ${item.DepotName}` : ''}
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-danger-50 text-danger-700">
                        {getMissingPolicyText(item)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {getNoPolicyVehicles().length === 0 && (
                <div className="p-8 text-center text-neutral-500">
                  Eksik trafik veya kasko poliçesi olan araç bulunmuyor
                </div>
              )}
            </>
          ) : (
            <>
              <table className="w-full hidden md:table">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('Plate')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Araç</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('Type')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Tip</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('InsuranceCompany')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Şirket</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('PolicyNumber')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Poliçe No</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('StartDate')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Başlangıç</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('EndDate')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Bitiş</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700 cursor-pointer" onClick={() => toggleSort('Cost')}>
                      <span className="inline-flex items-center space-x-1">
                        <span>Maliyet</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {getFilteredInsuranceRecords().map((record) => {
                    const daysUntil = calculateDaysUntil(record.EndDate);
                    const isExpiring = isExpiringSoon(record.EndDate, 30);
                    const expired = isExpired(record.EndDate);

                    return (
                      <tr
                        key={record.InsuranceID}
                        className={`hover:bg-neutral-50 ${
                          expired ? 'bg-danger-50' : isExpiring ? 'bg-warning-50' : ''
                        }`}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                          <div className="flex items-center">
                            <CarIcon className="w-4 h-4 mr-2 text-neutral-500" />
                            {record.Plate || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">{formatInsuranceType(record.Type)}</td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {record.InsuranceCompany || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {record.PolicyNumber || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {formatDate(record.StartDate)}
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <span className="text-sm text-neutral-600">
                              {formatDate(record.EndDate)}
                            </span>
                            {daysUntil >= 0 && (
                              <span
                                className={`text-xs ml-2 px-2 py-0.5 rounded-full ${
                                  expired
                                    ? 'bg-danger-100 text-danger-700'
                                    : daysUntil <= 7
                                    ? 'bg-danger-100 text-danger-700'
                                    : daysUntil <= 30
                                    ? 'bg-warning-100 text-warning-700'
                                    : 'bg-neutral-100 text-neutral-700'
                                }`}
                              >
                                {daysUntil} gün
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {record.Cost ? formatCurrency(record.Cost) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <PermissionGuard permission={PERMISSIONS.INSURANCE.EDIT}>
                              <button
                                onClick={() => handleOpenModal(record)}
                                className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Düzenle"
                              >
                                <Edit className="w-4 h-4 text-primary-600" />
                              </button>
                            </PermissionGuard>
                            <PermissionGuard permission={PERMISSIONS.INSURANCE.DELETE}>
                              <button
                                onClick={() => handleDelete(record.InsuranceID)}
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

              <div className="md:hidden divide-y divide-neutral-100">
                {getFilteredInsuranceRecords().map((record) => {
                  const daysUntil = calculateDaysUntil(record.EndDate);
                  const isExpiring = isExpiringSoon(record.EndDate, 30);
                  const expired = isExpired(record.EndDate);

                  return (
                    <div
                      key={record.InsuranceID}
                      className={`p-4 flex flex-col gap-3 ${
                        expired
                          ? 'bg-danger-50'
                          : isExpiring
                          ? 'bg-warning-50'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <CarIcon className="w-4 h-4 text-neutral-500" />
                            <span className="text-sm font-semibold text-neutral-900">
                              {record.Plate || '-'}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-500 mt-1">
                            {formatInsuranceType(record.Type)} •{' '}
                            {record.InsuranceCompany || '-'}
                          </div>
                          <div className="text-xs text-neutral-500 mt-0.5">
                            Poliçe No: {record.PolicyNumber || '-'}
                          </div>
                        </div>
                        <div className="text-right text-xs text-neutral-500 space-y-1">
                          <div>
                            Başlangıç:{' '}
                            <span className="font-semibold text-neutral-800">
                              {formatDate(record.StartDate)}
                            </span>
                          </div>
                          <div>
                            Bitiş:{' '}
                            <span className="font-semibold text-neutral-800">
                              {formatDate(record.EndDate)}
                            </span>
                          </div>
                          <div>
                            Maliyet:{' '}
                            <span className="font-semibold text-neutral-800">
                              {record.Cost
                                ? formatCurrency(record.Cost)
                                : '-'}
                            </span>
                          </div>
                          {daysUntil >= 0 && (
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full ${
                                expired
                                  ? 'bg-danger-100 text-danger-700'
                                  : daysUntil <= 7
                                  ? 'bg-danger-100 text-danger-700'
                                  : daysUntil <= 30
                                  ? 'bg-warning-100 text-warning-700'
                                  : 'bg-neutral-100 text-neutral-700'
                              }`}
                            >
                              {daysUntil} gün
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end pt-2 border-t border-neutral-100">
                        <div className="flex items-center space-x-2">
                          <PermissionGuard permission={PERMISSIONS.INSURANCE.EDIT}>
                            <button
                              onClick={() => handleOpenModal(record)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit className="w-4 h-4 text-primary-600" />
                            </button>
                          </PermissionGuard>
                          <PermissionGuard permission={PERMISSIONS.INSURANCE.DELETE}>
                            <button
                              onClick={() => handleDelete(record.InsuranceID)}
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

              {getFilteredInsuranceRecords().length === 0 && (
                <div className="p-8 text-center text-neutral-500">
                  Sigorta kaydı bulunmuyor
                </div>
              )}

              {mainTab === 'all' || mainTab === 'expired' ? (
                <Pagination
                  currentPage={currentPage}
                  totalPages={pagination.totalPages}
                  onPageChange={setCurrentPage}
                  totalItems={pagination.total}
                  itemsPerPage={50}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={selectedRecord ? 'Sigorta Düzenle' : 'Sigorta Ekle'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Araç *</label>
              <select
                value={formData.VehicleID || ''}
                onChange={(e) => setFormData({ ...formData, VehicleID: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              >
                <option value="">Seçiniz</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.VehicleID} value={vehicle.VehicleID}>
                    {vehicle.Plate} - {vehicle.Make} {vehicle.Model}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Tip *</label>
              <select
                value={formData.Type || ''}
                onChange={(e) => setFormData({ ...formData, Type: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              >
                <option value="">Seçiniz</option>
                <option value="TSP">Trafik Sigortası</option>
                <option value="KSP">Kasko</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Şirket</label>
              <select
                value={formData.InsuranceCompany || ''}
                onChange={(e) => setFormData({ ...formData, InsuranceCompany: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                {Array.from(new Set([
                  ...insuranceCompanies.map((company) => company.Name),
                  ...insuranceRecords.map((record) => record.InsuranceCompany || '').filter(name => !!name),
                  ...upcomingRecords.map((record) => record.InsuranceCompany || '').filter(name => !!name),
                ])).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Poliçe No</label>
              <input
                type="text"
                value={formData.PolicyNumber || ''}
                onChange={(e) => setFormData({ ...formData, PolicyNumber: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Başlangıç Tarihi *</label>
              <input
                type="date"
                value={formData.StartDate?.split('T')[0] || ''}
                onChange={(e) => setFormData({ ...formData, StartDate: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Bitiş Tarihi *</label>
              <input
                type="date"
                value={formData.EndDate?.split('T')[0] || ''}
                onChange={(e) => setFormData({ ...formData, EndDate: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Maliyet (₺)</label>
              <input
                type="number"
                step="0.01"
                value={formData.Cost || ''}
                onChange={(e) => setFormData({ ...formData, Cost: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Notlar</label>
              <textarea
                value={formData.Notes || ''}
                onChange={(e) => setFormData({ ...formData, Notes: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              İptal
            </Button>
            <Button type="submit">
              {selectedRecord ? 'Güncelle' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Insurance;
