import "server-only";

import { createHash } from "node:crypto";
import type {
  AppointmentNotificationEventType,
  NotificationOutboxStatus,
} from "@/db/schema/notification_outbox";
import type { AppointmentStatus } from "@/db/schema/appointments";

export const NOTIFICATION_OUTBOX_PAYLOAD_VERSION = 1;
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 8;
export const NOTIFICATION_OUTBOX_LEASE_MS = 5 * 60_000;
export const NOTIFICATION_OUTBOX_BASE_RETRY_MS = 60_000;
export const NOTIFICATION_OUTBOX_MAX_RETRY_MS = 6 * 60 * 60_000;
export const NOTIFICATION_OUTBOX_MAX_BATCH_SIZE = 100;

export function isOutboxTerminalFailed(status: string, attemptCount: number): boolean {
  return status === "FAILED" && attemptCount >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
}

export function isOutboxRetryableFailed(status: string, attemptCount: number): boolean {
  return status === "FAILED" && attemptCount < NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
}


export interface AppointmentCreatedPayloadV1 {
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
}

export interface AppointmentRescheduledPayloadV1 {
  oldStartAt: string;
  oldEndAt: string;
  newStartAt: string;
  newEndAt: string;
  status: AppointmentStatus;
}

export interface AppointmentCancelledPayloadV1 {
  startAt: string;
  endAt: string;
  previousStatus: AppointmentStatus;
  status: "CANCELLED";
}

export type AppointmentNotificationPayloadV1 =
  | AppointmentCreatedPayloadV1
  | AppointmentRescheduledPayloadV1
  | AppointmentCancelledPayloadV1;

export interface ClaimedNotificationEvent {
  id: string;
  businessId: string;
  appointmentId: string;
  eventType: AppointmentNotificationEventType;
  payloadVersion: number;
  payload: Record<string, unknown>;
  status: NotificationOutboxStatus;
  availableAt: Date;
  attemptCount: number;
  lockedAt: Date;
  lockedBy: string;
  createdAt: Date;
}

function hashIdempotencyMaterial(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

export function appointmentCreatedIdempotencyKey(input: {
  businessId: string;
  appointmentId: string;
}): string {
  return hashIdempotencyMaterial([
    "appointment-notification-v1",
    "APPOINTMENT_CREATED",
    input.businessId,
    input.appointmentId,
  ]);
}

export function appointmentCancelledIdempotencyKey(input: {
  businessId: string;
  appointmentId: string;
}): string {
  return hashIdempotencyMaterial([
    "appointment-notification-v1",
    "APPOINTMENT_CANCELLED",
    input.businessId,
    input.appointmentId,
  ]);
}

export function appointmentRescheduledIdempotencyKey(input: {
  businessId: string;
  appointmentId: string;
  previousVersion: string;
  oldStartAt: Date;
  oldEndAt: Date;
  newStartAt: Date;
  newEndAt: Date;
}): string {
  return hashIdempotencyMaterial([
    "appointment-notification-v1",
    "APPOINTMENT_RESCHEDULED",
    input.businessId,
    input.appointmentId,
    input.previousVersion,
    input.oldStartAt.toISOString(),
    input.oldEndAt.toISOString(),
    input.newStartAt.toISOString(),
    input.newEndAt.toISOString(),
  ]);
}

export function getNotificationRetryDelayMs(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error("INVALID_NOTIFICATION_ATTEMPT_COUNT");
  }
  return Math.min(
    NOTIFICATION_OUTBOX_BASE_RETRY_MS * 2 ** (attemptCount - 1),
    NOTIFICATION_OUTBOX_MAX_RETRY_MS
  );
}

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{0,63}$/;

export function isValidNotificationWorkerId(value: unknown): value is string {
  return typeof value === "string" && WORKER_ID_PATTERN.test(value);
}

export function sanitizeNotificationErrorCode(value: unknown): string {
  if (typeof value === "string" && ERROR_CODE_PATTERN.test(value)) return value;
  return "DELIVERY_ERROR";
}
