import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Scissors,
  Users,
  Plus,
  ArrowRight,
  CheckCircle2,
  CalendarCheck2,
  User,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { getBusinessById } from "@/repositories/business.repository";
import { getDashboardDailyAgenda } from "@/services/dashboard-appointments.service";
import { getStaffMembersWithProfilesByBusiness } from "@/repositories/staff.repository";
import { getServices } from "@/services/service.service";
import { getBusinessLocalToday } from "@/lib/timezone";
import { getAppointmentStatusLabel } from "@/lib/presentation";

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  CONFIRMED: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  CANCELLED: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
  NO_SHOW: { bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-400", border: "border-zinc-500/30" },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership?.business_id) redirect("/onboarding");

  const { business_id: businessId, role } = membership;

  const business = await getBusinessById(businessId);
  const timezone = business?.timezone || "Europe/Istanbul";
  const todayStr = getBusinessLocalToday(timezone);

  // Authoritative operational data
  const { appointments: todayAppointments } = await getDashboardDailyAgenda(
    businessId,
    user.id,
    role,
    todayStr
  );

  const pendingAppointments = todayAppointments.filter((a) => a.status === "PENDING").length;
  const confirmedAppointments = todayAppointments.filter((a) => a.status === "CONFIRMED").length;
  const completedAppointments = todayAppointments.filter((a) => a.status === "COMPLETED").length;

  let totalStaff = 0;
  let activeStaff = 0;
  let bookableStaff = 0;
  let activeServices = 0;

  if (role === "OWNER" || role === "ADMIN") {
    const rawStaff = await getStaffMembersWithProfilesByBusiness(businessId);
    totalStaff = rawStaff.length;
    activeStaff = rawStaff.filter((s) => s.active && (s.hasStaffProfile ? s.staffActive : true)).length;
    bookableStaff = rawStaff.filter((s) => s.publicBookingEnabled).length;

    const servicesList = await getServices(businessId);
    activeServices = servicesList.filter((s) => s.active).length;
  }

  // Format today's date for header display
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
              {role === "OWNER" ? "İşletme Sahibi" : role === "ADMIN" ? "Yönetici" : "Personel"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {displayToday} • <span className="font-medium text-foreground">{business?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/dashboard/appointments/new"
            className={cn(buttonVariants({ size: "sm" }), "shadow-xs font-semibold gap-1.5")}
          >
            <Plus className="h-4 w-4" />
            <span>Yeni Randevu</span>
          </Link>
          <Link
            href="/dashboard/appointments"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <Calendar className="h-4 w-4" />
            <span>Ajandaya Git</span>
          </Link>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. OPERATIONAL STATUS METRICS (Real data only)               */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Today's Appointments Card */}
        <Card className="border-border shadow-xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bugünkü Randevular
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {todayAppointments.length}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              {pendingAppointments > 0 && (
                <span className="text-amber-700 font-medium">
                  {pendingAppointments} bekliyor
                </span>
              )}
              {confirmedAppointments > 0 && (
                <span className="text-blue-700 font-medium">
                  {confirmedAppointments} onaylı
                </span>
              )}
              {completedAppointments > 0 && (
                <span className="text-emerald-700 font-medium">
                  {completedAppointments} tamamlandı
                </span>
              )}
              {todayAppointments.length === 0 && (
                <span>Planlanan randevu yok</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Staff & Booking Readiness Card (For OWNER/ADMIN) */}
        {role !== "STAFF" ? (
          <Card className="border-border shadow-xs hover:border-primary/40 transition-colors">
            <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ekip Durumu
              </span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {activeStaff} <span className="text-base font-normal text-muted-foreground">/ {totalStaff} aktif</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {bookableStaff > 0 ? (
                  <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {bookableStaff} personel online randevuya açık
                  </span>
                ) : (
                  <span>Henüz online randevuya açık personel yok</span>
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kişisel Ajanda
              </span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <User className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {todayAppointments.length}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Bugün size atanmış toplam randevu adedi
              </p>
            </CardContent>
          </Card>
        )}

        {/* Services / Tarife Card (For OWNER/ADMIN) or Working Hours summary */}
        {role !== "STAFF" ? (
          <Card className="border-border shadow-xs hover:border-primary/40 transition-colors">
            <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hizmet Tarifesi
              </span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Scissors className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {activeServices} <span className="text-base font-normal text-muted-foreground">aktif hizmet</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Müşterilerin seçebileceği tanımlı hizmetler
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sistem Saati
              </span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {timezone.split("/")[1]?.replace("_", " ") || timezone}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                İşletme yerel çalışma zaman dilimi
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. TODAY'S APPOINTMENTS AGENDA STREAM                         */}
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
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
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
              className={cn(buttonVariants({ size: "sm" }), "mt-2 shadow-xs")}
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
                            className="text-xs font-medium text-primary hover:underline"
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
                        className="text-primary font-medium hover:underline"
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
      {/* 4. QUICK SHORTCUTS                                           */}
      {/* ============================================================ */}
      <div className="space-y-4 pt-4 border-t border-border/60">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Hızlı Kısayollar
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/dashboard/appointments/new"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs"
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
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Randevu Ajandası</span>
              <span className="text-xs text-muted-foreground truncate">Günlük takvim yönetimi</span>
            </div>
          </Link>

          {role !== "STAFF" && (
            <>
              <Link
                href="/dashboard/services"
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs"
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
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">Personel Ekibi</span>
                  <span className="text-xs text-muted-foreground truncate">Çalışma saatleri ve izinler</span>
                </div>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
