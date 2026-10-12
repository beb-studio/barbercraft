import "server-only";

import { createHash } from "node:crypto";
import type { AppointmentNotificationEventType } from "@/db/schema";

export const NOTIFICATION_PLANNER_PAYLOAD_VERSION = 1;
export const NOTIFICATION_PLANNER_MAX_BATCH_SIZE = 100;

function key(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

export function immediateNotificationPlanKey(input: {
  sourceOutboxId: string;
  type: Exclude<AppointmentNotificationEventType, never>;
}): string {
  return key([
    "notification-plan-v1",
    "immediate",
    input.sourceOutboxId,
    input.type,
  ]);
}

export function reminderNotificationPlanKey(input: {
  businessId: string;
  appointmentId: string;
  appointmentStartAt: Date;
  minutesBefore: number;
}): string {
  return key([
    "notification-plan-v1",
    "reminder",
    input.businessId,
    input.appointmentId,
    input.appointmentStartAt.toISOString(),
    String(input.minutesBefore),
  ]);
}

export function hasMatchingEventStart(
  payload: Record<string, unknown>,
  expectedStart: Date,
  keyName: "startAt" | "newStartAt"
): boolean {
  const raw = payload[keyName];
  if (typeof raw !== "string") return false;
  const parsed = new Date(raw);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() === expectedStart.getTime();
}
