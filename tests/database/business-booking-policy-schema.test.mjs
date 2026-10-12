import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  applyMigrationFile,
  migrationsDir,
  startDatabase,
} from "./db.mjs";

let database;

before(async () => {
  database = await startDatabase();
});

after(async () => {
  await database?.stop();
});

describe("Business booking policy schema", { concurrency: false }, () => {
  it("uses compatibility defaults on a fresh database", async () => {
    const result = await database.pool.query(
      `INSERT INTO businesses (name, slug, timezone, currency)
       VALUES ('Policy Defaults', 'policy-defaults', 'Europe/Istanbul', 'TRY')
       RETURNING minimum_booking_lead_minutes, maximum_advance_booking_days,
         cancellation_notice_minutes, reschedule_notice_minutes`
    );
    assert.deepEqual(result.rows[0], {
      minimum_booking_lead_minutes: 0,
      maximum_advance_booking_days: null,
      cancellation_notice_minutes: 0,
      reschedule_notice_minutes: 0,
    });
  });

  it("accepts valid boundaries and nullable unlimited advance", async () => {
    const result = await database.pool.query(
      `INSERT INTO businesses
        (name, slug, timezone, currency, minimum_booking_lead_minutes,
         maximum_advance_booking_days, cancellation_notice_minutes,
         reschedule_notice_minutes)
       VALUES ('Policy Bounds', 'policy-bounds', 'UTC', 'TRY', 525600, 730, 0, 525600)
       RETURNING id`
    );
    assert.equal(result.rowCount, 1);
  });

  it("rejects negative and extreme values at the database boundary", async () => {
    for (const [column, value] of [
      ["minimum_booking_lead_minutes", -1],
      ["minimum_booking_lead_minutes", 525601],
      ["cancellation_notice_minutes", -1],
      ["reschedule_notice_minutes", 525601],
      ["maximum_advance_booking_days", 0],
      ["maximum_advance_booking_days", 731],
    ]) {
      await assert.rejects(
        database.pool.query(
          `INSERT INTO businesses (name, slug, timezone, currency, ${column})
           VALUES ('Invalid', $1, 'UTC', 'TRY', $2)`,
          [`invalid-${column}-${value}`, value]
        ),
        (error) => error?.code === "23514"
      );
    }
  });

  it("upgrades existing businesses without changing appointments or tokens", async () => {
    const upgrade = await startDatabase({
      throughMigration: "0014_appointment_access_tokens.sql",
    });
    try {
      await upgrade.pool.query(
        `INSERT INTO businesses (name, slug, timezone, currency)
         VALUES ('Existing Policy Business', 'existing-policy', 'Europe/Istanbul', 'TRY')`
      );
      const beforeBusinesses = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM businesses"
      );
      const beforeAppointments = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM appointments"
      );
      const beforeTokens = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM appointment_access_tokens"
      );

      await applyMigrationFile(
        upgrade.pool,
        path.join(migrationsDir, "0015_business_booking_policies.sql")
      );

      const after = await upgrade.pool.query(
        `SELECT minimum_booking_lead_minutes, maximum_advance_booking_days,
          cancellation_notice_minutes, reschedule_notice_minutes
         FROM businesses WHERE slug = 'existing-policy'`
      );
      const afterBusinesses = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM businesses"
      );
      const afterAppointments = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM appointments"
      );
      const afterTokens = await upgrade.pool.query(
        "SELECT count(*)::int AS count FROM appointment_access_tokens"
      );

      assert.deepEqual(after.rows[0], {
        minimum_booking_lead_minutes: 0,
        maximum_advance_booking_days: null,
        cancellation_notice_minutes: 0,
        reschedule_notice_minutes: 0,
      });
      assert.equal(afterBusinesses.rows[0].count, beforeBusinesses.rows[0].count);
      assert.equal(afterAppointments.rows[0].count, beforeAppointments.rows[0].count);
      assert.equal(afterTokens.rows[0].count, beforeTokens.rows[0].count);
    } finally {
      await upgrade.stop();
    }
  });
});
