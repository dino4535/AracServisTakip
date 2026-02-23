import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Pagination from '../components/common/Pagination';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { reportService } from '../services/reportService';
import { adminService } from '../services/adminService';
import { userService } from '../services/userService';
import { TrendingUp, AlertTriangle, Car, Download, Calendar, Filter, Wallet, Fuel, Wrench, Shield, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';

const CompanyFilter = ({ 
  selectedCompanies, 
  setSelectedCompanies, 
  companies 
}: { 
  selectedCompanies: number[], 
  setSelectedCompanies: (ids: number[]) => void, 
  companies: any[] 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="flex items-center gap-2 ml-4 relative">
       <span className="text-sm font-medium text-gray-700">Şirket:</span>
       <div className="relative">
         <button 
           onClick={() => setIsOpen(!isOpen)}
           className="bg-white border border-gray-300 rounded-md shadow-sm text-sm p-2 flex items-center justify-between min-w-[150px]"
         >
           <span className="truncate max-w-[120px]">
             {selectedCompanies.length === 0 
               ? 'Tümü' 
               : `${selectedCompanies.length} Şirket`}
           </span>
           <ChevronDown size={16} className="ml-2 text-gray-500" />
         </button>
         
         {isOpen && (
           <>
             <div 
               className="fixed inset-0 z-40" 
               onClick={() => setIsOpen(false)}
             />
             <div className="absolute z-50 w-64 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto left-0">
               {companies?.map((company: any) => (
                 <div 
                   key={company.CompanyID} 
                   className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                   onClick={() => {
                     const newSelected = selectedCompanies.includes(company.CompanyID)
                       ? selectedCompanies.filter(id => id !== company.CompanyID)
                       : [...selectedCompanies, company.CompanyID];
                     setSelectedCompanies(newSelected);
                   }}
                 >
                   <input 
                     type="checkbox" 
                     checked={selectedCompanies.includes(company.CompanyID)}
                     onChange={() => {}} 
                     className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                   />
                   <span className="ml-3 text-sm text-gray-900">{company.Name}</span>
                 </div>
               ))}
             </div>
           </>
         )}
       </div>
    </div>
  );
};

const Reports = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'detailed' | 'history'>('dashboard');
  
  // Date state for Detailed Report
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([]);
  const [selectedDepot, setSelectedDepot] = useState<string>('');
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedPlate, setSelectedPlate] = useState<string>('');
  const [missingCost, setMissingCost] = useState<boolean>(false);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState({ total: 0, totalPages: 1 });

  // Dashboard Queries
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => reportService.getDashboardStats(),
    enabled: activeTab === 'dashboard'
  });

  const { data: performance } = useQuery({
    queryKey: ['vehiclePerformance'],
    queryFn: () => reportService.getVehiclePerformance(),
    enabled: activeTab === 'dashboard'
  });

  const { data: trends } = useQuery({
    queryKey: ['trendAnalysis'],
    queryFn: () => reportService.getTrendAnalysis(),
    enabled: activeTab === 'dashboard'
  });

  // Companies Query
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => adminService.getAllCompanies(),
  });

  // Detailed Report Query
  const { data: detailedReport, isLoading: detailedLoading } = useQuery({
    queryKey: ['detailedReport', dateRange.startDate, dateRange.endDate, selectedCompanies, selectedDepot, selectedDriver, selectedPlate],
    queryFn: () => reportService.getDetailedReport(
      dateRange.startDate, 
      dateRange.endDate, 
      selectedCompanies.length > 0 ? selectedCompanies : undefined,
      selectedDepot ? Number(selectedDepot) : undefined,
      selectedDriver ? Number(selectedDriver) : undefined,
      selectedPlate || undefined
    ),
    enabled: activeTab === 'detailed'
  });

  // Service History Query
  const { 
    data: serviceHistoryData, 
    isLoading: serviceHistoryLoading,
    isError: serviceHistoryIsError,
    error: serviceHistoryError
  } = useQuery({
    queryKey: ['serviceHistory', dateRange.startDate, dateRange.endDate, selectedCompanies, selectedDepot, selectedDriver, selectedPlate, missingCost, historyPage],
    queryFn: async () => {
      const response = await reportService.getServiceHistoryReport(
        dateRange.startDate, 
        dateRange.endDate, 
        selectedCompanies.length > 0 ? selectedCompanies : undefined,
        selectedDepot ? Number(selectedDepot) : undefined,
        selectedDriver ? Number(selectedDriver) : undefined,
        selectedPlate || undefined,
        missingCost,
        { page: historyPage, limit: 50 }
      );
      if (response.pagination) {
        setHistoryPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
      return response;
    },
    enabled: activeTab === 'history'
  });

  const serviceHistory = serviceHistoryData?.data || [];

  // Depots Query
  const { data: depots } = useQuery({
    queryKey: ['depots'],
    queryFn: () => adminService.getAllDepots({ limit: 1000 }),
    select: (data) => data.data,
    enabled: activeTab === 'detailed'
  });

  // Drivers Query (Users)
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => userService.getAllUsers({ limit: 1000 }),
    select: (data) => data.data,
    enabled: activeTab === 'detailed'
  });

  // Calculate total costs for cards
  const totalCosts = React.useMemo(() => {
    if (!stats?.costs) return { Total: 0, Fuel: 0, Maintenance: 0, Insurance: 0, Inspection: 0, Accident: 0 };
    return stats.costs.reduce((acc: any, item: any) => {
        acc.Total += item.TotalCost;
        acc[item.Type] = (acc[item.Type] || 0) + item.TotalCost;
        return acc;
    }, { Total: 0, Fuel: 0, Maintenance: 0, Insurance: 0, Inspection: 0, Accident: 0 });
  }, [stats?.costs]);

  // Pie Chart Data
  const pieChartData = React.useMemo(() => {
    return [
        { name: 'Yakıt', value: totalCosts.Fuel, color: '#3B82F6' },
        { name: 'Bakım', value: totalCosts.Maintenance, color: '#F59E0B' },
        { name: 'Sigorta', value: totalCosts.Insurance, color: '#EF4444' },
        { name: 'Muayene', value: totalCosts.Inspection, color: '#8B5CF6' },
        { name: 'Kaza', value: totalCosts.Accident, color: '#DC2626' },
    ].filter(item => item.value > 0);
  }, [totalCosts]);

  // Process monthly costs for stacked bar chart
  const monthlyChartData = React.useMemo(() => {
    if (!stats?.costs) return [];
    
    const processed: Record<string, any> = {};
    
    stats.costs.forEach((item: any) => {
      if (!processed[item.Month]) {
        processed[item.Month] = { Month: item.Month, Fuel: 0, Maintenance: 0, Insurance: 0, Inspection: 0, Accident: 0 };
      }
      processed[item.Month][item.Type] = item.TotalCost;
    });
    
    return Object.values(processed).sort((a: any, b: any) => a.Month.localeCompare(b.Month));
  }, [stats?.costs]);

  const handleExportExcel = async () => {
    if (activeTab === 'dashboard' && performance) {
      const data = performance.map((item: any) => ({
        'Plaka': item.Plate,
        'Marka': item.Make,
        'Model': item.Model,
        'Toplam KM': Number(item.TotalKm).toFixed(0),
        'Ortalama Tüketim (L/100km)': Number(item.AvgConsumption).toFixed(2),
        'KM Başına Maliyet (TL)': Number(item.CostPerKm).toFixed(2),
        'Yakıt Maliyeti': Number(item.TotalFuelCost).toFixed(2),
        'Bakım Maliyeti': Number(item.TotalMaintCost).toFixed(2),
        'Sigorta Maliyeti': Number(item.TotalInsCost).toFixed(2),
        'Muayene Maliyeti': Number(item.TotalInspCost).toFixed(2),
        'Kaza Maliyeti': Number(item.TotalAccidentCost).toFixed(2),
        'Toplam Maliyet': Number(item.TotalCost).toFixed(2)
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Performans Raporu");
      XLSX.writeFile(wb, "arac-performans-raporu.xlsx");
    } else if (activeTab === 'detailed' || activeTab === 'history') {
      const wb = XLSX.utils.book_new();
      let hasData = false;

      // Add Detailed Report Sheet if available
      if (detailedReport && detailedReport.length > 0) {
        const data = detailedReport.map((item: any) => ({
          'Plaka': item.Plate,
          'Marka': item.Make,
          'Model': item.Model,
          'Şirket': item.CompanyName,
          'Sürücü': item.DriverName,
          'Lokasyon': item.DepotName || '-',
          'Toplam KM': item.TotalKm,
          'Ortalama Tüketim (L/100km)': Number(item.AvgConsumption).toFixed(2),
          'KM Başına Maliyet (TL)': Number(item.CostPerKm).toFixed(2),
          'Yakıt Tutarı': item.FuelCost,
          'Yakıt Litre': item.FuelLiters,
          'Bakım Tutarı': item.MaintenanceCost,
          'Bakım Sayısı': item.MaintenanceCount,
          'Sigorta Tutarı': item.InsuranceCost,
          'Muayene Tutarı': item.InspectionCost,
          'Kaza Tutarı': item.AccidentCost,
          'Toplam Maliyet': item.TotalCost,
          'Sonraki Bakım Tarihi': item.NextMaintenanceDate ? new Date(item.NextMaintenanceDate).toLocaleDateString('tr-TR') : '-',
          'Trafik Sigortası Bitiş': item.NextTrafficInsurance ? new Date(item.NextTrafficInsurance).toLocaleDateString('tr-TR') : '-',
          'Kasko Bitiş': item.NextKasko ? new Date(item.NextKasko).toLocaleDateString('tr-TR') : '-',
          'Muayene Bitiş': item.NextInspectionDate ? new Date(item.NextInspectionDate).toLocaleDateString('tr-TR') : '-'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Detaylı Rapor");
        hasData = true;
      }
      
      // Add Service History Sheet (fetch all data)
        try {
          const allHistory = await reportService.getServiceHistoryReport(
            dateRange.startDate,
            dateRange.endDate,
            selectedCompanies,
            selectedDepot ? Number(selectedDepot) : undefined,
            selectedDriver ? Number(selectedDriver) : undefined,
            selectedPlate,
            missingCost,
            { limit: 0 } // Request all records
          );

          const historyData = Array.isArray(allHistory) ? allHistory : allHistory.data;

          if (historyData && historyData.length > 0) {
            const serviceData = historyData.map((item: any) => ({
              'Plaka': item.Plate,
              'Marka': item.Make,
              'Model': item.Model,
              'Şirket': item.CompanyName,
              'Servis Tarihi': new Date(item.ServiceDate).toLocaleDateString('tr-TR'),
              'Servis Firması': item.ServiceCompanyName || '-',
              'Servis Türü': item.ServiceType || '-',
              'Açıklama': item.Description,
              'Maliyet': item.Cost,
              'KM': item.Kilometer,
              'Sonraki Bakım KM': item.NextServiceKm,
              'Sonraki Bakım Tarihi': item.NextServiceDate ? new Date(item.NextServiceDate).toLocaleDateString('tr-TR') : '-',
              'Fatura No': item.InvoiceNo || '-'
            }));
            const wsService = XLSX.utils.json_to_sheet(serviceData);
            XLSX.utils.book_append_sheet(wb, wsService, "Servis Geçmişi");
            hasData = true;
          }
        } catch (error) {
          console.error("Error fetching full service history for export:", error);
          if (serviceHistory && serviceHistory.length > 0) {
             const serviceData = serviceHistory.map((item: any) => ({
              'Plaka': item.Plate,
              'Marka': item.Make,
              'Model': item.Model,
              'Şirket': item.CompanyName,
              'Servis Tarihi': new Date(item.ServiceDate).toLocaleDateString('tr-TR'),
              'Servis Firması': item.ServiceCompanyName || '-',
              'Servis Türü': item.ServiceType || '-',
              'Açıklama': item.Description,
              'Maliyet': item.Cost,
              'KM': item.Kilometer,
              'Sonraki Bakım KM': item.NextServiceKm,
              'Sonraki Bakım Tarihi': item.NextServiceDate ? new Date(item.NextServiceDate).toLocaleDateString('tr-TR') : '-',
              'Fatura No': item.InvoiceNo || '-'
            }));
            const wsService = XLSX.utils.json_to_sheet(serviceData);
            XLSX.utils.book_append_sheet(wb, wsService, "Servis Geçmişi");
            hasData = true;
          }
        }

      if (hasData) {
        XLSX.writeFile(wb, `rapor-${dateRange.startDate}-${dateRange.endDate}.xlsx`);
      }
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
       {/* Operational Summary Cards */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Aktif Araçlar</p>
                <p className="text-2xl font-bold text-neutral-900 mt-1">{stats?.stats?.ActiveVehicles || 0}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Car className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Yaklaşan Bakımlar</p>
                <p className="text-2xl font-bold text-neutral-900 mt-1">{stats?.stats?.UpcomingMaintenance || 0}</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Bitecek Sigortalar</p>
                <p className="text-2xl font-bold text-neutral-900 mt-1">{stats?.stats?.ExpiringInsurance || 0}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Summary Cards */}
        <h3 className="text-lg font-semibold text-neutral-900 pt-4">Finansal Özet (Son 6 Ay)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Toplam Gider</p>
                <p className="text-xl font-bold text-neutral-900 mt-1">{totalCosts.Total.toLocaleString()} ₺</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg">
                <Wallet className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Yakıt Gideri</p>
                <p className="text-xl font-bold text-neutral-900 mt-1">{totalCosts.Fuel.toLocaleString()} ₺</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Fuel className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Bakım Gideri</p>
                <p className="text-xl font-bold text-neutral-900 mt-1">{totalCosts.Maintenance.toLocaleString()} ₺</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <Wrench className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Sigorta & Diğer</p>
                <p className="text-xl font-bold text-neutral-900 mt-1">{(totalCosts.Insurance + totalCosts.Inspection).toLocaleString()} ₺</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <Shield className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">Kaza Gideri</p>
                <p className="text-xl font-bold text-neutral-900 mt-1">{totalCosts.Accident.toLocaleString()} ₺</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Monthly Cost Analysis */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900 mb-6">Aylık Gider Dağılımı</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Fuel" name="Yakıt" stackId="a" fill="#3B82F6" />
                    <Bar dataKey="Maintenance" name="Bakım" stackId="a" fill="#F59E0B" />
                    <Bar dataKey="Insurance" name="Sigorta" stackId="a" fill="#EF4444" />
                    <Bar dataKey="Inspection" name="Muayene" stackId="a" fill="#8B5CF6" />
                    <Bar dataKey="Accident" name="Kaza" stackId="a" fill="#DC2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cost Distribution Pie Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900 mb-6">Toplam Gider Pasta Grafiği</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${value.toLocaleString()} ₺`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
        </div>

        {/* Trend Analysis Row */}
        <h3 className="text-lg font-semibold text-neutral-900 pt-4">Trend Analizi (Son 12 Ay)</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Avg Consumption Trend */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">Ortalama Yakıt Tüketimi (L/100km)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Month" tick={{fontSize: 12}} />
                    <YAxis domain={[0, 'auto']} />
                    <Tooltip formatter={(value: number) => `${Number(value).toFixed(2)} L`} />
                    <Line type="monotone" dataKey="AvgConsumption" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} name="Ort. Tüketim" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cost Per KM Trend */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">KM Başına Maliyet (TL/km)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Month" tick={{fontSize: 12}} />
                    <YAxis domain={[0, 'auto']} />
                    <Tooltip formatter={(value: number) => `${Number(value).toFixed(2)} ₺`} />
                    <Line type="monotone" dataKey="CostPerKm" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} name="KM Maliyeti" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Total Distance Trend */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">Toplam Mesafe (KM)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trends || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Month" tick={{fontSize: 12}} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()} km`} />
                    <Area type="monotone" dataKey="TotalKm" stroke="#10B981" fill="#D1FAE5" name="Toplam Mesafe" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
        </div>

        {/* Top Cost Vehicles Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-6">En Yüksek Maliyetli Araçlar (Top 10)</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performance || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="Plate" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="TotalCost" name="Toplam Maliyet (TL)" fill="#EF4444" />
                <Bar dataKey="TotalFuelCost" name="Yakıt (TL)" fill="#3B82F6" />
                <Bar dataKey="TotalMaintCost" name="Bakım (TL)" fill="#F59E0B" />
                <Bar dataKey="TotalAccidentCost" name="Kaza (TL)" fill="#DC2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Table */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900">Araç Maliyet Detayları (Top 10)</h2>
          </div>
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Araç</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Toplam KM</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Yakıt</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Bakım</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Kaza</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Sigorta/Diğer</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Toplam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {performance?.map((item: any, index: number) => (
                <tr key={index} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-neutral-900">{item.Plate}</div>
                    <div className="text-xs text-neutral-500">{item.Make} {item.Model}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 text-right">{item.TotalKm?.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 text-right">{item.TotalFuelCost?.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 text-right">{item.TotalMaintCost?.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 text-right">{item.TotalAccidentCost?.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 text-right">{(item.TotalInsCost + item.TotalInspCost)?.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-neutral-900 text-right">{item.TotalCost?.toLocaleString()} ₺</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );

  const renderDetailedReport = () => (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Tarih Aralığı:</span>
        </div>
        <input
          type="date"
          value={dateRange.startDate}
          onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
          className="border-gray-300 rounded-md shadow-sm text-sm"
        />
        <span className="text-gray-500">-</span>
        <input
          type="date"
          value={dateRange.endDate}
          onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
          className="border-gray-300 rounded-md shadow-sm text-sm"
        />
        
        <CompanyFilter 
          selectedCompanies={selectedCompanies} 
          setSelectedCompanies={setSelectedCompanies} 
          companies={companies || []} 
        />
        
        {/* Depot Filter */}
        <div className="flex items-center gap-2 ml-4">
           <span className="text-sm font-medium text-gray-700">Depo:</span>
           <select
             value={selectedDepot}
             onChange={(e) => setSelectedDepot(e.target.value)}
             className="border-gray-300 rounded-md shadow-sm text-sm p-2"
           >
             <option value="">Tümü</option>
             {depots?.map((depot: any) => (
               <option key={depot.DepotID} value={depot.DepotID}>{depot.Name}</option>
             ))}
           </select>
        </div>

        {/* Driver Filter */}
        <div className="flex items-center gap-2 ml-4">
           <span className="text-sm font-medium text-gray-700">Sürücü:</span>
           <select
             value={selectedDriver}
             onChange={(e) => setSelectedDriver(e.target.value)}
             className="border-gray-300 rounded-md shadow-sm text-sm p-2"
           >
             <option value="">Tümü</option>
             {users?.map((u: any) => (
               <option key={u.UserID} value={u.UserID}>{u.Name} {u.Surname}</option>
             ))}
           </select>
        </div>

        {/* Plate Filter */}
        <div className="flex items-center gap-2 ml-4">
           <span className="text-sm font-medium text-gray-700">Plaka:</span>
           <input
             type="text"
             value={selectedPlate}
             onChange={(e) => setSelectedPlate(e.target.value)}
             placeholder="Plaka ara..."
             className="border-gray-300 rounded-md shadow-sm text-sm p-2 w-32"
           />
        </div>

        <button 
           onClick={() => detailedReport && null} // Trigger refresh if needed, but react-query handles it via dependency
           className="ml-auto px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium"
        >
           <Filter className="h-4 w-4 inline mr-2" />
           Filtrele
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-neutral-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plaka</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marka/Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Şirket</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Depo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sürücü</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam KM</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ort. Tüketim</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">KM Maliyeti</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Yakıt (TL)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Bakım (TL)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sigorta (TL)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Muayene (TL)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Kaza (TL)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam (TL)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {detailedLoading ? (
               <tr><td colSpan={14} className="px-6 py-4 text-center">Yükleniyor...</td></tr>
            ) : detailedReport?.length === 0 ? (
               <tr><td colSpan={14} className="px-6 py-4 text-center">Kayıt bulunamadı.</td></tr>
            ) : (
              detailedReport?.map((item) => (
                <tr key={item.VehicleID} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{item.Plate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.Make} {item.Model}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.CompanyName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.DepotName || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.DriverName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.TotalKm.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{Number(item.AvgConsumption).toFixed(1)} L/100km</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{Number(item.CostPerKm).toFixed(2)} ₺/km</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.FuelCost.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.MaintenanceCost.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.InsuranceCost.toLocaleString()} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.InspectionCost?.toLocaleString() || '0'} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.AccidentCost?.toLocaleString() || '0'} ₺</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">{item.TotalCost.toLocaleString()} ₺</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderServiceHistory = () => (
    <div className="space-y-6">
       {/* Filters */}
       <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Tarih Aralığı:</span>
        </div>
        <input
          type="date"
          value={dateRange.startDate}
          onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
          className="border-gray-300 rounded-md shadow-sm text-sm"
        />
        <span className="text-gray-500">-</span>
        <input
          type="date"
          value={dateRange.endDate}
          onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
          className="border-gray-300 rounded-md shadow-sm text-sm"
        />
        
        <CompanyFilter 
          selectedCompanies={selectedCompanies} 
          setSelectedCompanies={setSelectedCompanies} 
          companies={companies || []} 
        />
        
        {/* Depot Filter */}
        <div className="flex items-center gap-2 ml-4">
           <span className="text-sm font-medium text-gray-700">Depo:</span>
           <select
             value={selectedDepot}
             onChange={(e) => setSelectedDepot(e.target.value)}
             className="border-gray-300 rounded-md shadow-sm text-sm p-2"
           >
             <option value="">Tümü</option>
             {depots?.map((depot: any) => (
               <option key={depot.DepotID} value={depot.DepotID}>{depot.Name}</option>
             ))}
           </select>
        </div>

        {/* Driver Filter */}
        <div className="flex items-center gap-2 ml-4">
           <span className="text-sm font-medium text-gray-700">Sürücü:</span>
           <select
             value={selectedDriver}
             onChange={(e) => setSelectedDriver(e.target.value)}
             className="border-gray-300 rounded-md shadow-sm text-sm p-2"
           >
             <option value="">Tümü</option>
             {users?.map((u: any) => (
               <option key={u.UserID} value={u.UserID}>{u.Name} {u.Surname}</option>
             ))}
           </select>
        </div>

        {/* Plate Filter */}
        <div className="flex items-center gap-2 ml-4">
           <span className="text-sm font-medium text-gray-700">Plaka:</span>
           <input
             type="text"
             value={selectedPlate}
             onChange={(e) => setSelectedPlate(e.target.value)}
             placeholder="Plaka ara..."
             className="border-gray-300 rounded-md shadow-sm text-sm p-2 w-32"
           />
        </div>

        {/* Missing Cost Filter */}
        <div className="flex items-center gap-2 ml-4">
           <input
             type="checkbox"
             id="missingCost"
             checked={missingCost}
             onChange={(e) => setMissingCost(e.target.checked)}
             className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
           />
           <label htmlFor="missingCost" className="text-sm font-medium text-gray-700">
             Maliyeti Girilmemiş
           </label>
        </div>

        <button 
           onClick={() => serviceHistory && null} 
           className="ml-auto px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium"
        >
           <Filter className="h-4 w-4 inline mr-2" />
           Filtrele
        </button>
      </div>

      {/* Service History Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-neutral-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kayıt Türü</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plaka</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Servis/Bakım Tipi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Servis Firması</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Açıklama</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yapılan İşlemler</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">KM</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Maliyet</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {serviceHistoryLoading ? (
                <tr><td colSpan={9} className="px-6 py-4 text-center">Yükleniyor...</td></tr>
              ) : serviceHistoryIsError ? (
                <tr><td colSpan={9} className="px-6 py-4 text-center text-red-600">Hata: {(serviceHistoryError as Error)?.message || 'Veri çekilemedi'}</td></tr>
              ) : serviceHistory?.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-4 text-center">Kayıt bulunamadı.</td></tr>
              ) : (
                serviceHistory?.map((item: any) => (
                  <tr key={`${item.RecordType}-${item.RecordID}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(item.ServiceDate).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.RecordType === 'ServiceRequest' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {item.RecordType === 'ServiceRequest' ? 'Servis Talebi' : 'Periyodik Bakım'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.Plate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.ServiceType || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.ServiceCompanyName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={item.Description}>{item.Description}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={item.Actions || ''}>{item.Actions || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.Kilometer?.toLocaleString() || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">{item.Cost?.toLocaleString()} ₺</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {serviceHistory?.length > 0 && (
          <Pagination
            currentPage={historyPage}
            totalPages={historyPagination.totalPages}
            onPageChange={setHistoryPage}
            totalItems={historyPagination.total}
            itemsPerPage={50}
          />
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Raporlar ve Analizler</h1>
            <p className="text-neutral-600 mt-1">Filo performansı ve maliyet analizleri</p>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Excel'e Aktar
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'dashboard'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'}
              `}
            >
              Genel Bakış
            </button>
            <button
              onClick={() => setActiveTab('detailed')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'detailed'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'}
              `}
            >
              Detaylı Rapor
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'history'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'}
              `}
            >
              Servis Geçmişi
            </button>
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'dashboard' ? renderDashboard() : 
         activeTab === 'detailed' ? renderDetailedReport() : 
         renderServiceHistory()}
      </div>
    </Layout>
  );
};

export default Reports;