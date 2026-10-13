import Link from "next/link";
import {
  Calendar,
  Clock,
  Plus,
  ArrowRight,
  User,
  CalendarCheck2,
  CheckCircle2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StaffWorkspaceData } from "@/types/staff-workspace";
import { getAppointmentStatusLabel } from "@/lib/presentation";

export interface StaffDashboardAppointmentItem {
  id: string;
  localStartTime: string;
  localEndTime: string;
  customer: {
    firstName: string;
    lastName: string | null;
  };
  service: {
    nameSnapshot: string;
  };
  status: string;
}

interface StaffDashboardViewProps {
  workspace?: StaffWorkspaceData;
  businessName?: string;
  userName?: string;
  timezone?: string;
  todayDateStr?: string;
  todayAppointments?: StaffDashboardAppointmentItem[];
}

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  CONFIRMED: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  CANCELLED: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
  NO_SHOW: { bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-400", border: "border-zinc-500/30" },
};

export function StaffDashboardView({
  workspace,
  businessName: propBusinessName,
  userName: propUserName,
  timezone: propTimezone,
  todayDateStr: propTodayDateStr,
  todayAppointments: propTodayAppointments,
}: StaffDashboardViewProps) {
  const businessName = workspace?.business.businessName ?? propBusinessName ?? "İşletme";
  const userName =
    workspace?.profile
      ? `${workspace.profile.firstName} ${workspace.profile.lastName || ""}`.trim()
      : propUserName ?? "Personel";
  const timezone = workspace?.business.timezone ?? propTimezone ?? "Europe/Istanbul";
  const todayDateStr = workspace?.business.localTodayDate ?? propTodayDateStr ?? "";

  const todayAppointments =
    workspace?.selectedDayAgenda.appointments.map((a) => ({
      id: a.appointmentId,
      localStartTime: a.localStartTime,
      localEndTime: a.localEndTime,
      customer: a.customer,
      service: {
        nameSnapshot: a.service.name,
      },
      status: a.status,
    })) ??
    propTodayAppointments ??
    [];

  const pendingAppointments = todayAppointments.filter((a) => a.status === "PENDING").length;
  const confirmedAppointments = todayAppointments.filter((a) => a.status === "CONFIRMED").length;
  const completedAppointments = todayAppointments.filter((a) => a.status === "COMPLETED").length;

  const displayToday = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-8">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Personel Paneli
            </h1>
            <Badge variant="outline" className="text-xs">
              Personel
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {displayToday} • <span className="font-medium text-foreground">{businessName}</span>
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

      {/* 2. OPERATIONAL SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Atanan Bugünkü Randevular */}
        <Card className="border-border shadow-xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bugünkü Randevularım
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
              {todayAppointments.length === 0 && <span>Bugün için planlanan randevu yok</span>}
            </div>
          </CardContent>
        </Card>

        {/* Kişisel Durum */}
        <Card className="border-border shadow-xs">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kişisel Ajanda
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <User className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="text-xl font-bold tracking-tight text-foreground truncate">
              {userName}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {completedAppointments > 0 ? (
                <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Bugün {completedAppointments} servis tamamlandı
                </span>
              ) : (
                "Bugün size atanmış randevular aşağıda listelenmiştir"
              )}
            </p>
          </CardContent>
        </Card>

        {/* Sistem Zaman Dilimi */}
        <Card className="border-border shadow-xs">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              İşletme Saati
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
      </div>

      {/* 3. TODAY'S AGENDA STREAM */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Bugünkü Randevu Akışım
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
                Bugün için size atanmış bir randevu bulunmuyor
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Yeni bir müşteri randevusu oluşturabilir veya takvimden diğer günleri inceleyebilirsiniz.
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
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {todayAppointments.map((app) => {
                    const badge = STATUS_BADGES[app.status] || STATUS_BADGES.PENDING;
                    const customerName = `${app.customer.firstName} ${app.customer.lastName || ""}`.trim();
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
                            href={`/dashboard/appointments?date=${todayDateStr}`}
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
                    <div className="flex items-center justify-end text-xs text-muted-foreground pt-1">
                      <Link
                        href={`/dashboard/appointments?date=${todayDateStr}`}
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

      {/* 4. SHORTCUTS */}
      <div className="space-y-4 pt-4 border-t border-border/60">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Hızlı Kısayollar
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/dashboard/appointments/new"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Yeni Randevu</span>
              <span className="text-xs text-muted-foreground truncate">Manuel randevu oluştur</span>
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
        </div>
      </div>
    </div>
  );
}
