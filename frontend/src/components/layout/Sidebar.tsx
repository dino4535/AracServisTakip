import { 
  Car, 
  Wrench, 
  Shield, 
  Fuel, 
  ClipboardList, 
  BarChart3, 
  Users, 
  Settings,
  FileSpreadsheet,
  FileBarChart,
  Gauge,
  ClipboardCheck,
  AlertTriangle,
  Search
} from 'lucide-react';
import { usePermissions, PERMISSIONS } from '../../hooks/usePermissions';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.png';

const Sidebar = () => {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const menuGroups = [
    {
      title: 'Genel',
      items: [
        {
          name: 'Dashboard',
          icon: BarChart3,
          path: '/',
          permission: PERMISSIONS.REPORTS.VIEW,
        },
      ]
    },
    {
      title: 'Filo Yönetimi',
      items: [
        {
          name: 'Araçlar',
          icon: Car,
          path: '/vehicles',
          permission: PERMISSIONS.VEHICLES.VIEW,
        },
        {
          name: 'Araç Bilgi Kartı',
          icon: Search,
          path: '/vehicle-overview',
          permission: PERMISSIONS.REPORTS.VIEW,
          adminOnly: true,
        },
        {
          name: 'Sigorta & Kasko',
          icon: Shield,
          path: '/insurance',
          permission: PERMISSIONS.INSURANCE.VIEW,
        },
        {
          name: 'Muayeneler',
          icon: ClipboardCheck,
          path: '/inspections',
          permission: PERMISSIONS.INSPECTIONS.VIEW,
        },
        {
          name: 'Kaza & Hasar',
          icon: AlertTriangle,
          path: '/accidents',
          permission: PERMISSIONS.ACCIDENTS.VIEW,
        },
      ]
    },
    {
      title: 'Operasyon',
      items: [
        {
          name: 'Bakım',
          icon: Wrench,
          path: '/maintenance',
          permission: PERMISSIONS.MAINTENANCE.VIEW,
        },
        {
          name: 'Yakıt',
          icon: Fuel,
          path: '/fuel',
          permission: PERMISSIONS.FUEL.VIEW,
        },
        {
          name: 'Aylık KM Girişi',
          icon: Gauge,
          path: '/monthly-km',
          permission: PERMISSIONS.VEHICLES.EDIT, // Using VEHICLES.EDIT permission
        },
        {
          name: 'Servis Talepleri',
          icon: ClipboardList,
          path: '/service-requests',
          permission: PERMISSIONS.SERVICE_REQUESTS.VIEW,
        },
      ]
    },
    {
      title: 'Veri Yönetimi',
      items: [
        {
          name: 'Raporlar',
          icon: FileBarChart,
          path: '/reports',
          permission: PERMISSIONS.REPORTS.VIEW,
        },
        {
          name: 'Toplu İşlemler',
          icon: FileSpreadsheet,
          path: '/bulk-operations',
          permission: PERMISSIONS.VEHICLES.ADD,
        },
      ]
    },
    {
      title: 'Sistem',
      items: [
        {
          name: 'Yönetim',
          icon: Users,
          path: '/admin',
          permission: PERMISSIONS.ADMIN.USERS_VIEW,
        },
      ]
    }
  ];

  return (
    <aside
      className={`bg-white border-r border-neutral-200 transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="p-4 border-b border-neutral-200 flex flex-col items-center gap-4">
        <div className={`flex items-center justify-center transition-all duration-300 ${isCollapsed ? 'w-12 h-12' : 'w-full h-16'}`}>
           <img src={logo} alt="Logo" className="w-full h-full object-contain" />
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-center p-2 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <Settings className={`w-5 h-5 text-neutral-600 ${isCollapsed ? '' : 'mr-2'}`} />
          {!isCollapsed && <span className="text-sm text-neutral-600">Menüyü Daralt</span>}
        </button>
      </div>

      <nav className="p-4 space-y-6 flex-1 overflow-y-auto">
        {menuGroups.map((group, groupIndex) => {
          const filteredItems = group.items.filter(item => {
            if ((item as any).adminOnly) {
              return isSuperAdmin || hasPermission(PERMISSIONS.ADMIN.USERS_VIEW);
            }
            return hasPermission(item.permission);
          });
          
          if (filteredItems.length === 0) return null;

          return (
            <div key={groupIndex} className="space-y-2">
              {!isCollapsed && (
                <div className="px-3 mb-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    {group.title}
                  </span>
                </div>
              )}
              {filteredItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center p-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                    title={isCollapsed ? item.name : ''}
                  >
                    <Icon className={`w-5 h-5 ${isCollapsed ? 'mx-auto' : 'mr-3'}`} />
                    {!isCollapsed && <span className="font-medium">{item.name}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
