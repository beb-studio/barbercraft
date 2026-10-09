import { pgTable, uuid, text, boolean, timestamp, primaryKey, unique, foreignKey } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { businessMembers } from "./members";
import { services } from "./services";

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    businessMemberId: uuid("business_member_id")
      .notNull()
      .unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    profileImageUrl: text("profile_image_url"),
    publicBookingEnabled: boolean("public_booking_enabled").default(true).notNull(),
    usesBusinessHours: boolean("uses_business_hours").default(true).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("staff_profiles_business_id_id_key").on(table.businessId, table.id),
    foreignKey({
      columns: [table.businessId, table.businessMemberId],
      foreignColumns: [businessMembers.businessId, businessMembers.id],
      name: "staff_profiles_member_fkey",
    }),
  ]
);

export const staffServices = pgTable(
  "staff_services",
  {
    businessId: uuid("business_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.staffId, table.serviceId] }),
    foreignKey({
      columns: [table.businessId, table.staffId],
      foreignColumns: [staffProfiles.businessId, staffProfiles.id],
      name: "staff_services_staff_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.businessId, table.serviceId],
      foreignColumns: [services.businessId, services.id],
      name: "staff_services_service_fkey",
    }).onDelete("cascade"),
  ]
);

export type StaffProfile = typeof staffProfiles.$inferSelect;
export type NewStaffProfile = typeof staffProfiles.$inferInsert;
export type StaffService = typeof staffServices.$inferSelect;
export type NewStaffService = typeof staffServices.$inferInsert;
