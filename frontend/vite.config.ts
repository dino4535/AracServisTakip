import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4010, // Nginx ile uyumlu olması için 5173'ü 4010 yaptık
    allowedHosts: ['arac.dinogida.com.tr'], // Domain engellemesini kaldırıyoruz
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  // Uygulamanızı yayına alırken "preview" kullanıyorsanız diye bu bloğu da ekliyoruz:
  preview: {
    port: 4010,
    allowedHosts: ['arac.dinogida.com.tr'],
  }
})