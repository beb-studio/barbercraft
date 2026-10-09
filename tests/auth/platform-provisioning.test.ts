/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let db: any;
let pgServer: any;
let users: any;
let businesses: any;
let businessMembers: any;
let platformAdmins: any;
let accounts: any;
let eq: any;
let and: any;
let PlatformProvisioningService: any;

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  
  const schema = await import("../../src/db/schema");
  users = schema.users;
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  platformAdmins = schema.platformAdmins;
  accounts = schema.accounts;

  const drizzleOrm = await import("drizzle-orm");
  eq = drizzleOrm.eq;
  and = drizzleOrm.and;

  const service = await import("../../src/services/platform-provisioning.service");
  PlatformProvisioningService = service.PlatformProvisioningService;
});

after(async () => {
  await pgServer.stop();
});

describe("Platform Provisioning Flow", () => {
  let platformAdminUserId: string;
  let platformAdminId: string;

  before(async () => {
    const [adminUser] = await db.insert(users).values({
      name: "Super Admin",
      email: "super-admin@example.com",
      emailVerified: true,
    }).returning();
    platformAdminUserId = adminUser.id;

    const [admin] = await db.insert(platformAdmins).values({
      userId: adminUser.id,
      role: "SUPER_ADMIN",
    }).returning();
    platformAdminId = admin.id;
  });

  after(async () => {
    await db.delete(businesses).where(eq(businesses.slug, "new-business-1"));
    await db.delete(businesses).where(eq(businesses.slug, "existing-business-1"));
    await db.delete(users).where(eq(users.email, "super-admin@example.com"));
    await db.delete(users).where(eq(users.email, "new-owner@example.com"));
    await db.delete(users).where(eq(users.email, "existing-owner@example.com"));
  });

  it("should provision a business for a new user and create their account with forcePasswordChange", async () => {
    const input = {
      name: "New Barber Shop",
      slug: "new-business-1",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      ownerEmail: "new-owner@example.com",
      ownerName: "New Owner",
      platformAdminId,
      actorUserId: platformAdminUserId,
    };

    const result = await PlatformProvisioningService.provisionBusiness(input);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isNewUser, true);
    assert.ok(result.tempPassword);
    assert.ok(result.tempPassword.length >= 12);

    const [biz] = await db.select().from(businesses).where(eq(businesses.id, result.businessId));
    assert.strictEqual(biz.slug, "new-business-1");
    assert.strictEqual(biz.active, true);

    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    assert.strictEqual(user.email, "new-owner@example.com");
    assert.strictEqual(user.forcePasswordChange, true);

    const [account] = await db.select().from(accounts).where(eq(accounts.userId, result.userId));
    assert.ok(account);
    assert.ok(account.password);

    const [membership] = await db.select().from(businessMembers).where(and(
      eq(businessMembers.businessId, result.businessId),
      eq(businessMembers.userId, result.userId)
    ));
    assert.strictEqual(membership.role, "OWNER");
  });

  it("should provision a business for an existing user without changing their password", async () => {
    const [existingUser] = await db.insert(users).values({
      name: "Existing Owner",
      email: "existing-owner@example.com",
      emailVerified: true,
      forcePasswordChange: false,
    }).returning();

    const input = {
      name: "Existing Barber Shop",
      slug: "existing-business-1",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      ownerEmail: "existing-owner@example.com",
      ownerName: "Existing Owner",
      platformAdminId,
      actorUserId: platformAdminUserId,
    };

    const result = await PlatformProvisioningService.provisionBusiness(input);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isNewUser, false);
    assert.strictEqual(result.tempPassword, null);

    const [user] = await db.select().from(users).where(eq(users.id, existingUser.id));
    assert.strictEqual(user.forcePasswordChange, false);

    const [membership] = await db.select().from(businessMembers).where(and(
      eq(businessMembers.businessId, result.businessId),
      eq(businessMembers.userId, existingUser.id)
    ));
    assert.strictEqual(membership.role, "OWNER");
  });

  it("should handle duplicate-slug concurrency safely", async () => {
    const input1 = {
      name: "Duplicate Slug 1",
      slug: "dup-slug",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      ownerEmail: "dup1@example.com",
      ownerName: "Dup 1",
      platformAdminId,
      actorUserId: platformAdminUserId,
    };
    const input2 = {
      name: "Duplicate Slug 2",
      slug: "dup-slug", // Same slug
      timezone: "Europe/Istanbul",
      currency: "TRY",
      ownerEmail: "dup2@example.com",
      ownerName: "Dup 2",
      platformAdminId,
      actorUserId: platformAdminUserId,
    };

    // Run concurrently
    const p1 = PlatformProvisioningService.provisionBusiness(input1);
    const p2 = PlatformProvisioningService.provisionBusiness(input2);

    const results = await Promise.allSettled([p1, p2]);

    const successes = results.filter(r => r.status === "fulfilled");
    const rejections = results.filter(r => r.status === "rejected");

    assert.strictEqual(successes.length, 1);
    assert.strictEqual(rejections.length, 1);

    const successRes = successes[0] as PromiseFulfilledResult<any>;
    
    // Verify exactly one business row
    const allDupBiz = await db.select().from(businesses).where(eq(businesses.slug, "dup-slug"));
    assert.strictEqual(allDupBiz.length, 1);
    
    // Cleanup
    await db.delete(businesses).where(eq(businesses.id, successRes.value.businessId));
    await db.delete(users).where(eq(users.email, "dup1@example.com"));
    await db.delete(users).where(eq(users.email, "dup2@example.com"));
  });

  it("should handle same-email concurrency safely", async () => {
    // Both try to create a business for the same new user email, but different business slugs.
    // Better Auth will reject one with "Email already in use", or one gets created and the other reuses it.
    // Wait, if they run exactly concurrently, both might query DB and see no user.
    // Both call signUpEmail. One fails. The failing one throws an error!
    // But the business creation for the successful one should succeed.
    
    const input1 = {
      name: "Email Concurrency 1",
      slug: "email-concur-1",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      ownerEmail: "concur@example.com",
      ownerName: "Concur",
      platformAdminId,
      actorUserId: platformAdminUserId,
    };
    const input2 = {
      name: "Email Concurrency 2",
      slug: "email-concur-2", // Different slug
      timezone: "Europe/Istanbul",
      currency: "TRY",
      ownerEmail: "concur@example.com", // Same email
      ownerName: "Concur",
      platformAdminId,
      actorUserId: platformAdminUserId,
    };

    // Run concurrently
    const p1 = PlatformProvisioningService.provisionBusiness(input1);
    const p2 = PlatformProvisioningService.provisionBusiness(input2);

    const results = await Promise.allSettled([p1, p2]);
    
    const successes = results.filter(r => r.status === "fulfilled");
    const rejections = results.filter(r => r.status === "rejected");

    // At least one must succeed. The other might succeed (if it reused the identity) or fail (if race condition caught by Better Auth).
    assert.ok(successes.length >= 1);

    // Ensure exactly ONE user exists
    const usersCreated = await db.select().from(users).where(eq(users.email, "concur@example.com"));
    assert.strictEqual(usersCreated.length, 1);

    // Cleanup
    if (successes[0]) await db.delete(businesses).where(eq(businesses.id, (successes[0] as any).value.businessId));
    if (successes[1]) await db.delete(businesses).where(eq(businesses.id, (successes[1] as any).value.businessId));
    await db.delete(users).where(eq(users.email, "concur@example.com"));
  });
});
