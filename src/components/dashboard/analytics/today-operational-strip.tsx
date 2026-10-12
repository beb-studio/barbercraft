import Link from "next/link";
import {
  Calendar,
  Clock,
  CheckCircle2,
  CalendarCheck2,
  ArrowRight,
  User,
  Scissors,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TodaySummary, UpcomingSummary } from "@/types/business-analytics";
import { getAppointmentStatusLabel } from "@/lib/presentation";

interface TodayOperationalStripProps {
  todaySummary: TodaySummary;
  upcomingSummary: UpcomingSummary;
  todayDateStr: string;
}

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  CONFIRMED: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  CANCELLED: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
  NO_SHOW: { bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-400", border: "border-zinc-500/30" },
};

export function TodayOperationalStrip({
  todaySummary,
  upcomingSummary,
  todayDateStr,
}: TodayOperationalStripProps) {
  const { nextAppointment, remainingToday } = upcomingSummary;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-sm font-bold tracking-tight text-foreground uppercase tracking-wider text-xs text-muted-foreground">
            Bugünün Operasyonel Durumu
          </h2>
        </div>
        <Link
          href={`/dashboard/appointments?date=${todayDateStr}`}
          className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 min-h-[36px] items-center"
        >
          <span>Bugünkü Ajandayı Aç</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Today's Total */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bugünkü Toplam
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {todaySummary.totalAppointments}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {todaySummary.pendingAppointments > 0 && (
                <span className="text-amber-700 font-medium">
                  {todaySummary.pendingAppointments} bekliyor
                </span>
              )}
              {todaySummary.confirmedAppointments > 0 && (
                <span className="text-blue-700 font-medium">
                  {todaySummary.confirmedAppointments} onaylı
                </span>
              )}
              {todaySummary.totalAppointments === 0 && <span>Randevu planlanmadı</span>}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Remaining Today */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kalan Randevular
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {remainingToday}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {remainingToday > 0
                ? "Bugün gerçekleşmeyi bekleyen"
                : "Bugünkü operasyonel randevular bitti"}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Completed Today */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tamamlanan Randevular
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {todaySummary.completedAppointments}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {todaySummary.completedAppointments > 0
                ? "Bugün başarıyla tamamlanan servis"
                : "Henüz tamamlanan randevu yok"}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Next Appointment */}
        <Card
          className={cn(
            "border-border/80 shadow-2xs transition-colors",
            nextAppointment ? "bg-card border-primary/30" : "bg-muted/20"
          )}
        >
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sıradaki Randevu
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <CalendarCheck2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {nextAppointment ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-base text-foreground">
                    {nextAppointment.localStartTime} – {nextAppointment.localEndTime}
                  </span>
                  {(() => {
                    const badge = STATUS_BADGES[nextAppointment.status] || STATUS_BADGES.PENDING;
                    return (
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border",
                          badge.bg,
                          badge.text,
                          badge.border
                        )}
                      >
                        {getAppointmentStatusLabel(nextAppointment.status)}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground truncate">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{nextAppointment.customerName}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                    <Scissors className="h-3 w-3 shrink-0" />
                    {nextAppointment.serviceName}
                  </span>
                  <span className="truncate max-w-[110px] text-right">
                    {nextAppointment.staffName}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-2 text-left">
                <p className="text-sm font-semibold text-foreground/80">
                  Bekleyen randevu yok
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bugün için sıradaki randevu planı bulunmuyor.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
