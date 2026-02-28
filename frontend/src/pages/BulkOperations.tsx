import { useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { bulkService } from '../services/bulkService';

type TabType = 'vehicles' | 'insurance' | 'fuel' | 'driver_mapping' | 'drivers' | 'monthly_km';

const BulkOperations = () => {
  const [activeTab, setActiveTab] = useState<TabType>('vehicles');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; count?: number; errors?: string[] } | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const data = await bulkService.downloadTemplate(activeTab);
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeTab}_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download error:', error);
      alert('Şablon indirilirken bir hata oluştu.');
    }
  };

  const handleDownloadData = async () => {
    try {
      const data = await bulkService.downloadData(activeTab);
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeTab}_data.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download error:', error);
      alert('Veri indirilirken bir hata oluştu.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      let response;
      switch (activeTab) {
        case 'vehicles':
          response = await bulkService.uploadVehicles(file);
          break;
        case 'insurance':
          response = await bulkService.uploadInsurance(file);
          break;
        case 'fuel':
          response = await bulkService.uploadFuel(file);
          break;
        case 'driver_mapping':
          response = await bulkService.uploadDriverMapping(file);
          break;
        case 'drivers':
          response = await bulkService.uploadDrivers(file);
          break;
        case 'monthly_km':
          response = await bulkService.uploadMonthlyKm(file);
          break;
      }
      setResult(response);
      if (response.success && (!response.errors || response.errors.length === 0)) {
        setFile(null);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setResult({ success: false, errors: ['Yükleme sırasında bir hata oluştu.'] });
    } finally {
      setUploading(false);
    }
  };

  const tabs = [
    { id: 'vehicles', label: 'Toplu Araç Ekleme' },
    { id: 'drivers', label: 'Toplu Sürücü Ekleme' },
    { id: 'driver_mapping', label: 'Sürücü Eşleme' },
    { id: 'insurance', label: 'Toplu Sigorta/Kasko' },
    { id: 'fuel', label: 'Toplu Yakıt Kaydı' },
    { id: 'monthly_km', label: 'Aylık KM Yükleme' },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <FileSpreadsheet className="w-6 h-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-neutral-900">Toplu İşlemler</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="border-b border-neutral-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setFile(null);
                    setResult(null);
                  }}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                    ${activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'}
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6 space-y-8">
            {/* Step 1: Download Template */}
            <div className="bg-neutral-50 p-6 rounded-lg border border-neutral-200">
              <h3 className="text-lg font-medium text-neutral-900 mb-2">1. Adım: Şablon veya Mevcut Veri İndir</h3>
              <p className="text-sm text-neutral-600 mb-4">
                Verilerinizi doğru formatta yüklemek için şablonu kullanabilir veya mevcut verileri indirip düzenleyerek tekrar yükleyebilirsiniz.
              </p>
              <div className="flex space-x-3">
                <Button variant="secondary" onClick={handleDownloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  Boş Şablon İndir
                </Button>
                <Button variant="primary" onClick={handleDownloadData}>
                  <Download className="w-4 h-4 mr-2" />
                  Mevcut Verileri İndir
                </Button>
              </div>
            </div>

            {/* Step 2: Upload File */}
            <div className="bg-white p-6 rounded-lg border border-neutral-200">
              <h3 className="text-lg font-medium text-neutral-900 mb-2">2. Adım: Dosya Yükle</h3>
              <p className="text-sm text-neutral-600 mb-4">
                Doldurduğunuz Excel dosyasını seçin ve yükleyin.
              </p>
              
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-neutral-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-primary-50 file:text-primary-700
                    hover:file:bg-primary-100
                  "
                />
                <Button 
                  onClick={handleUpload} 
                  disabled={!file || uploading}
                >
                  {uploading ? (
                    'Yükleniyor...'
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Yükle
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Results */}
            {result && (
              <div className={`p-4 rounded-lg border ${result.success && (!result.errors || result.errors.length === 0) ? 'bg-success-50 border-success-200' : 'bg-warning-50 border-warning-200'}`}>
                <div className="flex items-start">
                  {result.success && (!result.errors || result.errors.length === 0) ? (
                    <CheckCircle className="w-5 h-5 text-success-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-warning-600 mt-0.5" />
                  )}
                  <div className="ml-3">
                    <h3 className={`text-sm font-medium ${result.success && (!result.errors || result.errors.length === 0) ? 'text-success-800' : 'text-warning-800'}`}>
                      İşlem Tamamlandı
                    </h3>
                    <div className={`mt-2 text-sm ${result.success && (!result.errors || result.errors.length === 0) ? 'text-success-700' : 'text-warning-700'}`}>
                      <p>Başarılı Kayıt Sayısı: {result.count}</p>
                      {result.errors && result.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="font-medium">Hatalar:</p>
                          <ul className="list-disc list-inside mt-1 space-y-1">
                            {result.errors.map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BulkOperations;
