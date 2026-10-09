import {
  getAvailabilityInputs,
  getEffectiveScheduleForDay,
  getOverlappingConflicts,
  getEligibleStaffForAnyStaffAvailability,
  getBatchEffectiveSchedules,
  getBatchOverlappingConflicts
} from "@/repositories/availability.repository";
import {
  parseDateTimeInBusinessTimezone,
  formatInstantInBusinessTimezone
} from "@/lib/timezone";
import { toZonedTime } from "date-fns-tz";
import { getDay } from "date-fns";
import { DbExecutor, db } from "@/db";
import { businesses, services } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface AvailabilitySlot {
  startAt: string; // ISO string
  endAt: string; // ISO string
  localStartTime: string; // HH:mm
  localEndTime: string; // HH:mm
}

export interface AvailabilityResult {
  businessId: string;
  staffId: string;
  serviceId: string;
  localDate: string;
  timezone: string;
  serviceDurationMinutes: number;
  bookingIntervalMinutes: number;
  slots: AvailabilitySlot[];
  reason?: string;
}

export interface AnyStaffAvailabilityResult {
  businessId: string;
  serviceId: string;
  localDate: string;
  timezone: string;
  slots: AvailabilitySlot[];
}

export function computeSlotsForStaff({
  schedule,
  localDate,
  businessTimezone,
  bookingIntervalMinutes,
  serviceDurationMinutes,
  workingEndInstant,
  now,
  blocks,
  appointments
}: {
  schedule: { startTime: string; endTime: string };
  localDate: string;
  businessTimezone: string;
  bookingIntervalMinutes: number;
  serviceDurationMinutes: number;
  workingEndInstant: Date;
  now: Date;
  blocks: { startTime: Date; endTime: Date }[];
  appointments: { startTime: Date; endTime: Date }[];
}): AvailabilitySlot[] {
  const [startHour, startMin] = schedule.startTime.split(':').map(Number);
  let currentMinutes = startHour * 60 + startMin;

  const [endHour, endMin] = schedule.endTime.split(':').map(Number);
  const endMinutes = endHour * 60 + endMin;

  const slots: AvailabilitySlot[] = [];

  while (currentMinutes < endMinutes) {
    const hh = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
    const mm = (currentMinutes % 60).toString().padStart(2, '0');
    const candidateLocalTime = `${hh}:${mm}`;

    let candidateStartInstant: Date;
    try {
      candidateStartInstant = parseDateTimeInBusinessTimezone(
        localDate,
        candidateLocalTime,
        businessTimezone
      );
    } catch {
      // e.g. DST gap
      currentMinutes += bookingIntervalMinutes;
      continue;
    }

    if (candidateStartInstant.getTime() <= now.getTime()) {
      currentMinutes += bookingIntervalMinutes;
      continue;
    }

    const candidateEndInstant = new Date(
      candidateStartInstant.getTime() + serviceDurationMinutes * 60000
    );

    if (candidateEndInstant.getTime() > workingEndInstant.getTime()) {
      currentMinutes += bookingIntervalMinutes;
      continue;
    }

    let hasConflict = false;

    for (const block of blocks) {
      if (
        candidateStartInstant.getTime() < block.endTime.getTime() &&
        candidateEndInstant.getTime() > block.startTime.getTime()
      ) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      for (const appt of appointments) {
        if (
          candidateStartInstant.getTime() < appt.endTime.getTime() &&
          candidateEndInstant.getTime() > appt.startTime.getTime()
        ) {
          hasConflict = true;
          break;
        }
      }
    }

    if (!hasConflict) {
      const formattedEnd = formatInstantInBusinessTimezone(candidateEndInstant, businessTimezone);
      slots.push({
        startAt: candidateStartInstant.toISOString(),
        endAt: candidateEndInstant.toISOString(),
        localStartTime: candidateLocalTime,
        localEndTime: formattedEnd.timeStr,
      });
    }

    currentMinutes += bookingIntervalMinutes;
  }

  return slots;
}

export async function getStaffAvailability({
  businessId,
  staffId,
  serviceId,
  localDate,
  referenceNow,
  excludeAppointmentId,
  context = "PUBLIC",
  executor = db,
}: {
  businessId: string;
  staffId: string;
  serviceId: string;
  localDate: string; // YYYY-MM-DD
  referenceNow?: Date;
  excludeAppointmentId?: string;
  context?: "PUBLIC" | "INTERNAL";
  executor?: DbExecutor;
}): Promise<AvailabilityResult> {
  const inputs = await getAvailabilityInputs(businessId, staffId, serviceId, executor);

  if (!inputs) {
    throw new Error("Invalid request: business, staff, or service not found");
  }

  if (inputs.service.businessId !== businessId) {
    throw new Error("Invalid request: service does not belong to business");
  }

  const baseResult: AvailabilityResult = {
    businessId,
    staffId,
    serviceId,
    localDate,
    timezone: inputs.business.timezone,
    serviceDurationMinutes: inputs.service.durationMinutes,
    bookingIntervalMinutes: inputs.business.bookingIntervalMinutes,
    slots: [],
  };

  if (
    !inputs.member.active ||
    !inputs.staffProfile.active ||
    !inputs.service.active ||
    !inputs.isAssigned
  ) {
    baseResult.reason = "STAFF_NOT_BOOKABLE";
    return baseResult;
  }

  if (context === "PUBLIC" && !inputs.staffProfile.publicBookingEnabled) {
    baseResult.reason = "STAFF_NOT_BOOKABLE";
    return baseResult;
  }

  const startOfDayInstant = parseDateTimeInBusinessTimezone(localDate, "00:00", inputs.business.timezone);
  const zonedDate = toZonedTime(startOfDayInstant, inputs.business.timezone);
  const dayOfWeek = getDay(zonedDate);

  const schedule = await getEffectiveScheduleForDay(
    businessId,
    staffId,
    inputs.staffProfile.usesBusinessHours,
    dayOfWeek,
    executor
  );

  if (!schedule) {
    baseResult.reason = "CLOSED";
    return baseResult;
  }

  const workingStartInstant = parseDateTimeInBusinessTimezone(
    localDate,
    schedule.startTime,
    inputs.business.timezone
  );

  const workingEndInstant = parseDateTimeInBusinessTimezone(
    localDate,
    schedule.endTime,
    inputs.business.timezone
  );

  const conflicts = await getOverlappingConflicts(
    businessId,
    staffId,
    workingStartInstant,
    workingEndInstant,
    excludeAppointmentId,
    executor
  );

  const now = referenceNow ?? new Date();

  baseResult.slots = computeSlotsForStaff({
    schedule,
    localDate,
    businessTimezone: inputs.business.timezone,
    bookingIntervalMinutes: inputs.business.bookingIntervalMinutes,
    serviceDurationMinutes: inputs.service.durationMinutes,
    workingEndInstant,
    now,
    blocks: conflicts.blocks,
    appointments: conflicts.appointments
  });

  if (baseResult.slots.length === 0) {
    baseResult.reason = "NO_AVAILABLE_SLOTS";
  }

  return baseResult;
}

export async function getAnyStaffAvailability({
  businessId,
  serviceId,
  localDate,
  referenceNow,
  executor = db,
}: {
  businessId: string;
  serviceId: string;
  localDate: string; // YYYY-MM-DD
  referenceNow?: Date;
  executor?: DbExecutor;
}): Promise<AnyStaffAvailabilityResult> {
  const [biz, svc] = await Promise.all([
    executor.select().from(businesses).where(eq(businesses.id, businessId)).limit(1).then(r => r[0]),
    executor.select().from(services).where(eq(services.id, serviceId)).limit(1).then(r => r[0])
  ]);

  if (!biz || !svc || !svc.active || svc.businessId !== businessId) {
    throw new Error("Invalid request: business or service not found or inactive");
  }

  const baseResult: AnyStaffAvailabilityResult = {
    businessId,
    serviceId,
    localDate,
    timezone: biz.timezone,
    slots: [],
  };

  const eligibleStaff = await getEligibleStaffForAnyStaffAvailability(businessId, serviceId, executor);
  
  if (eligibleStaff.length === 0) {
    return baseResult; // zero eligible staff
  }

  const startOfDayInstant = parseDateTimeInBusinessTimezone(localDate, "00:00", biz.timezone);
  const zonedDate = toZonedTime(startOfDayInstant, biz.timezone);
  const dayOfWeek = getDay(zonedDate);

  const staffIds = eligibleStaff.map(s => s.id);
  const schedulesData = await getBatchEffectiveSchedules(businessId, staffIds, dayOfWeek, executor);
  
  const staffSchedules = new Map<string, { startTime: string; endTime: string }>();

  for (const staff of eligibleStaff) {
    if (staff.usesBusinessHours) {
      if (schedulesData.businessHours && !schedulesData.businessHours.isClosed && schedulesData.businessHours.startTime && schedulesData.businessHours.endTime) {
        staffSchedules.set(staff.id, {
          startTime: schedulesData.businessHours.startTime,
          endTime: schedulesData.businessHours.endTime,
        });
      }
    } else {
      const custom = schedulesData.staffHours.find(h => h.staffId === staff.id);
      if (custom && custom.isWorking && custom.startTime && custom.endTime) {
        staffSchedules.set(staff.id, {
          startTime: custom.startTime,
          endTime: custom.endTime,
        });
      }
    }
  }

  const workingStaffIds = Array.from(staffSchedules.keys());
  
  if (workingStaffIds.length === 0) {
    return baseResult;
  }

  // Cover DST overlaps safely using a wide net around local day
  const endOfDayInstant = new Date(startOfDayInstant.getTime() + 28 * 60 * 60 * 1000); 
  
  const conflictsData = await getBatchOverlappingConflicts(businessId, workingStaffIds, startOfDayInstant, endOfDayInstant, executor);

  const now = referenceNow ?? new Date();
  const allSlots: AvailabilitySlot[] = [];

  for (const staffId of workingStaffIds) {
    const schedule = staffSchedules.get(staffId)!;
    
    const workingEndInstant = parseDateTimeInBusinessTimezone(
      localDate,
      schedule.endTime,
      biz.timezone
    );

    const staffBlocks = conflictsData.blocks.filter(b => b.staffId === staffId);
    const staffAppts = conflictsData.appointments.filter(a => a.staffId === staffId);

    const staffSlots = computeSlotsForStaff({
      schedule,
      localDate,
      businessTimezone: biz.timezone,
      bookingIntervalMinutes: biz.bookingIntervalMinutes,
      serviceDurationMinutes: svc.durationMinutes,
      workingEndInstant,
      now,
      blocks: staffBlocks,
      appointments: staffAppts
    });

    allSlots.push(...staffSlots);
  }

  // Deduplicate by startAt
  const uniqueSlots = new Map<string, AvailabilitySlot>();
  for (const slot of allSlots) {
    if (!uniqueSlots.has(slot.startAt)) {
      uniqueSlots.set(slot.startAt, slot);
    }
  }

  baseResult.slots = Array.from(uniqueSlots.values()).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  return baseResult;
}
