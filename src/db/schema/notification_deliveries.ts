import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { notificationPlans } from "./notification_planning";

export const notificationDeliveryChannelEnum = pgEnum(
  "notification_delivery_channel",
  ["SMS"]
);

export const notificationDeliveryStatusEnum = pgEnum(
  "notification_delivery_status",
  ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"]
);

export type NotificationDeliveryChannel =
  (typeof notificationDeliveryChannelEnum.enumValues)[number];

export type NotificationDeliveryStatus =
  (typeof notificationDeliveryStatusEnum.enumValues)[number];

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    planId: uuid("plan_id").notNull(),
    channel: notificationDeliveryChannelEnum("channel").default("SMS").notNull(),
    status: notificationDeliveryStatusEnum("status").default("PENDING").notNull(),
    recipient: text("recipient").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("notification_deliveries_plan_channel_key").on(
      table.planId,
      table.channel
    ),
    unique("notification_deliveries_business_id_id_key").on(
      table.businessId,
      table.id
    ),
    foreignKey({
      columns: [table.businessId, table.planId],
      foreignColumns: [notificationPlans.businessId, notificationPlans.id],
      name: "notification_deliveries_plan_fkey",
    }).onDelete("restrict"),
    index("notification_deliveries_claim_idx")
      .on(table.availableAt, table.createdAt, table.id)
      .where(sql`${table.status} IN ('PENDING', 'FAILED')`),
    index("notification_deliveries_processing_lease_idx")
      .on(table.lockedAt)
      .where(sql`${table.status} = 'PROCESSING'`),
    index("notification_deliveries_business_plan_idx").on(
      table.businessId,
      table.planId,
      table.status
    ),
    check(
      "notification_deliveries_attempt_count_check",
      sql`${table.attemptCount} >= 0 AND ${table.attemptCount} <= 8`
    ),
    check(
      "notification_deliveries_recipient_length_check",
      sql`char_length(${table.recipient}) >= 3`
    ),
    check(
      "notification_deliveries_error_code_length_check",
      sql`${table.lastErrorCode} IS NULL OR char_length(${table.lastErrorCode}) <= 64`
    ),
    check(
      "notification_deliveries_lock_state_check",
      sql`(
        (${table.status} = 'PROCESSING' AND ${table.lockedAt} IS NOT NULL AND ${table.lockedBy} IS NOT NULL)
        OR
        (${table.status} <> 'PROCESSING' AND ${table.lockedAt} IS NULL AND ${table.lockedBy} IS NULL)
      )`
    ),
    check(
      "notification_deliveries_sent_state_check",
      sql`(
        (${table.status} = 'SENT' AND ${table.sentAt} IS NOT NULL)
        OR
        (${table.status} <> 'SENT')
      )`
    ),
    check(
      "notification_deliveries_failed_state_check",
      sql`(
        (${table.status} = 'FAILED' AND ${table.failedAt} IS NOT NULL)
        OR
        (${table.status} <> 'FAILED')
      )`
    ),
  ]
);

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
