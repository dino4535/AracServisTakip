# 🚗 Araç Servis Takip Portalı

Dino Gıda & Bermer için geliştirilmiş, araçların servis, muayene, sigorta, kasko, km ve yakıt tüketimlerini takip edebileceğiniz kapsamlı bir yönetim portalı.

## ✨ Özellikler

### 🔐 Yetki Yönetimi
- **Esnek Rol Sistemi:** Admin tarafından yönetilebilir roller ve yetkiler
- **Rol Bazlı Yetkilendirme (RBAC):** Kullanıcılara gerekli ekran yetkilerini verme imkanı
- **Ekran Bazlı Yetki Kontrolü:** Her modül için ayrı yetkiler (view, add, edit, delete)
- **Kullanıcı Yönetimi:** Kullanıcı ekleme, düzenleme, silme ve rol atama

### 🚙 Araç Yönetimi
- Araç listesi ve detayları
- Plaka, marka, model, yıl, yakıt tipi bilgileri
- KM takibi ve güncellemesi
- Araç durumu yönetimi (Aktif, Bakımda, Emekli, Satıldı)
- Şirket bazlı filtreleme

### 🔧 Servis & Bakım
- Bakım kayıtları (Servis, Muayene, Periyodik Bakım, Acil Tamir, Yıllık Bakım)
- KM bazlı hatırlatıcılar
- Sonraki bakım tarihi takibi
- Maliyet analizi

### 📋 Servis Talep Formları
- Servis talep oluşturma
- Onay süreci (Pending → In Progress → Completed)
- Öncelik seviyeleri (Low, Medium, High, Urgent)
- Tahmini ve gerçek maliyet takibi

### 🛡️ Sigorta & Kasko
- Trafik Sigortası ve Kasko kayıtları
- Poliçe bilgileri (Poliçe No, Sigorta Şirketi)
- Başlangıç ve bitiş tarihleri
- Otomatik hatırlatıcılar (30, 15, 7 gün öncesinde)

### ⛽ Yakıt Yönetimi
- Yakıt kayıtları
- Tüketim analizi (km/litre)
- Maliyet analizi
- Yakıt istasyonu takibi

### 📊 Dashboard & Raporlar
- Toplam araç sayısı
- Bakıma alınan araçlar
- Bekleyen servis talepleri
- Yaklaşan sigorta/kasko yenilemeleri
- Yakıt tüketim grafiği

### 🔔 Bildirim Sistemi
- In-App bildirimler
- Email bildirimleri (Nodemailer)
- Hatırlatıcılar:
  - Bakım approaching
  - Sigorta yenileme approaching
  - Kasko yenileme approaching
  - Servis talep oluşturulduğunda
  - Servis talep onaylandığında/tamamlandığında

## 🛠️ Teknolojiler

### Backend
- **Node.js** + **Express.js** + **TypeScript**
- **MSSQL** (SQL Server) veritabanı
- **JWT** for authentication
- **node-cron** for scheduled jobs (hatırlatıcılar)
- **Nodemailer** for email notifications
- **bcrypt** for password hashing

### Frontend
- **React 18** + **TypeScript**
- **Vite** for build tool
- **TailwindCSS** for styling
- **Zustand** for state management
- **TanStack Query (React Query)** for API calls
- **React Router v6** for routing
- **Lucide React** for icons

## 📋 Kurulum

### Önkoşullar
- Node.js 18+ ve npm
- SQL Server 2019+
- SMTP sunucusu (Email gönderimi için - opsiyonel)

### Backend Kurulumu

1. Backend dizinine gidin:
```bash
cd backend
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. `.env` dosyasını oluşturun ve düzenleyin:
```bash
cp .env.example .env
```

`.env` dosyası:
```env
# Database
DB_SERVER=77.83.37.247
DB_USER=OGUZ
DB_PASSWORD=@1B9j9K045.
DB_NAME=AracServisTakip
DB_PORT=1433

# JWT
JWT_SECRET=super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=Araç Servis Takip <noreply@aracservis.com>
```

4. Veritabanı migration'larını çalıştırın:
```bash
npm run migrate
```

5. Seed data'yı yükleyin (Varsayılan admin kullanıcı oluşturur):
```bash
npm run seed
```

6. Sunucuyu başlatın:
```bash
npm run dev
```

Backend `http://localhost:5000` adresinde çalışacak.

### Frontend Kurulumu

1. Frontend dizinine gidin:
```bash
cd frontend
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. `.env` dosyasını oluşturun ve düzenleyin:
```bash
cp .env.example .env
```

`.env` dosyası:
```env
VITE_API_URL=http://localhost:5000/api
```

4. Development server'ı başlatın:
```bash
npm run dev
```

Frontend `http://localhost:5173` adresinde çalışacak.

## 👤 Varsayılan Admin Kullanıcısı

**Email:** `admin@dino.com`  
**Şifre:** `Admin123`

> ⚠️ **Önemli:** Production ortamında şifreyi mutlaka değiştirin!

## 🔐 Varsayılan Roller ve Yetkiler

### Super Admin
- Tüm yetkilere sahip
- Kullanıcı ve rol yönetimi

### Admin
- Şirket bazlı tüm işlemler
- Kullanıcı ve rol yönetimi

### Manager
- Departman bazlı işlemler
- Araç, bakım, servis yönetimi

### Driver
- Araç bilgilerini görüntüleme
- KM güncelleme
- Yakıt kaydı ekleme

### Viewer
- Sadece okuma yetkisi
- Tüm modülleri görüntüleme

## 📁 Proje Yapısı

```
arac-servis-takip/
├── backend/
│   ├── src/
│   │   ├── config/          # Veritabanı ve diğer konfigürasyonlar
│   │   ├── controllers/     # Route controller'ları
│   │   ├── middleware/      # Auth ve authorization middleware'leri
│   │   ├── routes/          # API route'ları
│   │   ├── services/        # Email, notification servisi
│   │   ├── scheduledJobs/   # Cron job'lar (hatırlatıcılar)
│   │   ├── utils/           # Helper fonksiyonlar
│   │   └── server.ts        # Ana server dosyası
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # React component'leri
│   │   ├── pages/           # Sayfa component'leri
│   │   ├── services/        # API servisleri
│   │   ├── store/           # Zustand store'ları
│   │   ├── hooks/           # Custom hooks
│   │   └── utils/           # Helper fonksiyonlar
│   └── package.json
├── database/
│   ├── migrations/          # SQL migration script'leri
│   └── seeders/             # Seed data
└── README.md
```

## 🔄 Uygulama Akışı

1. **Giriş:** Kullanıcı giriş yapar → JWT token oluşturulur
2. **Yetki Kontrolü:** Middleware kullanıcının izinlerini kontrol eder
3. **Dashboard:** Kullanıcıya özelleştirilmiş dashboard gösterilir
4. **Araç İşlemleri:** Araç ekleme/düzenleme/KM güncelleme
5. **Servis Talebi:** Form doldurulur → Admin onayı bekler
6. **Hatırlatıcılar:** Cron job ile günlük kontrol → Bildirim gönderme
7. **Raporlar:** Filtrelenebilir raporlar

## 🚀 Production'a Deploy

### Backend
1. `NODE_ENV=production` olarak ayarlayın
2. `JWT_SECRET` güvenli bir değer kullanın
3. Veritabanı bağlantısını production sunucusuna göre ayarlayın
4. Build edin: `npm run build`
5. Start edin: `npm start`

### Frontend
1. Build edin: `npm run build`
2. `dist` klasörünü web sunucusuna yükleyin
3. `VITE_API_URL`'yi production API adresine ayarlayın

## 📝 Lisans

Bu proje Dino Gıda & Bermer için özel olarak geliştirilmiştir.

## 🆘 Destek

Sorularınız için sistem yöneticinizle iletişime geçin.
