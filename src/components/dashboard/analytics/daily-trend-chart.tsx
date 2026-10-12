"use client";

import { useState } from "react";
import { TrendingUp, BarChart2, Table as TableIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DailyTrendBucket } from "@/types/business-analytics";
import { formatCurrency } from "@/lib/presentation";

interface DailyTrendChartProps {
  dailyTrend: DailyTrendBucket[];
  currency: string;
}

function formatShortDate(dateStr: string): { day: string; month: string; weekday: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  const day = new Intl.DateTimeFormat("tr-TR", { day: "numeric", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("tr-TR", { month: "short", timeZone: "UTC" }).format(date);
  const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "UTC" }).format(date);

  return { day, month, weekday };
}

function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

export function DailyTrendChart({ dailyTrend, currency }: DailyTrendChartProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const maxAppointments = Math.max(
    1,
    ...dailyTrend.map((bucket) => bucket.appointmentCount)
  );

  const totalVolume = dailyTrend.reduce((sum, b) => sum + b.appointmentCount, 0);
  const totalCompleted = dailyTrend.reduce((sum, b) => sum + b.completedCount, 0);

  const activeBucket = hoveredDate
    ? dailyTrend.find((b) => b.localDate === hoveredDate)
    : null;

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-base tracking-tight text-foreground">
              Günlük Randevu Trendi
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dönem içi günlük randevu hacmi ve tamamlanan servis dağılımı
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
              <span>Tamamlanan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
              <span>Diğer Randevular</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            aria-label={showTable ? "Grafik görünümüne geç" : "Tablo görünümüne geç"}
            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted/40 text-xs font-semibold text-foreground flex items-center gap-1.5 transition-colors"
          >
            {showTable ? (
              <>
                <BarChart2 className="h-3.5 w-3.5" />
                <span>Grafik</span>
              </>
            ) : (
              <>
                <TableIcon className="h-3.5 w-3.5" />
                <span>Tablo</span>
              </>
            )}
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-4">
        {totalVolume === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <BarChart2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-foreground/80">
              Bu tarih aralığında randevu kaydı bulunmuyor
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Farklı bir tarih aralığı seçerek geçmiş randevuları inceleyebilirsiniz.
            </p>
          </div>
        ) : showTable ? (
          /* Accessible Table View */
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3 text-right">Toplam</th>
                  <th className="py-2.5 px-3 text-right">Tamamlanan</th>
                  <th className="py-2.5 px-3 text-right">İptal</th>
                  <th className="py-2.5 px-3 text-right">Gelmedi</th>
                  <th className="py-2.5 px-3 text-right">Hizmet Tutarı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {dailyTrend.map((bucket) => {
                  const valItem =
                    bucket.completedServiceValue.find((v) => v.currency === currency) ||
                    bucket.completedServiceValue[0];
                  return (
                    <tr key={bucket.localDate} className="hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium text-foreground">
                        {formatFullDate(bucket.localDate)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        {bucket.appointmentCount}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                        {bucket.completedCount}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-red-700 dark:text-red-400">
                        {bucket.cancelledCount}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-zinc-500">
                        {bucket.noShowCount}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-foreground">
                        {valItem ? formatCurrency(valItem.amount, valItem.currency) : formatCurrency(0, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Visual Bar Chart */
          <div className="space-y-4">
            {/* Active Details Box if hovered */}
            <div className="min-h-[40px] px-3 py-2 rounded-xl bg-muted/40 border border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs">
              {activeBucket ? (
                <>
                  <div className="font-semibold text-foreground">
                    {formatFullDate(activeBucket.localDate)}
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span>Toplam: <strong className="text-foreground">{activeBucket.appointmentCount}</strong></span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Tamamlanan: <strong>{activeBucket.completedCount}</strong>
                    </span>
                    {activeBucket.cancelledCount > 0 && (
                      <span className="text-red-700 dark:text-red-400">
                        İptal: <strong>{activeBucket.cancelledCount}</strong>
                      </span>
                    )}
                    <span className="text-foreground font-semibold">
                      Tutar: {formatCurrency(
                        (activeBucket.completedServiceValue.find((v) => v.currency === currency) || activeBucket.completedServiceValue[0])?.amount || 0,
                        currency
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground flex items-center justify-between w-full">
                  <span>Detayları görmek için günün üzerine gelin.</span>
                  <span className="font-mono text-foreground font-medium">
                    Toplam: {totalVolume} • Tamamlanan: {totalCompleted}
                  </span>
                </div>
              )}
            </div>

            {/* Bars container */}
            <div className="relative pt-4 pb-2">
              <div
                className={cn(
                  "grid items-end gap-1.5 sm:gap-2 h-44 w-full",
                  dailyTrend.length === 1 && "grid-cols-1 max-w-[120px] mx-auto",
                  dailyTrend.length === 7 && "grid-cols-7",
                  dailyTrend.length === 30 && "grid-cols-[repeat(30,minmax(0,1fr))]"
                )}
                role="region"
                aria-label="Günlük randevu trend grafiği"
              >
                {dailyTrend.map((bucket) => {
                  const { day, month, weekday } = formatShortDate(bucket.localDate);
                  const heightPercent =
                    bucket.appointmentCount > 0
                      ? Math.max(12, Math.round((bucket.appointmentCount / maxAppointments) * 100))
                      : 4;

                  const completedRatio =
                    bucket.appointmentCount > 0
                      ? bucket.completedCount / bucket.appointmentCount
                      : 0;

                  const isHovered = hoveredDate === bucket.localDate;

                  return (
                    <div
                      key={bucket.localDate}
                      className="group flex flex-col items-center justify-end h-full relative"
                      onMouseEnter={() => setHoveredDate(bucket.localDate)}
                      onMouseLeave={() => setHoveredDate(null)}
                    >
                      {/* Bar Pillar */}
                      <button
                        type="button"
                        tabIndex={0}
                        aria-label={`${formatFullDate(bucket.localDate)}: ${bucket.appointmentCount} randevu, ${bucket.completedCount} tamamlanan`}
                        className={cn(
                          "w-full rounded-t-md transition-all relative overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-primary",
                          bucket.appointmentCount > 0
                            ? "bg-muted-foreground/25 hover:bg-muted-foreground/35 cursor-pointer"
                            : "bg-muted/40 cursor-default",
                          isHovered && "ring-2 ring-primary ring-offset-1"
                        )}
                        style={{ height: `${heightPercent}%` }}
                      >
                        {/* Completed portion stacked fill */}
                        {bucket.completedCount > 0 && (
                          <div
                            className="w-full bg-primary absolute bottom-0 left-0 rounded-t-xs transition-all"
                            style={{ height: `${Math.round(completedRatio * 100)}%` }}
                          />
                        )}
                      </button>

                      {/* Day Label */}
                      <div className="mt-2 text-center select-none">
                        {dailyTrend.length <= 7 ? (
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-semibold text-foreground leading-tight">
                              {day} {month}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {weekday}
                            </span>
                          </div>
                        ) : (
                          // For 30 days: show every 5th or 6th day label or compact day number
                          <span
                            className={cn(
                              "text-[9px] font-mono",
                              isHovered
                                ? "text-primary font-bold"
                                : "text-muted-foreground/70 hidden sm:inline-block"
                            )}
                          >
                            {day}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
