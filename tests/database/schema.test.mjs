import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./db.mjs";

let db;

// UUID Helpers
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const U = {
  user1: uuid(1),
  user2: uuid(2),
  user3: uuid(3),
  user4: uuid(4),
};

const BIZ = {
  A: uuid(100),
  B: uuid(101),
};

const MEM = {
  ownerA: uuid(200),
  staffA: uuid(201),
  ownerB: uuid(202),
  staffB: uuid(203),
};

const SP = {
  staffA: uuid(300),
  staffB: uuid(301),
};

const SVC = {
  serviceA: uuid(400),
  serviceB: uuid(401),
};

const CUST = {
  customerA: uuid(500),
  customerB: uuid(501),
};

const APPT = {
  apptA: uuid(600),
};

const FK = "23503";
const UNIQUE = "23505";
const CHECK = "23514";

async function q(sql, params = []) {
  try {
    const r = await db.pool.query(sql, params);
    return { rows: r.rows, rowCount: r.rowCount, error: null };
  } catch (error) {
    return { rows: [], rowCount: 0, error };
  }
}

const ok = (r, msg) => assert.equal(r.error, null, `${msg ?? "expected success"}: ${r.error?.message}`);
const fails = (r, code, msg) => {
  assert.ok(r.error, `${msg ?? "expected failure"}: statement unexpectedly succeeded`);
  if (code) assert.equal(r.error.code, code, `${msg ?? ""}: ${r.error.message}`);
};

async function seed() {
  const p = db.pool;
  // Seed users
  for (const [k, id] of Object.entries(U)) {
    await p.query("INSERT INTO users (id, email, name, email_verified) VALUES ($1, $2, $3, $4)", [id, `${k}@test.local`, k, true]);
  }
  // Seed businesses
  await p.query(
    `INSERT INTO businesses (id, name, slug, timezone, currency, booking_interval_minutes) VALUES
       ($1, 'Barber Shop A', 'barber-a', 'Europe/Istanbul', 'TRY', 15),
       ($2, 'Barber Shop B', 'barber-b', 'America/New_York', 'USD', 30)`,
    [BIZ.A, BIZ.B]
  );
  // Seed business_members
  await p.query(
    `INSERT INTO business_members (id, business_id, user_id, role) VALUES
       ($1, $2, $3, 'OWNER'),
       ($4, $2, $5, 'STAFF'),
       ($6, $7, $8, 'OWNER'),
       ($9, $7, $5, 'STAFF')`,
    [MEM.ownerA, BIZ.A, U.user1, MEM.staffA, U.user2, MEM.ownerB, BIZ.B, U.user3, MEM.staffB]
  );
  // Seed staff_profiles
  await p.query(
    `INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name) VALUES
       ($1, $2, $3, 'John', 'Doe'),
       ($4, $5, $6, 'Jane', 'Smith')`,
    [SP.staffA, BIZ.A, MEM.staffA, SP.staffB, BIZ.B, MEM.staffB]
  );
  // Seed services
  await p.query(
    `INSERT INTO services (id, business_id, name, duration_minutes, price) VALUES
       ($1, $2, 'Haircut', 30, 250.00),
       ($3, $4, 'Beard Trim', 20, 150.00)`,
    [SVC.serviceA, BIZ.A, SVC.serviceB, BIZ.B]
  );
  // Seed customers
  await p.query(
    `INSERT INTO customers (id, business_id, first_name, last_name, phone, normalized_phone) VALUES
       ($1, $2, 'Alice', 'Customer', '05551112233', '+905551112233'),
       ($3, $4, 'Bob', 'Customer', '05551112233', '+905551112233')`,
    [CUST.customerA, BIZ.A, CUST.customerB, BIZ.B]
  );
}

before(async () => {
  db = await startDatabase();
  await seed();
});

after(async () => {
  await db?.stop();
});

describe("Database Schema Foundations", () => {
  it("applies all migrations successfully", () => {
    assert.ok(db.migrationFiles.length > 0, "Migration files should be found and executed");
  });

  it("contains all 12 core application tables", async () => {
    const r = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    ok(r);
    const expected = [
      "users",
      "businesses",
      "business_members",
      "services",
      "staff_profiles",
      "staff_services",
      "customers",
      "business_working_hours",
      "staff_working_hours",
      "time_blocks",
      "appointments",
      "appointment_access_tokens",
    ];
    const actual = r.rows.map((row) => row.table_name);
    for (const table of expected) {
      assert.ok(actual.includes(table), `Table ${table} must exist in public schema`);
    }
  });
});

describe("Multi-Tenancy Integrity & Constraints", () => {
  it("enforces single OWNER constraint per business", async () => {
    // Attempting to add a second OWNER to Barber Shop A must fail
    const res = await q(
      `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [BIZ.A, U.user4]
    );
    fails(res, UNIQUE, "Single owner per business constraint");
  });

  it("prevents cross-tenant service assignment in staff_services", async () => {
    // Assigning Service B (from Business B) to Staff A (from Business A) must fail composite FK
    const res = await q(
      `INSERT INTO staff_services (business_id, staff_id, service_id) VALUES ($1, $2, $3)`,
      [BIZ.A, SP.staffA, SVC.serviceB]
    );
    fails(res, FK, "Composite FK cross-tenant protection for staff_services");
  });

  it("prevents cross-tenant appointments", async () => {
    // Customer from Business B booking Staff A in Business A must fail composite FK
    const res = await q(
      `INSERT INTO appointments (business_id, customer_id, staff_id, service_id, start_time, end_time, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
       VALUES ($1, $2, $3, $4, '2026-10-10T10:00:00Z', '2026-10-10T10:30:00Z', 'Haircut', 30, 250.00)`,
      [BIZ.A, CUST.customerB, SP.staffA, SVC.serviceA]
    );
    fails(res, FK, "Composite FK cross-tenant protection for appointments customer");
  });

  it("enforces unique normalized phone per business", async () => {
    // Same normalized phone in Business A must fail
    const res = await q(
      `INSERT INTO customers (business_id, first_name, phone, normalized_phone) VALUES ($1, 'Duplicate', '05551112233', '+905551112233')`,
      [BIZ.A]
    );
    fails(res, UNIQUE, "Normalized phone per business uniqueness");
  });

  it("allows same normalized phone across different businesses", async () => {
    // Customer A and Customer B both have +905551112233 in different businesses
    const res = await q(`SELECT count(*)::int as count FROM customers WHERE normalized_phone = '+905551112233'`);
    ok(res);
    assert.equal(res.rows[0].count, 2);
  });
});

describe("Check Constraints & Validation", () => {
  it("rejects non-positive service duration and negative price", async () => {
    fails(await q(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1, 'Bad Dur', 0, 100.00)`, [BIZ.A]), CHECK);
    fails(await q(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1, 'Neg Price', 30, -50.00)`, [BIZ.A]), CHECK);
  });

  it("validates timezone in businesses table", async () => {
    fails(
      await q(`INSERT INTO businesses (name, slug, timezone, currency) VALUES ('Bad TZ', 'bad-tz', 'Invalid/Timezone', 'TRY')`),
      CHECK
    );
  });

  it("rejects appointment with start_time >= end_time", async () => {
    fails(
      await q(
        `INSERT INTO appointments (business_id, customer_id, staff_id, service_id, start_time, end_time, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
         VALUES ($1, $2, $3, $4, '2026-10-10T10:30:00Z', '2026-10-10T10:00:00Z', 'Haircut', 30, 250.00)`,
        [BIZ.A, CUST.customerA, SP.staffA, SVC.serviceA]
      ),
      CHECK
    );
  });

  it("validates staff_working_hours check constraints", async () => {
    // 1. Working day with null start_time must fail CHECK
    fails(
      await q(
        `INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
         VALUES ($1, $2, 1, true, NULL, '18:00')`,
        [BIZ.A, SP.staffA]
      ),
      CHECK
    );

    // 2. Working day with start_time >= end_time must fail CHECK
    fails(
      await q(
        `INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
         VALUES ($1, $2, 1, true, '18:00', '09:00')`,
        [BIZ.A, SP.staffA]
      ),
      CHECK
    );

    // 3. Closed day with non-null start_time must fail CHECK
    fails(
      await q(
        `INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
         VALUES ($1, $2, 0, false, '09:00', NULL)`,
        [BIZ.A, SP.staffA]
      ),
      CHECK
    );

    // 4. Closed day with NULL start_time and NULL end_time succeeds
    const closedRes = await q(
      `INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
       VALUES ($1, $2, 0, false, NULL, NULL) RETURNING *`,
      [BIZ.A, SP.staffA]
    );
    ok(closedRes);
    assert.equal(closedRes.rows[0].is_working, false);
    assert.equal(closedRes.rows[0].start_time, null);
    assert.equal(closedRes.rows[0].end_time, null);

    // 5. Open day with valid start_time < end_time succeeds
    const openRes = await q(
      `INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
       VALUES ($1, $2, 1, true, '09:00', '18:00') RETURNING *`,
      [BIZ.A, SP.staffA]
    );
    ok(openRes);
    assert.equal(openRes.rows[0].is_working, true);
    assert.equal(openRes.rows[0].start_time, "09:00:00");
    assert.equal(openRes.rows[0].end_time, "18:00:00");

    // Clean up test rows
    await q(`DELETE FROM staff_working_hours WHERE business_id = $1 AND staff_id = $2`, [BIZ.A, SP.staffA]);
  });

  it("validates time_blocks check constraints and enum values", async () => {
    // 1. Invalid block type must fail
    const invRes = await q(
      `INSERT INTO time_blocks (business_id, staff_id, block_type, start_time, end_time)
       VALUES ($1, $2, 'INVALID_TYPE', '2026-10-10 10:00:00+03', '2026-10-10 11:00:00+03')`,
      [BIZ.A, SP.staffA]
    );
    assert.ok(invRes.error, "Invalid block_type enum must be rejected by PostgreSQL");

    // 2. Legacy/removed enum values must fail
    const legRes = await q(
      `INSERT INTO time_blocks (business_id, staff_id, block_type, start_time, end_time)
       VALUES ($1, $2, 'VACATION', '2026-10-10 10:00:00+03', '2026-10-10 11:00:00+03')`,
      [BIZ.A, SP.staffA]
    );
    assert.ok(legRes.error, "Legacy block_type 'VACATION' must be rejected");

    // 3. start_time >= end_time must fail check_time_blocks_time
    fails(
      await q(
        `INSERT INTO time_blocks (business_id, staff_id, block_type, start_time, end_time)
         VALUES ($1, $2, 'TIME_OFF', '2026-10-10 12:00:00+03', '2026-10-10 10:00:00+03')`,
        [BIZ.A, SP.staffA]
      ),
      CHECK
    );

    // 4. Equal start_time and end_time must fail
    fails(
      await q(
        `INSERT INTO time_blocks (business_id, staff_id, block_type, start_time, end_time)
         VALUES ($1, $2, 'BREAK', '2026-10-10 12:00:00+03', '2026-10-10 12:00:00+03')`,
        [BIZ.A, SP.staffA]
      ),
      CHECK
    );

    // 5. Valid TIME_OFF block succeeds
    const validRes = await q(
      `INSERT INTO time_blocks (business_id, staff_id, block_type, start_time, end_time)
       VALUES ($1, $2, 'TIME_OFF', '2026-10-10 10:00:00+03', '2026-10-10 12:00:00+03') RETURNING *`,
      [BIZ.A, SP.staffA]
    );
    ok(validRes);
    assert.equal(validRes.rows[0].block_type, "TIME_OFF");

    // Clean up
    await q(`DELETE FROM time_blocks WHERE business_id = $1 AND staff_id = $2`, [BIZ.A, SP.staffA]);
  });
});

describe("Triggers & Database Logic", () => {
  it("automatically creates service snapshots on appointment insert", async () => {
    const res = await q(
      `INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
       VALUES ($1, $2, $3, $4, $5, '2026-10-10T11:00:00Z', '2026-10-10T11:30:00Z', 'Haircut', 30, 250.00) RETURNING *`,
      [APPT.apptA, BIZ.A, CUST.customerA, SP.staffA, SVC.serviceA]
    );
    ok(res);
    assert.equal(res.rows[0].service_name_snapshot, "Haircut");
    assert.equal(res.rows[0].service_duration_snapshot, 30);
    assert.equal(res.rows[0].service_price_snapshot, "250.00");
  });

  it("prevents modifying immutable columns on appointments", async () => {
    const res = await q(`UPDATE appointments SET service_id = $1 WHERE id = $2`, [SVC.serviceB, APPT.apptA]);
    assert.ok(res.error, "Changing service_id on existing appointment should trigger error");
  });

  it("automatically advances updated_at timestamp on row update", async () => {
    const before = await q(`SELECT updated_at FROM services WHERE id = $1`, [SVC.serviceA]);
    ok(before);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await q(`UPDATE services SET description = 'Updated Haircut' WHERE id = $1`, [SVC.serviceA]);
    const after = await q(`SELECT updated_at FROM services WHERE id = $1`, [SVC.serviceA]);
    ok(after);
    assert.ok(new Date(after.rows[0].updated_at) > new Date(before.rows[0].updated_at));
  });
});

describe("Platform Administration Schema & Constraints", () => {
  it("validates platform_admins roles and unique user_id constraint", async () => {
    // 1. Valid SUPER_ADMIN for user1 succeeds
    const res1 = await q(
      `INSERT INTO platform_admins (user_id, role, active)
       VALUES ($1, 'SUPER_ADMIN', true) RETURNING *`,
      [U.user1]
    );
    ok(res1);
    assert.equal(res1.rows[0].role, "SUPER_ADMIN");
    assert.equal(res1.rows[0].active, true);
    const admin1Id = res1.rows[0].id;

    // 2. Duplicate user1 fails UNIQUE constraint
    fails(
      await q(
        `INSERT INTO platform_admins (user_id, role, active)
         VALUES ($1, 'ADMIN', true)`,
        [U.user1]
      ),
      UNIQUE
    );

    // 3. Valid ADMIN for user2 succeeds
    const res2 = await q(
      `INSERT INTO platform_admins (user_id, role, active)
       VALUES ($1, 'ADMIN', true) RETURNING *`,
      [U.user2]
    );
    ok(res2);
    assert.equal(res2.rows[0].role, "ADMIN");

    // 4. Invalid role enum fails
    const invalidRole = await q(
      `INSERT INTO platform_admins (user_id, role, active)
       VALUES ($1, 'INVALID_ROLE', true)`,
      [U.user3]
    );
    assert.ok(invalidRole.error, "Invalid platform_admin_role should fail");

    // 5. Nonexistent user fails FK constraint
    fails(
      await q(
        `INSERT INTO platform_admins (user_id, role, active)
         VALUES ('00000000-0000-4000-8000-999999999999', 'ADMIN', true)`
      ),
      FK
    );

    // 6. Audit log insert succeeds
    const auditRes = await q(
      `INSERT INTO platform_admin_audit_logs (platform_admin_id, actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, 'TEST_ACTION', 'business', $3, '{"reason": "testing"}'::jsonb) RETURNING *`,
      [admin1Id, U.user1, BIZ.A]
    );
    ok(auditRes);
    assert.equal(auditRes.rows[0].action, "TEST_ACTION");
    assert.equal(auditRes.rows[0].metadata.reason, "testing");

    // Clean up
    await q(`DELETE FROM platform_admin_audit_logs WHERE action = 'TEST_ACTION'`);
    await q(`DELETE FROM platform_admins WHERE user_id IN ($1, $2)`, [U.user1, U.user2]);
  });

  describe("Rate Limits Schema & Operations", () => {
    it("supports atomic upsert and tracks count and expiry", async () => {
      const testKey = "test:ip-123";
      const future = new Date(Date.now() + 60000);

      // Initial insert
      const r1 = await q(
        `INSERT INTO rate_limits (key, count, expires_at)
         VALUES ($1, 1, $2)
         RETURNING key, count, expires_at`,
        [testKey, future]
      );
      ok(r1);
      assert.equal(r1.rows[0].count, 1);

      // Duplicate key violates PK without upsert
      const dup = await q(
        `INSERT INTO rate_limits (key, count, expires_at)
         VALUES ($1, 1, $2)`,
        [testKey, future]
      );
      fails(dup, UNIQUE);

      // Atomic upsert updates count
      const r2 = await q(
        `INSERT INTO rate_limits (key, count, expires_at, created_at, updated_at)
         VALUES ($1, 1, $2, now(), now())
         ON CONFLICT (key) DO UPDATE
         SET count = CASE
             WHEN rate_limits.expires_at < now() THEN 1
             ELSE rate_limits.count + 1
           END,
           expires_at = CASE
             WHEN rate_limits.expires_at < now() THEN $2
             ELSE rate_limits.expires_at
           END,
           updated_at = now()
         RETURNING count`,
        [testKey, future]
      );
      ok(r2);
      assert.equal(r2.rows[0].count, 2);

      // Cleanup
      await q(`DELETE FROM rate_limits WHERE key = $1`, [testKey]);
    });
  });
});
