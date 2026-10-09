import { pgTable, uuid, text, timestamp, index, foreignKey } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { customers } from "./customers";
import { businessMembers } from "./members";

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    content: text("content").notNull(),
    createdByBusinessMemberId: uuid("created_by_business_member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId, table.customerId],
      foreignColumns: [customers.businessId, customers.id],
      name: "customer_notes_customer_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.businessId, table.createdByBusinessMemberId],
      foreignColumns: [businessMembers.businessId, businessMembers.id],
      name: "customer_notes_business_member_fkey",
    }).onDelete("restrict"),
    index("customer_notes_business_customer_idx").on(table.businessId, table.customerId, table.createdAt.desc()),
  ]
);

export type CustomerNote = typeof customerNotes.$inferSelect;
export type NewCustomerNote = typeof customerNotes.$inferInsert;
