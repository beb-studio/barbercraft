import type { AppointmentStatus } from "@/db/schema/appointments";

const APPOINTMENT_STATUS_TRANSITIONS: Readonly<
  Partial<Record<AppointmentStatus, readonly AppointmentStatus[]>>
> = {
  PENDING: ["CANCELLED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED"],
};

export function canTransitionAppointmentStatus(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): boolean {
  return (
    APPOINTMENT_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false
  );
}

export function isOperationalAppointmentStatus(
  status: AppointmentStatus
): status is "PENDING" | "CONFIRMED" {
  return status === "PENDING" || status === "CONFIRMED";
}

export type PublicCancellationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ALREADY_CANCELLED" | "STATUS_NOT_CANCELLABLE" | "TOO_LATE";
    };

/**
 * Authoritative V1 public cancellation policy. `referenceNow` must come from
 * the server in production; callers may inject it only for deterministic tests.
 */
export function canPubliclyCancelAppointment(input: {
  status: AppointmentStatus;
  startsAt: Date;
  referenceNow: Date;
}): PublicCancellationDecision {
  if (input.status === "CANCELLED") {
    return { allowed: false, reason: "ALREADY_CANCELLED" };
  }

  if (!isOperationalAppointmentStatus(input.status)) {
    return { allowed: false, reason: "STATUS_NOT_CANCELLABLE" };
  }

  if (input.referenceNow.getTime() >= input.startsAt.getTime()) {
    return { allowed: false, reason: "TOO_LATE" };
  }

  return { allowed: true };
}

export type PublicRescheduleDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "STATUS_NOT_RESCHEDULABLE"
        | "TOO_LATE"
        | "PUBLIC_SCHEDULING_UNAVAILABLE";
    };

/**
 * Authoritative V1 public reschedule policy. Public scheduling eligibility is
 * derived from current trusted business/staff/service state by the caller.
 */
export function canPubliclyRescheduleAppointment(input: {
  status: AppointmentStatus;
  startsAt: Date;
  referenceNow: Date;
  publicSchedulingEligible: boolean;
}): PublicRescheduleDecision {
  if (!isOperationalAppointmentStatus(input.status)) {
    return { allowed: false, reason: "STATUS_NOT_RESCHEDULABLE" };
  }

  if (input.referenceNow.getTime() >= input.startsAt.getTime()) {
    return { allowed: false, reason: "TOO_LATE" };
  }

  if (!input.publicSchedulingEligible) {
    return { allowed: false, reason: "PUBLIC_SCHEDULING_UNAVAILABLE" };
  }

  return { allowed: true };
}
