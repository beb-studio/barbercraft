import { pgTable, uuid, smallint, time, boolean, timestamp, text, pgEnum, unique, foreignKey, index } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { staffProfiles } from "./staff";

export const timeBlockTypeEnum = pgEnum("time_block_type", [
  "TIME_OFF",
  "BREAK",
  "BLOCKED",
]);

export const businessWorkingHours = pgTable(
  "business_working_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    isClosed: boolean("is_closed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("business_working_hours_business_day_key").on(table.businessId, table.dayOfWeek),
  ]
);

export const staffWorkingHours = pgTable(
  "staff_working_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    dayOfWeek: smallint("day_of_week").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    isWorking: boolean("is_working").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("staff_working_hours_business_staff_day_key").on(
      table.businessId,
      table.staffId,
      table.dayOfWeek
    ),
    foreignKey({
      columns: [table.businessId, table.staffId],
      foreignColumns: [staffProfiles.businessId, staffProfiles.id],
      name: "staff_working_hours_staff_fkey",
    }).onDelete("cascade"),
  ]
);

export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id"),
    blockType: timeBlockTypeEnum("block_type").default("BLOCKED").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId, table.staffId],
      foreignColumns: [staffProfiles.businessId, staffProfiles.id],
      name: "time_blocks_staff_fkey",
    }).onDelete("cascade"),
    index("time_blocks_business_staff_time_idx").on(
      table.businessId,
      table.staffId,
      table.startTime,
      table.endTime
    ),
  ]
);

export type BusinessWorkingHour = typeof businessWorkingHours.$inferSelect;
export type NewBusinessWorkingHour = typeof businessWorkingHours.$inferInsert;
export type StaffWorkingHour = typeof staffWorkingHours.$inferSelect;
export type NewStaffWorkingHour = typeof staffWorkingHours.$inferInsert;
export type TimeBlock = typeof timeBlocks.$inferSelect;
export type NewTimeBlock = typeof timeBlocks.$inferInsert;
export type TimeBlockType = "TIME_OFF" | "BREAK" | "BLOCKED";
