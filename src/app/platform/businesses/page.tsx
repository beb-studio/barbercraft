import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformOperationsService } from "@/services/platform-operations.service";
import { BusinessHealthStatus } from "@/types/platform-operations";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Store,
  ArrowRight,
} from "lucide-react";
import { HealthBadge, HealthReasonList } from "../_components/health-badge";
import { BusinessListToolbar } from "./_components/business-list-toolbar";

export const metadata = {
  title: "İşletme Operasyon Rehberi | Platform",
  description: "Platformdaki işletmelerin operasyonel sağlık durumları, personelleri ve aktiviteleri.",
};

export default async function PlatformBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    search?: string;
    status?: string;
    healthStatus?: string;
    page?: string;
  }>;
}) {
  await requirePlatformAdmin();

  const resolved = await searchParams;
  const page = parseInt(resolved.page || "1", 10);
  const search = (resolved.search || resolved.q || "").trim();

  let healthStatus: BusinessHealthStatus | undefined = undefined;
  let filterActive: boolean | undefined = undefined;

  const rawStatus = (resolved.healthStatus || resolved.status || "").toUpperCase();
  if (rawStatus === "HEALTHY" || rawStatus === "ATTENTION" || rawStatus === "SUSPENDED") {
    healthStatus = rawStatus as BusinessHealthStatus;
  } else if (rawStatus === "ACTIVE") {
    filterActive = true;
  } else if (rawStatus === "INACTIVE") {
    filterActive = false;
  }

  const result = await PlatformOperationsService.listBusinessOperations({
    page: isNaN(page) || page < 1 ? 1 : page,
    limit: 20,
    search: search || undefined,
    healthStatus,
    filterActive,
  });

  const buildPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (rawStatus && rawStatus !== "ALL") params.set("healthStatus", rawStatus);
    params.set("page", targetPage.toString());
    return `/platform/businesses?${params.toString()}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            İşletme Operasyon Rehberi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistemdeki tüm işletmelerin operasyonel sağlık durumlarını, kadrolarını ve aktivitelerini izleyin.
          </p>
        </div>
        <Link
          href="/platform/businesses/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-700 h-10 px-4 min-h-[44px] shrink-0 w-full sm:w-auto shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Yeni İşletme Ekle
        </Link>
      </div>

      {/* Toolbar */}
      <BusinessListToolbar
        initialSearch={search}
        initialHealthStatus={rawStatus || "ALL"}
      />

      {/* Main Content */}
      {result.items.length === 0 ? (
        <div className="bg-card border border-border/80 rounded-xl p-12 flex flex-col items-center justify-center text-center shadow-xs">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4 text-muted-foreground">
            <Store className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">İşletme Bulunamadı</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Arama ve filtre kriterlerinize uyan işletme bulunamadı. Lütfen arama terimini değiştirin veya filtreleri temizleyin.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Operations Cards (< md / down to 390px) */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {result.items.map((biz) => (
              <div
                key={biz.businessId}
                className="bg-card border border-border/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5"
                data-testid={`business-card-${biz.businessId}`}
              >
                {/* Header: Title, Slug & Health Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground text-base truncate">
                      {biz.businessName}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      /{biz.slug}
                    </p>
                  </div>
                  <HealthBadge status={biz.health.status} />
                </div>

                {/* Diagnostic Reasons if any */}
                {biz.health.reasons.length > 0 && (
                  <div className="pt-1">
                    <HealthReasonList reasons={biz.health.reasons} />
                  </div>
                )}

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                      biz.active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                    }`}
                    title={biz.active ? "Platform tarafından askıya alınmamış işletme" : "Platform tarafından askıya alınmış işletme"}
                  >
                    {biz.active ? "Aktif" : "Askıya Alınmış"}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                      biz.onboardingCompleted
                        ? "bg-muted text-muted-foreground border-border/60"
                        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                    }`}
                  >
                    {biz.onboardingCompleted ? "Kurulum Tamam" : "Kurulum Bekliyor"}
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/40 text-xs border border-border/40">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Kadro:</span>
                    <span className="font-medium text-foreground">
                      {biz.memberCounts.owner} Sahip, {biz.staffCounts.active} Personel
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Randevu:</span>
                    <span className="font-medium text-foreground">
                      {biz.appointmentHealth.appointmentsToday} Bugün / {biz.appointmentHealth.futureOperationalAppointments} Gelecek
                    </span>
                  </div>
                </div>

                {/* Footer with Last Activity and Detail Link */}
                <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                  <div className="text-muted-foreground flex items-center gap-1.5 truncate">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {biz.activity.lastOperationalActivityAt
                        ? format(new Date(biz.activity.lastOperationalActivityAt), "d MMM, HH:mm", {
                            locale: tr,
                          })
                        : "Aktivite yok"}
                    </span>
                  </div>
                  <Link
                    href={`/platform/businesses/${biz.businessId}`}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 font-medium hover:bg-indigo-100 transition-colors shrink-0 min-h-[44px]"
                  >
                    <span>İncele</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block bg-card border border-border/80 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border/60">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">İşletme</th>
                    <th className="px-5 py-3.5 font-semibold">Sağlık Durumu</th>
                    <th className="px-5 py-3.5 font-semibold">Durum</th>
                    <th className="px-5 py-3.5 font-semibold">Kurulum</th>
                    <th className="px-5 py-3.5 font-semibold">Kadro</th>
                    <th className="px-5 py-3.5 font-semibold">Randevular</th>
                    <th className="px-5 py-3.5 font-semibold">Son Aktivite</th>
                    <th className="px-5 py-3.5 font-semibold text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {result.items.map((biz) => (
                    <tr key={biz.businessId} className="hover:bg-muted/30 transition-colors">
                      {/* Name & Slug */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate max-w-[200px]">
                              {biz.businessName}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              /{biz.slug}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Health Badge & Reasons */}
                      <td className="px-5 py-4">
                        <div className="space-y-1.5">
                          <HealthBadge status={biz.health.status} />
                          {biz.health.reasons.length > 0 && (
                            <HealthReasonList reasons={biz.health.reasons} />
                          )}
                        </div>
                      </td>

                      {/* Active / Suspended */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            biz.active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                          }`}
                          title={biz.active ? "Platform tarafından askıya alınmamış işletme" : "Platform tarafından askıya alınmış işletme"}
                        >
                          {biz.active ? "Aktif" : "Askıya Alınmış"}
                        </span>
                      </td>

                      {/* Onboarding */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            biz.onboardingCompleted
                              ? "bg-muted text-muted-foreground border-border/60"
                              : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                          }`}
                        >
                          {biz.onboardingCompleted ? "Tamamlandı" : "Tamamlanmadı"}
                        </span>
                      </td>

                      {/* Staff & Members */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">{biz.memberCounts.owner}</span> Sahip
                        </div>
                        <div>
                          <span className="font-medium text-foreground">{biz.staffCounts.active}</span> Personel
                        </div>
                      </td>

                      {/* Appointment counts */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-muted-foreground">
                        <div>
                          Bugün: <span className="font-medium text-foreground">{biz.appointmentHealth.appointmentsToday}</span>
                        </div>
                        <div>
                          Gelecek: <span className="font-medium text-foreground">{biz.appointmentHealth.futureOperationalAppointments}</span>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-muted-foreground">
                        {biz.activity.lastOperationalActivityAt ? (
                          format(new Date(biz.activity.lastOperationalActivityAt), "d MMM yyyy, HH:mm", {
                            locale: tr,
                          })
                        ) : (
                          <span className="italic">Aktivite yok</span>
                        )}
                      </td>

                      {/* Detail Link */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/platform/businesses/${biz.businessId}`}
                          className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                        >
                          İncele
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <span className="text-xs sm:text-sm text-muted-foreground order-2 sm:order-1 text-center sm:text-left">
                Toplam <span className="font-semibold text-foreground">{result.total}</span> işletmeden{" "}
                <span className="font-semibold text-foreground">{(result.page - 1) * result.limit + 1}</span>-
                <span className="font-semibold text-foreground">
                  {Math.min(result.page * result.limit, result.total)}
                </span>{" "}
                arası gösteriliyor
              </span>
              <div className="flex items-center gap-1 order-1 sm:order-2 bg-card border border-border/80 rounded-lg p-1 shadow-xs">
                {result.page > 1 ? (
                  <Link
                    href={buildPageUrl(result.page - 1)}
                    className="h-9 min-w-[36px] px-2 flex items-center justify-center rounded-md text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    aria-label="Önceki sayfa"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    <span>Önceki</span>
                  </Link>
                ) : (
                  <span className="h-9 min-w-[36px] px-2 flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground/40 cursor-not-allowed min-h-[44px]">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    <span>Önceki</span>
                  </span>
                )}

                <span className="px-3 text-xs font-medium text-muted-foreground">
                  Sayfa {result.page} / {result.totalPages}
                </span>

                {result.page < result.totalPages ? (
                  <Link
                    href={buildPageUrl(result.page + 1)}
                    className="h-9 min-w-[36px] px-2 flex items-center justify-center rounded-md text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    aria-label="Sonraki sayfa"
                  >
                    <span>Sonraki</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                ) : (
                  <span className="h-9 min-w-[36px] px-2 flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground/40 cursor-not-allowed min-h-[44px]">
                    <span>Sonraki</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
