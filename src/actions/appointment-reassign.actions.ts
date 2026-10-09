"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { AppointmentService } from "@/services/appointment.service";
import { db } from "@/db";
import { appointments, staffProfiles, staffServices } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAvailabilityInputs, getEffectiveScheduleForDay, getOverlappingConflicts } from "@/repositories/availability.repository";
import { formatInstantInBusinessTimezone, parseDateTimeInBusinessTimezone } from "@/lib/timezone";
import { toZonedTime } from "date-fns-tz";
import { getDay } from "date-fns";

export async function reassignAppointmentAction(
  appointmentId: string,
  targetStaffId: string,
  expectedUpdatedAt: string
) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Oturum süresi dolmuş." };

    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership?.business_id) return { success: false, error: "İşletme bulunamadı." };

    const result = await AppointmentService.reassignAppointment(
      membership.business_id,
      appointmentId,
      targetStaffId,
      expectedUpdatedAt,
      membership.role,
      user.id
    );

    if (result && result.reason === "NO_CHANGE") {
      return { success: true, noChange: true };
    }

    revalidatePath("/dashboard/appointments");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NOT_FOUND")) return { success: false, error: "Randevu bulunamadı veya daha önce silinmiş." };
    if (msg.includes("FORBIDDEN")) return { success: false, error: "Yetkisiz işlem." };
    if (msg.includes("STALE_APPOINTMENT")) return { success: false, error: "Bu randevu başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyin." };
    if (msg.includes("NOT_REASSIGNABLE")) return { success: false, error: "Sadece beklemede olan veya onaylanmış randevular yeniden atanabilir." };
    if (msg.includes("TOO_LATE")) return { success: false, error: "Geçmişteki bir randevu yeniden atanamaz." };
    if (msg.includes("TARGET_STAFF_UNAVAILABLE")) return { success: false, error: "Hedef personel seçilen saatte müsait değil." };
    if (msg.includes("TARGET_STAFF_NOT_ELIGIBLE")) return { success: false, error: "Hedef personel bu işlem için uygun değil." };
    
    return { success: false, error: "İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin." };
  }
}

export async function getEligibleTargetStaffAction(appointmentId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Oturum süresi dolmuş." };

    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership?.business_id) return { success: false, error: "İşletme bulunamadı." };

    const businessId = membership.business_id;

    // Fetch appointment
    const appt = await db.select()
      .from(appointments)
      .where(and(
        eq(appointments.id, appointmentId),
        eq(appointments.businessId, businessId)
      ))
      .limit(1)
      .then(r => r[0]);

    if (!appt) return { success: false, error: "Randevu bulunamadı." };

    const startAt = appt.startTime;
    const endAt = appt.endTime;
    const currentStaffId = appt.staffId;
    const serviceId = appt.serviceId;

    if (startAt.getTime() <= Date.now()) {
      return { success: false, error: "Geçmiş bir randevu yeniden atanamaz." };
    }

    // 1. Fetch all active staff with service mapping
    const candidateStaff = await db.select({
      id: staffProfiles.id,
      firstName: staffProfiles.firstName,
      lastName: staffProfiles.lastName,
    })
    .from(staffProfiles)
    .innerJoin(staffServices, eq(staffProfiles.id, staffServices.staffId))
    .where(and(
      eq(staffProfiles.businessId, businessId),
      eq(staffProfiles.active, true),
      eq(staffServices.serviceId, serviceId)
    ));

    const eligibleStaff: { id: string; name: string }[] = [];

    // Filter out current staff immediately
    const others = candidateStaff.filter(s => s.id !== currentStaffId);

    // Concurrently validate remaining candidates
    await Promise.all(others.map(async (staff) => {
      try {
        const targetInputs = await getAvailabilityInputs(businessId, staff.id, serviceId);
        if (!targetInputs || !targetInputs.member.active) return; // Must have active membership

        const { dateStr: localDate } = formatInstantInBusinessTimezone(startAt, targetInputs.business.timezone);
        const startOfDayInstant = parseDateTimeInBusinessTimezone(localDate, "00:00", targetInputs.business.timezone);
        const zonedDate = toZonedTime(startOfDayInstant, targetInputs.business.timezone);
        const dayOfWeek = getDay(zonedDate);

        const schedule = await getEffectiveScheduleForDay(
          businessId,
          staff.id,
          targetInputs.staffProfile.usesBusinessHours,
          dayOfWeek
        );

        if (!schedule) return;

        const workingStartInstant = parseDateTimeInBusinessTimezone(localDate, schedule.startTime, targetInputs.business.timezone);
        const workingEndInstant = parseDateTimeInBusinessTimezone(localDate, schedule.endTime, targetInputs.business.timezone);

        if (startAt.getTime() < workingStartInstant.getTime() || endAt.getTime() > workingEndInstant.getTime()) {
          return;
        }

        const { timeStr: localStartTime } = formatInstantInBusinessTimezone(startAt, targetInputs.business.timezone);
        const [appHour, appMin] = localStartTime.split(':').map(Number);
        const appMinutes = appHour * 60 + appMin;
        const [startHour, startMin] = schedule.startTime.split(':').map(Number);
        const scheduleStartMinutes = startHour * 60 + startMin;
        
        if ((appMinutes - scheduleStartMinutes) % targetInputs.business.bookingIntervalMinutes !== 0) {
          return;
        }

        const conflicts = await getOverlappingConflicts(
          businessId,
          staff.id,
          startAt,
          endAt,
          appointmentId
        );

        let hasConflict = false;
        for (const block of conflicts.blocks) {
          if (startAt.getTime() < block.endTime.getTime() && endAt.getTime() > block.startTime.getTime()) {
            hasConflict = true;
            break;
          }
        }
        if (!hasConflict) {
          for (const targetApp of conflicts.appointments) {
            if (startAt.getTime() < targetApp.endTime.getTime() && endAt.getTime() > targetApp.startTime.getTime()) {
              hasConflict = true;
              break;
            }
          }
        }

        if (!hasConflict) {
          eligibleStaff.push({
            id: staff.id,
            name: `${staff.firstName} ${staff.lastName}`
          });
        }
      } catch {
        // Just ignore errors for a candidate and exclude them
      }
    }));

    // Sort alphabetically by name
    eligibleStaff.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    return { success: true, data: eligibleStaff };
  } catch {
    return { success: false, error: "Uygun personeller alınamadı." };
  }
}
