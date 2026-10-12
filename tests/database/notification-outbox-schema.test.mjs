import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  applyMigrationFile,
  migrationsDir,
  startDatabase,
} from "./db.mjs";

const uuid = (n) =>
  `92000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  userA: uuid(1),
  userB: uuid(2),
  businessA: uuid(10),
  businessB: uuid(11),
  memberA: uuid(20),
  memberB: uuid(21),
  staffA: uuid(30),
  staffB: uuid(31),
  serviceA: uuid(40),
  serviceB: uuid(41),
  customerA: uuid(50),
  customerB: uuid(51),
  appointmentA: uuid(60),
  appointmentB: uuid(61),
};

let database;

async function seed(pool) {
  await pool.query(
    `INSERT INTO users (id, name, email, email_verified) VALUES
      ($1, 'Owner A', 'outbox-owner-a@test.local', true),
      ($2, 'Owner B', 'outbox-owner-b@test.local', true)`,
    [ids.userA, ids.userB]
  );
  await pool.query(
    `INSERT INTO businesses (id, name, slug, timezone, currency) VALUES
      ($1, 'Outbox A', 'outbox-a', 'Europe/Istanbul', 'TRY'),
      ($2, 'Outbox B', 'outbox-b', 'Europe/Istanbul', 'TRY')`,
    [ids.businessA, ids.businessB]
  );
  await pool.query(
    `INSERT INTO business_members (id, business_id, user_id, role) VALUES
      ($1, $2, $3, 'OWNER'), ($4, $5, $6, 'OWNER')`,
    [ids.memberA, ids.businessA, ids.userA, ids.memberB, ids.businessB, ids.userB]
  );
  await pool.query(
    `INSERT INTO staff_profiles
      (id, business_id, business_member_id, first_name, last_name) VALUES
      ($1, $2, $3, 'Usta', 'A'), ($4, $5, $6, 'Usta', 'B')`,
    [ids.staffA, ids.businessA, ids.memberA, ids.staffB, ids.businessB, ids.memberB]
  );
  await pool.query(
    `INSERT INTO services (id, business_id, name, duration_minutes, price) VALUES
      ($1, $2, 'Kesim A', 30, 300), ($3, $4, 'Kesim B', 30, 400)`,
    [ids.serviceA, ids.businessA, ids.serviceB, ids.businessB]
  );
  await pool.query(
    `INSERT INTO customers
      (id, business_id, first_name, phone, normalized_phone) VALUES
      ($1, $2, 'Müşteri A', '+905550001601', '+905550001601'),
      ($3, $4, 'Müşteri B', '+905550001602', '+905550001602')`,
    [ids.customerA, ids.businessA, ids.customerB, ids.businessB]
  );
  await pool.query(
    `INSERT INTO appointments
      (id, business_id, customer_id, staff_id, service_id, start_time, end_time,
       status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
     VALUES
      ($1, $2, $3, $4, $5, '2030-06-10T09:00:00Z', '2030-06-10T09:30:00Z',
       'CONFIRMED', 'Kesim A', 30, 300),
      ($6, $7, $8, $9, $10, '2030-06-11T09:00:00Z', '2030-06-11T09:30:00Z',
       'CONFIRMED', 'Kesim B', 30, 400)`,
    [
      ids.appointmentA,
      ids.businessA,
      ids.customerA,
      ids.staffA,
      ids.serviceA,
      ids.appointmentB,
      ids.businessB,
      ids.customerB,
      ids.staffB,
      ids.serviceB,
    ]
  );
}

before(async () => {
  database = await startDatabase();
  await seed(database.pool);
});

after(async () => {
  await database?.stop();
});

describe("Notification outbox schema", { concurrency: false }, () => {
  it("accepts a tenant-safe event with compatibility defaults", async () => {
    const result = await database.pool.query(
      `INSERT INTO notification_outbox
        (business_id, appointment_id, event_type, payload, idempotency_key)
       VALUES ($1, $2, 'APPOINTMENT_CREATED',
         '{"startAt":"2030-06-10T09:00:00.000Z","endAt":"2030-06-10T09:30:00.000Z","status":"CONFIRMED"}'::jsonb,
         $3)
       RETURNING payload_version, status, attempt_count, locked_at, locked_by,
         processed_at, last_error_code`,
      [ids.businessA, ids.appointmentA, "a".repeat(64)]
    );
    assert.deepEqual(result.rows[0], {
      payload_version: 1,
      status: "PENDING",
      attempt_count: 0,
      locked_at: null,
      locked_by: null,
      processed_at: null,
      last_error_code: null,
    });
  });

  it("rejects a cross-tenant appointment relationship", async () => {
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_outbox
          (business_id, appointment_id, event_type, payload, idempotency_key)
         VALUES ($1, $2, 'APPOINTMENT_CREATED', '{}'::jsonb, $3)`,
        [ids.businessB, ids.appointmentA, "b".repeat(64)]
      ),
      (error) => error?.code === "23503"
    );
  });

  it("rejects invalid event types and statuses", async () => {
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_outbox
          (business_id, appointment_id, event_type, payload, idempotency_key)
         VALUES ($1, $2, 'APPOINTMENT_COMPLETED', '{}'::jsonb, $3)`,
        [ids.businessA, ids.appointmentA, "c".repeat(64)]
      ),
      (error) => error?.code === "22P02"
    );
    await assert.rejects(
      database.pool.query(
        `UPDATE notification_outbox SET status = 'RETRYING'
         WHERE idempotency_key = $1`,
        ["a".repeat(64)]
      ),
      (error) => error?.code === "22P02"
    );
  });

  it("enforces globally unique deterministic idempotency keys", async () => {
    await assert.rejects(
      database.pool.query(
        `INSERT INTO notification_outbox
          (business_id, appointment_id, event_type, payload, idempotency_key)
         VALUES ($1, $2, 'APPOINTMENT_CANCELLED', '{}'::jsonb, $3)`,
        [ids.businessA, ids.appointmentA, "a".repeat(64)]
      ),
      (error) => error?.code === "23505"
    );
  });

  it("upgrades existing appointments without manufacturing historical events", async () => {
    const upgrade = await startDatabase({
      throughMigration: "0015_business_booking_policies.sql",
    });
    try {
      await seed(upgrade.pool);
      const before = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM appointments"
      );
      await applyMigrationFile(
        upgrade.pool,
        path.join(migrationsDir, "0016_notification_outbox.sql")
      );
      const after = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM appointments"
      );
      const events = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM notification_outbox"
      );
      assert.equal(before.rows[0].count, 2);
      assert.equal(after.rows[0].count, 2);
      assert.equal(events.rows[0].count, 0);
    } finally {
      await upgrade.stop();
    }
  });
});
