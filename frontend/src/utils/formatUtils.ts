export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(amount);
};

export const formatKm = (km: number): string => {
  return new Intl.NumberFormat('tr-TR').format(km) + ' km';
};

export const formatLiters = (liters: number): string => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(liters) + ' L';
};

export const getStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    Active: 'text-success-600 bg-success-50',
    InMaintenance: 'text-warning-600 bg-warning-50',
    Retired: 'text-danger-600 bg-danger-50',
    Sold: 'text-neutral-600 bg-neutral-50',
    Pending: 'text-warning-600 bg-warning-50',
    InProgress: 'text-primary-600 bg-primary-50',
    Completed: 'text-success-600 bg-success-50',
    Cancelled: 'text-danger-600 bg-danger-50',
    Low: 'text-success-600 bg-success-50',
    Medium: 'text-warning-600 bg-warning-50',
    High: 'text-danger-600 bg-danger-50',
    Urgent: 'text-danger-600 bg-danger-50',
  };
  return colorMap[status] || 'text-neutral-600 bg-neutral-50';
};

export const getPriorityColor = (priority: string): string => {
  const colorMap: Record<string, string> = {
    Low: 'bg-success-500',
    Medium: 'bg-warning-500',
    High: 'bg-danger-500',
    Urgent: 'bg-danger-700',
  };
  return colorMap[priority] || 'bg-neutral-500';
};

export const calculateDaysUntil = (date: string | Date): number => {
  const targetDate = new Date(date);
  const today = new Date();
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const isExpiringSoon = (date: string | Date, days: number = 30): boolean => {
  const daysUntil = calculateDaysUntil(date);
  return daysUntil > 0 && daysUntil <= days;
};

export const isExpired = (date: string | Date): boolean => {
  const daysUntil = calculateDaysUntil(date);
  return daysUntil <= 0;
};
