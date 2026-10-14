# BarberCraft — Manuel Kabul ve Doğrulama Test Kılavuzu (Manual Acceptance Guide)

Bu doküman, BarberCraft platformunun özellik dondurması (feature freeze) sonrasındaki manuel kabul testlerini adım adım yürütmek için hazırlanmıştır.

Tüm testler yerel ortamda **`http://localhost:4380`** adresi üzerinden yürütülür.

---

## 📌 Genel Test Bilgileri ve Ortam Hazırlığı

### 1. Hazırlık ve Sıfırlama
Testlere başlamadan önce temiz bir veritabanı durumu elde etmek için:

```bash
# 1. Ortamı ayağa kaldırın
pnpm dev:setup

# 2. Servisleri çalıştırın
pnpm dev:all
```

İstediğiniz an tüm verileri kanonik başlangıç durumuna sıfırlamak için:
```bash
pnpm qa:reset
```

### 2. Kanonik Kimlik Bilgileri
> **Evrensel QA Şifresi**: `BarberCraft-QA-4380!`
> **Yerel Geliştirme Veritabanı Portu**: `127.0.0.1:55432` (`barbercraft_dev` / `barbercraft_user`)

Sistemde tam olarak **8 adet kimlik doğrulamalı QA kullanıcısı** bulunmaktadır:

| Persona | Yetkili Rol (Auth Role) | E-posta | Randevu Alınabilir Profil | Başlangıç Sayfası |
| :--- | :--- | :--- | :--- | :--- |
| **Süper Yönetici** | `SUPER_ADMIN` | `qa.superadmin@local.test` | Yok | [`/platform`](http://localhost:4380/platform) |
| **Platform Yöneticisi** | `PLATFORM_ADMIN` | `qa.platformadmin@local.test` | Yok | [`/platform`](http://localhost:4380/platform) |
| **İşletme Sahibi** (QA Berber) | `OWNER` | `qa.owner@local.test` | Evet (Ahmet Usta) | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme Yöneticisi** (QA Berber) | `MANAGER` | `qa.manager@local.test` | Yok | [`/dashboard`](http://localhost:4380/dashboard) |
| **Personel 1** (QA Berber) | `STAFF` | `qa.staff@local.test` | Evet (Mehmet Kalfa) | [`/dashboard`](http://localhost:4380/dashboard) |
| **Personel 2** (QA Berber) | `STAFF` | `qa.staff2@local.test` | Evet (Ali Kalfa) | [`/dashboard`](http://localhost:4380/dashboard) |
| **İşletme Sahibi 2** (QA Berber 2) | `OWNER` | `qa.owner2@local.test` | Evet (Murat Usta) | [`/dashboard`](http://localhost:4380/dashboard) |
| **Personel 3** (QA Berber 2) | `STAFF` | `qa.staff3@local.test` | Evet (Kemal Kalfa) | [`/dashboard`](http://localhost:4380/dashboard) |
| **Kamusal Müşteri** | `CUSTOMER` | *Hesap gerektirmez* | N/A | [`/book/qa-berber`](http://localhost:4380/book/qa-berber) |

*Not: `qa.owner@local.test` kullanıcısının kimlik doğrulama rolü kesinlikle `OWNER`'dır. Kendisine bağlı bir personel profili (Ahmet Usta) bulunması onun auth rolünü değiştirmez.*

---

## 🧪 Senaryo 1: Kamusal Müşteri Akışı (Hesapsız Müşteri)

### Hedef
Müşterinin oturum açmadan 6 adımlı mobil akışla randevu oluşturabilmesi ve kendisine iletilen bağlantı (`/randevu#<token>`) üzerinden randevusunu yönetebilmesini doğrulamak.

### Test Adımları
1. **Rezervasyon Sayfasını Açın**:
   - Tarayıcınızda (tercihen mobil emülasyonda — 390px genişlik) `http://localhost:4380/book/qa-berber` adresine gidin.
2. **Hizmet Seçimi**:
   - "Saç Kesimi" (30 dk, 250 TL) hizmetini seçin ve "Devam Et"e tıklayın.
3. **Personel Seçimi**:
   - "Fark Etmez (İlk Müsait Personel)" veya "Mehmet Kalfa" seçeneğini belirleyin.
4. **Tarih ve Saat Seçimi**:
   - Gelecek bir gün seçin ve listelenen müsait saat dilimlerinden birini tıklayın.
5. **Müşteri Bilgileri**:
   - Ad: `Can`, Soyad: `Yılmaz`, Telefon: `0555 123 4567` girin.
6. **Onaylama**:
   - Özet ekranında detayları kontrol edip "Randevuyu Onayla" butonuna basın.
7. **Randevu Yönetimi (Yetki Bağlantısı)**:
   - Onay ekranında çıkan "Randevumu Yönet" butonuna veya oluşturulan bağlantıya tıklayın (`http://localhost:4380/randevu#<token>`).
   - Randevu detaylarının (Hizmet, Personel, Tarih, Saat, Durum: Onaylandı) hatasız yüklendiğini görün.
8. **Yeniden Planlama (Reschedule)**:
   - "Randevu Saatini Değiştir" butonuna tıklayın, yeni bir saat seçin ve onaylayın.
   - Sayfanın yeni saat ile güncellendiğini teyit edin.
9. **İptal Etme (Cancellation)**:
   - "Randevuyu İptal Et" butonuna tıklayın ve onaylayın.
   - Durumun "İptal Edildi" olarak güncellendiğini doğrulayın.

### Doğrulanacak Değişmezler
- [x] Tüm metinler, butonlar ve uyarılar Türkçedir.
- [x] Müşteriden hiçbir aşamada şifre veya hesap oluşturması istenmez.
- [x] Randevu belirteci URL parçası (`#<token>`) üzerinden iletilir, sunucu erişim loglarına yazılmaz.

---

## 🧪 Senaryo 2: Personel Çalışma Alanı (`STAFF`)

### Hedef
Personelin yalnızca kendi randevularını görebildiğini, durum geçişlerini yönetebildiğini, mola/zaman blokları oluşturabildiğini ve işletme ayarlarına veya diğer personellerin randevularına erişemediğini doğrulamak.

### Test Adımları
1. **Giriş Yapın**:
   - `http://localhost:4380/login` adresine gidin.
   - `qa.staff@local.test` / `BarberCraft-QA-4380!` ile giriş yapın.
2. **Yönlendirme ve Karşılama**:
   - Doğrudan `http://localhost:4380/dashboard` sayfasına yönlendirildiğinizi ve "Personel Çalışma Alanı" görünümünün açıldığını doğrulayın.
3. **Randevu Durum Geçişleri**:
   - Kendinize ait randevularda:
     - "Tamamlandı" olarak işaretleyin.
     - "Gelmedi" (No-Show) olarak işaretleyin.
4. **Kişisel Zaman Bloğu Oluşturma**:
   - "Mola / İzin Ekle" seçeneği ile `12:00 - 13:00` arasına bir "Mola" bloğu ekleyin.
   - Randevu takviminde bu saatin kapandığını ve çakışan randevuya izin verilmediğini doğrulayın.
5. **Yetki Kısıtlama Denetimi**:
   - Doğrudan `http://localhost:4380/dashboard/services` veya `/dashboard/settings` adresine gitmeyi deneyin.
   - Sistemin yetkisiz erişimi engelleyerek uygun Türkçe uyarı verdiğini doğrulayın.
   - `http://localhost:4380/platform` adresine gitmeyi deneyin; erişimin kesinlikle reddedildiğini görün.

---

## 🧪 Senaryo 3: İşletme Yöneticisi (`MANAGER`)

### Hedef
İşletme yöneticisinin operasyonel tüm randevuları, müşteri fihristini ve takvimi yönetebildiğini; ancak işletme silme veya işletme sahibi değiştirme gibi kritik yetkilerden izole olduğunu doğrulamak.

### Test Adımları
1. **Giriş Yapın**:
   - `qa.manager@local.test` / `BarberCraft-QA-4380!` ile giriş yapın.
2. **Salon Randevu Takvimi**:
   - `http://localhost:4380/dashboard/appointments` sayfasına gidin.
   - Salondaki tüm personellerin (Ahmet Usta, Mehmet Kalfa, Ali Kalfa) randevularını listeleyin ve filtreleyin.
3. **Manuel Randevu Oluşturma**:
   - "Yeni Randevu Ekle" butonuna basın.
   - Müşteri seçin, personel atayın ve randevuyu onaylayın.
4. **Müşteri Yönetimi**:
   - `http://localhost:4380/dashboard/customers` sayfasına gidin.
   - Müşteri profillerini, geçmiş randevu sayılarını ve notlarını inceleyin.
5. **Yetki Kısıtı**:
   - Platform konsoluna (`/platform`) erişimin reddedildiğini doğrulayın.

---

## 🧪 Senaryo 4: İşletme Sahibi (`OWNER`)

### Hedef
İşletme sahibinin tam salon yönetimi, hizmet kataloğu fiyatlandırması, personel ekleme/düzenleme, çalışma saatleri ve işletme analitiğine tam yetkili erişimini doğrulamak.

### Test Adımları
1. **Giriş Yapın**:
   - `qa.owner@local.test` / `BarberCraft-QA-4380!` ile giriş yapın.
2. **İşletme Analitiği**:
   - `http://localhost:4380/dashboard` sayfasındaki gelir, randevu sayısı, doluluk oranı ve tamamlanma istatistiklerini inceleyin.
3. **Hizmet Yönetimi**:
   - `http://localhost:4380/dashboard/services` sayfasına gidin.
   - Yeni bir hizmet ekleyin (Örn: "Cilt Bakımı", 40 dk, 300 TL).
   - Mevcut bir hizmetin fiyatını güncelleyin ve kaydedin.
4. **Personel Yönetimi**:
   - `http://localhost:4380/dashboard/staff` sayfasına gidin.
   - Personel listesini, çalışma saatlerini ve hizmet atamalarını doğrulayın.
5. **Çalışma Saatleri & Rezervasyon Politikaları**:
   - `http://localhost:4380/dashboard/settings` sayfasına gidin.
   - İptal süresi ve minimum randevu bildirim sürelerini gözden geçirin.
6. **Çok Kiracılık (Multi-Tenant) İzolasyonu**:
   - `qa.owner2@local.test` (QA Berber 2) ile oturum açın.
   - Yalnızca "QA Berber 2"ye ait randevuların ve personelin geldiğini; "QA Berber" verilerinin kesinlikle görünmediğini teyit edin.

---

## 🧪 Senaryo 5: Platform Yönetimi (`SUPER_ADMIN` ve `PLATFORM_ADMIN`)

### Hedef
Sistem genelindeki tüm işletmeleri listeleme, detaylarını inceleme, yeni işletme oluşturup işletme sahibi provizyonu yapabilme yeteneklerini doğrulamak.

### Test Adımları
1. **Giriş Yapın**:
   - `qa.superadmin@local.test` / `BarberCraft-QA-4380!` ile giriş yapın.
2. **Platform Komuta Merkezi**:
   - `http://localhost:4380/platform` sayfasına gidin.
   - Sistemdeki toplam işletme sayısı, aktif randevu sayısı ve metrik kartlarını doğrulayın.
3. **İşletmeler Dizini**:
   - `http://localhost:4380/platform/businesses` sayfasına gidin.
   - "QA Berber" ve "QA Berber 2" işletmelerini görüntüleyin.
4. **İşletme Detayı**:
   - "QA Berber" satırına tıklayarak detay sayfasına gidin (`/platform/businesses/[id]`).
   - İşletme sahipleri, üyeler, bildirim ayarları ve operasyonel özetleri inceleyin.
5. **Yeni İşletme ve OWNER Provizyonu**:
   - "Yeni İşletme Ekle" butonuna tıklayın.
   - İşletme Adı: `Test Salon`, Slug: `test-salon`, İşletme Sahibi E-posta: `yeni.sahip@local.test` girerek provizyonu tamamlayın.
   - Provizyonun halka açık kayıt kapalı olmasına rağmen başarıyla oluşturulduğunu doğrulayın.
6. **Platform Denetim Logları (Audit Logs)**:
   - Gerçekleştirilen tüm yönetimsel işlemlerin kayıt altına alındığını teyit edin.

---

## ✅ Kabul Kontrol Listesi (Checklist)

| Madde | Kriter | Durum |
| :--- | :--- | :---: |
| 1 | Halka açık kayıt (`/register` veya API sign-up) kesinlikle kapalı ve reddediliyor. | [x] |
| 2 | Tüm roller (SUPER_ADMIN, PLATFORM_ADMIN, OWNER, MANAGER, STAFF) doğru yetki sınırlarına sahip. | [x] |
| 3 | Müşteriler hesapsız olarak randevu alabiliyor ve token ile yönetebiliyor. | [x] |
| 4 | Tüm kullanıcı arayüzü, hata mesajları ve durum etiketleri Türkçedir. | [x] |
| 5 | Kiracılar arası (Cross-Tenant) veri sızıntısı sıfırdır. | [x] |
| 6 | Kanonik port 4380 üzerinden tüm akışlar eksiksiz çalışmaktadır. | [x] |
