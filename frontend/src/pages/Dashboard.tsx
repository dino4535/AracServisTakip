import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/layout/Layout';
import { Car, Wrench, AlertTriangle, TrendingUp, Activity, Droplets, DollarSign, Clock } from 'lucide-react';
import { dashboardService } from '../services/dashboardService';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { usePermissions } from '../hooks/usePermissions';

interface DashboardStats {
  TotalVehicles: number;
  VehiclesInMaintenance: number;
  VehiclesInService: number;
  PendingServiceRequests: number;
  ExpiringInsurances: number;
  UpcomingMaintenance: number;
  RecentFuelRecords: number;
}

interface Activity {
  Type: string;
  ItemId: string;
  Title: string;
  Date: string;
  Status: string;
  Module: string;
}

interface FuelConsumption {
  Month: number;
  Year: number;
  CompanyName: string | null;
  TotalCost: number;
}

interface MaintenanceCost {
  Year: number;
  Month: number;
  CompanyName: string | null;
  TotalCost: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [fuelConsumption, setFuelConsumption] = useState<FuelConsumption[]>([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsData, activitiesData, fuelData, maintenanceData] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getRecentActivity(),
        dashboardService.getFuelConsumption(),
        dashboardService.getMaintenanceCosts(),
      ]);

      setStats(statsData);
      setActivities(activitiesData);
      setFuelConsumption(fuelData);
      setMaintenanceCosts(maintenanceData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processTableData = (data: any[]) => {
    const months = Array.from(new Set(data.map(item => `${item.Month}/${item.Year}`)));
    const companies = Array.from(new Set(data.map(item => item.CompanyName || 'Diğer')));
    
    // Sort months descending (newest first)
    months.sort((a, b) => {
      const [m1, y1] = a.split('/').map(Number);
      const [m2, y2] = b.split('/').map(Number);
      return (y2 - y1) || (m2 - m1);
    });

    return { months, companies };
  };

  const getCostForCell = (data: any[], monthStr: string, company: string) => {
    const [month, year] = monthStr.split('/').map(Number);
    const item = data.find(d => 
      d.Month === month && 
      d.Year === year && 
      (d.CompanyName || 'Diğer') === company
    );
    return item ? item.TotalCost : 0;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-neutral-500">Yükleniyor...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-neutral-600">Hoş geldiniz, {user?.Name}!</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {hasPermission(PERMISSIONS.VEHICLES.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 mb-1">Toplam Araç</p>
                <p className="text-2xl font-bold text-neutral-900">{stats?.TotalVehicles || 0}</p>
              </div>
              <div className="p-3 bg-primary-50 rounded-lg">
                <Car className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </div>
          )}

          {hasPermission(PERMISSIONS.MAINTENANCE.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 mb-1">Bakımdaki Araçlar</p>
                <p className="text-2xl font-bold text-neutral-900">{stats?.VehiclesInMaintenance || 0}</p>
              </div>
              <div className="p-3 bg-warning-50 rounded-lg">
                <Wrench className="w-6 h-6 text-warning-600" />
              </div>
            </div>
          </div>
          )}

          {hasPermission(PERMISSIONS.SERVICE_REQUESTS.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 mb-1">İşlemdeki Araçlar</p>
                <p className="text-2xl font-bold text-neutral-900">{stats?.VehiclesInService || 0}</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg">
                <Clock className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>
          )}

          {hasPermission(PERMISSIONS.SERVICE_REQUESTS.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 mb-1">Bekleyen Talepler</p>
                <p className="text-2xl font-bold text-neutral-900">{stats?.PendingServiceRequests || 0}</p>
              </div>
              <div className="p-3 bg-danger-50 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-danger-600" />
              </div>
            </div>
          </div>
          )}

          {hasPermission(PERMISSIONS.INSURANCE.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600 mb-1">Yaklaşan Sigorta</p>
                <p className="text-2xl font-bold text-neutral-900">{stats?.ExpiringInsurances || 0}</p>
              </div>
              <div className="p-3 bg-success-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-success-600" />
              </div>
            </div>
          </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {(hasPermission(PERMISSIONS.SERVICE_REQUESTS.VIEW) ||
            hasPermission(PERMISSIONS.MAINTENANCE.VIEW) ||
            hasPermission(PERMISSIONS.FUEL.VIEW)) && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
            <div className="p-6 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-600" />
                Son Aktiviteler
              </h2>
            </div>
            <div className="p-6">
              {activities.length === 0 ? (
                <p className="text-center text-neutral-500 py-4">Aktivite bulunmuyor</p>
              ) : (
                <div className="space-y-3">
                  {activities.slice(0, 5).map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                      <div className="flex-shrink-0 w-2 h-2 mt-2 bg-primary-500 rounded-full"></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{activity.Title}</p>
                        <p className="text-sm text-neutral-600 capitalize">{activity.Type}</p>
                        <p className="text-xs text-neutral-500">
                          {format(new Date(activity.Date), 'dd MMM yyyy', { locale: tr })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          {hasPermission(PERMISSIONS.FUEL.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
            <div className="p-6 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                <Droplets className="w-5 h-5 text-primary-600" />
                Yakıt Tüketimi
              </h2>
            </div>
            <div className="p-6 overflow-x-auto">
              {fuelConsumption.length === 0 ? (
                <p className="text-center text-neutral-500 py-4">Veri bulunmuyor</p>
              ) : (
                <table className="min-w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="py-2 font-semibold text-neutral-900">Ay</th>
                      {processTableData(fuelConsumption).companies.map(company => (
                        <th key={company} className="py-2 font-semibold text-neutral-900 text-right">{company}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {processTableData(fuelConsumption).months.map(month => (
                      <tr key={month}>
                        <td className="py-2 text-neutral-600 font-medium">{month}</td>
                        {processTableData(fuelConsumption).companies.map(company => (
                          <td key={`${month}-${company}`} className="py-2 text-neutral-900 text-right">
                             ₺{getCostForCell(fuelConsumption, month, company).toLocaleString()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}

          {hasPermission(PERMISSIONS.MAINTENANCE.VIEW) && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
            <div className="p-6 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary-600" />
                Bakım Maliyetleri
              </h2>
            </div>
            <div className="p-6 overflow-x-auto">
              {maintenanceCosts.length === 0 ? (
                <p className="text-center text-neutral-500 py-4">Veri bulunmuyor</p>
              ) : (
                <table className="min-w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="py-2 font-semibold text-neutral-900">Ay</th>
                      {processTableData(maintenanceCosts).companies.map(company => (
                        <th key={company} className="py-2 font-semibold text-neutral-900 text-right">{company}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {processTableData(maintenanceCosts).months.map(month => (
                      <tr key={month}>
                        <td className="py-2 text-neutral-600 font-medium">{month}</td>
                        {processTableData(maintenanceCosts).companies.map(company => (
                          <td key={`${month}-${company}`} className="py-2 text-neutral-900 text-right">
                             ₺{getCostForCell(maintenanceCosts, month, company).toLocaleString()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
