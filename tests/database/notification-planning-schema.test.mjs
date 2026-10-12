import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { applyMigrationFile, migrationsDir, startDatabase } from "./db.mjs";

const uuid = (n) => `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = {
  user: uuid(1), businessA: uuid(10), businessB: uuid(11), member: uuid(20),
  staff: uuid(30), service: uuid(40), customer: uuid(50), appointment: uuid(60),
};
let database;

async function seed(pool) {
  await pool.query("INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'Plan Owner', 'plan-owner@test.local', true)", [ids.user]);
  await pool.query("INSERT INTO businesses (id, name, slug, timezone, currency) VALUES ($1, 'Plan A', 'plan-a', 'UTC', 'TRY'), ($2, 'Plan B', 'plan-b', 'UTC', 'TRY')", [ids.businessA, ids.businessB]);
  await pool.query("INSERT INTO business_members (id, business_id, user_id, role) VALUES ($1, $2, $3, 'OWNER')", [ids.member, ids.businessA, ids.user]);
  await pool.query("INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name) VALUES ($1, $2, $3, 'Plan', 'Staff')", [ids.staff, ids.businessA, ids.member]);
  await pool.query("INSERT INTO services (id, business_id, name, duration_minutes, price) VALUES ($1, $2, 'Plan Service', 30, 200)", [ids.service, ids.businessA]);
  await pool.query("INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES ($1, $2, 'Plan Customer', '+905550001701', '+905550001701')", [ids.customer, ids.businessA]);
  await pool.query("INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES ($1, $2, $3, $4, $5, '2031-01-10T10:00:00Z', '2031-01-10T10:30:00Z', 'CONFIRMED', 'Plan Service', 30, 200)", [ids.appointment, ids.businessA, ids.customer, ids.staff, ids.service]);
}

before(async () => { database = await startDatabase(); await seed(database.pool); });
after(async () => { await database?.stop(); });

describe("Notification planning schema", { concurrency: false }, () => {
  it("creates a safe default notification settings row for every business", async () => {
    const result = await database.pool.query("SELECT customer_notifications_enabled, appointment_created_enabled, appointment_rescheduled_enabled, appointment_cancelled_enabled FROM business_notification_settings WHERE business_id = $1", [ids.businessA]);
    assert.deepEqual(result.rows[0], { customer_notifications_enabled: false, appointment_created_enabled: true, appointment_rescheduled_enabled: true, appointment_cancelled_enabled: true });
    const inserted = await database.pool.query("INSERT INTO businesses (name, slug, timezone, currency) VALUES ('Plan C', 'plan-c', 'UTC', 'TRY') RETURNING id");
    const generated = await database.pool.query("SELECT count(*)::int AS count FROM business_notification_settings WHERE business_id = $1", [inserted.rows[0].id]);
    assert.equal(generated.rows[0].count, 1);
  });

  it("enforces canonical reminder offsets and their database bounds", async () => {
    await database.pool.query("INSERT INTO business_notification_reminder_rules (business_id, minutes_before) VALUES ($1, 1440)", [ids.businessA]);
    await assert.rejects(database.pool.query("INSERT INTO business_notification_reminder_rules (business_id, minutes_before) VALUES ($1, 1440)", [ids.businessA]), (error) => error?.code === "23505");
    for (const minutes of [4, 43201]) {
      await assert.rejects(database.pool.query("INSERT INTO business_notification_reminder_rules (business_id, minutes_before) VALUES ($1, $2)", [ids.businessA, minutes]), (error) => error?.code === "23514");
    }
  });

  it("rejects cross-tenant plan appointment and source-event relationships", async () => {
    const outbox = await database.pool.query("INSERT INTO notification_outbox (business_id, appointment_id, event_type, payload, idempotency_key) VALUES ($1, $2, 'APPOINTMENT_CREATED', '{}'::jsonb, $3) RETURNING id", [ids.businessA, ids.appointment, "a".repeat(64)]);
    await assert.rejects(database.pool.query("INSERT INTO notification_plans (business_id, appointment_id, source_outbox_id, type, scheduled_for, idempotency_key) VALUES ($1, $2, $3, 'APPOINTMENT_CREATED', NOW(), $4)", [ids.businessB, ids.appointment, outbox.rows[0].id, "b".repeat(64)]), (error) => error?.code === "23503");
  });

  it("upgrades existing tenants without modifying appointments, outbox, or manufacturing plans", async () => {
    const upgrade = await startDatabase({ throughMigration: "0016_notification_outbox.sql" });
    try {
      await seed(upgrade.pool);
      await upgrade.pool.query("INSERT INTO notification_outbox (business_id, appointment_id, event_type, payload, idempotency_key) VALUES ($1, $2, 'APPOINTMENT_CREATED', '{}'::jsonb, $3)", [ids.businessA, ids.appointment, "c".repeat(64)]);
      const before = await upgrade.pool.query("SELECT (SELECT count(*)::int FROM appointments) AS appointments, (SELECT count(*)::int FROM notification_outbox) AS outbox");
      await applyMigrationFile(upgrade.pool, path.join(migrationsDir, "0017_notification_planning.sql"));
      const after = await upgrade.pool.query("SELECT (SELECT count(*)::int FROM appointments) AS appointments, (SELECT count(*)::int FROM notification_outbox) AS outbox, (SELECT count(*)::int FROM notification_plans) AS plans, (SELECT count(*)::int FROM business_notification_settings) AS settings");
      assert.equal(before.rows[0].appointments, 1);
      assert.equal(before.rows[0].outbox, 1);
      assert.deepEqual(after.rows[0], { appointments: 1, outbox: 1, plans: 0, settings: 2 });
    } finally { await upgrade.stop(); }
  });
});
