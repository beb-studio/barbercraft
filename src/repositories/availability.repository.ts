import { db } from "@/db";
import {
  businesses,
  staffProfiles,
  businessMembers,
  services,
  staffServices,
  timeBlocks,
  appointments,
  businessWorkingHours,
  staffWorkingHours,
} from "@/db/schema";
import { and, eq, lt, gt, ne, inArray, sql } from "drizzle-orm";
import { DbExecutor } from "@/db";
export interface AvailabilityInputs {
  business: {
    id: string;
    timezone: string;
    bookingIntervalMinutes: number;
    active: boolean;
    onboardingCompletedAt: Date | null;
    minimumBookingLeadMinutes: number;
    maximumAdvanceBookingDays: number | null;
    cancellationNoticeMinutes: number;
    rescheduleNoticeMinutes: number;
  };
  staffProfile: {
    id: string;
    active: boolean;
    publicBookingEnabled: boolean;
    usesBusinessHours: boolean;
  };
  member: {
    active: boolean;
  };
  service: {
    id: string;
    active: boolean;
    durationMinutes: number;
    businessId: string;
    name: string;
    price: string;
  };
  isAssigned: boolean;
}

export async function getAvailabilityInputs(
  businessId: string,
  staffId: string,
  serviceId: string,
  executor: DbExecutor = db
): Promise<AvailabilityInputs | null> {
  const [biz, staff, svc, staffSvc] = await Promise.all([
    executor.select({
      id: businesses.id,
      timezone: businesses.timezone,
      bookingIntervalMinutes: businesses.bookingIntervalMinutes,
      active: businesses.active,
      onboardingCompletedAt: businesses.onboardingCompletedAt,
      minimumBookingLeadMinutes: businesses.minimumBookingLeadMinutes,
      maximumAdvanceBookingDays: businesses.maximumAdvanceBookingDays,
      cancellationNoticeMinutes: businesses.cancellationNoticeMinutes,
      rescheduleNoticeMinutes: businesses.rescheduleNoticeMinutes,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .then((res) => res[0]),
    executor.select({
      id: staffProfiles.id,
      active: staffProfiles.active,
      publicBookingEnabled: staffProfiles.publicBookingEnabled,
      usesBusinessHours: staffProfiles.usesBusinessHours,
      memberActive: businessMembers.active,
    })
    .from(staffProfiles)
    .innerJoin(businessMembers, eq(businessMembers.id, staffProfiles.businessMemberId))
    .where(and(
      eq(staffProfiles.id, staffId),
      eq(staffProfiles.businessId, businessId)
    ))
    .limit(1)
    .then((res) => res[0]),
    executor.select({
      id: services.id,
      active: services.active,
      durationMinutes: services.durationMinutes,
      businessId: services.businessId,
      name: services.name,
      price: services.price,
    })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)
    .then((res) => res[0]),
    executor.select({
      staffId: staffServices.staffId,
    })
    .from(staffServices)
    .where(and(
      eq(staffServices.staffId, staffId),
      eq(staffServices.serviceId, serviceId)
    ))
    .limit(1)
    .then((res) => res[0]),
  ]);

  if (!biz || !staff || !svc) {
    return null;
  }

  return {
    business: biz,
    staffProfile: {
      id: staff.id,
      active: staff.active,
      publicBookingEnabled: staff.publicBookingEnabled,
      usesBusinessHours: staff.usesBusinessHours,
    },
    member: { active: staff.memberActive },
    service: svc,
    isAssigned: !!staffSvc,
  };
}

export async function hasCompleteEffectiveSchedule(
  businessId: string,
  staffId: string,
  usesBusinessHours: boolean,
  executor: DbExecutor = db
): Promise<boolean> {
  if (usesBusinessHours) {
    const [stats] = await executor
      .select({
        totalDays: sql<number>`count(*)::int`,
        openDays: sql<number>`count(case when ${businessWorkingHours.isClosed} = false then 1 end)::int`,
      })
      .from(businessWorkingHours)
      .where(eq(businessWorkingHours.businessId, businessId));

    return stats.totalDays === 7 && stats.openDays >= 1;
  }

  const [stats] = await executor
    .select({
      totalDays: sql<number>`count(*)::int`,
      workingDays: sql<number>`count(case when ${staffWorkingHours.isWorking} = true then 1 end)::int`,
    })
    .from(staffWorkingHours)
    .where(
      and(
        eq(staffWorkingHours.businessId, businessId),
        eq(staffWorkingHours.staffId, staffId)
      )
    );

  return stats.totalDays === 7 && stats.workingDays >= 1;
}

export async function getEffectiveScheduleForDay(
  businessId: string,
  staffId: string,
  usesBusinessHours: boolean,
  dayOfWeek: number,
  executor: DbExecutor = db
): Promise<{ startTime: string; endTime: string } | null> {
  if (usesBusinessHours) {
    const res = await executor.select({
      isClosed: businessWorkingHours.isClosed,
      startTime: businessWorkingHours.startTime,
      endTime: businessWorkingHours.endTime,
    })
    .from(businessWorkingHours)
    .where(and(
      eq(businessWorkingHours.businessId, businessId),
      eq(businessWorkingHours.dayOfWeek, dayOfWeek)
    ))
    .limit(1)
    .then((r) => r[0]);

    if (res && !res.isClosed && res.startTime && res.endTime) {
      return { startTime: res.startTime, endTime: res.endTime };
    }
    return null;
  } else {
    const res = await executor.select({
      isWorking: staffWorkingHours.isWorking,
      startTime: staffWorkingHours.startTime,
      endTime: staffWorkingHours.endTime,
    })
    .from(staffWorkingHours)
    .where(and(
      eq(staffWorkingHours.businessId, businessId),
      eq(staffWorkingHours.staffId, staffId),
      eq(staffWorkingHours.dayOfWeek, dayOfWeek)
    ))
    .limit(1)
    .then((r) => r[0]);

    if (res && res.isWorking && res.startTime && res.endTime) {
      return { startTime: res.startTime, endTime: res.endTime };
    }
    return null;
  }
}

export async function getOverlappingConflicts(
  businessId: string,
  staffId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeAppointmentId?: string,
  executor: DbExecutor = db
) {
  const appointmentConditions = [
    eq(appointments.businessId, businessId),
    eq(appointments.staffId, staffId),
    lt(appointments.startTime, rangeEnd),
    gt(appointments.endTime, rangeStart),
    ne(appointments.status, "CANCELLED")
  ];

  if (excludeAppointmentId) {
    appointmentConditions.push(ne(appointments.id, excludeAppointmentId));
  }

  const [blocks, appts] = await Promise.all([
    executor.select({
      startTime: timeBlocks.startTime,
      endTime: timeBlocks.endTime,
      blockType: timeBlocks.blockType,
    })
    .from(timeBlocks)
    .where(and(
      eq(timeBlocks.businessId, businessId),
      eq(timeBlocks.staffId, staffId),
      lt(timeBlocks.startTime, rangeEnd),
      gt(timeBlocks.endTime, rangeStart)
    )),
    executor.select({
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(...appointmentConditions))
  ]);
  return { blocks, appointments: appts };
}


export async function getEligibleStaffForAnyStaffAvailability(
  businessId: string,
  serviceId: string,
  executor: DbExecutor = db
) {
  return executor.select({
    id: staffProfiles.id,
    usesBusinessHours: staffProfiles.usesBusinessHours,
  })
  .from(staffProfiles)
  .innerJoin(businessMembers, eq(businessMembers.id, staffProfiles.businessMemberId))
  .innerJoin(staffServices, eq(staffServices.staffId, staffProfiles.id))
  .where(and(
    eq(staffProfiles.businessId, businessId),
    eq(staffProfiles.active, true),
    eq(staffProfiles.publicBookingEnabled, true),
    eq(businessMembers.active, true),
    eq(staffServices.serviceId, serviceId)
  ));
}

export async function getBatchEffectiveSchedules(
  businessId: string,
  staffIds: string[],
  dayOfWeek: number,
  executor: DbExecutor = db
) {
  if (staffIds.length === 0) return { businessHours: null, staffHours: [] };

  const [bizHours, stfHours] = await Promise.all([
    executor.select({
      isClosed: businessWorkingHours.isClosed,
      startTime: businessWorkingHours.startTime,
      endTime: businessWorkingHours.endTime,
    })
    .from(businessWorkingHours)
    .where(and(
      eq(businessWorkingHours.businessId, businessId),
      eq(businessWorkingHours.dayOfWeek, dayOfWeek)
    ))
    .limit(1)
    .then(r => r[0]),

    executor.select({
      staffId: staffWorkingHours.staffId,
      isWorking: staffWorkingHours.isWorking,
      startTime: staffWorkingHours.startTime,
      endTime: staffWorkingHours.endTime,
    })
    .from(staffWorkingHours)
    .where(and(
      eq(staffWorkingHours.businessId, businessId),
      inArray(staffWorkingHours.staffId, staffIds),
      eq(staffWorkingHours.dayOfWeek, dayOfWeek)
    ))
  ]);

  return {
    businessHours: bizHours,
    staffHours: stfHours,
  };
}

export async function getBatchOverlappingConflicts(
  businessId: string,
  staffIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
  executor: DbExecutor = db
) {
  if (staffIds.length === 0) return { blocks: [], appointments: [] };

  const [blocks, appts] = await Promise.all([
    executor.select({
      staffId: timeBlocks.staffId,
      startTime: timeBlocks.startTime,
      endTime: timeBlocks.endTime,
      blockType: timeBlocks.blockType,
    })
    .from(timeBlocks)
    .where(and(
      eq(timeBlocks.businessId, businessId),
      inArray(timeBlocks.staffId, staffIds),
      lt(timeBlocks.startTime, rangeEnd),
      gt(timeBlocks.endTime, rangeStart)
    )),

    executor.select({
      staffId: appointments.staffId,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(
      eq(appointments.businessId, businessId),
      inArray(appointments.staffId, staffIds),
      lt(appointments.startTime, rangeEnd),
      gt(appointments.endTime, rangeStart),
      ne(appointments.status, "CANCELLED")
    ))
  ]);

  return { blocks, appointments: appts };
}
