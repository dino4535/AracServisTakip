import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import Button from '../common/Button';
import { Save, AlertCircle, CheckCircle, Play, Clock, Send } from 'lucide-react';

type Message = { type: 'success' | 'error'; text: string } | null;

const JobEmailSettings = () => {
  const [loading, setLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const [inspectionReminderEmails, setInspectionReminderEmails] = useState(true);
  const [inspectionOverdueEmails, setInspectionOverdueEmails] = useState(true);
  const [insuranceReminderEmails, setInsuranceReminderEmails] = useState(true);
  const [scheduleTime, setScheduleTime] = useState('09:00');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);

      const [
        inspectionReminder,
        inspectionOverdue,
        insuranceReminder,
        schedule,
      ] = await Promise.all([
        safeGetSetting('job_inspection_reminder_emails'),
        safeGetSetting('job_inspection_overdue_emails'),
        safeGetSetting('job_insurance_reminder_emails'),
        safeGetSetting('job_reminder_schedule'),
      ]);

      setInspectionReminderEmails(inspectionReminder !== 'false');
      setInspectionOverdueEmails(inspectionOverdue !== 'false');
      setInsuranceReminderEmails(insuranceReminder !== 'false');
      setScheduleTime(schedule && schedule !== 'true' ? schedule : '09:00');
    } catch (error) {
      console.error('Error fetching job email settings:', error);
      setMessage({
        type: 'error',
        text: 'Job e-posta ayarları yüklenirken bir hata oluştu.',
      });
    } finally {
      setLoading(false);
    }
  };

  const safeGetSetting = async (key: string): Promise<string> => {
    try {
      const value = await adminService.getSetting(key);
      return value;
    } catch {
      return 'true';
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);

      await Promise.all([
        adminService.updateSetting(
          'job_inspection_reminder_emails',
          String(inspectionReminderEmails)
        ),
        adminService.updateSetting(
          'job_inspection_overdue_emails',
          String(inspectionOverdueEmails)
        ),
        adminService.updateSetting(
          'job_insurance_reminder_emails',
          String(insuranceReminderEmails)
        ),
        adminService.updateSetting(
          'job_reminder_schedule',
          scheduleTime
        ),
      ]);

      setMessage({
        type: 'success',
        text: 'Job e-posta ayarları başarıyla kaydedildi.',
      });

      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving job email settings:', error);
      setMessage({
        type: 'error',
        text: 'Job e-posta ayarları kaydedilirken bir hata oluştu.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerManual = async () => {
    if (!window.confirm('Job e-posta hatırlatmalarını şimdi manuel olarak tetiklemek istediğinize emin misiniz?')) {
      return;
    }
    
    try {
      setTriggerLoading(true);
      await adminService.triggerJobReminder();
      setMessage({
        type: 'success',
        text: 'Job başarıyla tetiklendi. İşlem arka planda devam ediyor.',
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Trigger error:', error);
      setMessage({
        type: 'error',
        text: 'Job tetiklenirken bir hata oluştu.',
      });
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleTestReminders = async () => {
    try {
      setTestLoading(true);
      const response = await adminService.testJobReminder();
      setMessage({
        type: 'success',
        text: response.message || 'Test işlemi başlatıldı.',
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error('Test error:', error);
      setMessage({
        type: 'error',
        text: 'Test işlemi sırasında bir hata oluştu.',
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Job E-posta Ayarları</h2>
        <div className="flex space-x-2">
          <Button 
            variant="secondary" 
            onClick={handleTestReminders} 
            disabled={testLoading || triggerLoading || loading}
            className="text-blue-600 border-blue-600 hover:bg-blue-50"
          >
            <Send size={16} className="mr-2" />
            {testLoading ? 'Test Ediliyor...' : 'Test Et'}
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleTriggerManual} 
            disabled={triggerLoading || loading || testLoading}
            className="text-primary-600 border-primary-600 hover:bg-primary-50"
          >
            <Play size={16} className="mr-2" />
            {triggerLoading ? 'Çalışıyor...' : 'Şimdi Tetikle'}
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 mb-6 rounded-md flex items-center ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle size={20} className="mr-2" />
          ) : (
            <AlertCircle size={20} className="mr-2" />
          )}
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <div className="border-b pb-4">
          <h3 className="text-lg font-medium mb-3 flex items-center">
            <Clock size={20} className="mr-2 text-neutral-500" />
            Otomatik Çalışma Zamanı
          </h3>
          <p className="text-sm text-neutral-600 mb-3">
            Sistemin otomatik olarak hatırlatma maillerini göndereceği saati belirleyin. (Bu ayar Pazar günleri için geçerlidir.)
          </p>
          <div className="flex items-center">
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="border-b pb-4">
          <h3 className="text-lg font-medium mb-3">Muayene Hatırlatma Mailleri</h3>
          <p className="text-sm text-neutral-600 mb-3">
            Yaklaşan muayene tarihleri için sürücü, araç yöneticisi ve şirket adminlerine
            gönderilen haftalık otomatik e-posta bildirimlerini yönetir.
          </p>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={inspectionReminderEmails}
                onChange={(e) => setInspectionReminderEmails(e.target.checked)}
              />
              <div
                className={`block w-14 h-8 rounded-full ${
                  inspectionReminderEmails ? 'bg-green-500' : 'bg-gray-300'
                }`}
              ></div>
              <div
                className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                  inspectionReminderEmails ? 'transform translate-x-6' : ''
                }`}
              ></div>
            </div>
            <div className="ml-3 text-gray-700 font-medium">
              Muayene hatırlatma maillerini gönder
            </div>
          </label>
        </div>

        <div className="border-b pb-4">
          <h3 className="text-lg font-medium mb-3">Vizesi Geçmiş Araç Mailleri</h3>
          <p className="text-sm text-neutral-600 mb-3">
            Muayene vize tarihi geçmiş araçlar için araç yöneticisi ve şirket adminlerine
            gönderilen haftalık uyarı e-postalarını yönetir.
          </p>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={inspectionOverdueEmails}
                onChange={(e) => setInspectionOverdueEmails(e.target.checked)}
              />
              <div
                className={`block w-14 h-8 rounded-full ${
                  inspectionOverdueEmails ? 'bg-green-500' : 'bg-gray-300'
                }`}
              ></div>
              <div
                className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                  inspectionOverdueEmails ? 'transform translate-x-6' : ''
                }`}
              ></div>
            </div>
            <div className="ml-3 text-gray-700 font-medium">
              Vizesi geçmiş araç maillerini gönder
            </div>
          </label>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-3">Sigorta/Kasko Hatırlatma Mailleri</h3>
          <p className="text-sm text-neutral-600 mb-3">
            Yaklaşan sigorta ve kasko bitiş tarihleri için şirket adminlerine gönderilen
            haftalık özet e-postalarını yönetir.
          </p>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={insuranceReminderEmails}
                onChange={(e) => setInsuranceReminderEmails(e.target.checked)}
              />
              <div
                className={`block w-14 h-8 rounded-full ${
                  insuranceReminderEmails ? 'bg-green-500' : 'bg-gray-300'
                }`}
              ></div>
              <div
                className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                  insuranceReminderEmails ? 'transform translate-x-6' : ''
                }`}
              ></div>
            </div>
            <div className="ml-3 text-gray-700 font-medium">
              Sigorta/Kasko hatırlatma maillerini gönder
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="primary" onClick={handleSave} disabled={loading}>
          <Save size={18} className="mr-2" />
          Kaydet
        </Button>
      </div>
    </div>
  );
};

export default JobEmailSettings;

