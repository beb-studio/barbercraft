/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { startDatabase, applyMigrationFile, migrationsDir } from "../database/db.mjs";

describe("RELEASE PREP 0: Role Taxonomy Migration Test (Part 18)", () => {
  let pgServer: any;
  let pool: any;

  const testUserId1 = "11111111-1111-4111-8111-111111111111";
  const testUserId2 = "22222222-2222-4222-8222-222222222222";
  const testBizId = "33333333-3333-4333-8333-333333333333";
  const testMemberId = "44444444-4444-4444-8444-444444444444";
  const testPlatformAdminId = "55555555-5555-4555-8555-555555555555";

  before(async () => {
    // 1. Initialize database strictly up through migration 0020 (before role taxonomy cleanup)
    pgServer = await startDatabase({ throughMigration: "0020_rate_limits.sql" });
    pool = pgServer.pool;

    // Seed users and business
    await pool.query(
      `INSERT INTO users (id, name, email, email_verified) VALUES
       ($1, 'Legacy Business Admin', 'legacy.admin@test.local', true),
       ($2, 'Legacy Platform Admin', 'legacy.platform@test.local', true)`,
      [testUserId1, testUserId2]
    );

    await pool.query(
      `INSERT INTO businesses (id, name, slug, timezone, currency, active) VALUES
       ($1, 'Legacy Test Berber', 'legacy-test-berber', 'Europe/Istanbul', 'TRY', true)`,
      [testBizId]
    );

    // Seed legacy business membership with role 'ADMIN'
    await pool.query(
      `INSERT INTO business_members (id, business_id, user_id, role, active) VALUES
       ($1, $2, $3, 'ADMIN', true)`,
      [testMemberId, testBizId, testUserId1]
    );

    // Seed legacy platform admin with role 'ADMIN'
    await pool.query(
      `INSERT INTO platform_admins (id, user_id, role, active) VALUES
       ($1, $2, 'ADMIN', true)`,
      [testPlatformAdminId, testUserId2]
    );
  });

  after(async () => {
    await pgServer?.stop();
  });

  it("verifies pre-migration database contains legacy ADMIN roles", async () => {
    const memberRes = await pool.query(
      `SELECT id, role, active FROM business_members WHERE id = $1`,
      [testMemberId]
    );
    assert.equal(memberRes.rows[0].role, "ADMIN");
    assert.equal(memberRes.rows[0].active, true);

    const platformRes = await pool.query(
      `SELECT id, role, active FROM platform_admins WHERE id = $1`,
      [testPlatformAdminId]
    );
    assert.equal(platformRes.rows[0].role, "ADMIN");
    assert.equal(platformRes.rows[0].active, true);
  });

  it("applies 0021_role_taxonomy_cleanup migration safely and non-destructively", async () => {
    const migrationFile = path.join(migrationsDir, "0021_role_taxonomy_cleanup.sql");
    await applyMigrationFile(pool, migrationFile);

    // Verify existing business member now has role MANAGER
    const memberRes = await pool.query(
      `SELECT id, business_id, user_id, role, active FROM business_members WHERE id = $1`,
      [testMemberId]
    );
    assert.equal(memberRes.rows.length, 1);
    assert.equal(memberRes.rows[0].id, testMemberId);
    assert.equal(memberRes.rows[0].business_id, testBizId);
    assert.equal(memberRes.rows[0].user_id, testUserId1);
    assert.equal(memberRes.rows[0].role, "MANAGER", "Legacy business ADMIN must be converted to MANAGER");
    assert.equal(memberRes.rows[0].active, true, "Active state must be preserved");

    // Verify existing platform admin now has role PLATFORM_ADMIN
    const platformRes = await pool.query(
      `SELECT id, user_id, role, active FROM platform_admins WHERE id = $1`,
      [testPlatformAdminId]
    );
    assert.equal(platformRes.rows.length, 1);
    assert.equal(platformRes.rows[0].id, testPlatformAdminId);
    assert.equal(platformRes.rows[0].user_id, testUserId2);
    assert.equal(platformRes.rows[0].role, "PLATFORM_ADMIN", "Legacy platform ADMIN must be converted to PLATFORM_ADMIN");
    assert.equal(platformRes.rows[0].active, true, "Active state must be preserved");
  });

  it("permits inserting new rows with MANAGER and PLATFORM_ADMIN enums", async () => {
    const newUserId = "66666666-6666-4666-8666-666666666666";
    await pool.query(
      `INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'New User', 'new.user@test.local', true)`,
      [newUserId]
    );

    // New business member with MANAGER
    const newMemberRes = await pool.query(
      `INSERT INTO business_members (business_id, user_id, role, active)
       VALUES ($1, $2, 'MANAGER', true)
       RETURNING role`,
      [testBizId, newUserId]
    );
    assert.equal(newMemberRes.rows[0].role, "MANAGER");

    // New platform admin with PLATFORM_ADMIN
    const newPlatformRes = await pool.query(
      `INSERT INTO platform_admins (user_id, role, active)
       VALUES ($1, 'PLATFORM_ADMIN', true)
       RETURNING role`,
      [newUserId]
    );
    assert.equal(newPlatformRes.rows[0].role, "PLATFORM_ADMIN");
  });

  it("rejects obsolete standalone ADMIN string in both enums", async () => {
    const failUserId = "77777777-7777-4777-8777-777777777777";
    await pool.query(
      `INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'Fail User', 'fail.user@test.local', true)`,
      [failUserId]
    );

    // Rejected in business_member_role
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'ADMIN')`,
          [testBizId, failUserId]
        );
      },
      (err: any) => {
        assert.match(err.message, /invalid input value for enum business_member_role/i);
        return true;
      }
    );

    // Rejected in platform_admin_role
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO platform_admins (user_id, role) VALUES ($1, 'ADMIN')`,
          [failUserId]
        );
      },
      (err: any) => {
        assert.match(err.message, /invalid input value for enum platform_admin_role/i);
        return true;
      }
    );
  });
});
