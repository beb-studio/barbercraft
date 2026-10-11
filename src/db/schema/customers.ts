import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, unique, index, foreignKey, check } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { businessMembers } from "./members";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    phone: text("phone").notNull(),
    normalizedPhone: text("normalized_phone").notNull(),
    phoneComparisonKey: text("phone_comparison_key").notNull(),
    mergedIntoCustomerId: uuid("merged_into_customer_id"),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergedByBusinessMemberId: uuid("merged_by_business_member_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("customers_business_phone_key").on(table.businessId, table.normalizedPhone),
    unique("customers_business_id_id_key").on(table.businessId, table.id),
    foreignKey({
      columns: [table.businessId, table.mergedIntoCustomerId],
      foreignColumns: [table.businessId, table.id],
      name: "customers_merged_into_customer_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessId, table.mergedByBusinessMemberId],
      foreignColumns: [businessMembers.businessId, businessMembers.id],
      name: "customers_merged_by_business_member_fkey",
    }).onDelete("restrict"),
    check(
      "customers_no_self_merge_check",
      sql`${table.mergedIntoCustomerId} IS NULL OR ${table.mergedIntoCustomerId} <> ${table.id}`
    ),
    check(
      "customers_merge_metadata_check",
      sql`(${table.mergedIntoCustomerId} IS NULL AND ${table.mergedAt} IS NULL AND ${table.mergedByBusinessMemberId} IS NULL) OR (${table.mergedIntoCustomerId} IS NOT NULL AND ${table.mergedAt} IS NOT NULL AND ${table.mergedByBusinessMemberId} IS NOT NULL)`
    ),
    index("customers_business_phone_comparison_idx").on(table.businessId, table.phoneComparisonKey),
    index("customers_business_merged_into_idx").on(table.businessId, table.mergedIntoCustomerId),
  ]
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
