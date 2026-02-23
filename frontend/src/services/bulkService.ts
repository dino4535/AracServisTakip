import api from './api';

export const bulkService = {
  downloadTemplate: async (type: 'vehicles' | 'insurance' | 'fuel' | 'driver_mapping' | 'drivers') => {
    const response = await api.get(`/bulk/template/${type}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  downloadData: async (type: 'vehicles' | 'insurance' | 'fuel' | 'driver_mapping' | 'drivers') => {
    const response = await api.get(`/bulk/data/${type}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  uploadVehicles: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/bulk/vehicles', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadInsurance: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/bulk/insurance', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadFuel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/bulk/fuel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadDriverMapping: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/bulk/driver-mapping', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadDrivers: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/bulk/drivers', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
