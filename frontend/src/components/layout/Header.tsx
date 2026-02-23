import { Bell, User, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotificationStore } from '../../store/notificationStore';
import { useEffect, useRef } from 'react';
import { Notification } from '../../types';
import { formatDateTime } from '../../utils/formatUtils';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

const Header = ({ onToggleSidebar }: HeaderProps) => {
  const { user, logout } = useAuth();
  const { 
    notifications, 
    unreadCount, 
    isOpen, 
    toggleDropdown, 
    closeDropdown,
    fetchNotifications, 
    fetchUnreadCount,
    markAsRead,
    markAllAsRead
  } = useNotificationStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationList = notifications || [];

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeDropdown]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.IsRead) {
      await markAsRead(notification.NotificationID);
    }
  };

  return (
    <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Menüyü Aç"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-primary-600">Araç Servis Takip</h1>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={toggleDropdown}
              className="relative p-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 bg-danger-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-neutral-200 z-50">
                <div className="p-4 border-b border-neutral-200">
                  <h3 className="font-semibold text-neutral-900">Bildirimler</h3>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notificationList.length === 0 ? (
                    <div className="p-4 text-center text-neutral-500">
                      Bildirim bulunmuyor
                    </div>
                  ) : (
                    notificationList.map((notification) => (
                      <div
                        key={notification.NotificationID}
                        onClick={() => handleNotificationClick(notification)}
                        className={`p-4 border-b border-neutral-100 cursor-pointer hover:bg-neutral-50 transition-colors ${
                          !notification.IsRead ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-1">
                            <h4 className="font-medium text-neutral-900 text-sm">{notification.Title}</h4>
                            <p className="text-sm text-neutral-600 mt-1">{notification.Message}</p>
                            <p className="text-xs text-neutral-400 mt-2">
                              {formatDateTime(notification.CreatedAt)}
                            </p>
                          </div>
                          {!notification.IsRead && (
                            <div className="w-2 h-2 bg-primary-600 rounded-full mt-1"></div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {notificationList.length > 0 && (
                  <div className="p-4 border-t border-neutral-200 text-center">
                    <button 
                      onClick={() => markAllAsRead()}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Tümünü Okundu Olarak İşaretle
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-neutral-600" />
            <span className="text-sm font-medium text-neutral-900">
              {user?.Name} {user?.Surname}
            </span>
          </div>

          <button
            onClick={logout}
            className="p-2 text-neutral-600 hover:bg-danger-50 hover:text-danger-600 rounded-lg transition-colors"
            title="Çıkış Yap"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
