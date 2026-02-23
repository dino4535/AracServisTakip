export const getTurkeyNow = (): Date => {
  const now = new Date();
  const trString = now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' });
  return new Date(trString);
};

export const toTurkeyDateTimeString = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
};

