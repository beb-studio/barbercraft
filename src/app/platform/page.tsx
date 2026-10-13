import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformOperationsService } from "@/services/platform-operations.service";
import {
  Building2,
  ShieldAlert,
  ClipboardList,
  Users,
  CalendarDays,
  Send,
  MessageSquare,
  ArrowRight,
  Plus,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { HealthBadge } from "./_components/health-badge";

export const metadata = {
  title: "Platform Yönetimi | BarberCraft",
  description: "Platform genelindeki işletmeler, operasyonel durumlar ve bildirim kuyrukları.",
};

export default async function PlatformOverviewPage() {
  await requirePlatformAdmin();

  const [summary, recentBusinessesResult] = await Promise.all([
    PlatformOperationsService.getPlatformSummary(),
    PlatformOperationsService.listBusinessOperations({ limit: 5 }),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Platform Yönetimi — Platform Komuta Merkezi
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Platform genelindeki işletmeleri ve kullanım durumunu yönetin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/platform/businesses/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Yeni İşletme Ekle
          </Link>
          <Link
            href="/platform/businesses"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-card border border-border hover:bg-muted transition-colors shadow-xs rounded-lg"
          >
            İşletme Rehberi
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Businesses & Active Businesses */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Toplam İşletme</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
              {summary.totalBusinesses.toLocaleString("tr-TR")}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span
                className="text-emerald-600 dark:text-emerald-400 font-medium"
                title="Platform tarafından askıya alınmamış işletmeler"
              >
                Aktif İşletme: {summary.activeBusinesses}
              </span>
              <span>•</span>
              <span className={summary.suspendedBusinesses > 0 ? "text-rose-600 dark:text-rose-400 font-medium" : ""}>
                {summary.suspendedBusinesses} askıda
              </span>
            </div>
          </div>
        </div>

        {/* Onboarding Incomplete */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Kurulum Bekleyenler</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
              {summary.onboardingIncompleteBusinesses.toLocaleString("tr-TR")}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              İlk kurulumunu henüz tamamlamamış işletmeler
            </p>
          </div>
        </div>

        {/* Active Members & Staff (Toplam Kullanıcı & Toplam Personel) */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Aktif Kadro</span>
            <div className="p-2 rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
              {summary.activeTenantMembers.toLocaleString("tr-TR")}
            </div>
            <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
              <span>Toplam Kullanıcı: {summary.activeTenantMembers} aktif üye</span>
              <span>Toplam Personel: {summary.activeStaffProfiles} aktif profil</span>
            </div>
          </div>
        </div>

        {/* Appointments Activity (Toplam Randevu) */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Randevu Aktivitesi</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
              {summary.appointmentsToday.toLocaleString("tr-TR")}
            </div>
            <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
              <span>Bugün: {summary.appointmentsToday.toLocaleString("tr-TR")} randevu</span>
              <span>Toplam Randevu (Son 7 Gün): {summary.appointmentsLast7Days.toLocaleString("tr-TR")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Pipeline Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notification Outbox */}
        <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Bildirim Dış Kutusu (Outbox)</h2>
                  <p className="text-xs text-muted-foreground">Asenkron bildirim işleme kuyruğu durumu</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-5 text-center">
              <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {summary.notificationOutboxBacklog.toLocaleString("tr-TR")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Bekleyen İş</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-900/40">
                <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
                  {summary.retryableOutboxFailures.toLocaleString("tr-TR")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Yeniden Denenecek</div>
              </div>
              <div className="p-3 rounded-lg bg-rose-50/50 border border-rose-200/50 dark:bg-rose-950/20 dark:border-rose-900/40">
                <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400">
                  {summary.terminalOutboxFailures.toLocaleString("tr-TR")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Kalıcı Hata</div>
              </div>
            </div>
          </div>
          {summary.terminalOutboxFailures > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Kalıcı başarısız bildirimler işletme detay sayfasından incelenebilir ve yeniden kuyruğa alınabilir.</span>
            </div>
          )}
        </div>

        {/* SMS Deliveries */}
        <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">SMS Teslimat Kuyruğu</h2>
                  <p className="text-xs text-muted-foreground">Sağlayıcıya gönderilen SMS iletim işleri</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-5 text-center">
              <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {summary.deliveryBacklog.toLocaleString("tr-TR")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Bekleyen İletim</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-900/40">
                <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
                  {summary.retryableDeliveryFailures.toLocaleString("tr-TR")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Yeniden Denenecek</div>
              </div>
              <div className="p-3 rounded-lg bg-rose-50/50 border border-rose-200/50 dark:bg-rose-950/20 dark:border-rose-900/40">
                <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400">
                  {summary.terminalDeliveryFailures.toLocaleString("tr-TR")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Kalıcı Hata</div>
              </div>
            </div>
          </div>
          {summary.terminalDeliveryFailures > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Kalıcı başarısız teslimatlar işletme operasyon detayından yeniden kuyruğa alınabilir.</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Business Activity Table */}
      <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-foreground">Son Operasyonel İşletmeler</h2>
          </div>
          <Link
            href="/platform/businesses"
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            Tümünü Gör ({summary.totalBusinesses})
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentBusinessesResult.items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Henüz kayıtlı bir işletme bulunmuyor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase border-b border-border/60">
                <tr>
                  <th className="py-2.5 font-medium">İşletme</th>
                  <th className="py-2.5 font-medium">Sağlık Durumu</th>
                  <th className="py-2.5 font-medium">Durum</th>
                  <th className="py-2.5 font-medium">Kurulum</th>
                  <th className="py-2.5 font-medium">Son Aktivite</th>
                  <th className="py-2.5 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentBusinessesResult.items.map((b) => (
                  <tr key={b.businessId} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 font-medium text-foreground">
                      <div>{b.businessName}</div>
                      <div className="text-xs text-muted-foreground font-mono">/{b.slug}</div>
                    </td>
                    <td className="py-3">
                      <HealthBadge status={b.health.status} />
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                          b.active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                            : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                        }`}
                      >
                        {b.active ? "Aktif" : "Askıya Alınmış"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                          b.onboardingCompleted
                            ? "bg-muted text-muted-foreground border-border/60"
                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                        }`}
                      >
                        {b.onboardingCompleted ? "Tamamlandı" : "Tamamlanmadı"}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">
                      {b.activity.lastOperationalActivityAt
                        ? format(new Date(b.activity.lastOperationalActivityAt), "d MMM yyyy, HH:mm", {
                            locale: tr,
                          })
                        : "Aktivite yok"}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/platform/businesses/${b.businessId}`}
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
  );
}
