import "server-only";

import type { DbExecutor } from "@/db";
import type { AppointmentStatus } from "@/db/schema/appointments";
import {
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  NOTIFICATION_OUTBOX_MAX_BATCH_SIZE,
  NOTIFICATION_OUTBOX_PAYLOAD_VERSION,
  appointmentCancelledIdempotencyKey,
  appointmentCreatedIdempotencyKey,
  appointmentRescheduledIdempotencyKey,
  getNotificationRetryDelayMs,
  isValidNotificationWorkerId,
  sanitizeNotificationErrorCode,
} from "@/lib/notification-outbox";
import { NotificationOutboxRepository } from "@/repositories/notification-outbox.repository";

export class NotificationOutboxError extends Error {
  constructor(
    public readonly code:
      | "OUTBOX_DUPLICATE_EVENT"
      | "OUTBOX_INVALID_CLAIM"
      | "OUTBOX_CLAIM_NOT_OWNED"
      | "OUTBOX_PERSISTENCE_FAILED"
  ) {
    super(code);
    this.name = "NotificationOutboxError";
  }
}

async function requireInserted(
  executor: DbExecutor,
  input: Parameters<typeof NotificationOutboxRepository.insertEvent>[1]
) {
  let inserted;
  try {
    inserted = await NotificationOutboxRepository.insertEvent(executor, input);
  } catch {
    throw new NotificationOutboxError("OUTBOX_PERSISTENCE_FAILED");
  }
  if (!inserted) throw new NotificationOutboxError("OUTBOX_DUPLICATE_EVENT");
  return inserted;
}

function persistenceFailure(error: unknown): never {
  if (error instanceof NotificationOutboxError) throw error;
  throw new NotificationOutboxError("OUTBOX_PERSISTENCE_FAILED");
}

export const NotificationOutboxService = {
  async emitAppointmentCreated(
    executor: DbExecutor,
    input: {
      businessId: string;
      appointmentId: string;
      startAt: Date;
      endAt: Date;
      status: AppointmentStatus;
    }
  ) {
    return requireInserted(executor, {
      businessId: input.businessId,
      appointmentId: input.appointmentId,
      eventType: "APPOINTMENT_CREATED",
      payloadVersion: NOTIFICATION_OUTBOX_PAYLOAD_VERSION,
      payload: {
        startAt: input.startAt.toISOString(),
        endAt: input.endAt.toISOString(),
        status: input.status,
      },
      idempotencyKey: appointmentCreatedIdempotencyKey(input),
    });
  },

  async emitAppointmentRescheduled(
    executor: DbExecutor,
    input: {
      businessId: string;
      appointmentId: string;
      previousVersion: string;
      oldStartAt: Date;
      oldEndAt: Date;
      newStartAt: Date;
      newEndAt: Date;
      status: AppointmentStatus;
    }
  ) {
    return requireInserted(executor, {
      businessId: input.businessId,
      appointmentId: input.appointmentId,
      eventType: "APPOINTMENT_RESCHEDULED",
      payloadVersion: NOTIFICATION_OUTBOX_PAYLOAD_VERSION,
      payload: {
        oldStartAt: input.oldStartAt.toISOString(),
        oldEndAt: input.oldEndAt.toISOString(),
        newStartAt: input.newStartAt.toISOString(),
        newEndAt: input.newEndAt.toISOString(),
        status: input.status,
      },
      idempotencyKey: appointmentRescheduledIdempotencyKey(input),
    });
  },

  async emitAppointmentCancelled(
    executor: DbExecutor,
    input: {
      businessId: string;
      appointmentId: string;
      startAt: Date;
      endAt: Date;
      previousStatus: AppointmentStatus;
    }
  ) {
    return requireInserted(executor, {
      businessId: input.businessId,
      appointmentId: input.appointmentId,
      eventType: "APPOINTMENT_CANCELLED",
      payloadVersion: NOTIFICATION_OUTBOX_PAYLOAD_VERSION,
      payload: {
        startAt: input.startAt.toISOString(),
        endAt: input.endAt.toISOString(),
        previousStatus: input.previousStatus,
        status: "CANCELLED",
      },
      idempotencyKey: appointmentCancelledIdempotencyKey(input),
    });
  },

  async claimPendingBatch(input: {
    workerId: unknown;
    batchSize?: number;
    referenceNow?: Date;
  }) {
    const batchSize = input.batchSize ?? 25;
    if (
      !isValidNotificationWorkerId(input.workerId) ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > NOTIFICATION_OUTBOX_MAX_BATCH_SIZE
    ) {
      throw new NotificationOutboxError("OUTBOX_INVALID_CLAIM");
    }
    try {
      return await NotificationOutboxRepository.claimPendingBatch({
        workerId: input.workerId,
        batchSize,
        referenceNow: input.referenceNow ?? new Date(),
      });
    } catch (error) {
      persistenceFailure(error);
    }
  },

  async markProcessed(input: {
    eventId: string;
    workerId: unknown;
    referenceNow?: Date;
  }): Promise<void> {
    if (!isValidNotificationWorkerId(input.workerId)) {
      throw new NotificationOutboxError("OUTBOX_INVALID_CLAIM");
    }
    let changed: boolean;
    try {
      changed = await NotificationOutboxRepository.markProcessed({
        eventId: input.eventId,
        workerId: input.workerId,
        referenceNow: input.referenceNow ?? new Date(),
      });
    } catch (error) {
      persistenceFailure(error);
    }
    if (!changed) throw new NotificationOutboxError("OUTBOX_CLAIM_NOT_OWNED");
  },

  async markFailed(input: {
    eventId: string;
    workerId: unknown;
    errorCode: unknown;
    referenceNow?: Date;
  }): Promise<{ terminal: boolean; availableAt: Date }> {
    if (!isValidNotificationWorkerId(input.workerId)) {
      throw new NotificationOutboxError("OUTBOX_INVALID_CLAIM");
    }
    let event: Awaited<ReturnType<typeof NotificationOutboxRepository.findById>>;
    try {
      event = await NotificationOutboxRepository.findById(input.eventId);
    } catch (error) {
      persistenceFailure(error);
    }
    if (
      !event ||
      event.status !== "PROCESSING" ||
      event.lockedBy !== input.workerId
    ) {
      throw new NotificationOutboxError("OUTBOX_CLAIM_NOT_OWNED");
    }

    const referenceNow = input.referenceNow ?? new Date();
    const terminal = event.attemptCount >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
    const availableAt = terminal
      ? referenceNow
      : new Date(
          referenceNow.getTime() +
            getNotificationRetryDelayMs(event.attemptCount)
        );
    let changed: boolean;
    try {
      changed = await NotificationOutboxRepository.markFailed({
        eventId: input.eventId,
        workerId: input.workerId,
        errorCode: sanitizeNotificationErrorCode(input.errorCode),
        availableAt,
      });
    } catch (error) {
      persistenceFailure(error);
    }
    if (!changed) throw new NotificationOutboxError("OUTBOX_CLAIM_NOT_OWNED");
    return { terminal, availableAt };
  },
};
