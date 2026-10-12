"use client";

import { useState } from "react";
import { Clock, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BusyPeriodsSummary } from "@/types/business-analytics";

interface BusyPeriodsCardProps {
  busyPeriods: BusyPeriodsSummary;
}

export function BusyPeriodsCard({ busyPeriods }: BusyPeriodsCardProps) {
  const [tab, setTab] = useState<"WEEKDAY" | "HOUR">("WEEKDAY");

  const maxWeekday = Math.max(1, ...busyPeriods.byWeekday.map((d) => d.appointmentCount));
  const totalWeekdayVolume = busyPeriods.byWeekday.reduce((sum, d) => sum + d.appointmentCount, 0);

  // Filter hours that have activity or take top 6 hours
  const activeHours = busyPeriods.byHour.filter((h) => h.appointmentCount > 0);
  const topHours = [...busyPeriods.byHour]
    .sort((a, b) => b.appointmentCount - a.appointmentCount)
    .slice(0, 6)
    .filter((h) => h.appointmentCount > 0);
  const maxHour = Math.max(1, ...busyPeriods.byHour.map((h) => h.appointmentCount));

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="p-4 sm:p-5 pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-base tracking-tight text-foreground">
              Randevu Yoğunluk Dağılımı
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Haftanın günleri ve gün içindeki en yoğun saatler
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center p-0.5 bg-muted/60 rounded-lg border border-border/40 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setTab("WEEKDAY")}
            className={cn(
              "px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1",
              tab === "WEEKDAY"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="h-3 w-3" />
            <span>Günler</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("HOUR")}
            className={cn(
              "px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1",
              tab === "HOUR"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock className="h-3 w-3" />
            <span>Saatler</span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-3">
        {totalWeekdayVolume === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Clock className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-foreground/80">
              Henüz yoğunluk verisi yok
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seçilen aralıkta operasyonel randevu kaydı bulunmuyor.
            </p>
          </div>
        ) : tab === "WEEKDAY" ? (
          /* Weekdays Distribution */
          <div className="space-y-2.5">
            {busyPeriods.byWeekday.map((day) => {
              const percent = Math.round((day.appointmentCount / maxWeekday) * 100);
              const isBusiest = day.appointmentCount > 0 && day.appointmentCount === maxWeekday;

              return (
                <div key={day.dayOfWeek} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "font-medium truncate",
                        isBusiest ? "text-primary font-bold" : "text-foreground"
                      )}
                    >
                      {day.dayName}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      <strong className="text-foreground">{day.appointmentCount}</strong> randevu
                    </span>
                  </div>

                  <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isBusiest ? "bg-primary" : "bg-primary/50"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Hours Distribution */
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>En Yoğun Saat Dilimleri</span>
              <span className="font-mono text-[11px]">{activeHours.length} aktif saat</span>
            </div>

            {topHours.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Henüz saat bazlı randevu kaydı bulunmuyor.
              </p>
            ) : (
              <div className="space-y-2.5">
                {topHours.map((hourItem) => {
                  const startHour = String(hourItem.hour).padStart(2, "0");
                  const endHour = String((hourItem.hour + 1) % 24).padStart(2, "0");
                  const percent = Math.round((hourItem.appointmentCount / maxHour) * 100);

                  return (
                    <div key={hourItem.hour} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-foreground">
                          {startHour}:00 – {endHour}:00
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          <strong className="text-foreground">{hourItem.appointmentCount}</strong> randevu
                        </span>
                      </div>

                      <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
