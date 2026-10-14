import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import {
  notificationDeliveries,
  type NewNotificationDelivery,
  type NotificationDelivery,
  type NotificationDeliveryChannel,
  type NotificationDeliveryStatus,
} from "@/db/schema/notification_deliveries";
import {
  appointments,
  businesses,
  notificationPlans,
  type NotificationPlanType,
} from "@/db/schema";
import {
  NOTIFICATION_DELIVERY_LEASE_MS,
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
  PERMANENT_DELIVERY_ERROR_CODES,
  type ClaimedNotificationDelivery,
} from "@/lib/notification-delivery";


function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export interface InsertNotificationDeliveryInput {
  businessId: string;
  planId: string;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  recipient: string;
  provider: string;
  providerMessageId?: string | null;
  attemptCount?: number;
  availableAt?: Date;
  sentAt?: Date | null;
  failedAt?: Date | null;
  lastErrorCode?: string | null;
}

export interface DeliveryContextRow {
  delivery: NotificationDelivery;
  plan: {
    id: string;
    businessId: string;
    appointmentId: string;
    type: NotificationPlanType;
    status: string;
    scheduledFor: Date;
  };
  appointment: {
    id: string;
    businessId: string;
    customerId: string;
    staffId: string;
    serviceId: string;
    status: string;
    startTime: Date;
    endTime: Date;
    serviceNameSnapshot: string;
    serviceDurationSnapshot: number;
    servicePriceSnapshot: string;
  };
  business: {
    id: string;
    name: string;
    timezone: string;
  };
}

export const NotificationDeliveryRepository = {
  async insertDelivery(
    executor: DbExecutor,
    input: InsertNotificationDeliveryInput
  ): Promise<{ id: string } | null> {
    const values: NewNotificationDelivery = {
      businessId: input.businessId,
      planId: input.planId,
      channel: input.channel,
      status: input.status,
      recipient: input.recipient,
      provider: input.provider,
      providerMessageId: input.providerMessageId ?? null,
      attemptCount: input.attemptCount ?? 0,
      availableAt: input.availableAt ?? new Date(),
      sentAt: input.sentAt ?? null,
      failedAt: input.failedAt ?? null,
      lastErrorCode: input.lastErrorCode ?? null,
    };

    const [row] = await executor
      .insert(notificationDeliveries)
      .values(values)
      .onConflictDoNothing({
        target: [
          notificationDeliveries.planId,
          notificationDeliveries.channel,
        ],
      })
      .returning({ id: notificationDeliveries.id });

    return row ?? null;
  },

  async claimDueDeliveryBatch(input: {
    workerId: string;
    batchSize: number;
    referenceNow: Date;
  }): Promise<ClaimedNotificationDelivery[]> {
    return db.transaction(async (tx) => {
      const staleBefore = new Date(
        input.referenceNow.getTime() - NOTIFICATION_DELIVERY_LEASE_MS
      );

      // Clean up crashed/expired leases on the final attempt: mark terminal FAILED
      await tx.execute(sql`
        UPDATE notification_deliveries
        SET status = 'FAILED',
            available_at = ${input.referenceNow},
            failed_at = ${input.referenceNow},
            locked_at = NULL,
            locked_by = NULL,
            last_error_code = COALESCE(last_error_code, 'LEASE_EXPIRED'),
            updated_at = ${input.referenceNow}
        WHERE status = 'PROCESSING'
          AND attempt_count >= ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS}
          AND locked_at <= ${staleBefore}
      `);

      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id
          FROM notification_deliveries
          WHERE attempt_count < ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS}
            AND available_at <= ${input.referenceNow}
            AND (
              status = 'PENDING'
              OR (status = 'FAILED' AND (last_error_code IS NULL OR last_error_code NOT IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))
              OR (status = 'PROCESSING' AND locked_at <= ${staleBefore})
            )

          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.batchSize}
        )
        UPDATE notification_deliveries AS d
        SET status = 'PROCESSING',
            locked_at = ${input.referenceNow},
            locked_by = ${input.workerId},
            attempt_count = d.attempt_count + 1,
            updated_at = ${input.referenceNow}
        FROM candidates
        WHERE d.id = candidates.id
        RETURNING d.id, d.business_id, d.plan_id, d.channel, d.status, d.recipient,
          d.provider, d.provider_message_id, d.attempt_count, d.available_at,
          d.locked_at, d.locked_by, d.sent_at, d.failed_at, d.last_error_code,
          d.created_at, d.updated_at
      `);

      return result.rows.map((row) => ({
        id: row.id as string,
        businessId: row.business_id as string,
        planId: row.plan_id as string,
        channel: row.channel as NotificationDeliveryChannel,
        status: row.status as NotificationDeliveryStatus,
        recipient: row.recipient as string,
        provider: row.provider as string,
        providerMessageId: (row.provider_message_id as string | null) ?? null,
        attemptCount: row.attempt_count as number,
        availableAt: asDate(row.available_at as Date | string),
        lockedAt: row.locked_at ? asDate(row.locked_at as Date | string) : null,
        lockedBy: (row.locked_by as string | null) ?? null,
        sentAt: row.sent_at ? asDate(row.sent_at as Date | string) : null,
        failedAt: row.failed_at ? asDate(row.failed_at as Date | string) : null,
        lastErrorCode: (row.last_error_code as string | null) ?? null,
        createdAt: asDate(row.created_at as Date | string),
        updatedAt: asDate(row.updated_at as Date | string),
      }));
    });
  },

  async markSent(
    input: {
      deliveryId: string;
      workerId: string;
      providerMessageId?: string;
      referenceNow: Date;
    },
    executor: DbExecutor = db
  ): Promise<boolean> {
    const rows = await executor
      .update(notificationDeliveries)
      .set({
        status: "SENT",
        sentAt: input.referenceNow,
        providerMessageId: input.providerMessageId ?? null,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
      })
      .where(
        and(
          eq(notificationDeliveries.id, input.deliveryId),
          eq(notificationDeliveries.status, "PROCESSING"),
          eq(notificationDeliveries.lockedBy, input.workerId)
        )
      )
      .returning({ id: notificationDeliveries.id });

    return rows.length === 1;
  },

  async markFailed(
    input: {
      deliveryId: string;
      workerId: string;
      errorCode: string;
      isPermanent: boolean;
      availableAt: Date;
      referenceNow: Date;
    },
    executor: DbExecutor = db
  ): Promise<boolean> {
    const rows = await executor
      .update(notificationDeliveries)
      .set({
        status: "FAILED",
        availableAt: input.isPermanent
          ? input.referenceNow
          : input.availableAt,
        failedAt: input.referenceNow,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: input.errorCode,
      })
      .where(
        and(
          eq(notificationDeliveries.id, input.deliveryId),
          eq(notificationDeliveries.status, "PROCESSING"),
          eq(notificationDeliveries.lockedBy, input.workerId)
        )
      )
      .returning({ id: notificationDeliveries.id });

    return rows.length === 1;
  },

  async markCancelled(
    input: {
      deliveryId: string;
      workerId?: string;
      referenceNow: Date;
    },
    executor: DbExecutor = db
  ): Promise<boolean> {
    const clauses = [eq(notificationDeliveries.id, input.deliveryId)];
    if (input.workerId) {
      clauses.push(eq(notificationDeliveries.lockedBy, input.workerId));
    }

    const rows = await executor
      .update(notificationDeliveries)
      .set({
        status: "CANCELLED",
        lockedAt: null,
        lockedBy: null,
      })
      .where(and(...clauses))
      .returning({ id: notificationDeliveries.id });

    return rows.length === 1;
  },

  async findDuePendingPlans(
    executor: DbExecutor,
    input: {
      referenceNow: Date;
      channel: NotificationDeliveryChannel;
      limit: number;
    }
  ) {
    const result = await executor.execute(sql`
      SELECT p.id, p.business_id, p.appointment_id, p.type, p.scheduled_for
      FROM notification_plans p
      WHERE p.status = 'PENDING'
        AND p.scheduled_for <= ${input.referenceNow}
        AND NOT EXISTS (
          SELECT 1
          FROM notification_deliveries d
          WHERE d.plan_id = p.id
            AND d.channel::text = ${input.channel}
        )
      ORDER BY p.scheduled_for ASC, p.created_at ASC, p.id ASC
      LIMIT ${input.limit}
    `);

    return result.rows.map((row) => ({
      id: row.id as string,
      businessId: row.business_id as string,
      appointmentId: row.appointment_id as string,
      type: row.type as NotificationPlanType,
      scheduledFor: asDate(row.scheduled_for as Date | string),
    }));
  },

  async lockPlanForMaterialization(
    executor: DbExecutor,
    businessId: string,
    planId: string
  ) {
    const result = await executor.execute(sql`
      SELECT id, business_id, appointment_id, type, status, scheduled_for
      FROM notification_plans
      WHERE business_id = ${businessId}
        AND id = ${planId}
      FOR UPDATE
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      businessId: row.business_id as string,
      appointmentId: row.appointment_id as string,
      type: row.type as NotificationPlanType,
      status: row.status as string,
      scheduledFor: asDate(row.scheduled_for as Date | string),
    };
  },

  async lockAppointmentForDelivery(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string
  ) {
    const result = await executor.execute(sql`
      SELECT id, business_id, customer_id, staff_id, service_id,
        status, start_time, end_time, service_name_snapshot,
        service_duration_snapshot, service_price_snapshot
      FROM appointments
      WHERE business_id = ${businessId}
        AND id = ${appointmentId}
      FOR UPDATE
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      businessId: row.business_id as string,
      customerId: row.customer_id as string,
      staffId: row.staff_id as string,
      serviceId: row.service_id as string,
      status: row.status as string,
      startTime: asDate(row.start_time as Date | string),
      endTime: asDate(row.end_time as Date | string),
      serviceNameSnapshot: row.service_name_snapshot as string,
      serviceDurationSnapshot: row.service_duration_snapshot as number,
      servicePriceSnapshot: row.service_price_snapshot as string,
    };
  },

  async findDeliveryById(
    executor: DbExecutor,
    id: string
  ): Promise<NotificationDelivery | null> {
    const [row] = await executor
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, id))
      .limit(1);

    return row ?? null;
  },

  async findDeliveryByPlanAndChannel(
    executor: DbExecutor,
    planId: string,
    channel: NotificationDeliveryChannel
  ): Promise<NotificationDelivery | null> {
    const [row] = await executor
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.planId, planId),
          eq(notificationDeliveries.channel, channel)
        )
      )
      .limit(1);

    return row ?? null;
  },

  async findDeliveryContext(
    executor: DbExecutor,
    deliveryId: string
  ): Promise<DeliveryContextRow | null> {
    const [row] = await executor
      .select({
        delivery: notificationDeliveries,
        plan: {
          id: notificationPlans.id,
          businessId: notificationPlans.businessId,
          appointmentId: notificationPlans.appointmentId,
          type: notificationPlans.type,
          status: notificationPlans.status,
          scheduledFor: notificationPlans.scheduledFor,
        },
        appointment: {
          id: appointments.id,
          businessId: appointments.businessId,
          customerId: appointments.customerId,
          staffId: appointments.staffId,
          serviceId: appointments.serviceId,
          status: appointments.status,
          startTime: appointments.startTime,
          endTime: appointments.endTime,
          serviceNameSnapshot: appointments.serviceNameSnapshot,
          serviceDurationSnapshot: appointments.serviceDurationSnapshot,
          servicePriceSnapshot: appointments.servicePriceSnapshot,
        },
        business: {
          id: businesses.id,
          name: businesses.name,
          timezone: businesses.timezone,
        },
      })
      .from(notificationDeliveries)
      .innerJoin(
        notificationPlans,
        and(
          eq(notificationDeliveries.businessId, notificationPlans.businessId),
          eq(notificationDeliveries.planId, notificationPlans.id)
        )
      )
      .innerJoin(
        appointments,
        and(
          eq(notificationPlans.businessId, appointments.businessId),
          eq(notificationPlans.appointmentId, appointments.id)
        )
      )
      .innerJoin(businesses, eq(notificationDeliveries.businessId, businesses.id))
      .where(eq(notificationDeliveries.id, deliveryId))
      .limit(1);

    return row ?? null;
  },
};
