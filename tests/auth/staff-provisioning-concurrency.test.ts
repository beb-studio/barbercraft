/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let db: any;
let pgServer: any;
let users: any;
let businesses: any;
let businessMembers: any;
let staffProfiles: any;
let services: any;
let eq: any;
let and: any;
let StaffProvisioningService: any;
let auth: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MOCK = {
  biz1: uuid(1),
  biz2: uuid(2),
  owner1: uuid(3),
  owner2: uuid(4),
  service1: uuid(7),
  service2: uuid(8),
};

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  
  const schema = await import("../../src/db/schema");
  users = schema.users;
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  staffProfiles = schema.staffProfiles;
  services = schema.services;

  const drizzleOrm = await import("drizzle-orm");
  eq = drizzleOrm.eq;
  and = drizzleOrm.and;

  const spsModule = await import("../../src/services/staff-provisioning.service");
  StaffProvisioningService = spsModule.StaffProvisioningService;

  const authModule = await import("../../src/lib/auth/auth");
  auth = authModule.auth;

  // Mock Better Auth signUpEmail to correctly throw uniqueness errors like a real DB
  (auth as any).api = {
    signUpEmail: async (params: any) => {
      const { email, password, name } = params.body;
      try {
        await db.insert(users).values({
          email,
          name,
          emailVerified: true
        });
        return { ok: true, user: { id: "mock-id-will-be-overridden", email } };
      } catch (err: any) {
        // Postgres unique violation code is 23505
        if (err.code === "23505") {
          throw new Error("User already exists (mocked constraint violation)");
        }
        throw err;
      }
    }
  };

  // Insert base mock data
  await db.insert(users).values([
    { id: MOCK.owner1, email: "owner1@test.com", name: "O1", emailVerified: true },
    { id: MOCK.owner2, email: "owner2@test.com", name: "O2", emailVerified: true },
  ]);

  await db.insert(businesses).values([
    { id: MOCK.biz1, name: "Biz 1", slug: "biz1", timezone: "Europe/Istanbul", currency: "TRY", active: true },
    { id: MOCK.biz2, name: "Biz 2", slug: "biz2", timezone: "Europe/Istanbul", currency: "TRY", active: true },
  ]);

  await db.insert(businessMembers).values([
    { id: uuid(10), businessId: MOCK.biz1, userId: MOCK.owner1, role: "OWNER", active: true },
    { id: uuid(11), businessId: MOCK.biz2, userId: MOCK.owner2, role: "OWNER", active: true },
  ]);

  await db.insert(services).values([
    { id: MOCK.service1, businessId: MOCK.biz1, name: "Svc 1", durationMinutes: 30, price: "100", active: true },
    { id: MOCK.service2, businessId: MOCK.biz2, name: "Svc 2", durationMinutes: 30, price: "100", active: true },
  ]);
});

after(async () => {
  await pgServer.stop();
});

describe("Staff Provisioning Concurrency Hardening", () => {
  it("Stress Test: Same Email - Different Businesses Race", async () => {
    // 25 iterations to verify robustness
    for (let i = 0; i < 25; i++) {
      const targetEmail = `stress-diff-${i}@test.com`;

      const p1 = StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.owner1,
        email: targetEmail,
        name: "Concurrent User",
        serviceIds: []
      });

      const p2 = StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz2,
        actorUserId: MOCK.owner2,
        email: targetEmail,
        name: "Concurrent User",
        serviceIds: []
      });

      const results = await Promise.allSettled([p1, p2]);
      
      // Both must succeed!
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[1].status, "fulfilled");
      
      const r1 = (results[0] as any).value;
      const r2 = (results[1] as any).value;

      assert.equal(r1.success, true);
      assert.equal(r2.success, true);
      
      // They must share the SAME global identity
      assert.equal(r1.userId, r2.userId, "Both operations must resolve to the same user ID");
      
      // Only ONE can be the creator and get the temp password
      const creatorCount = (r1.isNewUser ? 1 : 0) + (r2.isNewUser ? 1 : 0);
      assert.equal(creatorCount, 1, "Exactly one request must be the creator");
      
      if (r1.isNewUser) {
        assert.ok(r1.tempPassword, "Creator must get temp password");
        assert.equal(r2.tempPassword, null, "Non-creator must not get temp password");
      } else {
        assert.ok(r2.tempPassword, "Creator must get temp password");
        assert.equal(r1.tempPassword, null, "Non-creator must not get temp password");
      }
      
      // Verify DB state
      const globalUsers = await db.select().from(users).where(eq(users.email, targetEmail));
      assert.equal(globalUsers.length, 1, "Exactly one global identity must exist");
      
      const members = await db.select().from(businessMembers).where(eq(businessMembers.userId, globalUsers[0].id));
      assert.equal(members.length, 2, "Exactly two memberships must exist");
    }
  });

  it("Same Email - Same Business Race", async () => {
    const targetEmail = "stress-same-biz@test.com";

    const p1 = StaffProvisioningService.provisionStaff({
      businessId: MOCK.biz1,
      actorUserId: MOCK.owner1,
      email: targetEmail,
      name: "Same Biz User",
      serviceIds: []
    });

    const p2 = StaffProvisioningService.provisionStaff({
      businessId: MOCK.biz1,
      actorUserId: MOCK.owner1, // same owner, same biz
      email: targetEmail,
      name: "Same Biz User",
      serviceIds: []
    });

    const results = await Promise.allSettled([p1, p2]);
    
    // Exactly ONE must succeed, exactly ONE must fail with STAFF_ALREADY_EXISTS
    const succeeded = results.filter(r => r.status === "fulfilled");
    const failed = results.filter(r => r.status === "rejected");
    
    assert.equal(succeeded.length, 1, "Exactly one operation must succeed");
    assert.equal(failed.length, 1, "Exactly one operation must fail");
    
    assert.match((failed[0] as any).reason.message, /STAFF_ALREADY_EXISTS/);
    
    // DB state
    const globalUsers = await db.select().from(users).where(eq(users.email, targetEmail));
    assert.equal(globalUsers.length, 1);
    
    const members = await db.select().from(businessMembers).where(eq(businessMembers.userId, globalUsers[0].id));
    assert.equal(members.length, 1, "Exactly one membership must exist");
  });

  it("Failure + Concurrent Success Race (Safe Compensation)", async () => {
    const targetEmail = "failure-race@test.com";

    // Request A fails during tenant logic due to cross-tenant service (INVALID_SERVICE)
    const pFail = StaffProvisioningService.provisionStaff({
      businessId: MOCK.biz1,
      actorUserId: MOCK.owner1,
      email: targetEmail,
      name: "Fail User",
      serviceIds: [MOCK.service2] // service2 belongs to biz2, this will throw
    });

    // Request B succeeds legitimately in another business
    const pSuccess = StaffProvisioningService.provisionStaff({
      businessId: MOCK.biz2,
      actorUserId: MOCK.owner2,
      email: targetEmail,
      name: "Success User",
      serviceIds: []
    });

    const results = await Promise.allSettled([pFail, pSuccess]);
    
    assert.equal(results[0].status, "rejected");
    assert.equal(results[1].status, "fulfilled");
    
    // Verify Request A threw the expected error, not a DB error
    assert.match((results[0] as any).reason.message, /INVALID_SERVICE/);
    
    const rSuccess = (results[1] as any).value;
    assert.equal(rSuccess.success, true);
    
    // The critical check: Does the identity still exist? 
    // If unsafe compensation fired, Request A would have deleted it!
    const globalUsers = await db.select().from(users).where(eq(users.email, targetEmail));
    assert.equal(globalUsers.length, 1, "Global identity MUST NOT be deleted by failing operation");
    
    // The successful operation must have created a membership
    const members = await db.select().from(businessMembers).where(eq(businessMembers.userId, globalUsers[0].id));
    assert.equal(members.length, 1, "Exactly one membership (from successful op) must exist");
    assert.equal(members[0].businessId, MOCK.biz2);
  });
});
