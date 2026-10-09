import {
  replaceBusinessWorkingHours,
  getBusinessWorkingHours,
  type WorkingHourInput,
} from "@/repositories/working-hours.repository";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function isValidTime(timeStr: string | null | undefined): boolean {
  if (!timeStr || typeof timeStr !== "string") return false;
  return TIME_REGEX.test(timeStr);
}

function normalizeTime(timeStr: string): string {
  // If HH:MM:SS, extract HH:MM:00 or HH:MM
  const match = timeStr.match(TIME_REGEX);
  if (!match) return timeStr;
  const hours = match[1];
  const minutes = match[2];
  return `${hours}:${minutes}:00`;
}

export async function getWorkingHours(businessId: string) {
  return await getBusinessWorkingHours(businessId);
}

export async function saveWorkingHours(
  businessId: string,
  schedule: Array<{
    dayOfWeek: number;
    startTime?: string | null;
    endTime?: string | null;
    isClosed?: boolean;
  }>
) {
  if (!Array.isArray(schedule) || schedule.length !== 7) {
    throw new Error("Weekly schedule must contain exactly 7 days.");
  }

  const seenDays = new Set<number>();
  const normalizedHours: WorkingHourInput[] = [];

  for (const entry of schedule) {
    const { dayOfWeek, isClosed = false, startTime, endTime } = entry;

    if (
      typeof dayOfWeek !== "number" ||
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek > 6
    ) {
      throw new Error(`Invalid day of week: ${dayOfWeek}. Must be between 0 and 6.`);
    }

    if (seenDays.has(dayOfWeek)) {
      throw new Error(`Duplicate day of week entry: ${dayOfWeek}.`);
    }
    seenDays.add(dayOfWeek);

    if (isClosed) {
      // Rule 9: Closed day ignores/normalizes submitted time values to NULL
      normalizedHours.push({
        dayOfWeek,
        startTime: null,
        endTime: null,
        isClosed: true,
      });
    } else {
      // Rule 6 & 7: Open day requires valid start and end time with start < end
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        throw new Error(
          `Day ${dayOfWeek} is open but has invalid start or end time format.`
        );
      }

      const normStart = normalizeTime(startTime as string);
      const normEnd = normalizeTime(endTime as string);

      if (normStart >= normEnd) {
        throw new Error(
          `Day ${dayOfWeek} start time (${startTime}) must be strictly before end time (${endTime}).`
        );
      }

      normalizedHours.push({
        dayOfWeek,
        startTime: normStart,
        endTime: normEnd,
        isClosed: false,
      });
    }
  }

  if (seenDays.size !== 7) {
    throw new Error("Weekly schedule must contain all 7 days of the week (0 to 6).");
  }

  // Atomically save to repository
  return await replaceBusinessWorkingHours(businessId, normalizedHours);
}
