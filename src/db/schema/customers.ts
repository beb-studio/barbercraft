import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";

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
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("customers_business_phone_key").on(table.businessId, table.normalizedPhone),
    unique("customers_business_id_id_key").on(table.businessId, table.id),
  ]
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
