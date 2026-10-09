import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformAdminService } from "@/services/platform-admin.service";
import {
  Building2,
  CheckCircle2,
  Users,
  UserCheck,
  CalendarCheck,
  ArrowRight,
  Shield,
  Clock,
  ArrowUpRight
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

export const metadata = {
  title: "Platform Yönetimi | BarberCraft",
  description: "Platform genelindeki işletmeler ve sistem metrikleri.",
};

export default async function PlatformOverviewPage() {
  await requirePlatformAdmin();
  const [metrics, recentBusinessesResult] = await Promise.all([
    PlatformAdminService.getOverviewMetrics(),
    PlatformAdminService.listBusinesses({ page: 1, limit: 5 }),
  ]);

  const cards = [
    {
      title: "Toplam İşletme",
      value: metrics.totalBusinesses,
      description: "Platforma kayıtlı tüm işletmeler",
      icon: Building2,
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
    },
    {
      title: "Aktif İşletme",
      value: metrics.activeBusinesses,
      description: "Hizmet vermeye açık işletmeler",
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      title: "Toplam Kullanıcı",
      value: metrics.totalUsers,
      description: "Kayıtlı sistem hesapları",
      icon: Users,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-900/20",
    },
    {
      title: "Toplam Personel",
      value: metrics.totalStaff,
      description: "Tüm işletmelerdeki personeller",
      icon: UserCheck,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      title: "Toplam Randevu",
      value: metrics.totalAppointments,
      description: "Oluşturulmuş tüm randevular",
      icon: CalendarCheck,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-900/20",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Platform Yönetimi
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Platform genelindeki işletmeleri ve kullanım durumunu yönetin.
          </p>
        </div>
        <Link 
          href="/platform/businesses"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-xs"
        >
          İşletme Rehberine Git
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-card border border-border/80 rounded-xl p-5 shadow-xs hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-4">
                <div className={`p-2 rounded-lg ${card.bg} ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-foreground font-mono tracking-tight">
                  {card.value.toLocaleString("tr-TR")}
                </div>
                <h3 className="text-sm font-semibold text-foreground mt-1">
                  {card.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {card.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real Data & Operational Context Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real Data: Son Kayıt Olan İşletmeler */}
        <div className="lg:col-span-2 bg-card border border-border/80 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-base font-semibold text-foreground">Son Eklenen İşletmeler</h2>
              </div>
              <Link
                href="/platform/businesses"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Tümünü Gör
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentBusinessesResult.data.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Henüz kayıtlı bir işletme bulunmuyor.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase border-b border-border/60">
                    <tr>
                      <th className="py-2.5 font-medium">İşletme</th>
                      <th className="py-2.5 font-medium">Kayıt Tarihi</th>
                      <th className="py-2.5 font-medium">Durum</th>
                      <th className="py-2.5 font-medium text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {recentBusinessesResult.data.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 font-medium text-foreground">
                          <div>{b.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">/{b.slug}</div>
                        </td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {format(new Date(b.createdAt), "d MMM yyyy", { locale: tr })}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                              b.active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                                : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
                            }`}
                          >
                            {b.active ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/platform/businesses/${b.id}`}
                            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            İncele
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Operational Context Card */}
        <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-semibold text-foreground">Platform Kapsamı</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Bu alan BarberCraft platform yöneticileri içindir. Sistem genelindeki işletmelerin durumu, üyelik rolleri ve denetim kayıtları merkezi olarak buradan yönetilir.
            </p>
            <div className="pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <span>İşletmelerin operasyonel takvim ve personel ayarları işletme paneli üzerinden yürütülür.</span>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border/60">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center w-full px-4 py-2.5 text-xs font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors border border-border/60"
            >
              İşletme Çalışma Alanına Geç
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
