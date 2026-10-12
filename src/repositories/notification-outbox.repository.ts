import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { notificationOutbox } from "@/db/schema/notification_outbox";
import type {
  AppointmentNotificationEventType,
  NotificationOutboxStatus,
} from "@/db/schema/notification_outbox";
import {
  NOTIFICATION_OUTBOX_LEASE_MS,
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  type ClaimedNotificationEvent,
} from "@/lib/notification-outbox";

export interface InsertNotificationEventInput {
  businessId: string;
  appointmentId: string;
  eventType: AppointmentNotificationEventType;
  payloadVersion: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export const NotificationOutboxRepository = {
  async insertEvent(executor: DbExecutor, input: InsertNotificationEventInput) {
    const [event] = await executor
      .insert(notificationOutbox)
      .values(input)
      .onConflictDoNothing({ target: notificationOutbox.idempotencyKey })
      .returning({ id: notificationOutbox.id });
    return event ?? null;
  },

  async claimPendingBatch(input: {
    workerId: string;
    batchSize: number;
    referenceNow: Date;
  }): Promise<ClaimedNotificationEvent[]> {
    return db.transaction(async (tx) => {
      const staleBefore = new Date(
        input.referenceNow.getTime() - NOTIFICATION_OUTBOX_LEASE_MS
      );
      // A worker may crash during the final permitted attempt. Convert that
      // expired lease into durable terminal failure before looking for work so
      // it never remains PROCESSING forever and is never delivered a ninth time.
      await tx.execute(sql`
        UPDATE notification_outbox
        SET status = 'FAILED',
            available_at = ${input.referenceNow},
            locked_at = NULL,
            locked_by = NULL,
            last_error_code = COALESCE(last_error_code, 'LEASE_EXPIRED'),
            updated_at = ${input.referenceNow}
        WHERE status = 'PROCESSING'
          AND attempt_count >= ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS}
          AND locked_at <= ${staleBefore}
      `);
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id
          FROM notification_outbox
          WHERE attempt_count < ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS}
            AND available_at <= ${input.referenceNow}
            AND (
              status IN ('PENDING', 'FAILED')
              OR (status = 'PROCESSING' AND locked_at <= ${staleBefore})
            )
          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.batchSize}
        )
        UPDATE notification_outbox AS event
        SET status = 'PROCESSING',
            locked_at = ${input.referenceNow},
            locked_by = ${input.workerId},
            attempt_count = event.attempt_count + 1,
            updated_at = ${input.referenceNow}
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id, event.business_id, event.appointment_id,
          event.event_type, event.payload_version, event.payload, event.status,
          event.available_at, event.attempt_count, event.locked_at,
          event.locked_by, event.created_at
      `);

      return result.rows.map((row) => ({
        id: row.id as string,
        businessId: row.business_id as string,
        appointmentId: row.appointment_id as string,
        eventType: row.event_type as AppointmentNotificationEventType,
        payloadVersion: row.payload_version as number,
        payload: row.payload as Record<string, unknown>,
        status: row.status as NotificationOutboxStatus,
        availableAt: asDate(row.available_at as Date | string),
        attemptCount: row.attempt_count as number,
        lockedAt: asDate(row.locked_at as Date | string),
        lockedBy: row.locked_by as string,
        createdAt: asDate(row.created_at as Date | string),
      }));
    });
  },

  async markProcessed(input: {
    eventId: string;
    workerId: string;
    referenceNow: Date;
  }, executor: DbExecutor = db): Promise<boolean> {
    const rows = await executor
      .update(notificationOutbox)
      .set({
        status: "PROCESSED",
        processedAt: input.referenceNow,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
      })
      .where(
        and(
          eq(notificationOutbox.id, input.eventId),
          eq(notificationOutbox.status, "PROCESSING"),
          eq(notificationOutbox.lockedBy, input.workerId)
        )
      )
      .returning({ id: notificationOutbox.id });
    return rows.length === 1;
  },

  async markFailed(input: {
    eventId: string;
    workerId: string;
    errorCode: string;
    availableAt: Date;
  }): Promise<boolean> {
    const rows = await db
      .update(notificationOutbox)
      .set({
        status: "FAILED",
        availableAt: input.availableAt,
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        lastErrorCode: input.errorCode,
      })
      .where(
        and(
          eq(notificationOutbox.id, input.eventId),
          eq(notificationOutbox.status, "PROCESSING"),
          eq(notificationOutbox.lockedBy, input.workerId)
        )
      )
      .returning({ id: notificationOutbox.id });
    return rows.length === 1;
  },

  async findById(eventId: string) {
    const [row] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, eventId))
      .limit(1);
    return row ?? null;
  },
};
