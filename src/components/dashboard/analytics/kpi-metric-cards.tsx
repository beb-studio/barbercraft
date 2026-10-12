import {
  Calendar,
  CheckCircle2,
  Users,
  Coins,
  XCircle,
  UserX,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { RangeSummary } from "@/types/business-analytics";
import { formatCurrency, formatPercentage } from "@/lib/presentation";

interface KpiMetricCardsProps {
  rangeSummary: RangeSummary;
  currency: string;
}

export function KpiMetricCards({ rangeSummary, currency }: KpiMetricCardsProps) {
  // Completion rate calculation relative to total appointments in range
  const completionRate =
    rangeSummary.totalAppointments > 0
      ? rangeSummary.completedAppointments / rangeSummary.totalAppointments
      : null;

  // Format completed service value
  const primaryValue =
    rangeSummary.completedServiceValue.find((v) => v.currency === currency) ||
    rangeSummary.completedServiceValue[0];
  const formattedValue = primaryValue
    ? formatCurrency(primaryValue.amount, primaryValue.currency)
    : formatCurrency(0, currency);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold tracking-tight text-foreground uppercase tracking-wider text-xs text-muted-foreground">
        Dönem Performans Özeti
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* KPI 1: Toplam Randevu */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Toplam Randevu
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {rangeSummary.totalAppointments}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {rangeSummary.operationalAppointments > 0 ? (
                <span>
                  {rangeSummary.operationalAppointments} aktif / bekleyen randevu
                </span>
              ) : (
                <span>Dönem içinde kayıtlı tüm randevular</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Tamamlanan Randevu */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tamamlanan Randevu
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {rangeSummary.completedAppointments}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {completionRate !== null ? (
                <span className="text-emerald-700 font-medium">
                  {formatPercentage(completionRate)} tamamlama oranı
                </span>
              ) : (
                <span>Henüz tamamlanan randevu yok</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Tekil Müşteri */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tekil Müşteri
            </span>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {rangeSummary.uniqueCustomers}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{rangeSummary.newCustomers}</span> yeni •{" "}
              <span className="font-medium text-foreground">{rangeSummary.returningCustomers}</span> geri dönen
            </p>
          </CardContent>
        </Card>

        {/* KPI 4: Tamamlanan Hizmet Tutarı (CRITICAL SEMANTIC: NOT REVENUE) */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tamamlanan Hizmet Tutarı
              </span>
              <span
                title="Tamamlanan randevuların kayıtlı hizmet tutarıdır; tahsilat verisi değildir."
                aria-label="Tamamlanan randevuların kayıtlı hizmet tutarıdır; tahsilat verisi değildir."
                className="cursor-help text-muted-foreground hover:text-foreground inline-flex items-center"
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Coins className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {formattedValue}
            </div>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
              Tamamlanan randevuların kayıtlı hizmet tutarıdır; tahsilat verisi değildir.
            </p>
          </CardContent>
        </Card>

        {/* KPI 5: İptal Oranı */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              İptal Oranı
            </span>
            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600">
              <XCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {formatPercentage(rangeSummary.cancellationRate)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {rangeSummary.cancelledAppointments > 0 ? (
                <span className="text-red-700 font-medium">
                  {rangeSummary.cancelledAppointments} randevu iptal edildi
                </span>
              ) : (
                <span>Bu dönemde iptal edilen randevu yok</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* KPI 6: Gelmedi Oranı */}
        <Card className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
          <CardHeader className="p-4 pb-1.5 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gelmedi Oranı
            </span>
            <div className="h-8 w-8 rounded-lg bg-zinc-500/10 flex items-center justify-center text-zinc-600">
              <UserX className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {formatPercentage(rangeSummary.noShowRate)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {rangeSummary.noShowAppointments > 0 ? (
                <span className="text-zinc-700 font-medium">
                  {rangeSummary.noShowAppointments} randevuya gelinmedi
                </span>
              ) : (
                <span>Bu dönemde gelmedi kaydı yok</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
