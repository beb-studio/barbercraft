import { formatInstantInBusinessTimezone } from "@/lib/timezone";

export const MAX_BOOKING_POLICY_MINUTES = 525_600;
export const MAXIMUM_ADVANCE_BOOKING_DAYS_LIMIT = 730;

export interface BusinessBookingPolicy {
  minimumBookingLeadMinutes: number;
  maximumAdvanceBookingDays: number | null;
  cancellationNoticeMinutes: number;
  rescheduleNoticeMinutes: number;
}

export const DEFAULT_BUSINESS_BOOKING_POLICY: Readonly<BusinessBookingPolicy> = {
  minimumBookingLeadMinutes: 0,
  maximumAdvanceBookingDays: null,
  cancellationNoticeMinutes: 0,
  rescheduleNoticeMinutes: 0,
};

export type BusinessBookingPolicyField = keyof BusinessBookingPolicy;

export type BusinessBookingPolicyValidationResult =
  | { valid: true; policy: BusinessBookingPolicy }
  | {
      valid: false;
      field: BusinessBookingPolicyField;
      reason: "NOT_AN_INTEGER" | "OUT_OF_RANGE";
    };

function validateMinutes(
  field: Exclude<BusinessBookingPolicyField, "maximumAdvanceBookingDays">,
  value: unknown
): BusinessBookingPolicyValidationResult | null {
  if (!Number.isSafeInteger(value)) {
    return { valid: false, field, reason: "NOT_AN_INTEGER" };
  }
  if ((value as number) < 0 || (value as number) > MAX_BOOKING_POLICY_MINUTES) {
    return { valid: false, field, reason: "OUT_OF_RANGE" };
  }
  return null;
}

/**
 * Shared server-side validation for persisted policy values and future settings
 * mutations. Browser-provided values must pass through this boundary before use.
 */
export function validateBusinessBookingPolicy(input: {
  minimumBookingLeadMinutes: unknown;
  maximumAdvanceBookingDays: unknown;
  cancellationNoticeMinutes: unknown;
  rescheduleNoticeMinutes: unknown;
}): BusinessBookingPolicyValidationResult {
  for (const field of [
    "minimumBookingLeadMinutes",
    "cancellationNoticeMinutes",
    "rescheduleNoticeMinutes",
  ] as const) {
    const invalid = validateMinutes(field, input[field]);
    if (invalid) return invalid;
  }

  if (input.maximumAdvanceBookingDays !== null) {
    if (!Number.isSafeInteger(input.maximumAdvanceBookingDays)) {
      return {
        valid: false,
        field: "maximumAdvanceBookingDays",
        reason: "NOT_AN_INTEGER",
      };
    }
    if (
      (input.maximumAdvanceBookingDays as number) < 1 ||
      (input.maximumAdvanceBookingDays as number) >
        MAXIMUM_ADVANCE_BOOKING_DAYS_LIMIT
    ) {
      return {
        valid: false,
        field: "maximumAdvanceBookingDays",
        reason: "OUT_OF_RANGE",
      };
    }
  }

  return {
    valid: true,
    policy: {
      minimumBookingLeadMinutes: input.minimumBookingLeadMinutes as number,
      maximumAdvanceBookingDays: input.maximumAdvanceBookingDays as number | null,
      cancellationNoticeMinutes: input.cancellationNoticeMinutes as number,
      rescheduleNoticeMinutes: input.rescheduleNoticeMinutes as number,
    },
  };
}

export function getBusinessBookingPolicy(input: BusinessBookingPolicy): BusinessBookingPolicy {
  const result = validateBusinessBookingPolicy(input);
  if (!result.valid) {
    throw new Error("INVALID_BUSINESS_BOOKING_POLICY");
  }
  return result.policy;
}

function addLocalCalendarDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

export function getMaximumPublicBookingLocalDate(input: {
  referenceNow: Date;
  businessTimezone: string;
  maximumAdvanceBookingDays: number | null;
}): string | null {
  if (input.maximumAdvanceBookingDays === null) return null;
  const localToday = formatInstantInBusinessTimezone(
    input.referenceNow,
    input.businessTimezone
  ).dateStr;
  return addLocalCalendarDays(localToday, input.maximumAdvanceBookingDays);
}

export type PublicBookingPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "MINIMUM_LEAD_TIME" | "MAXIMUM_ADVANCE";
    };

/**
 * Authoritative public target-slot policy. Lead time compares exact instants;
 * maximum advance compares inclusive business-local calendar dates.
 */
export function canPubliclyBookAt(input: {
  requestedStart: Date;
  referenceNow: Date;
  businessTimezone: string;
  policy: BusinessBookingPolicy;
}): PublicBookingPolicyDecision {
  const minimumStart =
    input.referenceNow.getTime() +
    input.policy.minimumBookingLeadMinutes * 60_000;
  if (input.requestedStart.getTime() < minimumStart) {
    return { allowed: false, reason: "MINIMUM_LEAD_TIME" };
  }

  if (input.policy.maximumAdvanceBookingDays !== null) {
    const finalAllowedDate = getMaximumPublicBookingLocalDate({
      referenceNow: input.referenceNow,
      businessTimezone: input.businessTimezone,
      maximumAdvanceBookingDays: input.policy.maximumAdvanceBookingDays,
    })!;
    const requestedLocalDate = formatInstantInBusinessTimezone(
      input.requestedStart,
      input.businessTimezone
    ).dateStr;
    if (requestedLocalDate > finalAllowedDate) {
      return { allowed: false, reason: "MAXIMUM_ADVANCE" };
    }
  }

  return { allowed: true };
}

/**
 * A positive notice window includes its exact cutoff. Zero retains TASK 014's
 * strict `now < start` behavior rather than authorizing at the start instant.
 */
export function hasRequiredPublicNotice(input: {
  startsAt: Date;
  referenceNow: Date;
  noticeMinutes: number;
}): boolean {
  if (input.noticeMinutes === 0) {
    return input.referenceNow.getTime() < input.startsAt.getTime();
  }
  return (
    input.referenceNow.getTime() + input.noticeMinutes * 60_000 <=
    input.startsAt.getTime()
  );
}
