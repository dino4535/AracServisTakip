import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Pagination from '../components/common/Pagination';
import { Users, Shield, Plus, Edit, Trash2, CheckCircle, XCircle, MapPin, FileText, Building, Send } from 'lucide-react';
import { userService } from '../services/userService';
import { adminService } from '../services/adminService';
import { PERMISSIONS } from '../hooks/usePermissions';
import PermissionGuard from '../utils/PermissionGuard';
import AuditLogs from '../components/admin/AuditLogs';
import OpetSettings from '../components/admin/OpetSettings';
import JobEmailSettings from '../components/admin/JobEmailSettings';
import RiskSettings from '../components/admin/RiskSettings';
import { Company, Depot, ServiceCompany, InsuranceCompany } from '../types';
import { toast } from 'react-hot-toast';

interface User {
  UserID: number;
  Name: string;
  Surname: string;
  Email: string;
  IsActive: boolean;
  CompanyID?: number;
  companyIds?: number[];
  CompanyName?: string;
  Roles?: string;
  RoleIDs?: string;
}

interface Role {
  RoleID: number;
  Name: string;
  Description?: string;
  Permissions?: string;
  PermissionIDs?: string;
}

interface Permission {
  PermissionID: number;
  PermissionCode: string;
  Description?: string;
  Module?: string;
}

const Admin = () => {
 
  const [activeTab, setActiveTab] = useState<
    'users' | 'roles' | 'depots' | 'serviceCompanies' | 'insuranceCompanies' | 'auditLogs' | 'opetSettings' | 'jobEmailSettings' | 'riskSettings'
  >('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [serviceCompanies, setServiceCompanies] = useState<ServiceCompany[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<InsuranceCompany[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isDepotModalOpen, setIsDepotModalOpen] = useState(false);
  const [isDepotUsersModalOpen, setIsDepotUsersModalOpen] = useState(false);
  const [isServiceCompanyModalOpen, setIsServiceCompanyModalOpen] = useState(false);
  const [isInsuranceCompanyModalOpen, setIsInsuranceCompanyModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedDepot, setSelectedDepot] = useState<Depot | null>(null);
  const [selectedServiceCompany, setSelectedServiceCompany] = useState<ServiceCompany | null>(null);
  const [selectedInsuranceCompany, setSelectedInsuranceCompany] = useState<InsuranceCompany | null>(null);
  const [selectedDepots, setSelectedDepots] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFormData, setUserFormData] = useState<any>({});
  const [roleFormData, setRoleFormData] = useState<any>({});
  const [depotFormData, setDepotFormData] = useState<any>({});
  const [serviceCompanyFormData, setServiceCompanyFormData] = useState<any>({});
  const [insuranceCompanyFormData, setInsuranceCompanyFormData] = useState<any>({});
  const [depotUserIds, setDepotUserIds] = useState<number[]>([]);
  
  // Bulk operations state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [isBulkManagerModalOpen, setIsBulkManagerModalOpen] = useState(false);
  const [bulkManagerId, setBulkManagerId] = useState<number | null>(null);

  // Pagination & search state
  const [userPage, setUserPage] = useState(1);
  const [userPagination, setUserPagination] = useState({ total: 0, totalPages: 1 });
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const [depotPage, setDepotPage] = useState(1);
  const [depotPagination, setDepotPagination] = useState({ total: 0, totalPages: 1 });

  const [serviceCompanyPage, setServiceCompanyPage] = useState(1);
  const [serviceCompanyPagination, setServiceCompanyPagination] = useState({ total: 0, totalPages: 1 });

  const [insuranceCompanyPage, setInsuranceCompanyPage] = useState(1);
  const [insuranceCompanyPagination, setInsuranceCompanyPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'depots') {
      fetchDepots();
    } else if (activeTab === 'serviceCompanies') {
      fetchServiceCompanies();
    } else if (activeTab === 'insuranceCompanies') {
      fetchInsuranceCompanies();
    }
  }, [userPage, depotPage, serviceCompanyPage, insuranceCompanyPage, activeTab, userSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const value = userSearchInput.trim();
      setUserPage(1);
      setUserSearch(value.length >= 2 ? value : '');
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [userSearchInput]);

  const fetchUsers = async () => {
    try {
      const response = await userService.getAllUsers({ page: userPage, limit: 50, search: userSearch || undefined });
      setUsers(response.data);
      if (response.pagination) {
        setUserPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchDepots = async () => {
    try {
      const response = await adminService.getAllDepots({ page: depotPage, limit: 50 });
      setDepots(response.data);
      if (response.pagination) {
        setDepotPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching depots:', error);
    }
  };

  const fetchServiceCompanies = async () => {
    try {
      const response = await adminService.getAllServiceCompanies({ page: serviceCompanyPage, limit: 50 });
      setServiceCompanies(response.data);
      if (response.pagination) {
        setServiceCompanyPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching service companies:', error);
    }
  };

  const fetchInsuranceCompanies = async () => {
    try {
      const response = await adminService.getAllInsuranceCompanies({ page: insuranceCompanyPage, limit: 50 });
      setInsuranceCompanies(response.data);
      if (response.pagination) {
        setInsuranceCompanyPagination({
          total: response.pagination.total,
          totalPages: response.pagination.totalPages
        });
      }
    } catch (error) {
      console.error('Error fetching insurance companies:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [rolesData, permissionsData, companiesData, depotsResponse, serviceCompaniesResponse, insuranceCompaniesResponse] = await Promise.all([
        adminService.getAllRoles(),
        adminService.getAllPermissions(),
        adminService.getAllCompanies(),
        adminService.getAllDepots({ limit: 1000 }),
        adminService.getAllServiceCompanies({ limit: 1000 }),
        adminService.getAllInsuranceCompanies({ limit: 1000 }),
      ]);
      setRoles(rolesData);
      setPermissions(permissionsData);
      setCompanies(companiesData);
      setDepots(depotsResponse.data);
      setServiceCompanies(serviceCompaniesResponse.data);
      setInsuranceCompanies(insuranceCompaniesResponse.data);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenUserModal = async (user?: User) => {
    if (user) {
      try {
        const userDetails = await userService.getUserById(user.UserID);
        setSelectedUser(userDetails);
        setUserFormData({
          name: userDetails.Name,
          surname: userDetails.Surname,
          email: userDetails.Email,
          isActive: userDetails.IsActive,
          companyId: userDetails.CompanyID,
          companyIds: userDetails.companyIds || (userDetails.CompanyID ? [userDetails.CompanyID] : []),
          roleIds: userDetails.RoleIDs ? userDetails.RoleIDs.split(',').map(Number) : [],
        });
        
        const userDepots = await userService.getUserDepots(user.UserID);
        setSelectedDepots(userDepots);
      } catch (error) {
        console.error('Error fetching user details:', error);
      }
    } else {
      setSelectedUser(null);
      setUserFormData({ isActive: true, roleIds: [], companyIds: [] });
      setSelectedDepots([]);
    }
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => {
    setIsUserModalOpen(false);
    setSelectedUser(null);
    setUserFormData({});
    setSelectedDepots([]);
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedUser) {
        await userService.updateUser(selectedUser.UserID, userFormData);
        await userService.updateUserDepots(selectedUser.UserID, selectedDepots);
      } else {
        const newUser = await userService.createUser(userFormData);
        if (newUser && newUser.userId) {
          await userService.updateUserDepots(newUser.userId, selectedDepots);
        }
      }
      await fetchUsers();
      handleCloseUserModal();
      toast.success('Kullanıcı başarıyla kaydedildi');
    } catch (error: any) {
      console.error('Error saving user:', error);
      const message =
        error?.response?.data?.error ||
        (error?.response?.status === 400
          ? 'Geçersiz istek. Lütfen girdiğiniz bilgileri kontrol edin.'
          : 'Kullanıcı kaydedilirken bir hata oluştu.');
      toast.error(message);
    }
  };

  const handleSendWelcomeEmail = async (user: User) => {
    try {
      const response = await userService.sendWelcomeEmail(user.UserID);
      toast.success(response?.message || `${user.Email} adresine hoşgeldin e-postası gönderildi`);
    } catch (error: any) {
      console.error('Error sending welcome email:', error);
      const message =
        error?.response?.data?.error ||
        (error?.response?.status === 403
          ? 'Bu işlem için yetkiniz bulunmuyor.'
          : 'Hoşgeldin e-postası gönderilirken bir hata oluştu.');
      toast.error(message);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (window.confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
      try {
        await userService.deleteUser(id);
        await fetchUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const handleToggleUserStatus = async (id: number, isActive: boolean) => {
    try {
      await userService.updateUser(id, { isActive: !isActive });
      await fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  const toggleSelectUser = (id: number) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter(userId => userId !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const toggleSelectAllUsers = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map(u => u.UserID));
    }
  };

  const handleBulkManagerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await userService.bulkUpdateManagers(selectedUserIds, bulkManagerId);
      await fetchUsers();
      setIsBulkManagerModalOpen(false);
      setSelectedUserIds([]);
      setBulkManagerId(null);
    } catch (error) {
      console.error('Error bulk updating managers:', error);
    }
  };

  const handleOpenRoleModal = (role?: Role) => {
    if (role) {
      setSelectedRole(role);
      setRoleFormData({
        name: role.Name,
        description: role.Description,
        permissionIds: role.PermissionIDs ? role.PermissionIDs.split(',').map(Number) : [],
      });
    } else {
      setSelectedRole(null);
      setRoleFormData({ permissionIds: [] });
    }
    setIsRoleModalOpen(true);
  };

  const handleCloseRoleModal = () => {
    setIsRoleModalOpen(false);
    setSelectedRole(null);
    setRoleFormData({});
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedRole) {
        await adminService.updateRole(selectedRole.RoleID, roleFormData);
      } else {
        await adminService.createRole(roleFormData);
      }
      await fetchData();
      handleCloseRoleModal();
    } catch (error) {
      console.error('Error saving role:', error);
    }
  };

  const handleDeleteRole = async (id: number) => {
    if (window.confirm('Bu rolü silmek istediğinize emin misiniz?')) {
      try {
        await adminService.deleteRole(id);
        await fetchData();
      } catch (error) {
        console.error('Error deleting role:', error);
      }
    }
  };

  const handleOpenDepotModal = (depot?: Depot) => {
    if (depot) {
      setSelectedDepot(depot);
      setDepotFormData({
        name: depot.Name,
        companyId: depot.CompanyID,
        city: depot.City,
        address: '', // Address not in interface but in DB? Let's check interface
      });
    } else {
      setSelectedDepot(null);
      setDepotFormData({ companyId: companies[0]?.CompanyID });
    }
    setIsDepotModalOpen(true);
  };

  const handleCloseDepotModal = () => {
    setIsDepotModalOpen(false);
    setSelectedDepot(null);
    setDepotFormData({});
  };

  const handleDepotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedDepot) {
        await adminService.updateDepot(selectedDepot.DepotID, depotFormData);
      } else {
        await adminService.createDepot(depotFormData);
      }
      await fetchDepots();
      handleCloseDepotModal();
    } catch (error) {
      console.error('Error saving depot:', error);
    }
  };

  const handleDeleteDepot = async (id: number) => {
    if (window.confirm('Bu depoyu silmek istediğinize emin misiniz?')) {
      try {
        await adminService.deleteDepot(id);
        await fetchDepots();
      } catch (error) {
        console.error('Error deleting depot:', error);
      }
    }
  };

  const handleOpenDepotUsersModal = async (depot: Depot) => {
    setSelectedDepot(depot);
    try {
      const ids = await adminService.getDepotUsers(depot.DepotID);
      setDepotUserIds(ids);
      setIsDepotUsersModalOpen(true);
    } catch (error) {
      console.error('Error fetching depot users:', error);
    }
  };

  const handleDepotUsersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDepot) return;
    try {
      await adminService.updateDepotUsers(selectedDepot.DepotID, depotUserIds);
      setIsDepotUsersModalOpen(false);
      setSelectedDepot(null);
      setDepotUserIds([]);
    } catch (error) {
      console.error('Error updating depot users:', error);
    }
  };

  const handleOpenServiceCompanyModal = (company?: ServiceCompany) => {
    if (company) {
      setSelectedServiceCompany(company);
      setServiceCompanyFormData({
        name: company.Name,
        address: company.Address,
        phone: company.Phone,
        email: company.Email,
        contactPerson: company.ContactPerson,
        isActive: company.IsActive,
      });
    } else {
      setSelectedServiceCompany(null);
      setServiceCompanyFormData({ isActive: true });
    }
    setIsServiceCompanyModalOpen(true);
  };

  const handleCloseServiceCompanyModal = () => {
    setIsServiceCompanyModalOpen(false);
    setSelectedServiceCompany(null);
    setServiceCompanyFormData({});
  };

  const handleServiceCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedServiceCompany) {
        await adminService.updateServiceCompany(selectedServiceCompany.ServiceCompanyID, serviceCompanyFormData);
      } else {
        await adminService.createServiceCompany(serviceCompanyFormData);
      }
      await fetchServiceCompanies();
      handleCloseServiceCompanyModal();
    } catch (error) {
      console.error('Error saving service company:', error);
    }
  };

  const handleDeleteServiceCompany = async (id: number) => {
    if (window.confirm('Bu servis firmasını silmek istediğinize emin misiniz?')) {
      try {
        await adminService.deleteServiceCompany(id);
        await fetchServiceCompanies();
      } catch (error) {
        console.error('Error deleting service company:', error);
      }
    }
  };

  const handleOpenInsuranceCompanyModal = (company?: InsuranceCompany) => {
    if (company) {
      setSelectedInsuranceCompany(company);
      setInsuranceCompanyFormData({
        name: company.Name,
        isActive: company.IsActive,
      });
    } else {
      setSelectedInsuranceCompany(null);
      setInsuranceCompanyFormData({ isActive: true });
    }
    setIsInsuranceCompanyModalOpen(true);
  };

  const handleCloseInsuranceCompanyModal = () => {
    setIsInsuranceCompanyModalOpen(false);
    setSelectedInsuranceCompany(null);
    setInsuranceCompanyFormData({});
  };

  const handleInsuranceCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedInsuranceCompany) {
        await adminService.updateInsuranceCompany(selectedInsuranceCompany.InsuranceCompanyID, insuranceCompanyFormData);
      } else {
        await adminService.createInsuranceCompany(insuranceCompanyFormData);
      }
      await fetchInsuranceCompanies();
      handleCloseInsuranceCompanyModal();
    } catch (error) {
      console.error('Error saving insurance company:', error);
    }
  };

  const handleDeleteInsuranceCompany = async (id: number) => {
    if (window.confirm('Bu sigorta şirketini silmek istediğinize emin misiniz?')) {
      try {
        await adminService.deleteInsuranceCompany(id);
        await fetchInsuranceCompanies();
      } catch (error) {
        console.error('Error deleting insurance company:', error);
      }
    }
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
        <div className="flex items-center space-x-3">
          <Shield className="w-6 h-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-neutral-900">Yönetim</h1>
        </div>

        <div className="border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Kullanıcılar
            </button>
            <PermissionGuard permission={PERMISSIONS.ADMIN.ROLES_VIEW}>
              <button
                onClick={() => setActiveTab('roles')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'roles'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <Shield className="w-4 h-4 inline mr-2" />
                Roller
              </button>
            </PermissionGuard>
            <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
              <button
                onClick={() => setActiveTab('depots')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'depots'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <MapPin className="w-4 h-4 inline mr-2" />
                Depolar
              </button>
            </PermissionGuard>
            <button
              onClick={() => setActiveTab('serviceCompanies')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'serviceCompanies'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              Servis Firmaları
            </button>
            <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
              <button
                onClick={() => setActiveTab('insuranceCompanies')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'insuranceCompanies'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <Building className="w-4 h-4 inline mr-2" />
                Sigorta Şirketleri
              </button>
            </PermissionGuard>
            <button
              onClick={() => setActiveTab('auditLogs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'auditLogs'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Denetim Kayıtları
            </button>
            <button
              onClick={() => setActiveTab('opetSettings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'opetSettings'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Opet Ayarları
            </button>
            <button
              onClick={() => setActiveTab('jobEmailSettings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'jobEmailSettings'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Job E-posta Ayarları
            </button>
            <button
              onClick={() => setActiveTab('riskSettings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'riskSettings'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Risk Ayarları
            </button>
          </nav>
        </div>

        {activeTab === 'opetSettings' && <OpetSettings />}
        {activeTab === 'jobEmailSettings' && <JobEmailSettings />}
        {activeTab === 'riskSettings' && <RiskSettings />}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center space-x-2">
              <div className="w-72">
                <input
                  type="text"
                  value={userSearchInput}
                  onChange={(e) => setUserSearchInput(e.target.value)}
                  placeholder="Ad, soyad, e-posta, şirket, rol..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="flex space-x-2">
                {selectedUserIds.length > 0 && (
                <PermissionGuard permission={PERMISSIONS.ADMIN.USERS_EDIT}>
                  <Button variant="secondary" onClick={() => setIsBulkManagerModalOpen(true)}>
                    <Users className="w-4 h-4 mr-2" />
                    Toplu Yönetici Ata ({selectedUserIds.length})
                  </Button>
                </PermissionGuard>
                )}
                <PermissionGuard permission={PERMISSIONS.ADMIN.USERS_ADD}>
                  <Button onClick={() => handleOpenUserModal()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Kullanıcı Ekle
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={users.length > 0 && selectedUserIds.length === users.length}
                        onChange={toggleSelectAllUsers}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Ad Soyad</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">E-posta</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Şirket</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Roller</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {users.map((user) => (
                    <tr key={user.UserID} className="hover:bg-neutral-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.UserID)}
                          onChange={() => toggleSelectUser(user.UserID)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                        {user.Name} {user.Surname}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">{user.Email}</td>
                      <td className="px-6 py-4 text-sm text-neutral-600">{user.CompanyName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        <div className="flex flex-wrap gap-1">
                          {user.Roles?.split(',').map((role, index) => (
                            <span key={index} className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs">
                              {role}
                            </span>
                          )) || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleUserStatus(user.UserID, user.IsActive)}
                          className="flex items-center space-x-2"
                        >
                          {user.IsActive ? (
                            <>
                              <CheckCircle className="w-5 h-5 text-success-600" />
                              <span className="text-sm text-success-700">Aktif</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-5 h-5 text-danger-600" />
                              <span className="text-sm text-danger-700">Pasif</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <PermissionGuard permission={PERMISSIONS.ADMIN.USERS_EDIT}>
                            <button
                              onClick={() => handleSendWelcomeEmail(user)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                              title="Hoşgeldin maili gönder"
                            >
                              <Send className="w-4 h-4 text-primary-600" />
                            </button>
                          </PermissionGuard>
                          <PermissionGuard permission={PERMISSIONS.ADMIN.USERS_EDIT}>
                            <button
                              onClick={() => handleOpenUserModal(user)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit className="w-4 h-4 text-primary-600" />
                            </button>
                          </PermissionGuard>
                          <PermissionGuard permission={PERMISSIONS.ADMIN.USERS_DELETE}>
                            <button
                              onClick={() => handleDeleteUser(user.UserID)}
                              className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4 text-danger-600" />
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <Pagination
                currentPage={userPage}
                totalPages={userPagination.totalPages}
                onPageChange={setUserPage}
                totalItems={userPagination.total}
                itemsPerPage={50}
              />

              {users.length === 0 && (
                <div className="p-8 text-center text-neutral-500">
                  Kullanıcı bulunmuyor
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <PermissionGuard permission={PERMISSIONS.ADMIN.ROLES_ADD}>
                <Button onClick={() => handleOpenRoleModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Rol Ekle
                </Button>
              </PermissionGuard>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Rol Adı</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Açıklama</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Yetki Sayısı</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {roles.map((role) => (
                    <tr key={role.RoleID} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                        {role.Name}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {role.Description || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {role.Permissions?.split(',').length || 0}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <PermissionGuard permission={PERMISSIONS.ADMIN.ROLES_EDIT}>
                            <button
                              onClick={() => handleOpenRoleModal(role)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit className="w-4 h-4 text-primary-600" />
                            </button>
                          </PermissionGuard>
                          <PermissionGuard permission={PERMISSIONS.ADMIN.ROLES_DELETE}>
                            <button
                              onClick={() => handleDeleteRole(role.RoleID)}
                              className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4 text-danger-600" />
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {roles.length === 0 && (
                <div className="p-8 text-center text-neutral-500">
                  Rol bulunmuyor
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'depots' && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
                <Button onClick={() => handleOpenDepotModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Depo Ekle
                </Button>
              </PermissionGuard>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Depo Adı</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Şehir</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Şirket</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {depots.map((depot) => (
                    <tr key={depot.DepotID} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900">{depot.Name}</td>
                      <td className="px-6 py-4 text-sm text-neutral-600">{depot.City || '-'}</td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {companies.find(c => c.CompanyID === depot.CompanyID)?.Name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
                            <button
                              onClick={() => handleOpenDepotModal(depot)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit className="w-4 h-4 text-primary-600" />
                            </button>
                            <button
                                onClick={() => handleOpenDepotUsersModal(depot)}
                                className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Kullanıcıları Yönet"
                            >
                                <Users className="w-4 h-4 text-blue-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteDepot(depot.DepotID)}
                              className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4 text-danger-600" />
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={depotPage}
                totalPages={depotPagination.totalPages}
                onPageChange={setDepotPage}
                totalItems={depotPagination.total}
                itemsPerPage={50}
              />
              {depots.length === 0 && (
                <div className="p-8 text-center text-neutral-500">Depo bulunmuyor</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'serviceCompanies' && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-neutral-900">Servis Firmaları</h2>
              <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
                <Button onClick={() => handleOpenServiceCompanyModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Servis Firması Ekle
                </Button>
              </PermissionGuard>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Firma Adı</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İletişim Kişisi</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Telefon</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">E-posta</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {serviceCompanies.map((company) => (
                    <tr key={company.ServiceCompanyID} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                        {company.Name}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {company.ContactPerson || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {company.Phone || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {company.Email || '-'}
                      </td>
                      <td className="px-6 py-4">
                        {company.IsActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                            Pasif
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
                            <button
                              onClick={() => handleOpenServiceCompanyModal(company)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4 text-primary-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteServiceCompany(company.ServiceCompanyID)}
                              className="p-1.5 hover:bg-error-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-error-600" />
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={serviceCompanyPage}
                totalPages={serviceCompanyPagination.totalPages}
                onPageChange={setServiceCompanyPage}
                totalItems={serviceCompanyPagination.total}
                itemsPerPage={50}
              />
              {serviceCompanies.length === 0 && (
                <div className="p-8 text-center text-neutral-500">Servis firması bulunmuyor</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'insuranceCompanies' && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-neutral-900">Sigorta Şirketleri</h2>
              <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
                <Button onClick={() => handleOpenInsuranceCompanyModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Sigorta Şirketi Ekle
                </Button>
              </PermissionGuard>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Şirket Adı</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">Durum</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-neutral-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {insuranceCompanies.map((company) => (
                    <tr key={company.InsuranceCompanyID} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                        {company.Name}
                      </td>
                      <td className="px-6 py-4">
                        {company.IsActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                            Pasif
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <PermissionGuard permission={PERMISSIONS.ADMIN.SETTINGS}>
                            <button
                              onClick={() => handleOpenInsuranceCompanyModal(company)}
                              className="p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4 text-primary-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteInsuranceCompany(company.InsuranceCompanyID)}
                              className="p-1.5 hover:bg-error-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-error-600" />
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={insuranceCompanyPage}
                totalPages={insuranceCompanyPagination.totalPages}
                onPageChange={setInsuranceCompanyPage}
                totalItems={insuranceCompanyPagination.total}
                itemsPerPage={50}
              />
              {insuranceCompanies.length === 0 && (
                <div className="p-8 text-center text-neutral-500">Sigorta şirketi bulunmuyor</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'auditLogs' && (
          <AuditLogs />
        )}
      </div>

      <Modal isOpen={isBulkManagerModalOpen} onClose={() => setIsBulkManagerModalOpen(false)} title="Toplu Yönetici Atama">
        <form onSubmit={handleBulkManagerSubmit} className="space-y-4">
          <p className="text-sm text-neutral-600">
            Seçili {selectedUserIds.length} kullanıcı için yönetici ataması yapıyorsunuz.
          </p>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Yönetici</label>
            <select
              value={bulkManagerId || ''}
              onChange={(e) => setBulkManagerId(parseInt(e.target.value) || null)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Yönetici Seçiniz (Mevcut Yöneticileri Kaldır)</option>
              {users.map((u) => (
                <option key={u.UserID} value={u.UserID}>
                  {u.Name} {u.Surname}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsBulkManagerModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit">
              Kaydet
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isDepotModalOpen} onClose={handleCloseDepotModal} title={selectedDepot ? 'Depo Düzenle' : 'Depo Ekle'}>
        <form onSubmit={handleDepotSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Depo Adı *</label>
            <input
              type="text"
              value={depotFormData.name || ''}
              onChange={(e) => setDepotFormData({ ...depotFormData, name: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Şehir</label>
            <input
              type="text"
              value={depotFormData.city || ''}
              onChange={(e) => setDepotFormData({ ...depotFormData, city: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Şirket *</label>
            <select
              value={depotFormData.companyId || ''}
              onChange={(e) => setDepotFormData({ ...depotFormData, companyId: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              {companies.map(c => (
                  <option key={c.CompanyID} value={c.CompanyID}>{c.Name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseDepotModal}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isDepotUsersModalOpen} onClose={() => setIsDepotUsersModalOpen(false)} title="Depo Yöneticileri/Kullanıcıları" size="lg">
          <form onSubmit={handleDepotUsersSubmit} className="space-y-4">
              <p className="text-sm text-neutral-600 mb-4">
                  Bu depoya atanacak kullanıcıları seçiniz. Seçilen kullanıcılar bu deponun yöneticisi veya çalışanı olarak atanacaktır.
              </p>
              <div className="max-h-96 overflow-y-auto border rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {users.map(u => (
                          <label key={u.UserID} className="flex items-center space-x-2 p-2 hover:bg-neutral-50 rounded cursor-pointer">
                              <input
                                  type="checkbox"
                                  checked={depotUserIds.includes(u.UserID)}
                                  onChange={(e) => {
                                      if (e.target.checked) {
                                          setDepotUserIds([...depotUserIds, u.UserID]);
                                      } else {
                                          setDepotUserIds(depotUserIds.filter(id => id !== u.UserID));
                                      }
                                  }}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm">
                                  <span className="font-medium">{u.Name} {u.Surname}</span>
                                  <span className="text-neutral-500 text-xs ml-1">({u.Roles})</span>
                              </span>
                          </label>
                      ))}
                  </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsDepotUsersModalOpen(false)}>İptal</Button>
                  <Button type="submit">Kaydet</Button>
              </div>
          </form>
      </Modal>

      <Modal isOpen={isServiceCompanyModalOpen} onClose={handleCloseServiceCompanyModal} title={selectedServiceCompany ? 'Servis Firması Düzenle' : 'Servis Firması Ekle'}>
        <form onSubmit={handleServiceCompanySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Firma Adı *</label>
            <input
              type="text"
              value={serviceCompanyFormData.name || ''}
              onChange={(e) => setServiceCompanyFormData({ ...serviceCompanyFormData, name: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Adres</label>
            <textarea
              value={serviceCompanyFormData.address || ''}
              onChange={(e) => setServiceCompanyFormData({ ...serviceCompanyFormData, address: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Telefon</label>
              <input
                type="text"
                value={serviceCompanyFormData.phone || ''}
                onChange={(e) => setServiceCompanyFormData({ ...serviceCompanyFormData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">E-posta</label>
              <input
                type="email"
                value={serviceCompanyFormData.email || ''}
                onChange={(e) => setServiceCompanyFormData({ ...serviceCompanyFormData, email: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">İletişim Kişisi</label>
            <input
              type="text"
              value={serviceCompanyFormData.contactPerson || ''}
              onChange={(e) => setServiceCompanyFormData({ ...serviceCompanyFormData, contactPerson: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={serviceCompanyFormData.isActive !== false}
              onChange={(e) => setServiceCompanyFormData({ ...serviceCompanyFormData, isActive: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-neutral-900">
              Aktif
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseServiceCompanyModal}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isInsuranceCompanyModalOpen} onClose={handleCloseInsuranceCompanyModal} title={selectedInsuranceCompany ? 'Sigorta Şirketi Düzenle' : 'Sigorta Şirketi Ekle'}>
        <form onSubmit={handleInsuranceCompanySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Şirket Adı *</label>
            <input
              type="text"
              value={insuranceCompanyFormData.name || ''}
              onChange={(e) => setInsuranceCompanyFormData({ ...insuranceCompanyFormData, name: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActiveInsurance"
              checked={insuranceCompanyFormData.isActive !== false}
              onChange={(e) => setInsuranceCompanyFormData({ ...insuranceCompanyFormData, isActive: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="isActiveInsurance" className="ml-2 block text-sm text-neutral-900">
              Aktif
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseInsuranceCompanyModal}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isUserModalOpen} onClose={handleCloseUserModal} title={selectedUser ? 'Kullanıcı Düzenle' : 'Kullanıcı Ekle'} size="lg">
        <form onSubmit={handleUserSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Ad *</label>
              <input
                type="text"
                value={userFormData.name || ''}
                onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Soyad *</label>
              <input
                type="text"
                value={userFormData.surname || ''}
                onChange={(e) => setUserFormData({ ...userFormData, surname: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">E-posta *</label>
              <input
                type="email"
                value={userFormData.email || ''}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Şifre {selectedUser ? '(Boş bırakılırsa değiştirilmez)' : '*'}</label>
              <input
                type="password"
                value={userFormData.password || ''}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required={!selectedUser}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Şirketler</label>
              <div className="grid grid-cols-2 gap-2">
                {companies.map((company) => (
                  <label key={company.CompanyID} className="flex items-center space-x-2 p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={userFormData.companyIds?.includes(company.CompanyID) || false}
                      onChange={(e) => {
                        const currentIds = userFormData.companyIds || [];
                        let newIds;
                        if (e.target.checked) {
                          newIds = [...currentIds, company.CompanyID];
                        } else {
                          newIds = currentIds.filter((id: number) => id !== company.CompanyID);
                        }
                        // Update companyIds and set the first one as primary companyId
                        setUserFormData({ 
                          ...userFormData, 
                          companyIds: newIds,
                          companyId: newIds.length > 0 ? newIds[0] : null
                        });
                      }}
                      className="rounded text-primary-600"
                    />
                    <span className="text-sm text-neutral-700">{company.Name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yönetici</label>
              <select
                value={userFormData.managerId || ''}
                onChange={(e) => setUserFormData({ ...userFormData, managerId: parseInt(e.target.value) || null })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Seçiniz</option>
                {users.map((u) => (
                  <option key={u.UserID} value={u.UserID}>
                    {u.Name} {u.Surname}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Roller</label>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => (
                  <label key={role.RoleID} className="flex items-center space-x-2 p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={userFormData.roleIds?.includes(role.RoleID) || false}
                      onChange={(e) => {
                        const currentIds = userFormData.roleIds || [];
                        if (e.target.checked) {
                          setUserFormData({ ...userFormData, roleIds: [...currentIds, role.RoleID] });
                        } else {
                          setUserFormData({ ...userFormData, roleIds: currentIds.filter((id: number) => id !== role.RoleID) });
                        }
                      }}
                      className="rounded text-primary-600"
                    />
                    <span className="text-sm text-neutral-700">{role.Name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yetkili Depolar</label>
              <div className="grid grid-cols-2 gap-2">
                {depots
                  .filter(depot => !userFormData.companyId || depot.CompanyID === userFormData.companyId)
                  .map((depot) => (
                  <label key={depot.DepotID} className="flex items-center space-x-2 p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={selectedDepots.includes(depot.DepotID)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDepots([...selectedDepots, depot.DepotID]);
                        } else {
                          setSelectedDepots(selectedDepots.filter(id => id !== depot.DepotID));
                        }
                      }}
                      className="rounded text-primary-600"
                    />
                    <span className="text-sm text-neutral-700">{depot.Name} ({depot.City})</span>
                  </label>
                ))}
                {depots.filter(depot => !userFormData.companyId || depot.CompanyID === userFormData.companyId).length === 0 && (
                  <div className="col-span-2 text-sm text-neutral-500 italic">
                    {userFormData.companyId ? 'Bu şirkete ait depo bulunamadı.' : 'Depoları görmek için önce şirket seçiniz.'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={userFormData.isActive || false}
                onChange={(e) => setUserFormData({ ...userFormData, isActive: e.target.checked })}
                className="rounded text-primary-600"
              />
              <label htmlFor="isActive" className="ml-2 text-sm text-neutral-700">Aktif</label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseUserModal}>
              İptal
            </Button>
            <Button type="submit">
              {selectedUser ? 'Güncelle' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isRoleModalOpen} onClose={handleCloseRoleModal} title={selectedRole ? 'Rol Düzenle' : 'Rol Ekle'} size="lg">
        <form onSubmit={handleRoleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Rol Adı *</label>
              <input
                type="text"
                value={roleFormData.name || ''}
                onChange={(e) => setRoleFormData({ ...roleFormData, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Açıklama</label>
              <textarea
                value={roleFormData.description || ''}
                onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Yetkiler</label>
              <div className="max-h-64 overflow-y-auto border border-neutral-200 rounded-lg p-2">
                {Object.entries(permissions.reduce((acc: any, perm) => {
                  if (perm.Module) {
                    if (!acc[perm.Module]) acc[perm.Module] = [];
                    acc[perm.Module].push(perm);
                  }
                  return acc;
                }, {})).map(([module, modulePerms]: [string, any]) => (
                  <div key={module} className="mb-4">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-2 capitalize">{module}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {modulePerms.map((perm: any) => (
                        <label key={perm.PermissionID} className="flex items-center space-x-2 p-2 border border-neutral-200 rounded hover:bg-neutral-50">
                          <input
                            type="checkbox"
                            checked={roleFormData.permissionIds?.includes(perm.PermissionID) || false}
                            onChange={(e) => {
                              const currentIds = roleFormData.permissionIds || [];
                              if (e.target.checked) {
                                setRoleFormData({ ...roleFormData, permissionIds: [...currentIds, perm.PermissionID] });
                              } else {
                                setRoleFormData({ ...roleFormData, permissionIds: currentIds.filter((id: number) => id !== perm.PermissionID) });
                              }
                            }}
                            className="rounded text-primary-600"
                          />
                          <span className="text-sm text-neutral-700">{perm.Description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseRoleModal}>
              İptal
            </Button>
            <Button type="submit">
              {selectedRole ? 'Güncelle' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Admin;
