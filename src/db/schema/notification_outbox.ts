import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const appointmentNotificationEventTypeEnum = pgEnum(
  "appointment_notification_event_type",
  ["APPOINTMENT_CREATED", "APPOINTMENT_RESCHEDULED", "APPOINTMENT_CANCELLED"]
);

export const notificationOutboxStatusEnum = pgEnum(
  "notification_outbox_status",
  ["PENDING", "PROCESSING", "PROCESSED", "FAILED"]
);

export type AppointmentNotificationEventType =
  (typeof appointmentNotificationEventTypeEnum.enumValues)[number];
export type NotificationOutboxStatus =
  (typeof notificationOutboxStatusEnum.enumValues)[number];

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    eventType: appointmentNotificationEventTypeEnum("event_type").notNull(),
    payloadVersion: integer("payload_version").default(1).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: notificationOutboxStatusEnum("status").default("PENDING").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("notification_outbox_idempotency_key_key").on(table.idempotencyKey),
    unique("notification_outbox_business_id_id_key").on(
      table.businessId,
      table.id
    ),
    foreignKey({
      columns: [table.businessId, table.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
      name: "notification_outbox_appointment_fkey",
    }).onDelete("restrict"),
    index("notification_outbox_claim_idx")
      .on(table.availableAt, table.createdAt, table.id)
      .where(sql`${table.status} IN ('PENDING', 'FAILED')`),
    index("notification_outbox_processing_lease_idx")
      .on(table.lockedAt)
      .where(sql`${table.status} = 'PROCESSING'`),
    index("notification_outbox_business_appointment_idx").on(
      table.businessId,
      table.appointmentId,
      table.createdAt
    ),
    check(
      "notification_outbox_payload_version_check",
      sql`${table.payloadVersion} > 0`
    ),
    check(
      "notification_outbox_payload_object_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`
    ),
    check(
      "notification_outbox_idempotency_key_check",
      sql`char_length(${table.idempotencyKey}) = 64`
    ),
    check(
      "notification_outbox_attempt_count_check",
      sql`${table.attemptCount} >= 0 AND ${table.attemptCount} <= 8`
    ),
    check(
      "notification_outbox_lock_state_check",
      sql`(
        (${table.status} = 'PROCESSING' AND ${table.lockedAt} IS NOT NULL AND ${table.lockedBy} IS NOT NULL)
        OR
        (${table.status} <> 'PROCESSING' AND ${table.lockedAt} IS NULL AND ${table.lockedBy} IS NULL)
      )`
    ),
    check(
      "notification_outbox_processed_state_check",
      sql`(
        (${table.status} = 'PROCESSED' AND ${table.processedAt} IS NOT NULL)
        OR
        (${table.status} <> 'PROCESSED' AND ${table.processedAt} IS NULL)
      )`
    ),
    check(
      "notification_outbox_error_code_check",
      sql`${table.lastErrorCode} IS NULL OR char_length(${table.lastErrorCode}) BETWEEN 1 AND 64`
    ),
  ]
);

export type NotificationOutboxEvent = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutboxEvent = typeof notificationOutbox.$inferInsert;
