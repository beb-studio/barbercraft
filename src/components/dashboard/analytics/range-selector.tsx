"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyticsDateRange, AnalyticsRangePreset } from "@/types/business-analytics";
import { getAnalyticsRangePresetLabel } from "@/lib/presentation";

interface RangeSelectorProps {
  currentRange: AnalyticsDateRange;
}

const PRESET_OPTIONS: { id: AnalyticsRangePreset; label: string; daysLabel: string }[] = [
  { id: "TODAY", label: "Bugün", daysLabel: "1 gün" },
  { id: "LAST_7_DAYS", label: "Son 7 Gün", daysLabel: "7 gün" },
  { id: "LAST_30_DAYS", label: "Son 30 Gün", daysLabel: "30 gün" },
];

function formatDateSpan(range: AnalyticsDateRange): string {
  const parseParts = (str: string) => {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const start = parseParts(range.startDateStr);
  const end = parseParts(range.endDateStr);

  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (range.startDateStr === range.endDateStr) {
    return formatter.format(start);
  }

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function RangeSelector({ currentRange }: RangeSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSelectPreset = (preset: AnalyticsRangePreset) => {
    if (preset === currentRange.preset) return;
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (preset === "LAST_7_DAYS") {
        params.delete("range");
      } else {
        params.set("range", preset);
      }
      const qs = params.toString();
      router.push(qs ? `/dashboard?${qs}` : "/dashboard");
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/70 p-2.5 rounded-2xl shadow-2xs">
      {/* Segmented Control Tabs */}
      <div
        role="tablist"
        aria-label="Analitik Zaman Aralığı"
        className="inline-flex items-center p-1 bg-muted/60 rounded-xl border border-border/40 gap-1 w-full sm:w-auto"
      >
        {PRESET_OPTIONS.map((option) => {
          const isActive = currentRange.preset === option.id;
          return (
            <button
              key={option.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              disabled={isPending}
              onClick={() => handleSelectPreset(option.id)}
              className={cn(
                "flex-1 sm:flex-none min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all text-center select-none flex items-center justify-center gap-1.5",
                isActive
                  ? "bg-background text-foreground shadow-xs border border-border/80 font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40",
                isPending && "opacity-70 cursor-not-allowed"
              )}
            >
              <span>{getAnalyticsRangePresetLabel(option.id)}</span>
              <span
                className={cn(
                  "hidden xs:inline-block text-[10px] px-1.5 py-0.2 rounded font-mono font-normal",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "bg-muted-foreground/15 text-muted-foreground"
                )}
              >
                {option.daysLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Date Span Subtitle & Loading Indicator */}
      <div className="flex items-center justify-between sm:justify-end gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          ) : (
            <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium text-foreground/90 font-mono text-[11px] sm:text-xs">
            {formatDateSpan(currentRange)}
          </span>
        </div>
      </div>
    </div>
  );
}
