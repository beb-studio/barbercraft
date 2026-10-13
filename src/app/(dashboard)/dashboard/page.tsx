import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Scissors,
  Users,
  Plus,
  ArrowRight,
  CalendarCheck2,
  AlertCircle,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { getBusinessById } from "@/repositories/business.repository";
import { getDashboardDailyAgenda } from "@/services/dashboard-appointments.service";
import { BusinessAnalyticsService } from "@/services/business-analytics.service";
import { StaffWorkspaceService } from "@/services/staff-workspace.service";
import { isValidAnalyticsPreset } from "@/lib/business-analytics/range";
import { getBusinessLocalToday } from "@/lib/timezone";
import { getAppointmentStatusLabel } from "@/lib/presentation";
import type { AnalyticsRangePreset, BusinessDashboardAnalytics } from "@/types/business-analytics";

import {
  RangeSelector,
  TodayOperationalStrip,
  KpiMetricCards,
  DailyTrendChart,
  TopServicesCard,
  StaffWorkloadCard,
  BusyPeriodsCard,
  CustomerSummaryCard,
} from "@/components/dashboard/analytics";
import { StaffDashboardView } from "@/components/dashboard/staff-dashboard-view";

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  CONFIRMED: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  CANCELLED: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
  NO_SHOW: { bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-400", border: "border-zinc-500/30" },
};

interface DashboardPageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership?.business_id) redirect("/onboarding");

  const { business_id: businessId, role } = membership;

  const business = await getBusinessById(businessId);
  const timezone = business?.timezone || "Europe/Istanbul";
  const todayStr = getBusinessLocalToday(timezone);

  // ============================================================
  // ROLE BRANCH 1: STAFF OPERATIONAL DASHBOARD
  // Strictly isolates STAFF from business-wide analytics & financials
  // ============================================================
  if (role === "STAFF") {
    const workspace = await StaffWorkspaceService.getStaffWorkspace({
      businessId,
      userId: user.id,
      role,
    });

    return <StaffDashboardView workspace={workspace} />;
  }

  // ============================================================
  // ROLE BRANCH 2: OWNER & ADMIN BUSINESS ANALYTICS COMMAND CENTER
  // ============================================================
  const resolvedParams = await searchParams;
  const rangeInput = resolvedParams.range;
  const preset: AnalyticsRangePreset =
    isValidAnalyticsPreset(rangeInput) ? rangeInput : "LAST_7_DAYS";

  let analytics: BusinessDashboardAnalytics;
  let todayAppointments: Awaited<ReturnType<typeof getDashboardDailyAgenda>>["appointments"] = [];

  try {
    const [analyticsResult, agendaResult] = await Promise.all([
      BusinessAnalyticsService.getDashboardAnalytics({ businessId, preset }),
      getDashboardDailyAgenda(businessId, user.id, role, todayStr),
    ]);
    analytics = analyticsResult;
    todayAppointments = agendaResult.appointments;
  } catch (error) {
    console.error("Dashboard analytics loading failed:", error);
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">
            Analitik verileri yüklenirken bir sorun oluştu
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            İşletme analitik gösterge paneli hazırlanırken geçici bir hata meydana geldi. Lütfen sayfayı yenilemeyi deneyin.
          </p>
        </div>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Yeniden Dene
        </Link>
      </div>
    );
  }

  // Header date display
  const displayToday = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-8">
      {/* ============================================================ */}
      {/* 1. WORKSPACE HEADER & CONTEXTUAL ACTIONS                     */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Genel Bakış
            </h1>
            <Badge variant="outline" className="text-xs">
              {role === "OWNER" ? "İşletme Sahibi" : "Yönetici"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {displayToday} • <span className="font-medium text-foreground">{analytics.businessName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/dashboard/appointments/new"
            className={cn(buttonVariants({ size: "sm" }), "shadow-xs font-semibold gap-1.5 min-h-[44px]")}
          >
            <Plus className="h-4 w-4" />
            <span>Yeni Randevu</span>
          </Link>
          <Link
            href="/dashboard/appointments"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 min-h-[44px]")}
          >
            <Calendar className="h-4 w-4" />
            <span>Ajandaya Git</span>
          </Link>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. RANGE SELECTOR (Bugün / Son 7 Gün / Son 30 Gün)           */}
      {/* ============================================================ */}
      <RangeSelector currentRange={analytics.selectedRange} />

      {/* ============================================================ */}
      {/* 3. TODAY / OPERATIONAL STRIP (Real-time actionable context)   */}
      {/* ============================================================ */}
      <TodayOperationalStrip
        todaySummary={analytics.todaySummary}
        upcomingSummary={analytics.upcomingSummary}
        todayDateStr={todayStr}
      />

      {/* ============================================================ */}
      {/* 4. SELECTED-RANGE KPI METRIC CARDS                           */}
      {/* ============================================================ */}
      <KpiMetricCards
        rangeSummary={analytics.rangeSummary}
        currency={analytics.currency}
      />

      {/* ============================================================ */}
      {/* 5. DAILY TREND VISUALIZATION                                 */}
      {/* ============================================================ */}
      <DailyTrendChart
        dailyTrend={analytics.dailyTrend}
        currency={analytics.currency}
      />

      {/* ============================================================ */}
      {/* 6. TWO-COLUMN: TOP SERVICES & STAFF WORKLOAD                 */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopServicesCard
          topServices={analytics.topServices}
          currency={analytics.currency}
        />
        <StaffWorkloadCard
          staffPerformance={analytics.staffPerformance}
          currency={analytics.currency}
        />
      </div>

      {/* ============================================================ */}
      {/* 7. TWO-COLUMN: BUSY PERIODS & CUSTOMER SUMMARY               */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BusyPeriodsCard busyPeriods={analytics.busyPeriods} />
        <CustomerSummaryCard
          rangeSummary={analytics.rangeSummary}
          upcomingSummary={analytics.upcomingSummary}
        />
      </div>

      {/* ============================================================ */}
      {/* 8. TODAY'S APPOINTMENTS AGENDA STREAM                         */}
      {/* ============================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Bugünün Randevu Akışı
            </h2>
            <p className="text-xs text-muted-foreground">
              {todayAppointments.length} randevu planlandı
            </p>
          </div>
          <Link
            href="/dashboard/appointments"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 min-h-[36px] items-center"
          >
            <span>Tüm Ajandayı Gör</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {todayAppointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center flex flex-col items-center justify-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
              <CalendarCheck2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Bugün için henüz kayıtlı bir randevu bulunmuyor
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Yeni bir müşteri randevusu oluşturmak için butonu kullanabilir veya farklı bir tarihteki ajandayı kontrol edebilirsiniz.
              </p>
            </div>
            <Link
              href="/dashboard/appointments/new"
              className={cn(buttonVariants({ size: "sm" }), "mt-2 shadow-xs min-h-[44px]")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Randevu Oluştur
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4">Saat</th>
                    <th className="py-3 px-4">Müşteri</th>
                    <th className="py-3 px-4">Hizmet</th>
                    <th className="py-3 px-4">Personel</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {todayAppointments.map((app) => {
                    const badge = STATUS_BADGES[app.status] || STATUS_BADGES.PENDING;
                    const customerName = `${app.customer.firstName} ${app.customer.lastName || ""}`.trim();
                    const staffName = app.staff.displayName || "Personel";
                    return (
                      <tr key={app.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-foreground whitespace-nowrap">
                          {app.localStartTime} – {app.localEndTime}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground whitespace-nowrap">
                          {customerName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {app.service.nameSnapshot}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {staffName}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
                              badge.bg,
                              badge.text,
                              badge.border
                            )}
                          >
                            {getAppointmentStatusLabel(app.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Link
                            href={`/dashboard/appointments?date=${todayStr}`}
                            className="text-xs font-medium text-primary hover:underline min-h-[36px] inline-flex items-center"
                          >
                            Yönet
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-border/60">
              {todayAppointments.map((app) => {
                const badge = STATUS_BADGES[app.status] || STATUS_BADGES.PENDING;
                const customerName = `${app.customer.firstName} ${app.customer.lastName || ""}`.trim();
                const staffName = app.staff.displayName || "Personel";
                return (
                  <div key={app.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-sm text-foreground">
                        {app.localStartTime} – {app.localEndTime}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
                          badge.bg,
                          badge.text,
                          badge.border
                        )}
                      >
                        {getAppointmentStatusLabel(app.status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{customerName}</span>
                      <span className="text-muted-foreground text-xs">{app.service.nameSnapshot}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span>Personel: {staffName}</span>
                      <Link
                        href={`/dashboard/appointments?date=${todayStr}`}
                        className="text-primary font-medium hover:underline min-h-[36px] inline-flex items-center"
                      >
                        Yönet &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 9. QUICK SHORTCUTS                                           */}
      {/* ============================================================ */}
      <div className="space-y-4 pt-4 border-t border-border/60">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Hızlı Kısayollar
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/dashboard/appointments/new"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs min-h-[56px]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Yeni Randevu</span>
              <span className="text-xs text-muted-foreground truncate">Manuel müşteri kaydı</span>
            </div>
          </Link>

          <Link
            href="/dashboard/appointments"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs min-h-[56px]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Randevu Ajandası</span>
              <span className="text-xs text-muted-foreground truncate">Günlük takvim yönetimi</span>
            </div>
          </Link>

          <Link
            href="/dashboard/services"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs min-h-[56px]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Scissors className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Hizmet Tarifesi</span>
              <span className="text-xs text-muted-foreground truncate">Fiyat ve süreler</span>
            </div>
          </Link>

          <Link
            href="/dashboard/staff"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs min-h-[56px]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Personel Ekibi</span>
              <span className="text-xs text-muted-foreground truncate">Çalışma saatleri ve izinler</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
