import {
  MAXIMUM_ADVANCE_BOOKING_DAYS_LIMIT,
  MAX_BOOKING_POLICY_MINUTES,
  type BusinessBookingPolicy,
} from "@/lib/business-booking-policy";

export const BOOKING_POLICY_TIME_UNITS = ["MINUTE", "HOUR", "DAY"] as const;

export type BookingPolicyTimeUnit =
  (typeof BOOKING_POLICY_TIME_UNITS)[number];

export interface PolicyDurationInput {
  amount: string;
  unit: BookingPolicyTimeUnit;
}

export interface BusinessBookingPolicyFormValues {
  minimumBookingLead: PolicyDurationInput;
  maximumAdvanceUnlimited: boolean;
  maximumAdvanceBookingDays: string;
  cancellationNotice: PolicyDurationInput;
  rescheduleNotice: PolicyDurationInput;
}

export type BookingPolicyFormParseResult =
  | { valid: true; policy: BusinessBookingPolicy }
  | {
      valid: false;
      field:
        | "minimumBookingLead"
        | "maximumAdvanceBookingDays"
        | "cancellationNotice"
        | "rescheduleNotice";
    };

const UNIT_MULTIPLIERS: Record<BookingPolicyTimeUnit, number> = {
  MINUTE: 1,
  HOUR: 60,
  DAY: 1_440,
};

const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export function isBookingPolicyTimeUnit(
  value: unknown
): value is BookingPolicyTimeUnit {
  return (
    typeof value === "string" &&
    (BOOKING_POLICY_TIME_UNITS as readonly string[]).includes(value)
  );
}

function parseDurationInput(
  input: PolicyDurationInput
): number | null {
  if (
    !isBookingPolicyTimeUnit(input.unit) ||
    !NON_NEGATIVE_INTEGER_PATTERN.test(input.amount)
  ) {
    return null;
  }

  const amount = Number(input.amount);
  const multiplier = UNIT_MULTIPLIERS[input.unit];
  if (!Number.isSafeInteger(amount) || amount > Math.floor(MAX_BOOKING_POLICY_MINUTES / multiplier)) {
    return null;
  }

  const minutes = amount * multiplier;
  return minutes <= MAX_BOOKING_POLICY_MINUTES ? minutes : null;
}

export function minutesToPolicyDurationInput(
  minutes: number
): PolicyDurationInput {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new Error("INVALID_POLICY_MINUTES");
  }
  if (minutes === 0) return { amount: "0", unit: "MINUTE" };
  if (minutes % 1_440 === 0) {
    return { amount: String(minutes / 1_440), unit: "DAY" };
  }
  if (minutes < 1_440 && minutes % 60 === 0) {
    return { amount: String(minutes / 60), unit: "HOUR" };
  }
  return { amount: String(minutes), unit: "MINUTE" };
}

export function bookingPolicyToFormValues(
  policy: BusinessBookingPolicy
): BusinessBookingPolicyFormValues {
  return {
    minimumBookingLead: minutesToPolicyDurationInput(
      policy.minimumBookingLeadMinutes
    ),
    maximumAdvanceUnlimited: policy.maximumAdvanceBookingDays === null,
    maximumAdvanceBookingDays:
      policy.maximumAdvanceBookingDays === null
        ? ""
        : String(policy.maximumAdvanceBookingDays),
    cancellationNotice: minutesToPolicyDurationInput(
      policy.cancellationNoticeMinutes
    ),
    rescheduleNotice: minutesToPolicyDurationInput(
      policy.rescheduleNoticeMinutes
    ),
  };
}

export function parseBookingPolicyFormValues(
  values: BusinessBookingPolicyFormValues
): BookingPolicyFormParseResult {
  const minimumBookingLeadMinutes = parseDurationInput(
    values.minimumBookingLead
  );
  if (minimumBookingLeadMinutes === null) {
    return { valid: false, field: "minimumBookingLead" };
  }

  let maximumAdvanceBookingDays: number | null = null;
  if (!values.maximumAdvanceUnlimited) {
    if (!POSITIVE_INTEGER_PATTERN.test(values.maximumAdvanceBookingDays)) {
      return { valid: false, field: "maximumAdvanceBookingDays" };
    }
    maximumAdvanceBookingDays = Number(values.maximumAdvanceBookingDays);
    if (
      !Number.isSafeInteger(maximumAdvanceBookingDays) ||
      maximumAdvanceBookingDays > MAXIMUM_ADVANCE_BOOKING_DAYS_LIMIT
    ) {
      return { valid: false, field: "maximumAdvanceBookingDays" };
    }
  }

  const cancellationNoticeMinutes = parseDurationInput(
    values.cancellationNotice
  );
  if (cancellationNoticeMinutes === null) {
    return { valid: false, field: "cancellationNotice" };
  }

  const rescheduleNoticeMinutes = parseDurationInput(
    values.rescheduleNotice
  );
  if (rescheduleNoticeMinutes === null) {
    return { valid: false, field: "rescheduleNotice" };
  }

  return {
    valid: true,
    policy: {
      minimumBookingLeadMinutes,
      maximumAdvanceBookingDays,
      cancellationNoticeMinutes,
      rescheduleNoticeMinutes,
    },
  };
}

export function formatPolicyMinutes(minutes: number): string {
  const value = minutesToPolicyDurationInput(minutes);
  const labels: Record<BookingPolicyTimeUnit, string> = {
    MINUTE: "dakika",
    HOUR: "saat",
    DAY: "gün",
  };
  return `${value.amount} ${labels[value.unit]}`;
}

export function getBusinessBookingPolicySummary(
  policy: BusinessBookingPolicy
): string[] {
  return [
    policy.minimumBookingLeadMinutes === 0
      ? "Müşteriler uygun olan ilk saatten randevu alabilir."
      : `Müşteriler en erken ${formatPolicyMinutes(policy.minimumBookingLeadMinutes)} sonrasına randevu alabilir.`,
    policy.maximumAdvanceBookingDays === null
      ? "İleri tarih sınırı yok."
      : `Randevular en fazla ${policy.maximumAdvanceBookingDays} gün sonrasına oluşturulabilir.`,
    policy.cancellationNoticeMinutes === 0
      ? "Müşteriler randevu başlayana kadar çevrim içi iptal edebilir."
      : `İptal işlemi randevudan en az ${formatPolicyMinutes(policy.cancellationNoticeMinutes)} önce yapılabilir.`,
    policy.rescheduleNoticeMinutes === 0
      ? "Müşteriler randevu başlayana kadar tarih veya saati değiştirebilir."
      : `Randevu değişikliği en az ${formatPolicyMinutes(policy.rescheduleNoticeMinutes)} önce yapılabilir.`,
  ];
}
