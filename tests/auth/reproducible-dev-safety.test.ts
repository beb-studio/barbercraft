/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";
import { validateQaResetTarget } from "../../scripts/qa-reset";
import { validateDevSetupConfig } from "../../scripts/dev-setup";
import { resolveSmsProvider } from "../../src/services/notification-delivery.service";
import { TestSmsProvider } from "../../src/lib/sms";
import { eq, inArray } from "drizzle-orm";

let pgServer: any;
let db: any;
let schema: any;
let auth: any;
let qaBootstrapModule: any;
let sessionModule: any;
let guardsModule: any;

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  schema = await import("../../src/db/schema");
  auth = (await import("../../src/lib/auth/auth")).auth;
  qaBootstrapModule = await import("../../src/services/qa-bootstrap.service");
  sessionModule = await import("../../src/lib/auth/session");
  guardsModule = await import("../../src/lib/auth/guards");
});

after(async () => {
  await pgServer?.stop();
});

describe("Reproducible Development Environment & QA Safety Verification", () => {
  const mockSession = (userId: string | null) => {
    if (!userId) {
      sessionModule.sessionDependencies.getCurrentUser = async () => null;
    } else {
      sessionModule.sessionDependencies.getCurrentUser = async () => ({
        id: userId,
        email: "mock@example.com",
        forcePasswordChange: false,
      });
    }
  };

  // --------------------------------------------------------------------------
  // Invariant 1: qa:reset rejects NODE_ENV=production
  // --------------------------------------------------------------------------
  it("Invariant 1: qa:reset rejects NODE_ENV=production", () => {
    const result = validateQaResetTarget(
      "postgresql://barbercraft_user:barbercraft_password@127.0.0.1:55432/barbercraft_dev",
      { NODE_ENV: "production" }
    );
    assert.equal(result.isSafe, false);
    assert.match(result.error ?? "", /production/i);
  });

  // --------------------------------------------------------------------------
  // Invariant 2: qa:reset rejects non-local hostname
  // --------------------------------------------------------------------------
  it("Invariant 2: qa:reset rejects non-local hostname", () => {
    const remoteHosts = [
      "postgresql://barbercraft_user:pass@production-db.internal:55432/barbercraft_dev",
      "postgresql://barbercraft_user:pass@192.168.1.100:55432/barbercraft_dev",
      "postgresql://barbercraft_user:pass@remote.aws.rds:55432/barbercraft_dev",
    ];

    for (const url of remoteHosts) {
      const result = validateQaResetTarget(url, { NODE_ENV: "development" });
      assert.equal(result.isSafe, false);
      assert.match(result.error ?? "", /not a recognized local development host/i);
    }
  });

  // --------------------------------------------------------------------------
  // Invariant 3: qa:reset rejects wrong database name (not barbercraft_dev)
  // --------------------------------------------------------------------------
  it("Invariant 3: qa:reset rejects wrong database name (not barbercraft_dev)", () => {
    const wrongDatabases = [
      "postgresql://barbercraft_user:pass@127.0.0.1:55432/production_app",
      "postgresql://barbercraft_user:pass@127.0.0.1:55432/barber_app_dev",
      "postgresql://barbercraft_user:pass@127.0.0.1:55432/postgres",
    ];

    for (const url of wrongDatabases) {
      const result = validateQaResetTarget(url, { NODE_ENV: "development" });
      assert.equal(result.isSafe, false);
      assert.match(result.error ?? "", /Expected database 'barbercraft_dev'/i);
    }
  });

  // --------------------------------------------------------------------------
  // Invariant 4: qa:reset rejects wrong database user (not barbercraft_user)
  // --------------------------------------------------------------------------
  it("Invariant 4: qa:reset rejects wrong database user (not barbercraft_user)", () => {
    const wrongUsers = [
      "postgresql://postgres:pass@127.0.0.1:55432/barbercraft_dev",
      "postgresql://root:pass@127.0.0.1:55432/barbercraft_dev",
      "postgresql://app_admin:pass@127.0.0.1:55432/barbercraft_dev",
    ];

    for (const url of wrongUsers) {
      const result = validateQaResetTarget(url, { NODE_ENV: "development" });
      assert.equal(result.isSafe, false);
      assert.match(result.error ?? "", /Expected database user 'barbercraft_user'/i);
    }
  });

  // --------------------------------------------------------------------------
  // Invariant 5: Canonical DATABASE_URL in .env.local.example uses 127.0.0.1:55432
  // --------------------------------------------------------------------------
  it("Invariant 5: Canonical DATABASE_URL in .env.local.example uses 127.0.0.1:55432", () => {
    const envExamplePath = path.resolve(process.cwd(), ".env.local.example");
    const content = fs.readFileSync(envExamplePath, "utf-8");
    const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
    assert.ok(match, "DATABASE_URL must be defined in .env.local.example");

    const parsed = new URL(match[1]);
    assert.equal(parsed.hostname, "127.0.0.1", "DATABASE_URL host must be 127.0.0.1");
    assert.equal(parsed.port, "55432", "DATABASE_URL port must be canonical 55432");
    assert.equal(parsed.pathname, "/barbercraft_dev", "DATABASE_URL database must be barbercraft_dev");
    assert.equal(decodeURIComponent(parsed.username), "barbercraft_user", "DATABASE_URL user must be barbercraft_user");
  });

  // --------------------------------------------------------------------------
  // Invariant 6: Dev compose exposes only 127.0.0.1:55432
  // --------------------------------------------------------------------------
  it("Invariant 6: Dev compose exposes only 127.0.0.1:55432", () => {
    const composePath = path.resolve(process.cwd(), "docker-compose.dev.yml");
    const content = fs.readFileSync(composePath, "utf-8");

    assert.match(
      content,
      /"127\.0\.0\.1:55432:5432"/,
      "docker-compose.dev.yml must bind explicitly to 127.0.0.1:55432:5432"
    );
    assert.doesNotMatch(content, /"5432:5432"/, "Must not bind default port 5432 to avoid host collision");
    assert.doesNotMatch(content, /"0\.0\.0\.0:/, "Must not bind to 0.0.0.0");
  });

  // --------------------------------------------------------------------------
  // Invariant 7: dev:setup validates expected DB contract (port 55432, barbercraft_dev, barbercraft_user)
  // --------------------------------------------------------------------------
  it("Invariant 7: dev:setup validates expected DB contract (port 55432, barbercraft_dev, barbercraft_user)", () => {
    // Valid canonical URL
    const valid = validateDevSetupConfig(
      "postgresql://barbercraft_user:barbercraft_password@127.0.0.1:55432/barbercraft_dev"
    );
    assert.equal(valid.isValid, true);
    assert.equal(valid.port, "55432");
    assert.equal(valid.database, "barbercraft_dev");
    assert.equal(valid.user, "barbercraft_user");

    // Invalid port
    const invalidPort = validateDevSetupConfig(
      "postgresql://barbercraft_user:barbercraft_password@127.0.0.1:5432/barbercraft_dev"
    );
    assert.equal(invalidPort.isValid, false);
    assert.match(invalidPort.error ?? "", /55432/);

    // Invalid database
    const invalidDb = validateDevSetupConfig(
      "postgresql://barbercraft_user:barbercraft_password@127.0.0.1:55432/other_db"
    );
    assert.equal(invalidDb.isValid, false);
    assert.match(invalidDb.error ?? "", /barbercraft_dev/);

    // Invalid user
    const invalidUser = validateDevSetupConfig(
      "postgresql://postgres:barbercraft_password@127.0.0.1:55432/barbercraft_dev"
    );
    assert.equal(invalidUser.isValid, false);
    assert.match(invalidUser.error ?? "", /barbercraft_user/);

    // Remote host
    const invalidHost = validateDevSetupConfig(
      "postgresql://barbercraft_user:barbercraft_password@remote.domain:55432/barbercraft_dev"
    );
    assert.equal(invalidHost.isValid, false);
    assert.match(invalidHost.error ?? "", /yerel döngüde/);
  });

  // --------------------------------------------------------------------------
  // Invariant 8: Local default selects non-live SMS behavior (TestSmsProvider)
  // --------------------------------------------------------------------------
  it("Invariant 8: Local default selects non-live SMS behavior (TestSmsProvider)", () => {
    const originalSmsProvider = process.env.SMS_PROVIDER;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalUsercode = process.env.NETGSM_USERCODE;
    const originalPassword = process.env.NETGSM_PASSWORD;
    const originalMsgHeader = process.env.NETGSM_MSGHEADER;

    try {
      // 1. Explicit SMS_PROVIDER="test" resolves TestSmsProvider
      process.env.SMS_PROVIDER = "test";
      const provider1 = resolveSmsProvider();
      assert.ok(provider1 instanceof TestSmsProvider, "SMS_PROVIDER='test' must resolve to TestSmsProvider");

      // 2. In development without Netgsm credentials, resolves TestSmsProvider fail-safe
      delete process.env.SMS_PROVIDER;
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      delete process.env.NETGSM_USERCODE;
      delete process.env.NETGSM_PASSWORD;
      delete process.env.NETGSM_MSGHEADER;
      const provider2 = resolveSmsProvider();
      assert.ok(provider2 instanceof TestSmsProvider, "Development default must resolve to TestSmsProvider");
    } finally {
      process.env.SMS_PROVIDER = originalSmsProvider;
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
      process.env.NETGSM_USERCODE = originalUsercode;
      process.env.NETGSM_PASSWORD = originalPassword;
      process.env.NETGSM_MSGHEADER = originalMsgHeader;
    }
  });

  // --------------------------------------------------------------------------
  // Invariant 9: QA bootstrap is idempotent
  // --------------------------------------------------------------------------
  it("Invariant 9: QA bootstrap is idempotent", async () => {
    const res1 = await qaBootstrapModule.bootstrapQA({});

    const users1 = await db.select().from(schema.users);
    const businesses1 = await db.select().from(schema.businesses);
    const members1 = await db.select().from(schema.businessMembers);
    const staff1 = await db.select().from(schema.staffProfiles);
    const services1 = await db.select().from(schema.services);

    // Run QA bootstrap a second time
    const res2 = await qaBootstrapModule.bootstrapQA({});

    const users2 = await db.select().from(schema.users);
    const businesses2 = await db.select().from(schema.businesses);
    const members2 = await db.select().from(schema.businessMembers);
    const staff2 = await db.select().from(schema.staffProfiles);
    const services2 = await db.select().from(schema.services);

    assert.equal(users2.length, users1.length, "User count must remain constant across bootstrap runs");
    assert.equal(businesses2.length, businesses1.length, "Business count must remain constant");
    assert.equal(members2.length, members1.length, "Membership count must remain constant");
    assert.equal(staff2.length, staff1.length, "Staff profile count must remain constant");
    assert.equal(services2.length, services1.length, "Service count must remain constant");

    assert.equal(res2.business.id, res1.business.id);
    assert.equal(res2.secondBusiness.id, res1.secondBusiness.id);
    assert.equal(res2.users.owner.id, res1.users.owner.id);
    assert.equal(res2.users.manager.id, res1.users.manager.id);
    assert.equal(res2.users.staff.id, res1.users.staff.id);
  });

  // --------------------------------------------------------------------------
  // Invariant 10: QA password converges to BarberCraft-QA-4380! when existing user password differs
  // --------------------------------------------------------------------------
  it("Invariant 10: QA password converges to BarberCraft-QA-4380! when existing user password differs", async () => {
    const canonicalPassword = "BarberCraft-QA-4380!";
    const divergentPassword = "TemporaryWrongPassword999!";

    // 1. Deliberately bootstrap staff with a divergent password
    await qaBootstrapModule.bootstrapQA({
      staffPassword: divergentPassword,
    });

    // 2. Verify staff can authenticate with divergent password
    const testReq1 = new Request("http://localhost:4380/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "qa.staff@local.test",
        password: divergentPassword,
      }),
    });
    const res1 = await auth.handler(testReq1);
    assert.equal(res1.status, 200, "Sign in with divergent password should succeed before convergence");

    // 3. Re-run canonical QA bootstrap without overrides (defaulting to BarberCraft-QA-4380!)
    await qaBootstrapModule.bootstrapQA({});

    // 4. Verify divergent password no longer works
    const testReq2 = new Request("http://localhost:4380/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "qa.staff@local.test",
        password: divergentPassword,
      }),
    });
    const res2 = await auth.handler(testReq2);
    assert.notEqual(res2.status, 200, "Sign in with old divergent password must fail after bootstrap convergence");

    // 5. Verify canonical QA password now succeeds
    const testReq3 = new Request("http://localhost:4380/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "qa.staff@local.test",
        password: canonicalPassword,
      }),
    });
    const res3 = await auth.handler(testReq3);
    assert.equal(res3.status, 200, "Sign in with canonical QA password must succeed");
  });

  // --------------------------------------------------------------------------
  // Invariant 11: Owner remains authenticated OWNER even when owner has a staff_profile
  // --------------------------------------------------------------------------
  it("Invariant 11: Owner remains authenticated OWNER even when owner has a staff_profile", async () => {
    const bootstrapRes = await qaBootstrapModule.bootstrapQA({});
    const ownerUserId = bootstrapRes.users.owner.id;
    const businessId = bootstrapRes.business.id;

    // Check database business_members record
    const [ownerMembership] = await db
      .select()
      .from(schema.businessMembers)
      .where(
        eq(schema.businessMembers.userId, ownerUserId)
      );

    assert.ok(ownerMembership, "Owner must have a business membership");
    assert.equal(ownerMembership.role, "OWNER", "Membership role must strictly remain OWNER");
    assert.equal(ownerMembership.businessId, businessId);

    // Check that owner ALSO has an active bookable staff profile (Ahmet Usta)
    const [ownerStaffProfile] = await db
      .select()
      .from(schema.staffProfiles)
      .where(
        eq(schema.staffProfiles.businessMemberId, ownerMembership.id)
      );

    assert.ok(ownerStaffProfile, "Owner must have a linked staff profile");
    assert.equal(ownerStaffProfile.firstName, "Ahmet");
    assert.equal(ownerStaffProfile.lastName, "Usta");
    assert.equal(ownerStaffProfile.active, true);
    assert.equal(ownerStaffProfile.publicBookingEnabled, true);

    // Verify RBAC guards when acting as owner
    mockSession(ownerUserId);

    // requireOwner must succeed
    const ownerGuard = await guardsModule.requireOwner(businessId);
    assert.equal(ownerGuard.membership.role, "OWNER");

    // requireManagerOrOwner must succeed
    const managerGuard = await guardsModule.requireManagerOrOwner(businessId);
    assert.equal(managerGuard.membership.role, "OWNER");

    // In contrast, when session is non-owner staff, requireOwner must reject
    mockSession(bootstrapRes.users.staff.id);
    await assert.rejects(
      async () => {
        await guardsModule.requireOwner(businessId);
      },
      (err: any) => {
        assert.equal(err.name, "ForbiddenError");
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Invariant 12: Exact 8 canonical authenticated QA identities exist
  // --------------------------------------------------------------------------
  it("Invariant 12: Exact 8 canonical authenticated QA identities exist", async () => {
    const bootstrapRes = await qaBootstrapModule.bootstrapQA({});

    const expectedEmails = [
      "qa.superadmin@local.test",
      "qa.platformadmin@local.test",
      "qa.owner@local.test",
      "qa.manager@local.test",
      "qa.staff@local.test",
      "qa.staff2@local.test",
      "qa.owner2@local.test",
      "qa.staff3@local.test",
    ];

    // Query all QA users
    const allQaUsers = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(inArray(schema.users.email, expectedEmails));

    assert.equal(allQaUsers.length, 8, "Exactly 8 canonical authenticated QA users must exist in users table");

    const emailMap = new Map<string, any>(allQaUsers.map((u: any) => [u.email, u]));
    for (const email of expectedEmails) {
      assert.ok(emailMap.has(email), `Expected QA user ${email} must exist`);
    }

    // Verify Platform Roles
    const superAdminUser = emailMap.get("qa.superadmin@local.test");
    const [superAdminRec] = await db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.userId, superAdminUser.id));
    assert.equal(superAdminRec?.role, "SUPER_ADMIN");

    const platformAdminUser = emailMap.get("qa.platformadmin@local.test");
    const [platformAdminRec] = await db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.userId, platformAdminUser.id));
    assert.equal(platformAdminRec?.role, "PLATFORM_ADMIN");

    // Verify Business Roles for QA Berber
    const primaryBizId = bootstrapRes.business.id;
    const owner1 = emailMap.get("qa.owner@local.test");
    const manager = emailMap.get("qa.manager@local.test");
    const staff1 = emailMap.get("qa.staff@local.test");
    const staff2 = emailMap.get("qa.staff2@local.test");

    const [owner1Mem] = await db
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, owner1.id));
    assert.equal(owner1Mem.role, "OWNER");
    assert.equal(owner1Mem.businessId, primaryBizId);

    const [mgrMem] = await db
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, manager.id));
    assert.equal(mgrMem.role, "MANAGER");
    assert.equal(mgrMem.businessId, primaryBizId);

    const [staff1Mem] = await db
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, staff1.id));
    assert.equal(staff1Mem.role, "STAFF");
    assert.equal(staff1Mem.businessId, primaryBizId);

    const [staff2Mem] = await db
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, staff2.id));
    assert.equal(staff2Mem.role, "STAFF");
    assert.equal(staff2Mem.businessId, primaryBizId);

    // Verify Business Roles for QA Salon (Second Business)
    const secondBizId = bootstrapRes.secondBusiness.id;
    const owner2 = emailMap.get("qa.owner2@local.test");
    const staff3 = emailMap.get("qa.staff3@local.test");

    const [owner2Mem] = await db
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, owner2.id));
    assert.equal(owner2Mem.role, "OWNER");
    assert.equal(owner2Mem.businessId, secondBizId);

    const [staff3Mem] = await db
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, staff3.id));
    assert.equal(staff3Mem.role, "STAFF");
    assert.equal(staff3Mem.businessId, secondBizId);

    // Verify CUSTOMER is accountless: no customer has a user account
    const allCustomers = await db.select().from(schema.customers);
    assert.ok(allCustomers.length > 0, "Customers exist in seed data");
    for (const c of allCustomers) {
      assert.equal((c as any).userId, undefined, "Customers must not have userId attribute or auth linkage");
    }
  });
});
