/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

describe("RELEASE PREP 0: Role Taxonomy Authorization & Cross-Tenant Regression (Parts 13 & 14)", () => {
  let pgServer: any;
  let db: any;
  let schema: any;
  let sessionModule: any;
  let guardsModule: any;
  let authModule: any;

  const uuid = (n: number) => `88110000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  const ids = {
    superAdmin: uuid(1),
    platformAdmin: uuid(2),
    ownerA: uuid(10),
    managerA: uuid(11),
    staffA: uuid(12),
    ownerB: uuid(20),
    managerB: uuid(21),
    staffB: uuid(22),
    bizA: uuid(100),
    bizB: uuid(200),
  };

  const mockSession = (userId: string | null) => {
    sessionModule.sessionDependencies.getCurrentUser = async () =>
      userId
        ? {
            id: userId,
            email: `${userId}@test.local`,
            forcePasswordChange: false,
          }
        : null;
  };

  before(async () => {
    pgServer = await startDatabase();
    process.env.DATABASE_URL = pgServer.connectionString;

    const dbLib = await import("../../src/db");
    db = dbLib.db;
    schema = await import("../../src/db/schema");
    sessionModule = await import("../../src/lib/auth/session");
    guardsModule = await import("../../src/lib/auth/guards");
    authModule = await import("../../src/lib/auth/auth");

    // Seed users
    await db.insert(schema.users).values([
      { id: ids.superAdmin, name: "QA Super Admin", email: "super@test.local", emailVerified: true },
      { id: ids.platformAdmin, name: "QA Platform Admin", email: "platform@test.local", emailVerified: true },
      { id: ids.ownerA, name: "Owner A", email: "ownerA@test.local", emailVerified: true },
      { id: ids.managerA, name: "Manager A", email: "managerA@test.local", emailVerified: true },
      { id: ids.staffA, name: "Staff A", email: "staffA@test.local", emailVerified: true },
      { id: ids.ownerB, name: "Owner B", email: "ownerB@test.local", emailVerified: true },
      { id: ids.managerB, name: "Manager B", email: "managerB@test.local", emailVerified: true },
      { id: ids.staffB, name: "Staff B", email: "staffB@test.local", emailVerified: true },
    ]);

    // Seed businesses
    await db.insert(schema.businesses).values([
      { id: ids.bizA, name: "QA Berber A", slug: "qa-berber-a", timezone: "Europe/Istanbul", currency: "TRY" },
      { id: ids.bizB, name: "QA Berber B", slug: "qa-berber-b", timezone: "Europe/Istanbul", currency: "TRY" },
    ]);

    // Seed platform admins
    await db.insert(schema.platformAdmins).values([
      { userId: ids.superAdmin, role: "SUPER_ADMIN", active: true },
      { userId: ids.platformAdmin, role: "PLATFORM_ADMIN", active: true },
    ]);

    // Seed business memberships (tenant A)
    await db.insert(schema.businessMembers).values([
      { businessId: ids.bizA, userId: ids.ownerA, role: "OWNER", active: true },
      { businessId: ids.bizA, userId: ids.managerA, role: "MANAGER", active: true },
      { businessId: ids.bizA, userId: ids.staffA, role: "STAFF", active: true },
    ]);

    // Seed business memberships (tenant B)
    await db.insert(schema.businessMembers).values([
      { businessId: ids.bizB, userId: ids.ownerB, role: "OWNER", active: true },
      { businessId: ids.bizB, userId: ids.managerB, role: "MANAGER", active: true },
      { businessId: ids.bizB, userId: ids.staffB, role: "STAFF", active: true },
    ]);
  });

  after(async () => {
    await pgServer?.stop();
  });

  beforeEach(() => {
    mockSession(null);
  });

  describe("Platform Authority Boundary (Invariants 1-5)", () => {
    it("1. SUPER_ADMIN can access platform operations and super admin actions", async () => {
      mockSession(ids.superAdmin);
      const ctx = await guardsModule.requirePlatformAdmin();
      assert.equal(ctx.platformRole, "SUPER_ADMIN");
      assert.equal(ctx.userId, ids.superAdmin);

      const superCtx = await guardsModule.requirePlatformSuperAdmin();
      assert.equal(superCtx.platformRole, "SUPER_ADMIN");
    });

    it("2. PLATFORM_ADMIN can access permitted platform operations, but not super admin actions", async () => {
      mockSession(ids.platformAdmin);
      const ctx = await guardsModule.requirePlatformAdmin();
      assert.equal(ctx.platformRole, "PLATFORM_ADMIN");
      assert.equal(ctx.userId, ids.platformAdmin);

      await assert.rejects(
        () => guardsModule.requirePlatformSuperAdmin(),
        { name: "ForbiddenError" }
      );
    });

    it("3. OWNER cannot access platform operations", async () => {
      mockSession(ids.ownerA);
      await assert.rejects(
        () => guardsModule.requirePlatformAdmin(),
        { name: "ForbiddenError" }
      );
    });

    it("4. MANAGER cannot access platform operations", async () => {
      mockSession(ids.managerA);
      await assert.rejects(
        () => guardsModule.requirePlatformAdmin(),
        { name: "ForbiddenError" }
      );
    });

    it("5. STAFF cannot access platform operations", async () => {
      mockSession(ids.staffA);
      await assert.rejects(
        () => guardsModule.requirePlatformAdmin(),
        { name: "ForbiddenError" }
      );
    });
  });

  describe("Business Authority Boundary (Invariants 6-8)", () => {
    it("6. OWNER retains complete business authority (passes requireOwner and requireManagerOrOwner)", async () => {
      mockSession(ids.ownerA);
      const { membership: ownerMem } = await guardsModule.requireOwner(ids.bizA);
      assert.equal(ownerMem.role, "OWNER");

      const { membership: managerMem } = await guardsModule.requireManagerOrOwner(ids.bizA);
      assert.equal(managerMem.role, "OWNER");
    });

    it("7. MANAGER retains business management authority (passes requireManagerOrOwner, rejected by requireOwner)", async () => {
      mockSession(ids.managerA);
      const { membership } = await guardsModule.requireManagerOrOwner(ids.bizA);
      assert.equal(membership.role, "MANAGER");

      await assert.rejects(
        () => guardsModule.requireOwner(ids.bizA),
        { name: "ForbiddenError" }
      );
    });

    it("8. STAFF remains strictly personal operational authority (rejected by both requireOwner and requireManagerOrOwner)", async () => {
      mockSession(ids.staffA);
      const { membership } = await guardsModule.requireBusinessMembership(ids.bizA);
      assert.equal(membership.role, "STAFF");

      await assert.rejects(
        () => guardsModule.requireManagerOrOwner(ids.bizA),
        { name: "ForbiddenError" }
      );

      await assert.rejects(
        () => guardsModule.requireOwner(ids.bizA),
        { name: "ForbiddenError" }
      );
    });
  });

  describe("Authority Separation, Customer Model & Self-Registration (Invariants 9-12)", () => {
    it("9. PLATFORM_ADMIN does not automatically receive tenant membership", async () => {
      mockSession(ids.platformAdmin);
      const membership = await sessionModule.getMembership(ids.bizA);
      assert.equal(membership, null, "Platform admin must have no tenant membership");

      await assert.rejects(
        () => guardsModule.requireBusinessMembership(ids.bizA),
        { name: "ForbiddenError" }
      );
    });

    it("10. MANAGER does not gain platform authority", async () => {
      mockSession(ids.managerA);
      await assert.rejects(
        () => guardsModule.requirePlatformAdmin(),
        { name: "ForbiddenError" }
      );
    });

    it("11. CUSTOMER remains accountless (no session, no membership, not in users)", async () => {
      mockSession(null);
      const currentUser = await sessionModule.getCurrentUser();
      assert.equal(currentUser, null, "Customer has no authenticated user session");

      const membership = await sessionModule.getMembership(ids.bizA);
      assert.equal(membership, null, "Customer has no tenant membership");
    });

    it("12. Public registration remains permanently disabled via Better Auth", async () => {
      const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "unauthorized.public.visitor@test.local",
          password: "VisitorPassword123!",
          name: "Public Visitor",
        }),
      });
      const res = await authModule.auth.handler(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
    });
  });

  describe("Cross-Tenant Isolation (Part 14)", () => {
    it("MANAGER in tenant A cannot access tenant B", async () => {
      mockSession(ids.managerA);
      await assert.rejects(
        () => guardsModule.requireManagerOrOwner(ids.bizB),
        { name: "ForbiddenError" }
      );
      await assert.rejects(
        () => guardsModule.requireBusinessMembership(ids.bizB),
        { name: "ForbiddenError" }
      );
    });

    it("STAFF in tenant A cannot access tenant B", async () => {
      mockSession(ids.staffA);
      await assert.rejects(
        () => guardsModule.requireBusinessMembership(ids.bizB),
        { name: "ForbiddenError" }
      );
    });

    it("OWNER in tenant A cannot access tenant B merely by forging IDs", async () => {
      mockSession(ids.ownerA);
      await assert.rejects(
        () => guardsModule.requireOwner(ids.bizB),
        { name: "ForbiddenError" }
      );
      await assert.rejects(
        () => guardsModule.requireManagerOrOwner(ids.bizB),
        { name: "ForbiddenError" }
      );
      await assert.rejects(
        () => guardsModule.requireBusinessMembership(ids.bizB),
        { name: "ForbiddenError" }
      );
    });
  });
});
