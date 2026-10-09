import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, Calendar, Users, Briefcase } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">BarberCraft</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#ozellikler" className="hover:text-foreground transition-colors">Özellikler</a>
            <a href="#online-randevu" className="hover:text-foreground transition-colors">Online Randevu</a>
          </nav>
          <div className="flex items-center">
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "font-semibold")}
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-background pt-16 pb-20 lg:pt-32 lg:pb-36 border-b border-border/40">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
              <div className="lg:col-span-6 text-center lg:text-left flex flex-col gap-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]">
                  Randevularınızı ve personelinizi <span className="text-primary">tek yerden</span> yönetin.
                </h1>
                <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  İşletmenizin günlük akışını profesyonelce düzenleyin. Manuel mesajlaşmayı bırakın, online randevu ve akıllı takvim ile zamandan tasarruf edin.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-2">
                  <Link
                    href="/login"
                    className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto font-semibold h-12 px-8")}
                  >
                    Giriş Yap
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <a
                    href="#ozellikler"
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto font-semibold h-12 px-8")}
                  >
                    Özellikleri İncele
                  </a>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 justify-center lg:justify-start pt-4 text-sm font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Çoklu Personel Yönetimi</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Canlı Takvim Senkronizasyonu</span>
                </div>
              </div>
              
              <div className="lg:col-span-6 mt-16 lg:mt-0 relative">
                <div className="relative rounded-2xl bg-white border border-border shadow-2xl p-4 sm:p-6 lg:p-8 -rotate-1 hover:rotate-0 transition-transform duration-500 max-w-xl mx-auto">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div className="font-bold text-lg">24 Ekim Perşembe</div>
                    <div className="text-sm font-medium bg-secondary text-secondary-foreground px-3 py-1 rounded-full">3 Bekleyen Randevu</div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-background border rounded-lg p-4 flex justify-between items-start border-l-4 border-l-primary">
                      <div>
                        <div className="font-bold text-lg">09:30 – 10:15</div>
                        <div className="text-base font-semibold mt-1">Ahmet Yılmaz</div>
                        <div className="text-sm text-muted-foreground mt-1">Saç Kesimi (45 dk)</div>
                      </div>
                      <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md font-semibold">ONAYLANDI</div>
                    </div>
                    <div className="bg-background border rounded-lg p-4 flex justify-between items-start border-l-4 border-l-primary">
                      <div>
                        <div className="font-bold text-lg">10:30 – 11:00</div>
                        <div className="text-base font-semibold mt-1">Caner Öztürk</div>
                        <div className="text-sm text-muted-foreground mt-1">Sakal Tıraşı (30 dk)</div>
                      </div>
                      <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-md font-semibold">BEKLİYOR</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="ozellikler" className="py-20 lg:py-32 bg-secondary/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">İşletmenizin kontrolü tamamen sizde</h2>
              <p className="mt-4 text-lg text-muted-foreground">BarberCraft, işletmenizin operasyonel yükünü hafifletir ve tüm süreçleri tek bir ekranda toplar.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-2xl border shadow-sm">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Randevu Yönetimi</h3>
                <p className="text-muted-foreground leading-relaxed">
                  İptaller, randevu değişiklikleri ve onay süreçlerini anında yönetin. Çakışmaları otomatik önleyen akıllı takvim sistemiyle rahat edin.
                </p>
              </div>
              
              <div className="bg-white p-8 rounded-2xl border shadow-sm">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Personel Çalışma Saatleri</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Her personel için özel çalışma saatleri, molalar ve izin günleri belirleyin. Personel müsaitliğine göre randevuları yönetin.
                </p>
              </div>
              
              <div className="bg-white p-8 rounded-2xl border shadow-sm">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                  <Briefcase className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Hizmet ve Fiyatlandırma</h3>
                <p className="text-muted-foreground leading-relaxed">
                  İşletmenizin sunduğu tüm hizmetleri, süreleri ve güncel fiyatları tanımlayın. Değişiklikler anında müşterilerinize yansısın.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Online Booking Flow */}
        <section id="online-randevu" className="py-20 lg:py-32">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <div className="order-2 lg:order-1 mt-12 lg:mt-0">
                <div className="max-w-md mx-auto bg-white border shadow-xl rounded-3xl overflow-hidden">
                  <div className="bg-primary text-primary-foreground p-6 text-center">
                    <div className="font-bold text-xl">Makas & Ustura Erkek Kuaförü</div>
                    <div className="text-primary-foreground/80 text-sm mt-1">Online Randevu</div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="border rounded-xl p-4 flex justify-between items-center bg-secondary/50">
                      <div>
                        <div className="font-semibold">Saç Kesimi</div>
                        <div className="text-sm text-muted-foreground">45 dakika</div>
                      </div>
                      <div className="font-bold">250 ₺</div>
                    </div>
                    <div className="border rounded-xl p-4 flex justify-between items-center cursor-pointer hover:border-primary">
                      <div>
                        <div className="font-semibold">Fark Etmez</div>
                        <div className="text-sm text-muted-foreground">Uygun olan ilk personel</div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <Button className="w-full mt-4" size="lg">Devam Et</Button>
                  </div>
                </div>
              </div>
              
              <div className="order-1 lg:order-2 flex flex-col gap-6">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                  Müşterileriniz için 7/24 kesintisiz randevu deneyimi.
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Size özel oluşturulan rezervasyon sayfasını sosyal medya hesaplarınıza veya web sitenize ekleyin.
                  Müşterileriniz aramak zorunda kalmadan, belirlediğiniz kurallara ve müsaitlik durumunuza göre saniyeler içinde randevu oluştursun.
                </p>
                <ul className="space-y-4 mt-2">
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/10 p-1 rounded-full text-primary mt-1">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-foreground">&quot;Fark Etmez&quot; Seçeneği</strong>
                      <span className="text-muted-foreground">Müşteri personel seçmek istemezse sistem en uygun personeli otomatik atar.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/10 p-1 rounded-full text-primary mt-1">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-foreground">Anında SMS veya E-posta Yok</strong>
                      <span className="text-muted-foreground">Gereksiz bildirim kirliliği olmadan, onaylarınızı panelden takip edin.</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center items-center gap-2 mb-6">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">BarberCraft</span>
          </div>
          <p className="text-muted-foreground">
            &copy; {new Date().getFullYear()} BarberCraft B2B Platform. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  );
}
