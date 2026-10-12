import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { applyMigrationFile, migrationsDir, startDatabase } from "./db.mjs";

const uuid = (n) => `97000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = {
  user: uuid(1),
  businessA: uuid(10),
  businessB: uuid(11),
  member: uuid(20),
  staff: uuid(30),
  service: uuid(40),
  customer: uuid(50),
  appointment: uuid(60),
  outbox: uuid(70),
  planA: uuid(80),
  planB: uuid(81),
};

let database;

async function seed(pool) {
  await pool.query(
    "INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'Deliv Owner', 'deliv-owner@test.local', true)",
    [ids.user]
  );
  await pool.query(
    "INSERT INTO businesses (id, name, slug, timezone, currency) VALUES ($1, 'Deliv A', 'deliv-a', 'UTC', 'TRY'), ($2, 'Deliv B', 'deliv-b', 'UTC', 'TRY')",
    [ids.businessA, ids.businessB]
  );
  await pool.query(
    "INSERT INTO business_members (id, business_id, user_id, role) VALUES ($1, $2, $3, 'OWNER')",
    [ids.member, ids.businessA, ids.user]
  );
  await pool.query(
    "INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name) VALUES ($1, $2, $3, 'Deliv', 'Staff')",
    [ids.staff, ids.businessA, ids.member]
  );
  await pool.query(
    "INSERT INTO services (id, business_id, name, duration_minutes, price) VALUES ($1, $2, 'Deliv Service', 30, 200)",
    [ids.service, ids.businessA]
  );
  await pool.query(
    "INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES ($1, $2, 'Deliv Customer', '+905550001901', '+905550001901')",
    [ids.customer, ids.businessA]
  );
  await pool.query(
    "INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES ($1, $2, $3, $4, $5, '2031-01-10T10:00:00Z', '2031-01-10T10:30:00Z', 'CONFIRMED', 'Deliv Service', 30, 200)",
    [ids.appointment, ids.businessA, ids.customer, ids.staff, ids.service]
  );
  await pool.query(
    "INSERT INTO notification_outbox (id, business_id, appointment_id, event_type, payload, idempotency_key) VALUES ($1, $2, $3, 'APPOINTMENT_CREATED', '{}'::jsonb, $4)",
    [ids.outbox, ids.businessA, ids.appointment, "a".repeat(64)]
  );
  await pool.query(
    "INSERT INTO notification_plans (id, business_id, appointment_id, source_outbox_id, type, scheduled_for, idempotency_key) VALUES ($1, $2, $3, $4, 'APPOINTMENT_CREATED', NOW(), $5)",
    [ids.planA, ids.businessA, ids.appointment, ids.outbox, "p".repeat(64)]
  );
}

before(async () => {
  database = await startDatabase();
  await seed(database.pool);
});

after(async () => {
  await database?.stop();
});

describe("Notification delivery schema", { concurrency: false }, () => {
  it("accepts valid same-tenant delivery", async () => {
    const res = await database.pool.query(
      `INSERT INTO notification_deliveries (
        business_id, plan_id, channel, status, recipient, provider
      ) VALUES ($1, $2, 'SMS', 'PENDING', '+905550001901', 'netgsm')
      RETURNING id, channel, status, recipient, provider, attempt_count`,
      [ids.businessA, ids.planA]
    );

    assert.equal(res.rows.length, 1);
    assert.deepEqual(res.rows[0], {
      id: res.rows[0].id,
      channel: "SMS",
      status: "PENDING",
      recipient: "+905550001901",
      provider: "netgsm",
      attempt_count: 0,
    });
  });

  it("rejects cross-tenant plan/delivery relationship", async () => {
    const crossPlan = uuid(89);
    await database.pool.query(
      "INSERT INTO notification_plans (id, business_id, appointment_id, source_outbox_id, type, scheduled_for, idempotency_key) VALUES ($1, $2, $3, $4, 'APPOINTMENT_CREATED', NOW(), $5)",
      [crossPlan, ids.businessA, ids.appointment, ids.outbox, "x".repeat(64)]
    );

    // Delivery for businessB referencing crossPlan of businessA must violate composite foreign key
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_deliveries (
          business_id, plan_id, channel, status, recipient, provider
        ) VALUES ($1, $2, 'SMS', 'PENDING', '+905550001901', 'netgsm')`,
        [ids.businessB, crossPlan]
      ),
      (error) => error?.code === "23503"
    );
  });

  it("enforces unique plan + SMS delivery materialization", async () => {
    // ids.planA already has a delivery inserted in test 1
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_deliveries (
          business_id, plan_id, channel, status, recipient, provider
        ) VALUES ($1, $2, 'SMS', 'PENDING', '+905550001902', 'netgsm')`,
        [ids.businessA, ids.planA]
      ),
      (error) => error?.code === "23505"
    );
  });

  it("enforces status and check constraints", async () => {
    const plan2 = uuid(82);
    await database.pool.query(
      "INSERT INTO notification_plans (id, business_id, appointment_id, source_outbox_id, type, scheduled_for, idempotency_key) VALUES ($1, $2, $3, $4, 'APPOINTMENT_CREATED', NOW(), $5)",
      [plan2, ids.businessA, ids.appointment, ids.outbox, "2".repeat(64)]
    );

    // attempt_count bounds check: attempt_count > 8 rejected
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_deliveries (
          business_id, plan_id, channel, status, recipient, provider, attempt_count
        ) VALUES ($1, $2, 'SMS', 'PENDING', '+905550001901', 'netgsm', 9)`,
        [ids.businessA, plan2]
      ),
      (error) => error?.code === "23514"
    );

    // PROCESSING without locked_at or locked_by rejected
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_deliveries (
          business_id, plan_id, channel, status, recipient, provider
        ) VALUES ($1, $2, 'SMS', 'PROCESSING', '+905550001901', 'netgsm')`,
        [ids.businessA, plan2]
      ),
      (error) => error?.code === "23514"
    );

    // SENT without sent_at rejected
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_deliveries (
          business_id, plan_id, channel, status, recipient, provider
        ) VALUES ($1, $2, 'SMS', 'SENT', '+905550001901', 'netgsm')`,
        [ids.businessA, plan2]
      ),
      (error) => error?.code === "23514"
    );

    // FAILED without failed_at rejected
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_deliveries (
          business_id, plan_id, channel, status, recipient, provider
        ) VALUES ($1, $2, 'SMS', 'FAILED', '+905550001901', 'netgsm')`,
        [ids.businessA, plan2]
      ),
      (error) => error?.code === "23514"
    );
  });

  it("upgrades existing database with zero historical deliveries", async () => {
    const upgrade = await startDatabase({
      throughMigration: "0018_notification_settings_delete_cascade.sql",
    });
    try {
      await seed(upgrade.pool);
      const before = await upgrade.pool.query(
        "SELECT (SELECT count(*)::int FROM appointments) AS appointments, (SELECT count(*)::int FROM notification_plans) AS plans"
      );
      await applyMigrationFile(
        upgrade.pool,
        path.join(migrationsDir, "0019_notification_delivery.sql")
      );
      const after = await upgrade.pool.query(
        "SELECT (SELECT count(*)::int FROM appointments) AS appointments, (SELECT count(*)::int FROM notification_plans) AS plans, (SELECT count(*)::int FROM notification_deliveries) AS deliveries"
      );
      assert.equal(before.rows[0].appointments, 1);
      assert.equal(before.rows[0].plans, 1);
      assert.deepEqual(after.rows[0], {
        appointments: 1,
        plans: 1,
        deliveries: 0,
      });
    } finally {
      await upgrade.stop();
    }
  });
});
