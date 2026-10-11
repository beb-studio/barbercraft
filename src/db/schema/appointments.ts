import { pgTable, uuid, integer, numeric, text, timestamp, pgEnum, foreignKey, index, unique } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { staffProfiles } from "./staff";
import { services } from "./services";

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);

export const appointmentSourceEnum = pgEnum("appointment_source", [
  "PUBLIC_WEB",
  "MANUAL_ADMIN",
  "MANUAL_STAFF",
]);

export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type AppointmentSource = (typeof appointmentSourceEnum.enumValues)[number];

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").default("PENDING").notNull(),
    source: appointmentSourceEnum("source").default("PUBLIC_WEB").notNull(),
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    serviceDurationSnapshot: integer("service_duration_snapshot").notNull(),
    servicePriceSnapshot: numeric("service_price_snapshot", { precision: 10, scale: 2 }).notNull(),
    cancellationReason: text("cancellation_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("appointments_business_id_id_key").on(table.businessId, table.id),
    foreignKey({
      columns: [table.businessId, table.customerId],
      foreignColumns: [customers.businessId, customers.id],
      name: "appointments_customer_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.staffId],
      foreignColumns: [staffProfiles.businessId, staffProfiles.id],
      name: "appointments_staff_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.serviceId],
      foreignColumns: [services.businessId, services.id],
      name: "appointments_service_fkey",
    }).onDelete("restrict"),
    index("appointments_business_time_idx").on(table.businessId, table.startTime, table.endTime),
    index("appointments_business_staff_time_idx").on(table.businessId, table.staffId, table.startTime),
    index("appointments_business_customer_idx").on(table.businessId, table.customerId),
  ]
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
