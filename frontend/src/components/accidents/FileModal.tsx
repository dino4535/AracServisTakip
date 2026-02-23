
import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { accidentService } from '../../services/accidentService';

interface FileModalProps {
  isOpen: boolean;
  onClose: () => void;
  accidentId: number;
  readOnly?: boolean;
}

interface AccidentFile {
  FileID: number;
  FileName: string;
  FilePath: string;
  FileType: string;
  UploadedBy: number;
  UploaderName: string;
  CreatedAt: string;
}

const FileModal: React.FC<FileModalProps> = ({ isOpen, onClose, accidentId, readOnly = false }) => {
  const [files, setFiles] = useState<AccidentFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && accidentId) {
      loadFiles();
    }
  }, [isOpen, accidentId]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await accidentService.getFiles(accidentId);
      setFiles(data);
    } catch (err) {
      console.error('Error loading files:', err);
      setError('Dosyalar yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      await accidentService.uploadFile(accidentId, formData);
      await loadFiles();
      // Reset input
      e.target.value = '';
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Dosya yüklenirken bir hata oluştu.');
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.includes('image')) return <ImageIcon className="h-5 w-5 text-blue-500" />;
    return <FileText className="h-5 w-5 text-gray-500" />;
  };

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const getDownloadUrl = (path: string) => {
    // path comes as "uploads\accidents\file.jpg" from backend, need to fix slashes and prepend url
    const cleanPath = path.replace(/\\/g, '/');
    // Backend serves static files at /uploads
    // If path starts with uploads/, remove it to avoid double
    // Actually backend returns relative path "uploads/accidents/..."
    // Express static is at /uploads mapping to ../uploads.
    // So if I request http://localhost:5000/uploads/accidents/file.jpg it should work.
    // But my path is "uploads/accidents/file.jpg".
    // So url = BASE_URL_WITHOUT_API + path.
    // VITE_API_URL is http://localhost:5000/api
    const baseUrl = API_URL.replace('/api', '');
    return `${baseUrl}/${cleanPath}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Kaza Dosyaları / Tutanaklar">
      <div className="space-y-4">
        {!readOnly && (
          <div className="flex items-center space-x-4 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className={`flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Yükleniyor...' : 'Dosya Seç ve Yükle'}
            </label>
            <span className="text-xs text-gray-500">
              (JPG, PNG, PDF - Max 10MB)
            </span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {loading ? (
            <div className="text-center py-4 text-gray-500">Yükleniyor...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
              Dosya bulunamadı
            </div>
          ) : (
            files.map((file) => (
              <div key={file.FileID} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-3 overflow-hidden">
                  {getFileIcon(file.FileType)}
                  <div className="min-w-0">
                    <a 
                      href={getDownloadUrl(file.FilePath)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline truncate block"
                    >
                      {file.FileName}
                    </a>
                    <p className="text-xs text-gray-500">
                      {file.UploaderName} • {new Date(file.CreatedAt).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
                {/* Delete button could go here if implemented */}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose}>
            Kapat
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FileModal;
