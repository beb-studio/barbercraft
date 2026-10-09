import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformAdminService } from "@/services/platform-admin.service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, Building2, Users, Calendar, Clock, MapPin, Phone, Shield, Activity, ListOrdered, Link as LinkIcon } from "lucide-react";
import { BusinessStatusToggle } from "./_components/business-status-toggle";
import { getCurrencySymbol } from "@/lib/presentation";

export default async function PlatformBusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await requirePlatformAdmin();

  const { businessId } = await params;

  const data = await PlatformAdminService.getBusinessDetail(businessId);
  if (!data) {
    notFound();
  }

  const logs = await PlatformAdminService.getBusinessAuditLogs(businessId);
  const { business, owners, metrics } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/60 rounded-xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-start sm:items-center gap-4">
          <Link
            href="/platform/businesses"
            className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0 mt-0.5 sm:mt-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{business.name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${
                  business.active
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                    : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${business.active ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                {business.active ? "Aktif" : "Pasif"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground mt-1 text-sm">
              <LinkIcon className="w-3.5 h-3.5" />
              <span className="font-mono">/{business.slug}</span>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 w-full sm:w-auto">
          <BusinessStatusToggle
            businessId={business.id}
            businessName={business.name}
            isActive={business.active}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Business Info & Owners */}
        <div className="space-y-6 lg:col-span-1">
          {/* Business Details Card */}
          <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold flex items-center gap-2 border-b border-border/60 pb-4 text-foreground">
              <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              İşletme Bilgileri
            </h2>
            <dl className="grid gap-4 mt-5 text-sm">
              <div className="grid gap-1">
                <dt className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider font-medium">
                  <MapPin className="w-3.5 h-3.5" /> Adres
                </dt>
                <dd className="font-medium text-foreground">{business.address || "-"}</dd>
              </div>
              <div className="grid gap-1 pt-3 border-t border-border/40">
                <dt className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider font-medium">
                  <Phone className="w-3.5 h-3.5" /> Telefon
                </dt>
                <dd className="font-medium text-foreground">{business.phone || "-"}</dd>
              </div>
              <div className="grid gap-1 pt-3 border-t border-border/40">
                <dt className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider font-medium">
                  <Clock className="w-3.5 h-3.5" /> Bölge / Saat Dilimi
                </dt>
                <dd className="font-medium text-foreground">{business.timezone}</dd>
              </div>
              <div className="grid gap-1 pt-3 border-t border-border/40">
                <dt className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                  Para Birimi
                </dt>
                <dd className="font-medium text-foreground">
                  {business.currency === "TRY"
                    ? "TRY (₺)"
                    : `${business.currency} (${getCurrencySymbol(business.currency)})`}
                </dd>
              </div>
              <div className="grid gap-1 pt-3 border-t border-border/40">
                <dt className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                  Kayıt Tarihi
                </dt>
                <dd className="font-medium text-foreground">
                  {format(new Date(business.createdAt), "d MMMM yyyy", { locale: tr })}
                </dd>
              </div>
            </dl>
          </div>

          {/* Owners Card */}
          <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold flex items-center gap-2 border-b border-border/60 pb-4 text-foreground">
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Sahiplik
            </h2>
            <div className="space-y-4 mt-5">
              {owners.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 bg-muted/40 rounded-lg text-center">
                  Kayıtlı sahip bulunamadı.
                </p>
              ) : (
                owners.map((owner) => (
                  <div key={owner.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/20">
                    <div>
                      <div className="font-semibold text-sm text-foreground">{owner.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{owner.email}</div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${
                      owner.active 
                        ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50" 
                        : "border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50"
                    }`}>
                      {owner.active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Metrics & Logs */}
        <div className="space-y-6 lg:col-span-2">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground font-mono">{metrics.totalAppointments.toLocaleString("tr-TR")}</div>
                <div className="text-sm font-medium text-muted-foreground">Toplam Randevu</div>
              </div>
            </div>
            <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground font-mono">{metrics.totalStaff.toLocaleString("tr-TR")}</div>
                <div className="text-sm font-medium text-muted-foreground">Personel Sayısı</div>
              </div>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border/60">
              <h2 className="font-semibold flex items-center gap-2 text-foreground">
                <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Denetim Geçmişi
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Bu işletme üzerinde gerçekleştirilen son 20 platform işlemi</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border/60">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Tarih</th>
                    <th className="px-6 py-4 font-semibold">Yönetici</th>
                    <th className="px-6 py-4 font-semibold">İşlem</th>
                    <th className="px-6 py-4 font-semibold">Neden / Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <ListOrdered className="w-8 h-8 opacity-20 mb-3" />
                          <p>Bu işletme için henüz bir denetim kaydı bulunmuyor.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const metadata = log.metadata as Record<string, unknown> | null;
                      const reason = (typeof metadata?.reason === "string" ? metadata.reason : null) || "-";
                      let actionText = log.action;
                      let actionColor = "text-foreground";
                      
                      if (log.action === "BUSINESS_ACTIVATED") {
                        actionText = "Aktife Alındı";
                        actionColor = "text-emerald-600 dark:text-emerald-400 font-medium";
                      } else if (log.action === "BUSINESS_DEACTIVATED") {
                        actionText = "Pasife Alındı";
                        actionColor = "text-rose-600 dark:text-rose-400 font-medium";
                      } else if (log.action === "BOOTSTRAP_GRANT_PLATFORM_ADMIN") {
                        actionText = "Yönetici Yetkisi Tanımlandı";
                        actionColor = "text-indigo-600 dark:text-indigo-400 font-medium";
                      }

                      return (
                        <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 text-muted-foreground whitespace-nowrap text-xs">
                            {format(new Date(log.createdAt), "d MMM yyyy HH:mm", { locale: tr })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-foreground">{log.adminName}</div>
                            <div className="text-xs text-muted-foreground">{log.adminEmail}</div>
                          </td>
                          <td className={`px-6 py-4 ${actionColor}`}>{actionText}</td>
                          <td className="px-6 py-4 text-muted-foreground">
                            <div className="max-w-[200px] truncate" title={reason}>
                              {reason}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
