import { db } from "@/db";
import {
  staffProfiles,
  businessMembers,
  appointments,
  customers,
  services,
  staffServices,
  timeBlocks,
} from "@/db/schema";
import { eq, and, gte, lt, gt, inArray } from "drizzle-orm";
import { getBusinessById } from "@/repositories/business.repository";
import { getEffectiveStaffScheduleSummary } from "@/repositories/staff.repository";
import {
  parseDateTimeInBusinessTimezone,
  formatInstantInBusinessTimezone,
  getLocalDayBounds,
  getBusinessLocalToday,
  DATE_REGEX,
} from "@/lib/timezone";
import { ForbiddenError } from "@/lib/auth/guards";
import { toZonedTime } from "date-fns-tz";
import { getDay } from "date-fns";
import type {
  StaffWorkspaceData,
  StaffWorkspaceProfile,
  StaffWorkspaceBusiness,
  StaffWorkspaceOperationalPulse,
  StaffWorkspaceAgendaAppointment,
  StaffWorkspaceTimeBlock,
  StaffWorkspaceDayAgenda,
  StaffWorkspaceAssignedService,
  StaffWorkspaceNextAppointment,
  StaffWorkspaceRangePreset,
} from "@/types/staff-workspace";

export interface GetStaffWorkspaceInput {
  businessId: string;
  userId: string;
  role: string;
  rangePreset?: StaffWorkspaceRangePreset;
  selectedDate?: string; // YYYY-MM-DD
  targetStaffId?: string; // Optional for OWNER/MANAGER
  referenceNow?: Date;
}

export function getBusinessWeekDays(targetDateStr: string, timezone: string) {
  const targetDayInstant = parseDateTimeInBusinessTimezone(targetDateStr, "12:00", timezone);
  const zonedTarget = toZonedTime(targetDayInstant, timezone);
  const dow = getDay(zonedTarget); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  
  // Monday is start of week
  const daysBackToMonday = dow === 0 ? 6 : dow - 1;

  const [year, month, day] = targetDateStr.split("-").map(Number);
  const mondayBase = new Date(Date.UTC(year, month - 1, day - daysBackToMonday));

  const weekDays = [];
  const dayNames = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(Date.UTC(mondayBase.getUTCFullYear(), mondayBase.getUTCMonth(), mondayBase.getUTCDate() + i));
    const dateStr = dayDate.toISOString().split("T")[0];
    const bounds = getLocalDayBounds(dateStr, timezone);
    const dayOfWeek = (1 + i) % 7; // Mon=1, ..., Sat=6, Sun=0

    weekDays.push({
      dateStr,
      dayOfWeek,
      dayName: dayNames[i],
      bounds,
    });
  }

  return weekDays;
}

export class StaffWorkspaceService {
  /**
   * Authoritative staff workspace resolver.
   * Guarantees role isolation, customer privacy, and zero financial exposure.
   */
  static async getStaffWorkspace(input: GetStaffWorkspaceInput): Promise<StaffWorkspaceData> {
    const { businessId, userId, role, selectedDate, targetStaffId } = input;
    const refNow = input.referenceNow || new Date();

    // 1. Resolve Trusted Staff Profile
    let activeProfile: typeof staffProfiles.$inferSelect;

    if (role === "STAFF") {
      const [staffRow] = await db
        .select({
          profile: staffProfiles,
          member: businessMembers,
        })
        .from(staffProfiles)
        .innerJoin(businessMembers, eq(staffProfiles.businessMemberId, businessMembers.id))
        .where(
          and(
            eq(businessMembers.businessId, businessId),
            eq(businessMembers.userId, userId),
            eq(businessMembers.active, true),
            eq(staffProfiles.businessId, businessId)
          )
        )
        .limit(1);

      if (!staffRow) {
        throw new ForbiddenError("Yetkisiz işlem: Aktif personel üyeliği bulunamadı.");
      }

      if (!staffRow.profile.active) {
        throw new ForbiddenError("Yetkisiz işlem: Personel profili aktif değil.");
      }

      // If client supplied staffId, it MUST match the trusted profile
      if (targetStaffId && targetStaffId !== staffRow.profile.id) {
        throw new ForbiddenError("Yetkisiz işlem: Başka bir personelin çalışma alanına erişemezsiniz.");
      }

      activeProfile = staffRow.profile;
    } else if (role === "OWNER") {
      if (targetStaffId) {
        const [profile] = await db
          .select()
          .from(staffProfiles)
          .where(and(eq(staffProfiles.businessId, businessId), eq(staffProfiles.id, targetStaffId)))
          .limit(1);
        if (!profile) {
          throw new Error("Personel bulunamadı.");
        }
        activeProfile = profile;
      } else {
        // Find owner's own profile
        const [profile] = await db
          .select({ profile: staffProfiles })
          .from(staffProfiles)
          .innerJoin(businessMembers, eq(staffProfiles.businessMemberId, businessMembers.id))
          .where(
            and(
              eq(businessMembers.businessId, businessId),
              eq(businessMembers.userId, userId),
              eq(staffProfiles.businessId, businessId)
            )
          )
          .limit(1)
          .then((r) => r.map((x) => x.profile));

        if (!profile) {
          throw new Error("Görüntülenecek personel profili belirtilmedi.");
        }
        activeProfile = profile;
      }
    } else if (role === "MANAGER") {
      if (targetStaffId) {
        const [staffRow] = await db
          .select({
            profile: staffProfiles,
            member: businessMembers,
          })
          .from(staffProfiles)
          .innerJoin(businessMembers, eq(staffProfiles.businessMemberId, businessMembers.id))
          .where(and(eq(staffProfiles.businessId, businessId), eq(staffProfiles.id, targetStaffId)))
          .limit(1);

        if (!staffRow) {
          throw new Error("Personel bulunamadı.");
        }
        if (staffRow.member.role === "OWNER") {
          throw new ForbiddenError("İşletme yöneticileri (MANAGER), işletme sahibinin (OWNER) personel profilini yönetemez.");
        }
        activeProfile = staffRow.profile;
      } else {
        const [profile] = await db
          .select({ profile: staffProfiles })
          .from(staffProfiles)
          .innerJoin(businessMembers, eq(staffProfiles.businessMemberId, businessMembers.id))
          .where(
            and(
              eq(businessMembers.businessId, businessId),
              eq(businessMembers.userId, userId),
              eq(staffProfiles.businessId, businessId)
            )
          )
          .limit(1)
          .then((r) => r.map((x) => x.profile));

        if (!profile) {
          throw new Error("Görüntülenecek personel profili belirtilmedi.");
        }
        activeProfile = profile;
      }
    } else {
      throw new ForbiddenError("Yetkisiz rol.");
    }

    // 2. Resolve Business & Timezone
    const business = await getBusinessById(businessId);
    if (!business) {
      throw new Error("İşletme bulunamadı.");
    }
    const timezone = business.timezone || "Europe/Istanbul";
    const localTodayDate = getBusinessLocalToday(timezone, refNow);

    // 3. Resolve Target Date & Current Week Days
    const validTargetDate =
      selectedDate && DATE_REGEX.test(selectedDate.trim())
        ? selectedDate.trim()
        : localTodayDate;

    const weekDays = getBusinessWeekDays(validTargetDate, timezone);
    const weekStart = weekDays[0].bounds.start;
    const weekEnd = weekDays[6].bounds.end;

    const todayBounds = getLocalDayBounds(localTodayDate, timezone);
    const selectedDayBounds = getLocalDayBounds(validTargetDate, timezone);

    // Query interval bounds covering today, selected day, and week
    const queryStart = new Date(
      Math.min(weekStart.getTime(), todayBounds.start.getTime(), selectedDayBounds.start.getTime())
    );
    const queryEnd = new Date(
      Math.max(weekEnd.getTime(), todayBounds.end.getTime(), selectedDayBounds.end.getTime())
    );

    // 4. Fetch Effective Schedule & Assigned Services
    const [scheduleSummary, assignedServicesRows] = await Promise.all([
      getEffectiveStaffScheduleSummary(businessId, activeProfile.id, activeProfile.usesBusinessHours),
      db
        .select({
          id: services.id,
          name: services.name,
          durationMinutes: services.durationMinutes,
          active: services.active,
        })
        .from(staffServices)
        .innerJoin(services, eq(staffServices.serviceId, services.id))
        .where(
          and(
            eq(staffServices.businessId, businessId),
            eq(staffServices.staffId, activeProfile.id),
            eq(services.businessId, businessId),
            eq(services.active, true)
          )
        )
        .orderBy(services.name),
    ]);

    const scheduleByDay = new Map(scheduleSummary.hours.map((h) => [h.dayOfWeek, h]));

    // 5. Query Appointments
    const [appointmentRows, nextApptRows, timeBlockRows] = await Promise.all([
      db
        .select({
          id: appointments.id,
          startTime: appointments.startTime,
          endTime: appointments.endTime,
          status: appointments.status,
          source: appointments.source,
          updatedAt: appointments.updatedAt,
          serviceNameSnapshot: appointments.serviceNameSnapshot,
          serviceDurationSnapshot: appointments.serviceDurationSnapshot,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerPhone: customers.phone,
        })
        .from(appointments)
        .innerJoin(
          customers,
          and(eq(appointments.customerId, customers.id), eq(appointments.businessId, customers.businessId))
        )
        .where(
          and(
            eq(appointments.businessId, businessId),
            eq(appointments.staffId, activeProfile.id),
            gte(appointments.startTime, queryStart),
            lt(appointments.startTime, queryEnd)
          )
        )
        .orderBy(appointments.startTime),

      // Next operational appointment
      db
        .select({
          id: appointments.id,
          startTime: appointments.startTime,
          endTime: appointments.endTime,
          status: appointments.status,
          updatedAt: appointments.updatedAt,
          serviceNameSnapshot: appointments.serviceNameSnapshot,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerPhone: customers.phone,
        })
        .from(appointments)
        .innerJoin(
          customers,
          and(eq(appointments.customerId, customers.id), eq(appointments.businessId, customers.businessId))
        )
        .where(
          and(
            eq(appointments.businessId, businessId),
            eq(appointments.staffId, activeProfile.id),
            inArray(appointments.status, ["PENDING", "CONFIRMED"]),
            gte(appointments.startTime, refNow)
          )
        )
        .orderBy(appointments.startTime)
        .limit(1),

      // Time Blocks
      db
        .select({
          id: timeBlocks.id,
          blockType: timeBlocks.blockType,
          startTime: timeBlocks.startTime,
          endTime: timeBlocks.endTime,
          reason: timeBlocks.reason,
        })
        .from(timeBlocks)
        .where(
          and(
            eq(timeBlocks.businessId, businessId),
            eq(timeBlocks.staffId, activeProfile.id),
            lt(timeBlocks.startTime, queryEnd),
            gt(timeBlocks.endTime, queryStart)
          )
        )
        .orderBy(timeBlocks.startTime),
    ]);

    // 6. Map Appointments (Zero Financial Exposure, Privacy-Scrubbed, Zero Internal Notes)
    const mappedAppointments: StaffWorkspaceAgendaAppointment[] = appointmentRows.map((row) => {
      const startFormatted = formatInstantInBusinessTimezone(row.startTime, timezone);
      const endFormatted = formatInstantInBusinessTimezone(row.endTime, timezone);
      const canOperate = row.status === "PENDING" || row.status === "CONFIRMED";

      return {
        appointmentId: row.id,
        startAt: row.startTime.toISOString(),
        endAt: row.endTime.toISOString(),
        localStartTime: startFormatted.timeStr,
        localEndTime: endFormatted.timeStr,
        localDate: startFormatted.dateStr,
        status: row.status,
        source: row.source,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
        customer: {
          firstName: row.customerFirstName,
          lastName: row.customerLastName,
          phone: row.customerPhone,
        },
        service: {
          name: row.serviceNameSnapshot,
          durationMinutes: row.serviceDurationSnapshot,
        },
        allowedActions: {
          canComplete: canOperate,
          canMarkNoShow: canOperate,
          canCancel: canOperate,
          canReschedule: canOperate,
          canReassign: false, // Strict invariant: staff cannot reassign
        },
      };
    });

    // 7. Map Next Appointment
    let nextAppointment: StaffWorkspaceNextAppointment | null = null;
    if (nextApptRows.length > 0) {
      const nextRow = nextApptRows[0];
      const nextStartFormatted = formatInstantInBusinessTimezone(nextRow.startTime, timezone);
      const nextEndFormatted = formatInstantInBusinessTimezone(nextRow.endTime, timezone);

      nextAppointment = {
        appointmentId: nextRow.id,
        customerName: `${nextRow.customerFirstName} ${nextRow.customerLastName || ""}`.trim(),
        customerPhone: nextRow.customerPhone,
        serviceName: nextRow.serviceNameSnapshot,
        startTime: nextRow.startTime.toISOString(),
        endTime: nextRow.endTime.toISOString(),
        localStartTime: nextStartFormatted.timeStr,
        localEndTime: nextEndFormatted.timeStr,
        localDate: nextStartFormatted.dateStr,
        status: nextRow.status,
        updatedAt: nextRow.updatedAt instanceof Date ? nextRow.updatedAt.toISOString() : new Date(nextRow.updatedAt).toISOString(),
      };
    }

    // 8. Map Time Blocks
    const mappedTimeBlocks: StaffWorkspaceTimeBlock[] = timeBlockRows.map((tb) => {
      const startFormatted = formatInstantInBusinessTimezone(tb.startTime, timezone);
      const endFormatted = formatInstantInBusinessTimezone(tb.endTime, timezone);

      return {
        id: tb.id,
        blockType: tb.blockType,
        startTime: tb.startTime.toISOString(),
        endTime: tb.endTime.toISOString(),
        localStartTime: startFormatted.timeStr,
        localEndTime: endFormatted.timeStr,
        localDate: startFormatted.dateStr,
        reason: tb.reason,
        isPast: tb.endTime.getTime() <= refNow.getTime(),
      };
    });

    // 9. Calculate Operational Pulse
    const todayAppointments = mappedAppointments.filter((a) => a.localDate === localTodayDate);
    const totalAppointmentsToday = todayAppointments.length;
    const remainingAppointmentsToday = todayAppointments.filter(
      (a) =>
        (a.status === "PENDING" || a.status === "CONFIRMED") &&
        new Date(a.startAt).getTime() >= refNow.getTime()
    ).length;
    const completedToday = todayAppointments.filter((a) => a.status === "COMPLETED").length;
    const cancelledToday = todayAppointments.filter((a) => a.status === "CANCELLED").length;
    const noShowToday = todayAppointments.filter((a) => a.status === "NO_SHOW").length;

    // Week Counts
    const weekDateStrings = new Set(weekDays.map((w) => w.dateStr));
    const weekAppointments = mappedAppointments.filter((a) => weekDateStrings.has(a.localDate));
    const weekTotalAppointments = weekAppointments.length;
    const weekCompletedAppointments = weekAppointments.filter((a) => a.status === "COMPLETED").length;

    const pulse: StaffWorkspaceOperationalPulse = {
      todayDate: localTodayDate,
      totalAppointmentsToday,
      remainingAppointmentsToday,
      completedToday,
      cancelledToday,
      noShowToday,
      weekTotalAppointments,
      weekCompletedAppointments,
    };

    // 10. Assemble Selected Day Agenda
    const selectedDaySchedule = scheduleByDay.get(
      weekDays.find((w) => w.dateStr === validTargetDate)?.dayOfWeek ??
        getDay(toZonedTime(parseDateTimeInBusinessTimezone(validTargetDate, "12:00", timezone), timezone))
    );
    const isWorkingSelectedDay = selectedDaySchedule ? selectedDaySchedule.isWorking : false;
    const workingHoursSelectedDay =
      selectedDaySchedule && selectedDaySchedule.isWorking && selectedDaySchedule.startTime && selectedDaySchedule.endTime
        ? { startTime: selectedDaySchedule.startTime, endTime: selectedDaySchedule.endTime }
        : null;

    const selectedDayAppointments = mappedAppointments.filter((a) => a.localDate === validTargetDate);
    const selectedDayTimeBlocks = mappedTimeBlocks.filter((tb) => tb.localDate === validTargetDate);

    const selectedDayAgenda: StaffWorkspaceDayAgenda = {
      dateStr: validTargetDate,
      dayOfWeek:
        selectedDaySchedule?.dayOfWeek ??
        getDay(toZonedTime(parseDateTimeInBusinessTimezone(validTargetDate, "12:00", timezone), timezone)),
      dayName:
        weekDays.find((w) => w.dateStr === validTargetDate)?.dayName ||
        new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(
          parseDateTimeInBusinessTimezone(validTargetDate, "12:00", timezone)
        ),
      isWorkingDay: isWorkingSelectedDay,
      workingHours: workingHoursSelectedDay,
      appointments: selectedDayAppointments,
      timeBlocks: selectedDayTimeBlocks,
      totalAppointments: selectedDayAppointments.length,
      completedAppointments: selectedDayAppointments.filter((a) => a.status === "COMPLETED").length,
    };

    // 11. Assemble Current Week Agenda (7 days Monday to Sunday)
    const currentWeekAgenda: StaffWorkspaceDayAgenda[] = weekDays.map((day) => {
      const daySchedule = scheduleByDay.get(day.dayOfWeek);
      const isWorkingDay = daySchedule ? daySchedule.isWorking : false;
      const workingHours =
        daySchedule && daySchedule.isWorking && daySchedule.startTime && daySchedule.endTime
          ? { startTime: daySchedule.startTime, endTime: daySchedule.endTime }
          : null;

      const dayAppts = mappedAppointments.filter((a) => a.localDate === day.dateStr);
      const dayTimeBlocks = mappedTimeBlocks.filter((tb) => tb.localDate === day.dateStr);

      return {
        dateStr: day.dateStr,
        dayOfWeek: day.dayOfWeek,
        dayName: day.dayName,
        isWorkingDay,
        workingHours,
        appointments: dayAppts,
        timeBlocks: dayTimeBlocks,
        totalAppointments: dayAppts.length,
        completedAppointments: dayAppts.filter((a) => a.status === "COMPLETED").length,
      };
    });

    // 12. Profile & Business Summaries
    const profile: StaffWorkspaceProfile = {
      staffId: activeProfile.id,
      firstName: activeProfile.firstName,
      lastName: activeProfile.lastName,
      title: null,
      photoUrl: activeProfile.profileImageUrl,
      isPublicBookingEnabled: activeProfile.publicBookingEnabled,
      isActive: activeProfile.active,
    };

    const businessSummary: StaffWorkspaceBusiness = {
      businessId: business.id,
      businessName: business.name,
      timezone,
      localTodayDate,
    };

    const assignedServices: StaffWorkspaceAssignedService[] = assignedServicesRows.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      active: s.active,
    }));

    return {
      profile,
      business: businessSummary,
      pulse,
      nextAppointment,
      selectedDayAgenda,
      currentWeekAgenda,
      assignedServices,
      personalTimeBlocks: mappedTimeBlocks,
    };
  }
}
