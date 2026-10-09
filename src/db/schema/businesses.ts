import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull(),
  currency: text("currency").notNull(),
  bookingIntervalMinutes: integer("booking_interval_minutes").default(15).notNull(),
  active: boolean("active").default(true).notNull(),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
