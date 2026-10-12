import { sql } from "drizzle-orm";
import {
  boolean,
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
import { appointments } from "./appointments";
import { businesses } from "./businesses";
import { notificationOutbox } from "./notification_outbox";

export const notificationPlanTypeEnum = pgEnum("notification_plan_type", [
  "APPOINTMENT_CREATED",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_REMINDER",
]);

export const notificationPlanStatusEnum = pgEnum("notification_plan_status", [
  "PENDING",
  "CANCELLED",
]);

export type NotificationPlanType =
  (typeof notificationPlanTypeEnum.enumValues)[number];
export type NotificationPlanStatus =
  (typeof notificationPlanStatusEnum.enumValues)[number];

/** One expandable notification policy record per tenant. */
export const businessNotificationSettings = pgTable(
  "business_notification_settings",
  {
    businessId: uuid("business_id").primaryKey(),
    customerNotificationsEnabled: boolean("customer_notifications_enabled")
      .default(false)
      .notNull(),
    appointmentCreatedEnabled: boolean("appointment_created_enabled")
      .default(true)
      .notNull(),
    appointmentRescheduledEnabled: boolean("appointment_rescheduled_enabled")
      .default(true)
      .notNull(),
    appointmentCancelledEnabled: boolean("appointment_cancelled_enabled")
      .default(true)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: "business_notification_settings_business_fkey",
    }).onDelete("cascade"),
  ]
);

export const businessNotificationReminderRules = pgTable(
  "business_notification_reminder_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    minutesBefore: integer("minutes_before").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [businesses.id],
      name: "business_notification_reminder_rules_business_fkey",
    }).onDelete("cascade"),
    unique("business_notification_reminder_rules_business_minutes_key").on(
      table.businessId,
      table.minutesBefore
    ),
    index("business_notification_reminder_rules_business_idx").on(
      table.businessId,
      table.enabled,
      table.minutesBefore
    ),
    check(
      "business_notification_reminder_rules_minutes_check",
      sql`${table.minutesBefore} BETWEEN 5 AND 43200`
    ),
  ]
);

/** Provider-neutral customer notification intent. Delivery state is deferred. */
export const notificationPlans = pgTable(
  "notification_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    sourceOutboxId: uuid("source_outbox_id"),
    type: notificationPlanTypeEnum("type").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    reminderOffsetMinutes: integer("reminder_offset_minutes"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: notificationPlanStatusEnum("status").default("PENDING").notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId, table.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
      name: "notification_plans_appointment_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.sourceOutboxId],
      foreignColumns: [notificationOutbox.businessId, notificationOutbox.id],
      name: "notification_plans_source_outbox_fkey",
    }).onDelete("restrict"),
    unique("notification_plans_idempotency_key_key").on(table.idempotencyKey),
    index("notification_plans_due_idx")
      .on(table.scheduledFor, table.createdAt, table.id)
      .where(sql`${table.status} = 'PENDING'`),
    index("notification_plans_appointment_idx").on(
      table.businessId,
      table.appointmentId,
      table.status,
      table.type,
      table.scheduledFor
    ),
    index("notification_plans_business_reminder_idx")
      .on(table.businessId, table.scheduledFor)
      .where(
        sql`${table.status} = 'PENDING' AND ${table.type} = 'APPOINTMENT_REMINDER'`
      ),
    check(
      "notification_plans_idempotency_key_check",
      sql`char_length(${table.idempotencyKey}) = 64`
    ),
    check(
      "notification_plans_reminder_shape_check",
      sql`(
        (${table.type} = 'APPOINTMENT_REMINDER' AND ${table.reminderOffsetMinutes} BETWEEN 5 AND 43200 AND ${table.sourceOutboxId} IS NULL)
        OR
        (${table.type} <> 'APPOINTMENT_REMINDER' AND ${table.reminderOffsetMinutes} IS NULL AND ${table.sourceOutboxId} IS NOT NULL)
      )`
    ),
    check(
      "notification_plans_cancelled_state_check",
      sql`(
        (${table.status} = 'CANCELLED' AND ${table.cancelledAt} IS NOT NULL)
        OR
        (${table.status} = 'PENDING' AND ${table.cancelledAt} IS NULL)
      )`
    ),
  ]
);

export type BusinessNotificationSettings =
  typeof businessNotificationSettings.$inferSelect;
export type BusinessNotificationReminderRule =
  typeof businessNotificationReminderRules.$inferSelect;
export type NotificationPlan = typeof notificationPlans.$inferSelect;
