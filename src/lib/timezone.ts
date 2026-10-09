import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { tr } from "date-fns/locale";

/**
 * Validates if the given string is a valid IANA timezone supported by Intl.
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates date string in YYYY-MM-DD format.
 */
export const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Validates time string in HH:mm format.
 */
export const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parses a local date (YYYY-MM-DD) and time (HH:mm) in the specified business IANA timezone
 * and returns the exact UTC Date instant.
 *
 * Handles DST edge cases:
 * - If the local wall-clock time is nonexistent due to a spring-forward transition,
 *   rejects with an error rather than silently shifting.
 * - If the local time is ambiguous due to a fall-back transition, date-fns-tz
 *   deterministically chooses the earlier instant.
 */
export function parseDateTimeInBusinessTimezone(
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new Error(`Geçersiz işletme zaman dilimi: ${timeZone}`);
  }

  const trimmedDate = dateStr.trim();
  const trimmedTime = timeStr.trim().slice(0, 5); // support HH:mm

  if (!DATE_REGEX.test(trimmedDate)) {
    throw new Error(`Geçersiz tarih formatı (YYYY-MM-DD bekleniyor): ${dateStr}`);
  }

  if (!TIME_REGEX.test(trimmedTime)) {
    throw new Error(`Geçersiz saat formatı (HH:mm bekleniyor): ${timeStr}`);
  }

  const localIsoString = `${trimmedDate} ${trimmedTime}`;
  const utcInstant = fromZonedTime(localIsoString, timeZone);

  if (isNaN(utcInstant.getTime())) {
    throw new Error(`Tarih ve saat çözümlenemedi: ${localIsoString}`);
  }

  // Detect DST spring-forward gap (nonexistent local wall-clock time)
  const formattedBack = formatInTimeZone(utcInstant, timeZone, "yyyy-MM-dd HH:mm");
  if (formattedBack !== localIsoString) {
    throw new Error(
      `Belirtilen saat (${trimmedTime}), ${timeZone} zaman diliminde yaz saati (DST) geçişi nedeniyle mevcut değildir.`
    );
  }

  return utcInstant;
}

/**
 * Formats a UTC Date instant into local date and time representations in the business timezone.
 */
export function formatInstantInBusinessTimezone(
  date: Date,
  timeZone: string
): {
  dateStr: string;      // YYYY-MM-DD
  timeStr: string;      // HH:mm
  displayStr: string;   // e.g. "10 Eki 2026, 09:00"
} {
  const safeTimeZone = isValidIanaTimeZone(timeZone) ? timeZone : "Europe/Istanbul";

  const dateStr = formatInTimeZone(date, safeTimeZone, "yyyy-MM-dd");
  const timeStr = formatInTimeZone(date, safeTimeZone, "HH:mm");
  const displayStr = formatInTimeZone(date, safeTimeZone, "d MMM yyyy, HH:mm", {
    locale: tr,
  });

  return {
    dateStr,
    timeStr,
    displayStr,
  };
}

/**
 * Resolves the current local calendar date (YYYY-MM-DD) in the specified business IANA timezone.
 */
export function getBusinessLocalToday(
  timeZone: string,
  referenceNow: Date = new Date()
): string {
  return formatInstantInBusinessTimezone(referenceNow, timeZone).dateStr;
}

/**
 * Returns the exact UTC bounds [localDayStart, nextLocalDayStart)
 * for a given local calendar date (YYYY-MM-DD) in the specified business timezone.
 */
export function getLocalDayBounds(
  dateStr: string,
  timeZone: string
): { start: Date; end: Date } {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new Error(`Geçersiz işletme zaman dilimi: ${timeZone}`);
  }

  const trimmedDate = dateStr.trim();
  if (!DATE_REGEX.test(trimmedDate)) {
    throw new Error(`Geçersiz tarih formatı (YYYY-MM-DD bekleniyor): ${dateStr}`);
  }

  // Use fromZonedTime which gracefully handles if 00:00 is skipped by DST
  const start = fromZonedTime(`${trimmedDate} 00:00:00`, timeZone);
  
  // Calculate next day by adding 24h to the local representation
  const [year, month, day] = trimmedDate.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateStr = nextDate.toISOString().split('T')[0];
  
  const end = fromZonedTime(`${nextDateStr} 00:00:00`, timeZone);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error(`Tarih sınırları hesaplanamadı: ${dateStr}`);
  }

  return { start, end };
}

export type TimeBlockStatus = "ACTIVE" | "UPCOMING" | "PAST";

/**
 * Evaluates the status of a time block against an authoritative reference time (server/DB now).
 *
 * Rules:
 * - ACTIVE: start <= now && end > now
 * - UPCOMING: start > now
 * - PAST: end <= now
 */
export function getTimeBlockStatus(
  startTime: Date,
  endTime: Date,
  referenceNow: Date = new Date()
): TimeBlockStatus {
  const nowMs = referenceNow.getTime();
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();

  if (endMs <= nowMs) {
    return "PAST";
  }
  if (startMs <= nowMs && endMs > nowMs) {
    return "ACTIVE";
  }
  return "UPCOMING";
}
