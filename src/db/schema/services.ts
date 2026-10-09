import { pgTable, uuid, text, integer, numeric, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("services_business_id_id_key").on(table.businessId, table.id),
  ]
);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
