import { getBusinessLocalToday, getLocalDayBounds, isValidIanaTimeZone } from "@/lib/timezone";
import type { AnalyticsDateRange, AnalyticsRangePreset } from "@/types/business-analytics";

export const ALLOWED_ANALYTICS_PRESETS: readonly AnalyticsRangePreset[] = [
  "TODAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
] as const;

export function isValidAnalyticsPreset(preset: unknown): preset is AnalyticsRangePreset {
  return typeof preset === "string" && ALLOWED_ANALYTICS_PRESETS.includes(preset as AnalyticsRangePreset);
}

export function shiftDateStr(dateStr: string, daysDelta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + daysDelta));
  return shifted.toISOString().split("T")[0];
}

export const TURKISH_WEEKDAY_NAMES: Record<number, string> = {
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
  7: "Pazar",
};

export function getTurkishWeekdayName(isoDayOfWeek: number): string {
  return TURKISH_WEEKDAY_NAMES[isoDayOfWeek] ?? `Gün ${isoDayOfWeek}`;
}

export function getAnalyticsDateRange(
  preset: AnalyticsRangePreset,
  timeZone: string,
  referenceNow: Date = new Date()
): AnalyticsDateRange {
  const safeTimeZone = isValidIanaTimeZone(timeZone) ? timeZone : "Europe/Istanbul";
  const todayStr = getBusinessLocalToday(safeTimeZone, referenceNow);

  let startDateStr: string;
  const endDateStr: string = todayStr;
  let daysCount: number;

  switch (preset) {
    case "TODAY":
      startDateStr = todayStr;
      daysCount = 1;
      break;
    case "LAST_7_DAYS":
      startDateStr = shiftDateStr(todayStr, -6);
      daysCount = 7;
      break;
    case "LAST_30_DAYS":
      startDateStr = shiftDateStr(todayStr, -29);
      daysCount = 30;
      break;
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Bilinmeyen zaman aralığı: ${_exhaustive}`);
    }
  }

  const localDates: string[] = [];
  for (let i = 0; i < daysCount; i++) {
    localDates.push(shiftDateStr(startDateStr, i));
  }

  const startInstant = getLocalDayBounds(startDateStr, safeTimeZone).start;
  const endInstant = getLocalDayBounds(endDateStr, safeTimeZone).end;

  return {
    preset,
    timeZone: safeTimeZone,
    startDateStr,
    endDateStr,
    startInstant,
    endInstant,
    daysCount,
    localDates,
  };
}
