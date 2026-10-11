import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const appointmentAccessTokens = pgTable(
  "appointment_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("appointment_access_tokens_token_hash_key").on(table.tokenHash),
    foreignKey({
      columns: [table.businessId, table.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
      name: "appointment_access_tokens_appointment_fkey",
    }).onDelete("cascade"),
    index("appointment_access_tokens_business_appointment_idx").on(
      table.businessId,
      table.appointmentId
    ),
    check(
      "appointment_access_tokens_hash_length_check",
      sql`char_length(${table.tokenHash}) = 64`
    ),
    check(
      "appointment_access_tokens_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
  ]
);

export type AppointmentAccessToken = typeof appointmentAccessTokens.$inferSelect;
export type NewAppointmentAccessToken = typeof appointmentAccessTokens.$inferInsert;
