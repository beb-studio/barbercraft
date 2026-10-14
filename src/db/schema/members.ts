import { pgTable, uuid, boolean, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { users } from "./users";

export const businessMemberRoleEnum = pgEnum("business_member_role", [
  "OWNER",
  "MANAGER",
  "STAFF",
]);

export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: businessMemberRoleEnum("role").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("business_members_business_user_key").on(table.businessId, table.userId),
    unique("business_members_business_id_id_key").on(table.businessId, table.id),
  ]
);

export type BusinessMember = typeof businessMembers.$inferSelect;
export type NewBusinessMember = typeof businessMembers.$inferInsert;
