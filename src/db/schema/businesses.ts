import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    phone: text("phone"),
    address: text("address"),
    logoUrl: text("logo_url"),
    timezone: text("timezone").notNull(),
    currency: text("currency").notNull(),
    bookingIntervalMinutes: integer("booking_interval_minutes").default(15).notNull(),
    minimumBookingLeadMinutes: integer("minimum_booking_lead_minutes")
      .default(0)
      .notNull(),
    maximumAdvanceBookingDays: integer("maximum_advance_booking_days"),
    cancellationNoticeMinutes: integer("cancellation_notice_minutes")
      .default(0)
      .notNull(),
    rescheduleNoticeMinutes: integer("reschedule_notice_minutes")
      .default(0)
      .notNull(),
    active: boolean("active").default(true).notNull(),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "businesses_minimum_booking_lead_minutes_check",
      sql`${table.minimumBookingLeadMinutes} BETWEEN 0 AND 525600`
    ),
    check(
      "businesses_maximum_advance_booking_days_check",
      sql`${table.maximumAdvanceBookingDays} IS NULL OR ${table.maximumAdvanceBookingDays} BETWEEN 1 AND 730`
    ),
    check(
      "businesses_cancellation_notice_minutes_check",
      sql`${table.cancellationNoticeMinutes} BETWEEN 0 AND 525600`
    ),
    check(
      "businesses_reschedule_notice_minutes_check",
      sql`${table.rescheduleNoticeMinutes} BETWEEN 0 AND 525600`
    ),
  ]
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
