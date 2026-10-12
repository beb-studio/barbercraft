import { Users, UserPlus, UserCheck, CalendarDays, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { RangeSummary, UpcomingSummary } from "@/types/business-analytics";
import { formatPercentage } from "@/lib/presentation";

interface CustomerSummaryCardProps {
  rangeSummary: RangeSummary;
  upcomingSummary: UpcomingSummary;
}

export function CustomerSummaryCard({
  rangeSummary,
  upcomingSummary,
}: CustomerSummaryCardProps) {
  const { uniqueCustomers, newCustomers, returningCustomers } = rangeSummary;
  const newRatio = uniqueCustomers > 0 ? newCustomers / uniqueCustomers : 0;
  const returningRatio = uniqueCustomers > 0 ? returningCustomers / uniqueCustomers : 0;

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="p-4 sm:p-5 pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Users className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-base tracking-tight text-foreground">
              Müşteri & Gelecek Planlama
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Müşteri kazanımı ve yaklaşan günlerin randevu hacmi
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-4 space-y-5">
        {/* Section 1: Customer Mix */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              Müşteri Dağılımı ({uniqueCustomers} Tekil Müşteri)
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {formatPercentage(newRatio)} yeni müşteri oranı
            </span>
          </div>

          {/* Proportional dual bar */}
          <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden flex">
            {newCustomers > 0 && (
              <div
                className="bg-blue-600 dark:bg-blue-500 h-full transition-all"
                style={{ width: `${Math.round(newRatio * 100)}%` }}
                title={`${newCustomers} yeni müşteri`}
              />
            )}
            {returningCustomers > 0 && (
              <div
                className="bg-emerald-600 dark:bg-emerald-500 h-full transition-all"
                style={{ width: `${Math.round(returningRatio * 100)}%` }}
                title={`${returningCustomers} geri dönen müşteri`}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
                <UserPlus className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-base font-bold text-foreground">
                  {newCustomers}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Yeni Müşteri
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                <UserCheck className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-base font-bold text-foreground">
                  {returningCustomers}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Geri Dönen
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Upcoming Outlook */}
        <div className="space-y-2.5 pt-3 border-t border-border/50">
          <div className="text-xs font-semibold text-foreground">
            Yaklaşan Randevu Görünümü
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                <CalendarClock className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-base font-bold text-foreground">
                  {upcomingSummary.tomorrowCount}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Yarınki Randevu
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <CalendarDays className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-base font-bold text-foreground">
                  {upcomingSummary.next7DaysCount}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Gelecek 7 Gün
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
