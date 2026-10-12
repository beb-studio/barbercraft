export const NOTIFICATION_REMINDER_TIME_UNITS = [
  "MINUTE",
  "HOUR",
  "DAY",
] as const;

export type NotificationReminderTimeUnit =
  (typeof NOTIFICATION_REMINDER_TIME_UNITS)[number];

export const MINIMUM_REMINDER_MINUTES = 5;
export const MAXIMUM_REMINDER_MINUTES = 43_200;
export const MAXIMUM_REMINDER_RULES = 3;

export interface ReminderDurationInput {
  amount: string;
  unit: NotificationReminderTimeUnit;
}

export interface BusinessNotificationSettingsInput {
  customerNotificationsEnabled: boolean;
  appointmentCreatedEnabled: boolean;
  appointmentRescheduledEnabled: boolean;
  appointmentCancelledEnabled: boolean;
  reminderRules: ReminderDurationInput[];
}

export interface ValidBusinessNotificationSettings {
  customerNotificationsEnabled: boolean;
  appointmentCreatedEnabled: boolean;
  appointmentRescheduledEnabled: boolean;
  appointmentCancelledEnabled: boolean;
  reminderMinutes: number[];
}

const MULTIPLIERS: Record<NotificationReminderTimeUnit, number> = {
  MINUTE: 1,
  HOUR: 60,
  DAY: 1_440,
};
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function isNotificationReminderTimeUnit(
  value: unknown
): value is NotificationReminderTimeUnit {
  return (
    typeof value === "string" &&
    (NOTIFICATION_REMINDER_TIME_UNITS as readonly string[]).includes(value)
  );
}

export function parseReminderDuration(
  value: ReminderDurationInput
): number | null {
  if (
    !value ||
    !isNotificationReminderTimeUnit(value.unit) ||
    !POSITIVE_INTEGER.test(value.amount)
  ) {
    return null;
  }
  const amount = Number(value.amount);
  const multiplier = MULTIPLIERS[value.unit];
  if (
    !Number.isSafeInteger(amount) ||
    amount > Math.floor(MAXIMUM_REMINDER_MINUTES / multiplier)
  ) {
    return null;
  }
  const minutes = amount * multiplier;
  return minutes >= MINIMUM_REMINDER_MINUTES &&
    minutes <= MAXIMUM_REMINDER_MINUTES
    ? minutes
    : null;
}

export function minutesToReminderDuration(
  minutes: number
): ReminderDurationInput {
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < MINIMUM_REMINDER_MINUTES ||
    minutes > MAXIMUM_REMINDER_MINUTES
  ) {
    throw new Error("INVALID_REMINDER_MINUTES");
  }
  if (minutes % 1_440 === 0) {
    return { amount: String(minutes / 1_440), unit: "DAY" };
  }
  if (minutes < 1_440 && minutes % 60 === 0) {
    return { amount: String(minutes / 60), unit: "HOUR" };
  }
  return { amount: String(minutes), unit: "MINUTE" };
}

export function formatReminderMinutes(minutes: number): string {
  const value = minutesToReminderDuration(minutes);
  const labels: Record<NotificationReminderTimeUnit, string> = {
    MINUTE: "dakika",
    HOUR: "saat",
    DAY: "gün",
  };
  return `${value.amount} ${labels[value.unit]}`;
}

export function validateBusinessNotificationSettings(
  value: unknown
):
  | { valid: true; settings: ValidBusinessNotificationSettings }
  | { valid: false } {
  if (!value || typeof value !== "object") return { valid: false };
  const input = value as BusinessNotificationSettingsInput;
  if (
    typeof input.customerNotificationsEnabled !== "boolean" ||
    typeof input.appointmentCreatedEnabled !== "boolean" ||
    typeof input.appointmentRescheduledEnabled !== "boolean" ||
    typeof input.appointmentCancelledEnabled !== "boolean" ||
    !Array.isArray(input.reminderRules) ||
    input.reminderRules.length > MAXIMUM_REMINDER_RULES
  ) {
    return { valid: false };
  }

  const reminderMinutes: number[] = [];
  for (const rule of input.reminderRules) {
    const minutes = parseReminderDuration(rule);
    if (minutes === null || reminderMinutes.includes(minutes)) {
      return { valid: false };
    }
    reminderMinutes.push(minutes);
  }

  return {
    valid: true,
    settings: {
      customerNotificationsEnabled: input.customerNotificationsEnabled,
      appointmentCreatedEnabled: input.appointmentCreatedEnabled,
      appointmentRescheduledEnabled: input.appointmentRescheduledEnabled,
      appointmentCancelledEnabled: input.appointmentCancelledEnabled,
      reminderMinutes: reminderMinutes.sort((a, b) => b - a),
    },
  };
}
