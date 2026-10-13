import "server-only";

import type {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
} from "@/db/schema/notification_deliveries";

export const NOTIFICATION_DELIVERY_MAX_ATTEMPTS = 8;
export const NOTIFICATION_DELIVERY_LEASE_MS = 5 * 60_000;
export const NOTIFICATION_DELIVERY_BASE_RETRY_MS = 60_000;
export const NOTIFICATION_DELIVERY_MAX_RETRY_MS = 6 * 60 * 60_000;
export const NOTIFICATION_DELIVERY_MAX_BATCH_SIZE = 100;

export const PERMANENT_DELIVERY_ERROR_CODES = [
  "RECIPIENT_UNAVAILABLE",
  "NETGSM_20",
  "NETGSM_30",
  "NETGSM_40",
  "NETGSM_70",
  "MALFORMED_RESPONSE",
] as const;

export function isDeliveryTerminalFailed(
  status: string,
  attemptCount: number,
  lastErrorCode?: string | null
): boolean {
  if (status !== "FAILED") return false;
  if (attemptCount >= NOTIFICATION_DELIVERY_MAX_ATTEMPTS) return true;
  if (lastErrorCode && (PERMANENT_DELIVERY_ERROR_CODES as readonly string[]).includes(lastErrorCode)) {
    return true;
  }
  return false;
}

export function isDeliveryRetryableFailed(
  status: string,
  attemptCount: number,
  lastErrorCode?: string | null
): boolean {
  if (status !== "FAILED") return false;
  return !isDeliveryTerminalFailed(status, attemptCount, lastErrorCode);
}


export interface ClaimedNotificationDelivery {
  id: string;
  businessId: string;
  planId: string;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  recipient: string;
  provider: string;
  providerMessageId: string | null;
  attemptCount: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  sentAt: Date | null;
  failedAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function getNotificationDeliveryRetryDelayMs(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error("INVALID_NOTIFICATION_DELIVERY_ATTEMPT_COUNT");
  }
  return Math.min(
    NOTIFICATION_DELIVERY_BASE_RETRY_MS * 2 ** (attemptCount - 1),
    NOTIFICATION_DELIVERY_MAX_RETRY_MS
  );
}

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{0,63}$/;

export function isValidNotificationDeliveryWorkerId(
  value: unknown
): value is string {
  return typeof value === "string" && WORKER_ID_PATTERN.test(value);
}

export function sanitizeDeliveryErrorCode(value: unknown): string {
  if (typeof value === "string" && ERROR_CODE_PATTERN.test(value)) return value;
  return "DELIVERY_ERROR";
}

export function getPublicApplicationBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL;
  if (!raw) {
    throw new Error("MISSING_PUBLIC_APPLICATION_BASE_URL");
  }
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("INVALID_PUBLIC_APPLICATION_BASE_URL_PROTOCOL");
    }
    return trimmed;
  } catch {
    throw new Error("INVALID_PUBLIC_APPLICATION_BASE_URL");
  }
}

export interface RenderNotificationTemplateInput {
  type:
    | "APPOINTMENT_CREATED"
    | "APPOINTMENT_RESCHEDULED"
    | "APPOINTMENT_CANCELLED"
    | "APPOINTMENT_REMINDER";
  businessName: string;
  serviceName: string;
  dateTimeDisplay: string;
  managementUrl?: string;
}

export function renderNotificationMessage(
  input: RenderNotificationTemplateInput
): string {
  const { type, businessName, serviceName, dateTimeDisplay, managementUrl } =
    input;
  switch (type) {
    case "APPOINTMENT_CREATED":
      return managementUrl
        ? `${businessName}: ${serviceName} randevunuz ${dateTimeDisplay} için oluşturuldu. Randevu yönetimi: ${managementUrl}`
        : `${businessName}: ${serviceName} randevunuz ${dateTimeDisplay} için oluşturuldu.`;
    case "APPOINTMENT_RESCHEDULED":
      return managementUrl
        ? `${businessName}: ${serviceName} randevunuz ${dateTimeDisplay} olarak güncellendi. Randevu yönetimi: ${managementUrl}`
        : `${businessName}: ${serviceName} randevunuz ${dateTimeDisplay} olarak güncellendi.`;
    case "APPOINTMENT_REMINDER":
      return managementUrl
        ? `${businessName}: ${serviceName} randevunuz ${dateTimeDisplay} tarihindedir. Randevu detayları: ${managementUrl}`
        : `${businessName}: ${serviceName} randevunuz ${dateTimeDisplay} tarihindedir.`;
    case "APPOINTMENT_CANCELLED":
      return `${businessName}: ${dateTimeDisplay} tarihindeki ${serviceName} randevunuz iptal edilmiştir.`;
  }
}
