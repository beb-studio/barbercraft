import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  applyMigrationFile,
  migrationsDir,
  startDatabase,
} from "./db.mjs";

const uuid = (n) =>
  `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
      ($1, 'Owner A', 'token-owner-a@test.local', true),
      ($2, 'Owner B', 'token-owner-b@test.local', true)`,
    [ids.userA, ids.userB]
  );
  await pool.query(
    `INSERT INTO businesses (id, name, slug, timezone, currency) VALUES
      ($1, 'Token A', 'token-a', 'Europe/Istanbul', 'TRY'),
      ($2, 'Token B', 'token-b', 'Europe/Istanbul', 'TRY')`,
    [ids.businessA, ids.businessB]
  );
  await pool.query(
    `INSERT INTO business_members (id, business_id, user_id, role) VALUES
      ($1, $2, $3, 'OWNER'),
      ($4, $5, $6, 'OWNER')`,
    [
      ids.memberA,
      ids.businessA,
      ids.userA,
      ids.memberB,
      ids.businessB,
      ids.userB,
    ]
  );
  await pool.query(
    `INSERT INTO staff_profiles
      (id, business_id, business_member_id, first_name, last_name) VALUES
      ($1, $2, $3, 'Usta', 'A'),
      ($4, $5, $6, 'Usta', 'B')`,
    [
      ids.staffA,
      ids.businessA,
      ids.memberA,
      ids.staffB,
      ids.businessB,
      ids.memberB,
    ]
  );
  await pool.query(
    `INSERT INTO services (id, business_id, name, duration_minutes, price) VALUES
      ($1, $2, 'Kesim A', 30, 300),
      ($3, $4, 'Kesim B', 30, 400)`,
    [ids.serviceA, ids.businessA, ids.serviceB, ids.businessB]
  );
  await pool.query(
    `INSERT INTO customers
      (id, business_id, first_name, phone, normalized_phone) VALUES
      ($1, $2, 'Müşteri A', '+905550000001', '+905550000001'),
      ($3, $4, 'Müşteri B', '+905550000002', '+905550000002')`,
    [ids.customerA, ids.businessA, ids.customerB, ids.businessB]
  );
  await pool.query(
    `INSERT INTO appointments
      (id, business_id, customer_id, staff_id, service_id, start_time, end_time,
       status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
     VALUES
      ($1, $2, $3, $4, $5, '2030-01-10T09:00:00Z', '2030-01-10T09:30:00Z',
       'CONFIRMED', 'Kesim A', 30, 300),
      ($6, $7, $8, $9, $10, '2030-01-11T09:00:00Z', '2030-01-11T09:30:00Z',
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

describe("Appointment access token schema", { concurrency: false }, () => {
  it("stores only a fixed-length hash and preserves expiration", async () => {
    const tokenHash = "a".repeat(64);
    const expiresAt = new Date("2030-01-10T10:30:00Z");
    const result = await database.pool.query(
      `INSERT INTO appointment_access_tokens
        (business_id, appointment_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING token_hash, expires_at, revoked_at`,
      [ids.businessA, ids.appointmentA, tokenHash, expiresAt]
    );

    assert.equal(result.rows[0].token_hash, tokenHash);
    assert.equal(result.rows[0].expires_at.toISOString(), expiresAt.toISOString());
    assert.equal(result.rows[0].revoked_at, null);
    assert.notEqual(result.rows[0].token_hash, "raw-secret-token");
  });

  it("enforces globally unique token hashes", async () => {
    await assert.rejects(
      database.pool.query(
        `INSERT INTO appointment_access_tokens
          (business_id, appointment_id, token_hash, expires_at)
         VALUES ($1, $2, $3, '2030-01-10T11:00:00Z')`,
        [ids.businessA, ids.appointmentA, "a".repeat(64)]
      ),
      (error) => error?.code === "23505"
    );
  });

  it("accepts a same-tenant appointment relationship", async () => {
    const result = await database.pool.query(
      `INSERT INTO appointment_access_tokens
        (business_id, appointment_id, token_hash, expires_at)
       VALUES ($1, $2, $3, '2030-01-11T10:30:00Z') RETURNING id`,
      [ids.businessB, ids.appointmentB, "b".repeat(64)]
    );
    assert.equal(result.rowCount, 1);
  });

  it("rejects a cross-tenant appointment relationship", async () => {
    await assert.rejects(
      database.pool.query(
        `INSERT INTO appointment_access_tokens
          (business_id, appointment_id, token_hash, expires_at)
         VALUES ($1, $2, $3, '2030-01-10T11:00:00Z')`,
        [ids.businessB, ids.appointmentA, "c".repeat(64)]
      ),
      (error) => error?.code === "23503"
    );
  });

  it("stores explicit revocation state", async () => {
    const revokedAt = new Date("2029-12-01T09:00:00Z");
    const result = await database.pool.query(
      `UPDATE appointment_access_tokens
       SET revoked_at = $1
       WHERE token_hash = $2
       RETURNING revoked_at`,
      [revokedAt, "b".repeat(64)]
    );
    assert.equal(result.rows[0].revoked_at.toISOString(), revokedAt.toISOString());
  });

  it("does not manufacture tokens while upgrading an existing database", async () => {
    const upgradeDb = await startDatabase({
      throughMigration: "0013_customer_logical_merge_foundation.sql",
    });
    try {
      await seed(upgradeDb.pool);
      const beforeAppointments = await upgradeDb.pool.query(
        "SELECT count(*)::int AS count FROM appointments"
      );
      await applyMigrationFile(
        upgradeDb.pool,
        path.join(migrationsDir, "0014_appointment_access_tokens.sql")
      );
      const afterAppointments = await upgradeDb.pool.query(
        "SELECT count(*)::int AS count FROM appointments"
      );
      const tokens = await upgradeDb.pool.query(
        "SELECT count(*)::int AS count FROM appointment_access_tokens"
      );

      assert.equal(beforeAppointments.rows[0].count, 2);
      assert.equal(afterAppointments.rows[0].count, 2);
      assert.equal(tokens.rows[0].count, 0);
    } finally {
      await upgradeDb.stop();
    }
  });
});
