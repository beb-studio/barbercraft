# BarberCraft — Berber ve Kuaför Randevu & Operasyon Yönetim Sistemi

BarberCraft, berber salonları ve kuaförler için tasarlanmış; çok kiracılı (multi-tenant), uçtan uca güvenli, mobil öncelikli ve üretime hazır bir randevu ve salon operasyon yönetim platformudur.

Tamamen **Türkçe** kullanıcı arayüzü, rol tabanlı erişim denetimi (RBAC), atomik randevu zamanlama motoru, arka plan bildirim/hatırlatma çalışanı ve kendi sunucunuzda (self-hosted) Docker ile çalıştırılabilen modern bir mimariye sahiptir.

---

## 📋 Sistem Gereksinimleri

- **Node.js**: `v20.x` LTS (Desteklenen motor sözleşmesi: `>=20.0.0 <21.0.0`)
- **Paket Yöneticisi**: `pnpm@11.12.0` (Corepack ile sabitlenmiş)
- **Docker**: Docker Engine / Docker Desktop ve Docker Compose (Yerel geliştirme veritabanı için)

---

## ⚡ Hızlı Başlangıç (Quick Start)

Temiz bir geliştirici makinesinde sıfırdan kurulum yalnızca 5 adımdır:

```bash
# 1. Depoyu klonlayın ve dizine girin
git clone <repository-url>
cd "Barber Appointment App"

# 2. Node.js LTS (20) ortamında pnpm paket yöneticisini etkinleştirip bağımlılıkları kurun
corepack enable
pnpm install --frozen-lockfile

# 3. Yerel geliştirme ortamı şablonunu kopyalayın
cp .env.local.example .env.local

# 4. Geliştirme ortamını otomatik olarak hazırlayın
# (Docker veritabanını 55432 portunda başlatır, bağlantıyı doğrular, migrasyonları uygular ve QA test verilerini tohumlar)
pnpm dev:setup

# 5. Web sunucusunu ve bildirim çalışanını birlikte başlatın
pnpm dev:all
```

Kurulum tamamlandığında tarayıcınızda açın:
👉 **[http://localhost:4380](http://localhost:4380)**

---

## 🔑 Kanonik Test ve Kabul (QA) Hesapları

Geliştirme ve manuel kabul testlerinde kullanılmak üzere sistemde tanımlı kanonik hesaplar aşağıdadır.

> [!IMPORTANT]
> **Tüm QA test hesaplarının evrensel şifresi**: `BarberCraft-QA-4380!`

### Kimlik Doğrulama Rolleri (Authenticated Roles)
Sistemde 5 adet kimlik doğrulamalı rol bulunmaktadır: `SUPER_ADMIN`, `PLATFORM_ADMIN`, `OWNER`, `MANAGER` ve `STAFF`.

| Seviye | Yetkili Rol (Auth Role) | Arayüz Etiketi | E-posta | Randevu Alınabilir Profil | Başlangıç Sayfası |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Platform** | `SUPER_ADMIN` | Süper Yönetici | `qa.superadmin@local.test` | Yok | [`/platform`](http://localhost:4380/platform) |
| **Platform** | `PLATFORM_ADMIN` | Platform Yöneticisi | `qa.platformadmin@local.test` | Yok | [`/platform`](http://localhost:4380/platform) |
| **İşletme 1** (`qa-berber`) | `OWNER` | İşletme Sahibi | `qa.owner@local.test` | Evet (Ahmet Usta) | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme 1** (`qa-berber`) | `MANAGER` | İşletme Yöneticisi | `qa.manager@local.test` | Yok | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme 1** (`qa-berber`) | `STAFF` | Personel | `qa.staff@local.test` | Evet (Mehmet Kalfa) | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme 1** (`qa-berber`) | `STAFF` | Personel | `qa.staff2@local.test` | Evet (Ali Kalfa) | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme 2** (`qa-berber-2`) | `OWNER` | İşletme Sahibi | `qa.owner2@local.test` | Evet (Murat Usta) | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme 2** (`qa-berber-2`) | `STAFF` | Personel | `qa.staff3@local.test` | Evet (Kemal Kalfa) | [`/dashboard`](http://localhost:4380/dashboard) |
| **Kamusal Aktör** | `CUSTOMER` | Müşteri | *Hesap gerektirmez* | N/A | [`/book/qa-berber`](http://localhost:4380/book/qa-berber) |

> [!NOTE]
> **İşletme Sahibi ve Personel Profili Ayrımı**:
> `qa.owner@local.test` kullanıcısının kimlik doğrulama rolü kesin ve değişmez olarak **`OWNER`**'dır. Ayrıca randevu takviminde randevu kabul edebilmesi için kendisine bağlı aktif bir personel profili (Ahmet Usta) bulunmaktadır. Bu durum kullanıcının kimlik doğrulama rolünü değiştirmez.

---

## 🛠 Kullanılabilir Geliştirici Komutları

| Komut | Açıklama |
| :--- | :--- |
| `pnpm dev:setup` | **Tek Komutla Kurulum**: `.env.local` varlığını ve 55432 portunu doğrular, Docker PostgreSQL konteynerini ayağa kaldırır, migrasyonları çalıştırır ve kanonik QA kullanıcılarını tohumlar. |
| `pnpm dev:all` | **Eşzamanlı Geliştirme**: Next.js web sunucusunu (Port 4380) ve arka plan bildirim çalışanını (`worker.ts`) eşzamanlı olarak başlatır. Renkli ve etiketli log çıktısı sunar. |
| `pnpm dev` | Yalnızca Next.js web sunucusunu Port 4380 üzerinde başlatır. |
| `pnpm worker:start` | Yalnızca arka plan bildirim çalışanını başlatır. |
| `pnpm qa:bootstrap` | Kanonik QA kullanıcılarını ve işletme verilerini idempotent (tekrarlanabilir) şekilde veritabanına ekler, mevcut kullanıcıların şifrelerini `BarberCraft-QA-4380!` değerine eşitler. |
| `pnpm qa:reset` | **Güvenli Sıfırlama**: Yalnızca yerel `barbercraft_dev` veritabanındaki 25 uygulama tablosunu temizler (`TRUNCATE CASCADE`) ve QA verilerini sıfırdan oluşturur. Migrasyon geçmişi korunur; üretim ortamında çalıştırılamaz. |
| `pnpm db:migrate` | `drizzle/migrations` dizinindeki bekleyen tüm şema migrasyonlarını veritabanına uygular. |
| `pnpm db:test` | Embedded PostgreSQL üzerinde 53 veritabanı kısıtı, tetikleyici ve şema bütünlüğü testini çalıştırır. |
| `pnpm auth:test` | 1000+ yetkilendirme, RBAC, randevu akışı, güvenlik ve çok kiracılık testini çalıştırır. |
| `pnpm lint` | Proje genelinde ESLint kurallarını denetler. |
| `pnpm typecheck` | TypeScript derleme ve tip denetimini gerçekleştirir (`tsc --noEmit`). |
| `pnpm build` | Üretim derlemesini Next.js Standalone modunda oluşturur. |

---

## 🏗 Mimari ve Teknoloji Yığını

- **Uygulama İskeleti**: Next.js 16 (App Router, Turbopack, React Server Components & Server Actions)
- **Kullanıcı Arayüzü**: React 19, Tailwind CSS v4, Lucide Icons, Mobile-First Duyarlı Tasarım (390px ekran optimizasyonu)
- **Veritabanı & ORM**: PostgreSQL 16, Drizzle ORM (`drizzle-orm`), Drizzle Kit
- **Kimlik Doğrulama**: Better Auth (Güçlendirilmiş, halka açık kayıt kalıcı olarak kapalı, platform üzerinden yetkili işletme sahibi provizyonu)
- **Bildirim & SMS Güvenliği**:
  - Yerel geliştirmede `SMS_PROVIDER="test"` devrededir; gerçek SMS atılmaz, harici ağ çağrısı yapılmaz.
  - İşletme bildirim ayarlarında müşteri bildirimleri varsayılan olarak kapalıdır.
- **Konteynerizasyon**: Docker, Docker Compose, Caddy (Otomatik HTTPS / Let's Encrypt ters vekil sunucu)
- **Güvenlik**:
  - Halka açık kayıt (`sign-up`) tamamen devre dışıdır.
  - IP adresleri veritabanında saklanmaz; SHA-256 ile özetlenir.
  - Oran sınırlaması (Rate Limiting) PostgreSQL atomik sayaçları ile uygulanır.
  - Müşteri randevu yönetimi kriptografik token yetkilendirmesi (`/randevu#<token>`) ile URL parçası üzerinden korunur.

---

## 🐳 Docker Topolojisi

### Yerel Geliştirme (`docker-compose.dev.yml`)
Yerel geliştirme için ana makine PostgreSQL kurulumlarıyla çakışmayı önlemek üzere özel **55432** portu kullanılır:
- **Konteyner Adı**: `barbercraft_dev_db`
- **Port Eşlemesi**: `127.0.0.1:55432:5432` (Dış ağlara kapalı, yalnızca yerel döngü)
- **Veritabanı Adı**: `barbercraft_dev`
- **Kullanıcı / Şifre**: `barbercraft_user` / `barbercraft_password`
- **Kalıcı Birim**: `barbercraft_dev_pgdata`

### Üretim Dağıtımı (`docker-compose.production.yml`)
Üretim ortamında standart iç ağ izolasyonu uygulanır:
1. **Ters Vekil (`proxy` - Caddy)**: 80 ve 443 portlarını dış dünyaya açar, SSL/TLS sertifikalarını yönetir.
2. **Web Sunucusu (`app` - Next.js Standalone)**: İç ağda Port 4380 üzerinde çalışır, dışarıya doğrudan port açmaz.
3. **Bildirim Çalışanı (`worker`)**: İç ağda veritabanını yoklar, randevu hatırlatmalarını ve temizlik görevlerini yürütür.
4. **Veritabanı (`db` - PostgreSQL 16)**: Standart dahili 5432 portunda dinler, dış dünyaya kesinlikle port açmaz.

Ayrıntılı üretim kılavuzları için [`DEPLOYMENT.md`](./DEPLOYMENT.md) ve [`OPERATIONS.md`](./OPERATIONS.md) dosyalarını inceleyebilirsiniz.

---

## 📖 Kapsamlı Dokümantasyon

- [`docs/MANUAL_ACCEPTANCE.md`](./docs/MANUAL_ACCEPTANCE.md) — Rol bazlı manuel kabul ve doğrulama test senaryoları rehberi.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Kendi sunucunuzda (self-hosted Linux VPS) üretim kurulum rehberi.
- [`OPERATIONS.md`](./OPERATIONS.md) — Yedekleme, geri yükleme, gözlemlenebilirlik ve operasyonel çalıştırma el kitabı (Runbook).
- [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) — Yetki matrisi, randevu yaşam döngüsü ve iş kuralları.
- [`SECURITY.md`](./SECURITY.md) — Güvenlik mimarisi, kimlik doğrulama ilkeleri ve kısıtlamalar.
- [`DATABASE.md`](./DATABASE.md) — Veritabanı şeması, tablolar, indeksler ve kısıtlar.
- [`UX_RULES.md`](./UX_RULES.md) — Mobil öncelikli tasarım ve Türkçe dil standartları.
