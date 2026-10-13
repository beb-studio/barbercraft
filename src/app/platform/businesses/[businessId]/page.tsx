import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformOperationsService } from "@/services/platform-operations.service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ChevronLeft,
  Users,
  CalendarDays,
  Shield,
  Send,
  Activity,
  RotateCcw,
  CheckCircle2,
  ListOrdered,
} from "lucide-react";
import { HealthBadge, HealthReasonList } from "../../_components/health-badge";
import { TenantLifecycleActions } from "./_components/tenant-lifecycle-actions";
import { TerminalFailureRecovery } from "./_components/terminal-failure-recovery";
import { getCurrencySymbol } from "@/lib/presentation";

export const metadata = {
  title: "İşletme Operasyon Detayı | Platform",
  description: "İşletmenin operasyonel durumu, bildirim kuyrukları ve denetim geçmişi.",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  BUSINESS_ACTIVATED: "İşletme Aktifleştirildi",
  BUSINESS_DEACTIVATED: "İşletme Askıya Alındı",
  BUSINESS_SUSPENDED: "İşletme Askıya Alındı",
  BUSINESS_REACTIVATED: "İşletme Aktifleştirildi",
  NOTIFICATION_OUTBOX_REQUEUED: "Outbox Kaydı Yeniden Kuyruğa Alındı",
  NOTIFICATION_DELIVERY_REQUEUED: "SMS Teslimatı Yeniden Kuyruğa Alındı",
  BOOTSTRAP_GRANT_PLATFORM_ADMIN: "Yönetici Yetkisi Tanımlandı",
  PLATFORM_ADMIN_ROLE_UPDATED: "Yönetici Rolü Güncellendi",
};

export default async function PlatformBusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await requirePlatformAdmin();

  const { businessId } = await params;
  const detail = await PlatformOperationsService.getBusinessDetail(businessId);

  if (!detail) {
    notFound();
  }

  const { summary, owners, staff, notificationBreakdown, recentAuditLogs, recentFailures } = detail;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* ============================================================ */}
      {/* 1. TENANT HEADER & PRIMARY IDENTITY                           */}
      {/* ============================================================ */}
      <div className="bg-card border border-border/80 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <Link
            href="/platform/businesses"
            className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5 sm:mt-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="İşletme Rehberine Dön"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                {summary.businessName}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${
                  summary.active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                }`}
                title={summary.active ? "Platform tarafından askıya alınmamış işletme" : "Platform tarafından askıya alınmış işletme"}
              >
                {summary.active ? "Aktif" : "Askıya Alınmış"}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                  summary.onboardingCompleted
                    ? "bg-muted text-muted-foreground border-border/60"
                    : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                }`}
              >
                {summary.onboardingCompleted ? "Kurulum Tamamlandı" : "Kurulum Bekliyor"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1.5 font-mono">
              <span>/{summary.slug}</span>
              <span>•</span>
              <span className="font-sans">Saat Dilimi: {summary.timezone}</span>
              <span>•</span>
              <span className="font-sans">
                Para Birimi: {summary.currency === "TRY" ? "TRY (₺)" : `${summary.currency} (${getCurrencySymbol(summary.currency)})`}
              </span>
              <span>•</span>
              <span className="font-sans">
                Kayıt: {format(new Date(summary.createdAt), "d MMMM yyyy", { locale: tr })}
              </span>
            </div>
          </div>
        </div>

        {/* Lifecycle Actions */}
        <div className="shrink-0 flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
          <TenantLifecycleActions
            businessId={summary.businessId}
            businessName={summary.businessName}
            isActive={summary.active}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. HEALTH STATUS & DIAGNOSTIC REASONS                         */}
      {/* ============================================================ */}
      <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Operasyonel Sağlık Durumu</h2>
              <p className="text-xs text-muted-foreground">Sistem teşhis ve sağlık değerlendirmesi</p>
            </div>
          </div>
          <div>
            <HealthBadge status={summary.health.status} />
          </div>
        </div>

        {summary.health.reasons.length > 0 ? (
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tespit Edilen Teşhis Maddeleri ({summary.health.reasons.length})
            </h3>
            <HealthReasonList reasons={summary.health.reasons} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Tüm operasyonel kontroller normal. Bu işletmede aktif bir arıza veya sağlık uyarısı bulunmuyor.</span>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3 & 4. OPERATIONAL ROSTERS & APPOINTMENT AGGREGATES           */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Member & Staff Roster (Zero PII, Safe operational display) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Owners & Admins */}
          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-foreground">İşletme Sahipleri</h3>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {owners.length} Kişi
              </span>
            </div>

            <div className="space-y-2.5 mt-4">
              {owners.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center bg-muted/30 rounded-lg">
                  Kayıtlı aktif işletme sahibi bulunmuyor.
                </p>
              ) : (
                owners.map((owner) => (
                  <div
                    key={owner.id}
                    className="p-3 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-foreground truncate">
                        {owner.name || "İsimsiz Sahip"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                        {owner.email}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border shrink-0 ${
                        owner.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
                      }`}
                    >
                      {owner.active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Staff Roster */}
          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-foreground">Personel Profilleri</h3>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {staff.length} Personel
              </span>
            </div>

            <div className="space-y-2.5 mt-4">
              {staff.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center bg-muted/30 rounded-lg">
                  Kayıtlı personel profili bulunmuyor.
                </p>
              ) : (
                staff.map((st) => (
                  <div
                    key={st.id}
                    className="p-3 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-foreground truncate">
                        {st.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {st.serviceCount} Hizmet • {st.bookable ? "Randevu Açık" : "Randevu Kapalı"}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border shrink-0 ${
                        st.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground border-border/60"
                      }`}
                    >
                      {st.active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Appointment Aggregates & Notification Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Appointment Aggregates (Zero PII, Zero GMV) */}
          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-foreground">Randevu Operasyon Özeti</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Son Randevu: {summary.appointmentHealth.lastAppointmentAt
                  ? format(new Date(summary.appointmentHealth.lastAppointmentAt), "d MMM yyyy, HH:mm", { locale: tr })
                  : "Kayıt yok"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-4">
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {summary.appointmentHealth.appointmentsToday}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Bugünkü Randevular</div>
              </div>
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {summary.appointmentHealth.futureOperationalAppointments}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Gelecek Randevular</div>
              </div>
              <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 text-center col-span-2 sm:col-span-1">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {summary.appointmentHealth.appointmentsLast7Days}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Son 7 Günlük Randevular</div>
              </div>
            </div>
          </div>

          {/* 5. Notification Health Breakdown */}
          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-foreground">Bildirim & Teslimat Kuyrukları</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Son Başarılı İletim: {notificationBreakdown.lastSuccessfulDeliveryAt
                  ? format(new Date(notificationBreakdown.lastSuccessfulDeliveryAt), "d MMM yyyy, HH:mm", { locale: tr })
                  : "İletim kaydı yok"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Outbox Card */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border/60 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Dış Kutu (Outbox)</span>
                  <span className="font-mono text-foreground">
                    Toplam {notificationBreakdown.outbox.pending + notificationBreakdown.outbox.processing + notificationBreakdown.outbox.processed + notificationBreakdown.outbox.retryableFailed + notificationBreakdown.outbox.terminalFailed}
                  </span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Bekleyen (Pending):</span>
                    <span className="font-mono font-medium text-foreground">{notificationBreakdown.outbox.pending}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">İşleniyor (Processing):</span>
                    <span className="font-mono font-medium text-foreground">{notificationBreakdown.outbox.processing}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Başarılı (Processed):</span>
                    <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{notificationBreakdown.outbox.processed}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Yeniden Denenecek (Retryable):</span>
                    <span className="font-mono font-medium text-amber-600 dark:text-amber-400">{notificationBreakdown.outbox.retryableFailed}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Kalıcı Hata (Terminal):</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{notificationBreakdown.outbox.terminalFailed}</span>
                  </div>
                </div>
              </div>

              {/* Delivery Card */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border/60 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>SMS Teslimatları</span>
                  <span className="font-mono text-foreground">
                    Toplam {notificationBreakdown.deliveries.pending + notificationBreakdown.deliveries.processing + notificationBreakdown.deliveries.sent + notificationBreakdown.deliveries.retryableFailed + notificationBreakdown.deliveries.terminalFailed + notificationBreakdown.deliveries.cancelled}
                  </span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Bekleyen (Pending):</span>
                    <span className="font-mono font-medium text-foreground">{notificationBreakdown.deliveries.pending}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">İşleniyor (Processing):</span>
                    <span className="font-mono font-medium text-foreground">{notificationBreakdown.deliveries.processing}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">İletildi (Sent):</span>
                    <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{notificationBreakdown.deliveries.sent}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Yeniden Denenecek (Retryable):</span>
                    <span className="font-mono font-medium text-amber-600 dark:text-amber-400">{notificationBreakdown.deliveries.retryableFailed}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Kalıcı Hata (Terminal):</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{notificationBreakdown.deliveries.terminalFailed}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 6. TERMINAL FAILURES & CONTROLLED RECOVERY                   */}
      {/* ============================================================ */}
      <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Kalıcı Başarısızlıklar & Yeniden Kuyruğa Alma</h2>
              <p className="text-xs text-muted-foreground">Operatör kontrolünde yeniden kuyruğa alınabilir terminal hata kayıtları</p>
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {recentFailures.length} Kayıt
          </span>
        </div>

        {recentFailures.length === 0 ? (
          <div className="p-8 text-center bg-muted/20 rounded-lg border border-border/40">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2 opacity-80" />
            <p className="text-sm text-muted-foreground">
              Bu işletmede kalıcı (terminal) başarısızlık kaydı bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider border-b border-border/60">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tür</th>
                  <th className="px-4 py-3 font-semibold">Kayıt Kimliği</th>
                  <th className="px-4 py-3 font-semibold">Deneme Sayısı</th>
                  <th className="px-4 py-3 font-semibold">Hata Kodu</th>
                  <th className="px-4 py-3 font-semibold">Tarih</th>
                  <th className="px-4 py-3 font-semibold text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentFailures.map((failure) => (
                  <tr key={failure.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-foreground">
                        {failure.type === "OUTBOX" ? "Bildirim Dış Kutusu" : "SMS Teslimatı"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-muted-foreground">
                      {failure.id.slice(0, 16)}...
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono">
                      {failure.attemptCount}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-medium">
                        {failure.lastErrorCode || "Belirtilmemiş"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {format(new Date(failure.failedAt || failure.createdAt), "d MMM yyyy, HH:mm", { locale: tr })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <TerminalFailureRecovery failure={failure} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 7. PLATFORM AUDIT TIMELINE                                    */}
      {/* ============================================================ */}
      <div className="bg-card border border-border/80 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Platform Denetim Geçmişi</h2>
              <p className="text-xs text-muted-foreground">Bu işletme üzerinde uygulanan son platform yönetici işlemleri</p>
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {recentAuditLogs.length} Kayıt
          </span>
        </div>

        {recentAuditLogs.length === 0 ? (
          <div className="p-8 text-center bg-muted/20 rounded-lg border border-border/40">
            <ListOrdered className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">
              Bu işletme için henüz bir denetim kaydı bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider border-b border-border/60">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tarih</th>
                  <th className="px-4 py-3 font-semibold">Yönetici</th>
                  <th className="px-4 py-3 font-semibold">İşlem</th>
                  <th className="px-4 py-3 font-semibold">Gerekçe / Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentAuditLogs.map((log) => {
                  const actionLabel = AUDIT_ACTION_LABELS[log.action] || log.action;
                  const reason = typeof log.metadata?.reason === "string" ? log.metadata.reason : null;
                  const previousErrorCode = typeof log.metadata?.previousErrorCode === "string" ? log.metadata.previousErrorCode : null;
                  const previousAttempts = typeof log.metadata?.previousAttempts === "number" ? log.metadata.previousAttempts : null;

                  return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.createdAt), "d MMM yyyy, HH:mm", { locale: tr })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-foreground">{log.adminName || "Yönetici"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{log.adminEmail}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        {actionLabel}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {reason ? (
                          <span className="font-medium text-foreground">{reason}</span>
                        ) : previousErrorCode ? (
                          <span>Önceki hata: <strong className="font-mono text-foreground">{previousErrorCode}</strong> ({previousAttempts} deneme)</span>
                        ) : (
                          <span className="italic text-muted-foreground/60">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
