import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { db, type DbExecutor } from "@/db";
import type { AppointmentStatus } from "@/db/schema/appointments";
import {
  DATE_REGEX,
  formatInstantInBusinessTimezone,
  getBusinessLocalToday,
} from "@/lib/timezone";
import {
  canPubliclyCancelAppointment,
  canPubliclyRescheduleAppointment,
} from "@/lib/appointment-lifecycle";
import {
  getBusinessBookingPolicy,
  getMaximumPublicBookingLocalDate,
} from "@/lib/business-booking-policy";
import { AppointmentAccessRepository } from "@/repositories/appointment-access.repository";
import {
  getStaffAvailability,
  isStaffPublicSchedulingEligible,
} from "@/services/availability.service";

export const APPOINTMENT_ACCESS_POST_APPOINTMENT_GRACE_MS =
  24 * 60 * 60 * 1000;

const RAW_TOKEN_BYTES = 32;
const RAW_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_INSERT_ATTEMPTS = 3;

export interface AppointmentManagementView {
  businessName: string;
  serviceName: string;
  staffDisplayName: string;
  dateLabel: string;
  localStartTime: string;
  localEndTime: string;
  durationMinutes: number;
  price: string;
  currency: string;
  status: AppointmentStatus;
  localDate: string;
  businessLocalToday: string;
  canCancel: boolean;
  canReschedule: boolean;
  cancellationWindowClosed: boolean;
  rescheduleWindowClosed: boolean;
  maximumRescheduleLocalDate: string | null;
}

export interface AppointmentRescheduleSlot {
  startAt: string;
  localStartTime: string;
  localEndTime: string;
}

export type AppointmentCancellationResult =
  | {
      outcome: "CANCELLED";
      changed: boolean;
      appointment: AppointmentManagementView;
    }
  | {
      outcome: "NOT_CANCELLABLE";
      appointment: AppointmentManagementView;
    }
  | { outcome: "INVALID_CAPABILITY" };

export type AppointmentRescheduleAvailabilityResult =
  | {
      outcome: "AVAILABLE";
      appointment: AppointmentManagementView;
      localDate: string;
      slots: AppointmentRescheduleSlot[];
      reason?: "CLOSED" | "NO_AVAILABLE_SLOTS";
    }
  | {
      outcome: "NOT_RESCHEDULABLE" | "ONLINE_UNAVAILABLE";
      appointment: AppointmentManagementView;
    }
  | { outcome: "INVALID_DATE" }
  | { outcome: "INVALID_CAPABILITY" };

export type AppointmentRescheduleResult =
  | {
      outcome: "RESCHEDULED";
      appointment: AppointmentManagementView;
    }
  | {
      outcome:
        | "UNCHANGED"
        | "SLOT_UNAVAILABLE"
        | "NOT_RESCHEDULABLE"
        | "ONLINE_UNAVAILABLE";
      appointment: AppointmentManagementView;
    }
  | { outcome: "INVALID_CAPABILITY" };

export function calculateAppointmentAccessExpiry(appointmentEndTime: Date): Date {
  return new Date(
    appointmentEndTime.getTime() + APPOINTMENT_ACCESS_POST_APPOINTMENT_GRACE_MS
  );
}

function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

function hashRawToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function hasValidTokenSyntax(rawToken: unknown): rawToken is string {
  return typeof rawToken === "string" && RAW_TOKEN_REGEX.test(rawToken);
}

function isCapabilityActive(
  capability: { tokenRevokedAt: Date | null; tokenExpiresAt: Date },
  referenceNow: Date
): boolean {
  return (
    capability.tokenRevokedAt === null &&
    capability.tokenExpiresAt.getTime() > referenceNow.getTime()
  );
}

type ManagementViewRow = NonNullable<
  Awaited<
    ReturnType<typeof AppointmentAccessRepository.findManagementViewByHash>
  >
>;

async function toManagementView(
  row: ManagementViewRow,
  referenceNow: Date,
  executor: DbExecutor = db,
  knownPublicSchedulingEligibility?: boolean
): Promise<AppointmentManagementView> {
  const localStart = formatInstantInBusinessTimezone(
    row.startTime,
    row.businessTimezone
  );
  const localEnd = formatInstantInBusinessTimezone(
    row.endTime,
    row.businessTimezone
  );

  const publicSchedulingEligible =
    knownPublicSchedulingEligibility ??
    (await isStaffPublicSchedulingEligible({
      businessId: row.businessId,
      staffId: row.staffId,
      serviceId: row.serviceId,
      executor,
    }));
  const policy = getBusinessBookingPolicy(row);
  const cancellationDecision = canPubliclyCancelAppointment({
    status: row.status,
    startsAt: row.startTime,
    referenceNow,
    policy,
  });
  const rescheduleDecision = canPubliclyRescheduleAppointment({
    status: row.status,
    startsAt: row.startTime,
    referenceNow,
    publicSchedulingEligible,
    policy,
  });
  const beforeStart = referenceNow.getTime() < row.startTime.getTime();

  return {
    businessName: row.businessName,
    serviceName: row.serviceName,
    staffDisplayName: `${row.staffFirstName} ${row.staffLastName}`.trim(),
    dateLabel: localStart.displayStr.split(",")[0],
    localStartTime: localStart.timeStr,
    localEndTime: localEnd.timeStr,
    durationMinutes: row.serviceDurationMinutes,
    price: row.servicePrice,
    currency: row.businessCurrency,
    status: row.status,
    localDate: localStart.dateStr,
    businessLocalToday: getBusinessLocalToday(
      row.businessTimezone,
      referenceNow
    ),
    canCancel: cancellationDecision.allowed,
    canReschedule: rescheduleDecision.allowed,
    cancellationWindowClosed:
      !cancellationDecision.allowed &&
      cancellationDecision.reason === "TOO_LATE" &&
      policy.cancellationNoticeMinutes > 0 &&
      beforeStart,
    rescheduleWindowClosed:
      !rescheduleDecision.allowed &&
      rescheduleDecision.reason === "TOO_LATE" &&
      policy.rescheduleNoticeMinutes > 0 &&
      beforeStart,
    maximumRescheduleLocalDate: getMaximumPublicBookingLocalDate({
      referenceNow,
      businessTimezone: row.businessTimezone,
      maximumAdvanceBookingDays: policy.maximumAdvanceBookingDays,
    }),
  };
}

function parseCanonicalInstant(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString() === value ? instant : null;
}

export const AppointmentAccessService = {
  async issue(
    input: { businessId: string; appointmentId: string },
    executor: DbExecutor = db
  ): Promise<{ rawToken: string; expiresAt: Date }> {
    const appointment = await AppointmentAccessRepository.findAppointmentForIssue(
      executor,
      input.businessId,
      input.appointmentId
    );
    if (!appointment) {
      throw new Error("APPOINTMENT_ACCESS_APPOINTMENT_NOT_FOUND");
    }

    const expiresAt = calculateAppointmentAccessExpiry(appointment.endTime);
    if (expiresAt.getTime() <= Date.now()) {
      throw new Error("APPOINTMENT_ACCESS_NOT_OPERATIONAL");
    }

    for (let attempt = 0; attempt < TOKEN_INSERT_ATTEMPTS; attempt += 1) {
      const rawToken = generateRawToken();
      const tokenHash = hashRawToken(rawToken);
      const inserted = await AppointmentAccessRepository.insertToken(executor, {
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        tokenHash,
        expiresAt,
      });

      if (inserted) {
        return { rawToken, expiresAt: inserted.expiresAt };
      }
    }

    throw new Error("APPOINTMENT_ACCESS_TOKEN_COLLISION");
  },

  async resolve(
    rawToken: unknown,
    referenceNow: Date = new Date()
  ): Promise<AppointmentManagementView | null> {
    if (!hasValidTokenSyntax(rawToken)) return null;

    const row = await AppointmentAccessRepository.findManagementViewByHash(
      hashRawToken(rawToken)
    );
    if (!row || !isCapabilityActive(row, referenceNow)) {
      return null;
    }

    return toManagementView(row, referenceNow);
  },

  async cancel(
    rawToken: unknown,
    referenceNow?: Date
  ): Promise<AppointmentCancellationResult> {
    if (!hasValidTokenSyntax(rawToken)) {
      return { outcome: "INVALID_CAPABILITY" };
    }

    const tokenHash = hashRawToken(rawToken);
    const initialNow = referenceNow ?? new Date();

    return db.transaction(async (tx) => {
      const target =
        await AppointmentAccessRepository.findMutationTargetByHash(
          tx,
          tokenHash
        );
      if (!target || !isCapabilityActive(target, initialNow)) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      // Preserve the existing mutation lock order used by booking, internal
      // status changes, and rescheduling: staff profile, then appointment.
      const staffLocked =
        await AppointmentAccessRepository.lockStaffProfileForUpdate(
          tx,
          target.businessId,
          target.staffId
        );
      if (!staffLocked) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const appointment =
        await AppointmentAccessRepository.lockAppointmentForUpdate(
          tx,
          target.businessId,
          target.appointmentId
        );
      if (!appointment || appointment.staffId !== target.staffId) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      // Re-lock and revalidate the capability after waiting on appointment
      // locks so concurrent revocation/expiry cannot authorize a stale write.
      const capability = await AppointmentAccessRepository.lockTokenForUpdate(
        tx,
        tokenHash
      );
      const mutationNow = referenceNow ?? new Date();
      if (
        !capability ||
        capability.businessId !== target.businessId ||
        capability.appointmentId !== target.appointmentId ||
        !isCapabilityActive(
          {
            tokenRevokedAt: capability.revokedAt,
            tokenExpiresAt: capability.expiresAt,
          },
          mutationNow
        )
      ) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const currentRow =
        await AppointmentAccessRepository.findManagementViewByHash(
          tokenHash,
          tx
        );
      if (!currentRow) return { outcome: "INVALID_CAPABILITY" } as const;

      const decision = canPubliclyCancelAppointment({
        status: appointment.status,
        startsAt: appointment.startTime,
        referenceNow: mutationNow,
        policy: getBusinessBookingPolicy(currentRow),
      });

      let changed = false;
      if (decision.allowed) {
        changed = await AppointmentAccessRepository.setAppointmentCancelled(
          tx,
          target.businessId,
          target.appointmentId
        );
        if (!changed) return { outcome: "INVALID_CAPABILITY" } as const;
      } else if (decision.reason !== "ALREADY_CANCELLED") {
        return {
          outcome: "NOT_CANCELLABLE",
          appointment: await toManagementView(currentRow, mutationNow, tx),
        } as const;
      }

      const cancelledView =
        await AppointmentAccessRepository.findManagementViewByHash(
          tokenHash,
          tx
        );
      if (!cancelledView) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      return {
        outcome: "CANCELLED",
        changed,
        appointment: await toManagementView(cancelledView, mutationNow, tx),
      } as const;
    });
  },

  async getRescheduleAvailability(
    rawToken: unknown,
    localDate: unknown,
    referenceNow: Date = new Date()
  ): Promise<AppointmentRescheduleAvailabilityResult> {
    if (!hasValidTokenSyntax(rawToken)) {
      return { outcome: "INVALID_CAPABILITY" };
    }
    if (typeof localDate !== "string" || !DATE_REGEX.test(localDate)) {
      return { outcome: "INVALID_DATE" };
    }

    const tokenHash = hashRawToken(rawToken);
    const target = await AppointmentAccessRepository.findMutationTargetByHash(
      db,
      tokenHash
    );
    if (!target || !isCapabilityActive(target, referenceNow)) {
      return { outcome: "INVALID_CAPABILITY" };
    }

    const row = await AppointmentAccessRepository.findManagementViewByHash(
      tokenHash
    );
    if (!row) return { outcome: "INVALID_CAPABILITY" };

    const publicSchedulingEligible =
      await isStaffPublicSchedulingEligible({
        businessId: target.businessId,
        staffId: target.staffId,
        serviceId: target.serviceId,
      });
    const decision = canPubliclyRescheduleAppointment({
      status: row.status,
      startsAt: row.startTime,
      referenceNow,
      publicSchedulingEligible,
      policy: getBusinessBookingPolicy(row),
    });
    const appointment = await toManagementView(
      row,
      referenceNow,
      db,
      publicSchedulingEligible
    );

    if (!decision.allowed) {
      return {
        outcome:
          decision.reason === "PUBLIC_SCHEDULING_UNAVAILABLE"
            ? "ONLINE_UNAVAILABLE"
            : "NOT_RESCHEDULABLE",
        appointment,
      };
    }

    if (localDate < appointment.businessLocalToday) {
      return { outcome: "INVALID_DATE" };
    }

    try {
      const availability = await getStaffAvailability({
        businessId: target.businessId,
        staffId: target.staffId,
        serviceId: target.serviceId,
        localDate,
        referenceNow,
        excludeAppointmentId: target.appointmentId,
        serviceDurationMinutes: row.serviceDurationMinutes,
        context: "PUBLIC",
      });

      const slots = availability.slots
        .filter(
          (slot) =>
            new Date(slot.startAt).getTime() !== row.startTime.getTime()
        )
        .map((slot) => ({
          startAt: slot.startAt,
          localStartTime: slot.localStartTime,
          localEndTime: slot.localEndTime,
        }));

      const reason =
        availability.reason === "CLOSED"
          ? "CLOSED"
          : slots.length === 0
            ? "NO_AVAILABLE_SLOTS"
            : undefined;

      return {
        outcome: "AVAILABLE",
        appointment,
        localDate,
        slots,
        ...(reason ? { reason } : {}),
      };
    } catch {
      return { outcome: "INVALID_DATE" };
    }
  },

  async reschedule(
    rawToken: unknown,
    requestedStartAt: unknown,
    referenceNow?: Date
  ): Promise<AppointmentRescheduleResult> {
    if (!hasValidTokenSyntax(rawToken)) {
      return { outcome: "INVALID_CAPABILITY" };
    }

    const tokenHash = hashRawToken(rawToken);
    const initialNow = referenceNow ?? new Date();

    return db.transaction(async (tx) => {
      const target =
        await AppointmentAccessRepository.findMutationTargetByHash(
          tx,
          tokenHash
        );
      if (!target || !isCapabilityActive(target, initialNow)) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const staffLocked =
        await AppointmentAccessRepository.lockStaffProfileForUpdate(
          tx,
          target.businessId,
          target.staffId
        );
      if (!staffLocked) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const appointment =
        await AppointmentAccessRepository.lockAppointmentForUpdate(
          tx,
          target.businessId,
          target.appointmentId
        );
      if (
        !appointment ||
        appointment.staffId !== target.staffId ||
        appointment.serviceId !== target.serviceId
      ) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const capability = await AppointmentAccessRepository.lockTokenForUpdate(
        tx,
        tokenHash
      );
      const mutationNow = referenceNow ?? new Date();
      if (
        !capability ||
        capability.businessId !== target.businessId ||
        capability.appointmentId !== target.appointmentId ||
        !isCapabilityActive(
          {
            tokenRevokedAt: capability.revokedAt,
            tokenExpiresAt: capability.expiresAt,
          },
          mutationNow
        )
      ) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const publicSchedulingEligible =
        await isStaffPublicSchedulingEligible({
          businessId: target.businessId,
          staffId: appointment.staffId,
          serviceId: appointment.serviceId,
          executor: tx,
        });
      const currentRow =
        await AppointmentAccessRepository.findManagementViewByHash(
          tokenHash,
          tx
        );
      if (!currentRow) return { outcome: "INVALID_CAPABILITY" } as const;

      const decision = canPubliclyRescheduleAppointment({
        status: appointment.status,
        startsAt: appointment.startTime,
        referenceNow: mutationNow,
        publicSchedulingEligible,
        policy: getBusinessBookingPolicy(currentRow),
      });
      const currentView = await toManagementView(
        currentRow,
        mutationNow,
        tx,
        publicSchedulingEligible
      );

      if (!decision.allowed) {
        return {
          outcome:
            decision.reason === "PUBLIC_SCHEDULING_UNAVAILABLE"
              ? "ONLINE_UNAVAILABLE"
              : "NOT_RESCHEDULABLE",
          appointment: currentView,
        } as const;
      }

      const requestedStart = parseCanonicalInstant(requestedStartAt);
      if (!requestedStart) {
        return {
          outcome: "SLOT_UNAVAILABLE",
          appointment: currentView,
        } as const;
      }

      if (requestedStart.getTime() === appointment.startTime.getTime()) {
        return {
          outcome: "UNCHANGED",
          appointment: currentView,
        } as const;
      }

      const localDate = formatInstantInBusinessTimezone(
        requestedStart,
        currentRow.businessTimezone
      ).dateStr;

      let availability;
      try {
        availability = await getStaffAvailability({
          businessId: target.businessId,
          staffId: appointment.staffId,
          serviceId: appointment.serviceId,
          localDate,
          referenceNow: mutationNow,
          excludeAppointmentId: appointment.id,
          serviceDurationMinutes: appointment.serviceDurationSnapshot,
          context: "PUBLIC",
          executor: tx,
        });
      } catch {
        return {
          outcome: "SLOT_UNAVAILABLE",
          appointment: currentView,
        } as const;
      }

      const selectedSlot = availability.slots.find(
        (slot) =>
          new Date(slot.startAt).getTime() === requestedStart.getTime()
      );
      if (!selectedSlot) {
        return {
          outcome: "SLOT_UNAVAILABLE",
          appointment: currentView,
        } as const;
      }

      const newEndTime = new Date(
        requestedStart.getTime() +
          appointment.serviceDurationSnapshot * 60_000
      );
      const updated =
        await AppointmentAccessRepository.setAppointmentSchedule(
          tx,
          target.businessId,
          appointment.id,
          requestedStart,
          newEndTime
        );
      if (!updated) return { outcome: "INVALID_CAPABILITY" } as const;

      await AppointmentAccessService.refreshExpirationAfterReschedule(tx, {
        businessId: target.businessId,
        appointmentId: appointment.id,
        appointmentEndTime: newEndTime,
      });

      const refreshedRow =
        await AppointmentAccessRepository.findManagementViewByHash(
          tokenHash,
          tx
        );
      if (!refreshedRow) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      return {
        outcome: "RESCHEDULED",
        appointment: await toManagementView(
          refreshedRow,
          mutationNow,
          tx,
          publicSchedulingEligible
        ),
      } as const;
    });
  },

  async revoke(
    rawToken: unknown,
    executor: DbExecutor = db,
    revokedAt: Date = new Date()
  ): Promise<boolean> {
    if (!hasValidTokenSyntax(rawToken)) return false;
    return AppointmentAccessRepository.revokeByHash(
      executor,
      hashRawToken(rawToken),
      revokedAt
    );
  },

  async refreshExpirationAfterReschedule(
    executor: DbExecutor,
    input: { businessId: string; appointmentId: string; appointmentEndTime: Date }
  ): Promise<void> {
    await AppointmentAccessRepository.updateAppointmentTokenExpirations(
      executor,
      input.businessId,
      input.appointmentId,
      calculateAppointmentAccessExpiry(input.appointmentEndTime)
    );
  },
};
