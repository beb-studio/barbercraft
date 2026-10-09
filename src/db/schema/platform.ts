import { pgTable, uuid, text, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";

export const platformAdminRoleEnum = pgEnum("platform_admin_role", [
  "SUPER_ADMIN",
  "ADMIN",
]);

export type PlatformAdminRole = (typeof platformAdminRoleEnum.enumValues)[number];

export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    role: platformAdminRoleEnum("role").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const platformAdminAuditLogs = pgTable(
  "platform_admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platformAdminId: uuid("platform_admin_id").references(() => platformAdmins.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type PlatformAdminAuditLog = typeof platformAdminAuditLogs.$inferSelect;
export type NewPlatformAdminAuditLog = typeof platformAdminAuditLogs.$inferInsert;
