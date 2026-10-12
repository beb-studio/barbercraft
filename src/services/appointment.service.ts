import { AppointmentRepository } from "../repositories/appointment.repository";
import { getAvailabilityInputs, getEffectiveScheduleForDay, getOverlappingConflicts } from "../repositories/availability.repository";
import { getStaffAvailability } from "./availability.service";
import { formatInstantInBusinessTimezone, parseDateTimeInBusinessTimezone, getLocalDayBounds } from "../lib/timezone";
import { toZonedTime } from "date-fns-tz";
import { getDay } from "date-fns";
import { sql } from "drizzle-orm";
import { resolveCanonicalCustomer } from "@/services/customer-resolution.service";
import { AppointmentAccessService } from "@/services/appointment-access.service";
import { NotificationOutboxService } from "@/services/notification-outbox.service";
import {
  canTransitionAppointmentStatus,
  isOperationalAppointmentStatus,
} from "@/lib/appointment-lifecycle";
import type { AppointmentStatus } from "@/db/schema/appointments";

export interface CreateAppointmentInput {
  businessId: string;
  staffId: string;
  serviceId: string;
  startAt: string; // ISO string
  customer?: {
    firstName: string;
    lastName?: string;
    phone: string;
    notes?: string;
  };
  customerId?: string;
  notes?: string;
  context?: "PUBLIC" | "INTERNAL";
  source?: "PUBLIC_WEB" | "MANUAL_ADMIN" | "MANUAL_STAFF";
  issueManagementAccess?: boolean;
}

export interface CreateAnyStaffAppointmentInput {
  businessId: string;
  candidateStaffIds: string[];
  serviceId: string;
  startAt: string; // ISO string
  customer?: {
    firstName: string;
    lastName?: string;
    phone: string;
    notes?: string;
  };
  customerId?: string;
  notes?: string;
  context?: "PUBLIC" | "INTERNAL";
  source?: "PUBLIC_WEB" | "MANUAL_ADMIN" | "MANUAL_STAFF";
  issueManagementAccess?: boolean;
}

export const AppointmentService = {
  async createAnyStaffAppointment(input: CreateAnyStaffAppointmentInput) {
    if (input.candidateStaffIds.length === 0) {
      throw new Error("No candidate staff provided");
    }

    return AppointmentRepository.transaction(async (tx) => {
      // 1. Lock all candidate staff profiles deterministically to prevent deadlocks
      await AppointmentRepository.lockStaffProfilesForUpdate(tx, input.businessId, input.candidateStaffIds);

      const requestedStartDate = new Date(input.startAt);
      if (isNaN(requestedStartDate.getTime())) {
        throw new Error("Invalid start time");
      }

      // Check service and business existence via first candidate
      const firstInputs = await getAvailabilityInputs(input.businessId, input.candidateStaffIds[0], input.serviceId, tx);
      if (!firstInputs) {
        throw new Error("Invalid request: business or service not found");
      }

      const { dateStr: localDate } = formatInstantInBusinessTimezone(requestedStartDate, firstInputs.business.timezone);
      const context = input.context || "PUBLIC";

      // Revalidate availability for each locked candidate
      const validStaffIds: string[] = [];
      let validSlot: { startAt: string; endAt: string } | null = null;
      let finalInputs: Awaited<ReturnType<typeof getAvailabilityInputs>> | null = null;

      for (const staffId of input.candidateStaffIds) {
        const inputs = await getAvailabilityInputs(input.businessId, staffId, input.serviceId, tx);
        if (!inputs || !inputs.staffProfile.active || !inputs.service.active || !inputs.isAssigned) {
          continue;
        }
        if (context === "PUBLIC" && !inputs.staffProfile.publicBookingEnabled) {
          continue;
        }

        const availability = await getStaffAvailability({
          businessId: input.businessId,
          staffId,
          serviceId: input.serviceId,
          localDate,
          context,
          executor: tx,
        });

        if (availability.reason === "STAFF_NOT_BOOKABLE" || availability.reason === "CLOSED") {
          continue;
        }

        const slot = availability.slots.find(s => new Date(s.startAt).getTime() === requestedStartDate.getTime());
        if (slot) {
          validStaffIds.push(staffId);
          if (!validSlot) {
            validSlot = slot;
            finalInputs = inputs;
          }
        }
      }

      if (validStaffIds.length === 0 || !validSlot || !finalInputs) {
        throw new Error("Time slot not available (staff closed or not bookable)");
      }

      // 3. Determine least loaded staff among available candidates
      const { start: localDayStartUtc, end: nextLocalDayStartUtc } = getLocalDayBounds(localDate, firstInputs.business.timezone);
      const workloads = await AppointmentRepository.getDailyWorkloads(tx, input.businessId, validStaffIds, localDayStartUtc, nextLocalDayStartUtc);
      
      validStaffIds.sort(); // tie-break by ascending UUID
      let selectedStaffId = validStaffIds[0];
      let minWorkload = workloads[selectedStaffId] ?? 0;

      for (const staffId of validStaffIds) {
        const wl = workloads[staffId] ?? 0;
        if (wl < minWorkload) {
          minWorkload = wl;
          selectedStaffId = staffId;
        }
      }

      // 4. Create appointment
      let resolvedCustomerId: string;
      if (input.customerId) {
        const existing = await resolveCanonicalCustomer(
          tx,
          input.businessId,
          input.customerId,
          { lock: true }
        );

        if (!existing) {
          throw new Error("Customer not found or does not belong to the business");
        }
        resolvedCustomerId = existing.id;
      } else if (input.customer) {
        const customer = await AppointmentRepository.upsertCustomer(tx, input.businessId, input.customer);
        resolvedCustomerId = customer.id;
      } else {
        throw new Error("Either customerId or customer details must be provided");
      }

      const appointment = await AppointmentRepository.createAppointmentRecord(tx, {
        businessId: input.businessId,
        customerId: resolvedCustomerId,
        staffId: selectedStaffId,
        serviceId: input.serviceId,
        startTime: new Date(validSlot.startAt),
        endTime: new Date(validSlot.endAt),
        status: "CONFIRMED",
        source: input.source || "PUBLIC_WEB",
        serviceNameSnapshot: finalInputs.service.name,
        serviceDurationSnapshot: finalInputs.service.durationMinutes,
        servicePriceSnapshot: finalInputs.service.price,
        notes: input.notes || input.customer?.notes || null,
      });

      await NotificationOutboxService.emitAppointmentCreated(tx, {
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        startAt: appointment.startTime,
        endAt: appointment.endTime,
        status: appointment.status,
      });

      const managementAccess = input.issueManagementAccess
        ? await AppointmentAccessService.issue(
            { businessId: input.businessId, appointmentId: appointment.id },
            tx
          )
        : null;

      return {
        appointment,
        assignedStaffId: selectedStaffId,
        managementToken: managementAccess?.rawToken,
      };
    });
  },

  async createAppointment(input: CreateAppointmentInput) {
    return AppointmentRepository.transaction(async (tx) => {
      // 1. Lock the staff profile for the duration of the transaction
      await AppointmentRepository.lockStaffProfileForUpdate(tx, input.businessId, input.staffId);

      // 2. Fetch authoritative configuration for validation
      const inputs = await getAvailabilityInputs(input.businessId, input.staffId, input.serviceId, tx);
      if (!inputs) {
        throw new Error("Invalid request: business, staff, or service not found");
      }

      // Check basic business rules (some are handled by getStaffAvailability but we need the inputs for DB storage)
      if (!inputs.staffProfile.active) {
        throw new Error("Staff is not bookable");
      }
      const context = input.context || "PUBLIC";
      if (context === "PUBLIC" && !inputs.staffProfile.publicBookingEnabled) {
        throw new Error("Staff is not bookable");
      }
      if (!inputs.service.active || !inputs.isAssigned) {
        throw new Error("Service is not bookable or not assigned to staff");
      }

      // 3. Determine local date of the requested start time in the business's timezone
      const requestedStartDate = new Date(input.startAt);
      if (isNaN(requestedStartDate.getTime())) {
        throw new Error("Invalid start time");
      }
      const { dateStr: localDate } = formatInstantInBusinessTimezone(requestedStartDate, inputs.business.timezone);

      // 4. Generate valid availability slots for that day inside the transaction
      const availability = await getStaffAvailability({
        businessId: input.businessId,
        staffId: input.staffId,
        serviceId: input.serviceId,
        localDate,
        context,
        executor: tx,
      });

      if (availability.reason === "STAFF_NOT_BOOKABLE" || availability.reason === "CLOSED") {
        throw new Error("Time slot not available (staff closed or not bookable)");
      }

      // 5. Verify the requested slot matches one of the generated valid slots exactly
      const validSlot = availability.slots.find(slot => new Date(slot.startAt).getTime() === requestedStartDate.getTime());

      if (!validSlot) {
        throw new Error("Time slot not available or overlaps with another booking");
      }

      // 6. Proceed to write operations
      let resolvedCustomerId: string;
      if (input.customerId) {
        const existing = await resolveCanonicalCustomer(
          tx,
          input.businessId,
          input.customerId,
          { lock: true }
        );

        if (!existing) {
          throw new Error("Customer not found or does not belong to the business");
        }
        resolvedCustomerId = existing.id;
      } else if (input.customer) {
        const customer = await AppointmentRepository.upsertCustomer(tx, input.businessId, input.customer);
        resolvedCustomerId = customer.id;
      } else {
        throw new Error("Either customerId or customer details must be provided");
      }

      const appointment = await AppointmentRepository.createAppointmentRecord(tx, {
        businessId: input.businessId,
        customerId: resolvedCustomerId,
        staffId: input.staffId,
        serviceId: input.serviceId,
        startTime: new Date(validSlot.startAt),
        endTime: new Date(validSlot.endAt),
        status: "CONFIRMED",
        source: input.source || "PUBLIC_WEB",
        serviceNameSnapshot: inputs.service.name,
        serviceDurationSnapshot: inputs.service.durationMinutes,
        servicePriceSnapshot: inputs.service.price,
        notes: input.notes || input.customer?.notes || null,
      });

      await NotificationOutboxService.emitAppointmentCreated(tx, {
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        startAt: appointment.startTime,
        endAt: appointment.endTime,
        status: appointment.status,
      });

      const managementAccess = input.issueManagementAccess
        ? await AppointmentAccessService.issue(
            { businessId: input.businessId, appointmentId: appointment.id },
            tx
          )
        : null;

      return {
        ...appointment,
        managementToken: managementAccess?.rawToken,
      };
    });
  },

  async updateAppointmentStatus(
    businessId: string,
    appointmentId: string,
    targetStatus: "COMPLETED" | "NO_SHOW" | "CANCELLED",
    userRole: string,
    userId: string
  ) {
    return AppointmentRepository.transaction(async (tx) => {
      // 1. Fetch appointment safely
      const initialAppRes = await tx.execute(
        sql`SELECT staff_id, start_time, status FROM appointments WHERE id = ${appointmentId} AND business_id = ${businessId}`
      );
      const initialApp = initialAppRes.rows[0];

      if (!initialApp) {
        throw new Error("NOT_FOUND: Appointment not found");
      }

      const staffId = initialApp.staff_id as string;

      // Check STAFF role authorization
      if (userRole === "STAFF") {
        const staffProfileRes = await tx.execute(
          sql`
            SELECT sp.id 
            FROM staff_profiles sp
            JOIN business_members bm ON sp.business_member_id = bm.id
            WHERE bm.user_id = ${userId} AND bm.business_id = ${businessId}
          `
        );
        const staffProfile = staffProfileRes.rows[0];
        if (!staffProfile || staffProfile.id !== staffId) {
          throw new Error("FORBIDDEN: You cannot mutate another staff member's appointment");
        }
      } else if (userRole !== "OWNER" && userRole !== "ADMIN") {
        throw new Error("FORBIDDEN: Unauthorized role");
      }

      // 2. Lock staff_profile to serialize with other time blocks / booking
      await AppointmentRepository.lockStaffProfileForUpdate(tx, businessId, staffId);

      // 3. Lock appointment and re-read
      const appRes = await tx.execute(
        sql`SELECT id, status, start_time, end_time FROM appointments WHERE id = ${appointmentId} AND business_id = ${businessId} FOR UPDATE`
      );
      const app = appRes.rows[0];

      if (!app) {
        throw new Error("NOT_FOUND: Appointment disappeared");
      }

      const currentStatus = app.status as AppointmentStatus;

      // 4. Validate transition rules
      if (!canTransitionAppointmentStatus(currentStatus, targetStatus)) {
        throw new Error(`INVALID_TRANSITION: Cannot transition from ${currentStatus} to ${targetStatus}`);
      }

      // 5. Validate temporal rules
      const startTime = app.start_time instanceof Date 
        ? app.start_time 
        : new Date(app.start_time as string);
      const now = new Date();

      if ((targetStatus === "COMPLETED" || targetStatus === "NO_SHOW") && startTime.getTime() > now.getTime()) {
        throw new Error("TOO_EARLY: Cannot mark as completed or no-show before the appointment starts");
      }

      // 6. Execute update
      await tx.execute(
        sql`UPDATE appointments SET status = ${targetStatus}, updated_at = NOW() WHERE id = ${appointmentId}`
      );

      if (targetStatus === "CANCELLED") {
        const endTime = app.end_time instanceof Date
          ? app.end_time
          : new Date(app.end_time as string);
        await NotificationOutboxService.emitAppointmentCancelled(tx, {
          businessId,
          appointmentId,
          startAt: startTime,
          endAt: endTime,
          previousStatus: currentStatus,
        });
      }

      return { success: true };
    });
  },

  async rescheduleAppointment(input: {
    businessId: string;
    appointmentId: string;
    newStartAt: string; // ISO String
    expectedUpdatedAt: string; // ISO String, from client to prevent stale overwrite
    userId: string;
    userRole: string;
  }) {
    return AppointmentRepository.transaction(async (tx) => {
      // 1. Fetch initial appointment without lock to check RBAC
      const initialAppRes = await tx.execute(
        sql`SELECT staff_id, status, start_time, updated_at FROM appointments WHERE id = ${input.appointmentId} AND business_id = ${input.businessId}`
      );
      const initialApp = initialAppRes.rows[0];

      if (!initialApp) {
        throw new Error("NOT_FOUND: Appointment not found");
      }

      const staffId = initialApp.staff_id as string;
      
      const dbUpdatedAt = initialApp.updated_at instanceof Date 
        ? initialApp.updated_at 
        : new Date(initialApp.updated_at as string);

      // Verify STALE UI
      if (new Date(input.expectedUpdatedAt).getTime() !== dbUpdatedAt.getTime()) {
         throw new Error("STALE_APPOINTMENT: Appointment has been modified by another user");
      }

      // Check RBAC
      if (input.userRole === "STAFF") {
        const staffProfileRes = await tx.execute(
          sql`
            SELECT sp.id 
            FROM staff_profiles sp 
            JOIN business_members bm ON sp.business_member_id = bm.id 
            WHERE bm.user_id = ${input.userId} AND bm.business_id = ${input.businessId}
          `
        );
        const sp = staffProfileRes.rows[0];
        if (!sp || sp.id !== staffId) {
          throw new Error("FORBIDDEN: You cannot mutate another staff member's appointment");
        }
      } else if (input.userRole !== "OWNER" && input.userRole !== "ADMIN") {
        throw new Error("FORBIDDEN: Unauthorized role");
      }

      // Pre-validation: Must be PENDING or CONFIRMED
      if (!isOperationalAppointmentStatus(initialApp.status as AppointmentStatus)) {
         throw new Error("NOT_RESCHEDULABLE: Only PENDING or CONFIRMED appointments can be rescheduled");
      }

      // Pre-validation: Must be in the future
      const initialStartTime = initialApp.start_time instanceof Date 
        ? initialApp.start_time 
        : new Date(initialApp.start_time as string);
      if (initialStartTime.getTime() <= new Date().getTime()) {
         throw new Error("TOO_LATE: Cannot reschedule an appointment that is already in the past or currently happening");
      }
      
      // 2. Lock staff_profile (MUST be first)
      await AppointmentRepository.lockStaffProfileForUpdate(tx, input.businessId, staffId);

      // 3. Lock appointment for update
      const appRes = await tx.execute(
        sql`SELECT id, status, start_time, end_time, updated_at,
          updated_at::text AS event_version, service_id, service_duration_snapshot
          FROM appointments
          WHERE id = ${input.appointmentId} AND business_id = ${input.businessId}
          FOR UPDATE`
      );
      const app = appRes.rows[0];
      if (!app) {
        throw new Error("NOT_FOUND: Appointment disappeared");
      }

      const lockedUpdatedAt = app.updated_at instanceof Date 
        ? app.updated_at 
        : new Date(app.updated_at as string);

      // Check STALE again inside lock just in case it was updated during our lock wait
      if (new Date(input.expectedUpdatedAt).getTime() !== lockedUpdatedAt.getTime()) {
         throw new Error("STALE_APPOINTMENT: Appointment has been modified by another user");
      }

      // Validate status / time again inside lock
      if (!isOperationalAppointmentStatus(app.status as AppointmentStatus)) {
         throw new Error("NOT_RESCHEDULABLE: Only PENDING or CONFIRMED appointments can be rescheduled");
      }
      
      const lockedStartTime = app.start_time instanceof Date 
        ? app.start_time 
        : new Date(app.start_time as string);
      if (lockedStartTime.getTime() <= new Date().getTime()) {
         throw new Error("TOO_LATE: Cannot reschedule an appointment that is already in the past or currently happening");
      }

      const serviceId = app.service_id as string;
      const durationMinutes = app.service_duration_snapshot as number;

      // 4. Calculate timezone/date for the new slot
      const inputs = await getAvailabilityInputs(input.businessId, staffId, serviceId, tx);
      if (!inputs) {
        throw new Error("Invalid request: business, staff, or service not found");
      }

      const newRequestedStartDate = new Date(input.newStartAt);
      if (isNaN(newRequestedStartDate.getTime())) {
        throw new Error("Invalid start time");
      }
      if (newRequestedStartDate.getTime() === lockedStartTime.getTime()) {
        return { success: true, reason: "NO_CHANGE" as const };
      }

      const { dateStr: localDate } = formatInstantInBusinessTimezone(newRequestedStartDate, inputs.business.timezone);

      // 5. Check Availability (excluding this appointment)
      const availability = await getStaffAvailability({
        businessId: input.businessId,
        staffId,
        serviceId,
        localDate,
        executor: tx,
        excludeAppointmentId: input.appointmentId,
        serviceDurationMinutes: durationMinutes,
        context: "INTERNAL",
      });

      if (availability.reason === "STAFF_NOT_BOOKABLE" || availability.reason === "CLOSED") {
        throw new Error("Time slot not available (staff closed or not bookable)");
      }

      // 6. Ensure slot exists exactly (avoids overriding other checks, relies on engine)
      const validSlot = availability.slots.find(slot => new Date(slot.startAt).getTime() === newRequestedStartDate.getTime());
      if (!validSlot) {
        throw new Error("Time slot not available or overlaps with another booking");
      }

      // 7. Calculate new end time using SNAPSHOT duration
      const newEndAt = new Date(newRequestedStartDate.getTime() + durationMinutes * 60000);

      // 8. Update appointment
      await tx.execute(
        sql`UPDATE appointments SET start_time = ${newRequestedStartDate}, end_time = ${newEndAt}, updated_at = NOW() WHERE id = ${input.appointmentId}`
      );

      const oldEndTime = app.end_time instanceof Date
        ? app.end_time
        : new Date(app.end_time as string);
      await NotificationOutboxService.emitAppointmentRescheduled(tx, {
        businessId: input.businessId,
        appointmentId: input.appointmentId,
        previousVersion: app.event_version as string,
        oldStartAt: lockedStartTime,
        oldEndAt: oldEndTime,
        newStartAt: newRequestedStartDate,
        newEndAt,
        status: app.status as AppointmentStatus,
      });

      await AppointmentAccessService.refreshExpirationAfterReschedule(tx, {
        businessId: input.businessId,
        appointmentId: input.appointmentId,
        appointmentEndTime: newEndAt,
      });

      return { success: true };
    });
  },

  async reassignAppointment(
    businessId: string,
    appointmentId: string,
    targetStaffId: string,
    expectedUpdatedAt: string,
    userRole: string,
    _userId: string
  ) {
    return AppointmentRepository.transaction(async (tx) => {
      // 1. Initial lookup to get current staff ID
      const initialAppRes = await tx.execute(
        sql`SELECT staff_id FROM appointments WHERE id = ${appointmentId} AND business_id = ${businessId}`
      );
      const initialApp = initialAppRes.rows[0];
      if (!initialApp) {
        throw new Error("NOT_FOUND: Appointment not found");
      }
      
      const currentStaffId = initialApp.staff_id as string;

      if (userRole === "STAFF") {
        throw new Error("FORBIDDEN: Staff cannot reassign appointments");
      } else if (userRole !== "OWNER" && userRole !== "ADMIN") {
        throw new Error("FORBIDDEN: Unauthorized role");
      }

      if (currentStaffId === targetStaffId) {
        return { success: true, reason: "NO_CHANGE" };
      }

      // 2. Lock both staff profiles deterministically
      await AppointmentRepository.lockStaffProfilesForUpdate(tx, businessId, [currentStaffId, targetStaffId]);

      // 3. Lock appointment for update
      const appRes = await tx.execute(
        sql`SELECT * FROM appointments WHERE id = ${appointmentId} AND business_id = ${businessId} FOR UPDATE`
      );
      const app = appRes.rows[0];
      if (!app) {
        throw new Error("NOT_FOUND: Appointment disappeared");
      }

      const lockedUpdatedAt = app.updated_at instanceof Date 
        ? app.updated_at 
        : new Date(app.updated_at as string);

      if (new Date(expectedUpdatedAt).getTime() !== lockedUpdatedAt.getTime()) {
        throw new Error("STALE_APPOINTMENT: Appointment has been modified by another user");
      }
      
      if (app.staff_id !== currentStaffId) {
        throw new Error("STALE_APPOINTMENT: Staff changed concurrently");
      }

      const status = app.status as AppointmentStatus;
      if (!isOperationalAppointmentStatus(status)) {
        throw new Error("NOT_REASSIGNABLE: Only PENDING or CONFIRMED appointments can be reassigned");
      }

      const startAt = app.start_time instanceof Date 
        ? app.start_time 
        : new Date(app.start_time as string);
      const endAt = app.end_time instanceof Date 
        ? app.end_time 
        : new Date(app.end_time as string);

      if (startAt.getTime() <= new Date().getTime()) {
        throw new Error("TOO_LATE: Cannot reassign an appointment that is already in the past or currently happening");
      }

      // 4. Validate target staff eligibility
      const serviceId = app.service_id as string;
      const targetInputs = await getAvailabilityInputs(businessId, targetStaffId, serviceId, tx);
      
      if (!targetInputs) {
        throw new Error("TARGET_STAFF_NOT_ELIGIBLE: Target staff or service not found");
      }
      if (!targetInputs.member.active || !targetInputs.staffProfile.active || !targetInputs.isAssigned) {
        throw new Error("TARGET_STAFF_NOT_ELIGIBLE: Target staff is not active or does not provide this service");
      }
      // Note: we do NOT check inputs.service.active (service might be deactivated but we preserve history)
      // Note: we do NOT check targetInputs.staffProfile.publicBookingEnabled (internal management)

      // 5. Validate schedule for exact slot
      const { dateStr: localDate } = formatInstantInBusinessTimezone(startAt, targetInputs.business.timezone);
      const startOfDayInstant = parseDateTimeInBusinessTimezone(localDate, "00:00", targetInputs.business.timezone);
      const zonedDate = toZonedTime(startOfDayInstant, targetInputs.business.timezone);
      const dayOfWeek = getDay(zonedDate);

      const schedule = await getEffectiveScheduleForDay(
        businessId,
        targetStaffId,
        targetInputs.staffProfile.usesBusinessHours,
        dayOfWeek,
        tx
      );

      if (!schedule) {
        throw new Error("TARGET_STAFF_UNAVAILABLE: Target staff is closed on this day");
      }

      const workingStartInstant = parseDateTimeInBusinessTimezone(localDate, schedule.startTime, targetInputs.business.timezone);
      const workingEndInstant = parseDateTimeInBusinessTimezone(localDate, schedule.endTime, targetInputs.business.timezone);

      if (startAt.getTime() < workingStartInstant.getTime() || endAt.getTime() > workingEndInstant.getTime()) {
        throw new Error("TARGET_STAFF_UNAVAILABLE: Appointment is outside target staff's working hours");
      }

      // Check booking interval grid
      const { timeStr: localStartTime } = formatInstantInBusinessTimezone(startAt, targetInputs.business.timezone);
      const [appHour, appMin] = localStartTime.split(':').map(Number);
      const appMinutes = appHour * 60 + appMin;
      const [startHour, startMin] = schedule.startTime.split(':').map(Number);
      const scheduleStartMinutes = startHour * 60 + startMin;
      
      if ((appMinutes - scheduleStartMinutes) % targetInputs.business.bookingIntervalMinutes !== 0) {
        throw new Error("TARGET_STAFF_UNAVAILABLE: Appointment time does not align with target staff's booking grid");
      }

      // 6. Check conflicts
      const conflicts = await getOverlappingConflicts(
        businessId,
        targetStaffId,
        startAt,
        endAt,
        appointmentId, // exclude current appointment just in case (though it currently belongs to currentStaffId)
        tx
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

      if (hasConflict) {
        throw new Error("TARGET_STAFF_UNAVAILABLE: Target staff has a conflicting appointment or time block");
      }

      // 7. Update appointment
      await tx.execute(
        sql`UPDATE appointments SET staff_id = ${targetStaffId}, updated_at = NOW() WHERE id = ${appointmentId}`
      );

      return { success: true };
    });
  }
};
