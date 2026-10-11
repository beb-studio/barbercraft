/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let schema: any;
let PlatformAdminService: any;
let PlatformAdminRepository: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Test Users
const userSuperAdmin = uuid(901);
const userOwner1 = uuid(902);
const userOwner2 = uuid(903);

const biz1 = uuid(911); // Will stay active
const biz2 = uuid(912); // Will be deactivated

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  schema = await import("../../src/db/schema");

  const platformSvc = await import("../../src/services/platform-admin.service");
  PlatformAdminService = platformSvc.PlatformAdminService;
  
  const platformRepo = await import("../../src/repositories/platform-admin.repository");
  PlatformAdminRepository = platformRepo.PlatformAdminRepository;

  // Insert Users
  await db.insert(schema.users).values([
    { id: userSuperAdmin, name: "Super", email: "super@platform.com", emailVerified: true },
    { id: userOwner1, name: "Owner 1", email: "owner1@test.com", emailVerified: true },
    { id: userOwner2, name: "Owner 2", email: "owner2@test.com", emailVerified: true },
  ]);

  // Insert Platform Admin
  await db.insert(schema.platformAdmins).values([
    { id: uuid(9010), userId: userSuperAdmin, role: "SUPER_ADMIN", active: true },
  ]);

  // Insert Businesses
  await db.insert(schema.businesses).values([
    {
      id: biz1,
      name: "Alpha Salon",
      slug: "alpha-salon",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: biz2,
      name: "Beta Cuts",
      slug: "beta-cuts",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
  ]);

  // Insert Memberships
  await db.insert(schema.businessMembers).values([
    { id: uuid(9110), businessId: biz1, userId: userOwner1, role: "OWNER", active: true },
    { id: uuid(9120), businessId: biz2, userId: userOwner2, role: "OWNER", active: true },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("TASK 010B: Platform Business Management Tests", () => {
  it("PlatformAdminRepository: listBusinesses should support pagination, search, and active filtering", async () => {
    // Deactivate biz2 manually
    await PlatformAdminRepository.toggleBusinessActive(biz2, false, uuid(9010), userSuperAdmin, "test deactivation");

    // Test list all (no filters)
    const list1 = await PlatformAdminRepository.listBusinesses({ page: 1, limit: 10 });
    assert.strictEqual(list1.data.length, 2);
    assert.strictEqual(list1.total, 2);

    // Test filter active only
    const list2 = await PlatformAdminRepository.listBusinesses({ page: 1, limit: 10, filterActive: true });
    assert.strictEqual(list2.data.length, 1);
    assert.strictEqual(list2.data[0]?.id, biz1);

    // Test filter inactive only
    const list3 = await PlatformAdminRepository.listBusinesses({ page: 1, limit: 10, filterActive: false });
    assert.strictEqual(list3.data.length, 1);
    assert.strictEqual(list3.data[0]?.id, biz2);

    // Test search by name
    const list4 = await PlatformAdminRepository.listBusinesses({ page: 1, limit: 10, search: "Alpha" });
    assert.strictEqual(list4.data.length, 1);
    assert.strictEqual(list4.data[0]?.id, biz1);

    // Test search by slug
    const list5 = await PlatformAdminRepository.listBusinesses({ page: 1, limit: 10, search: "beta-" });
    assert.strictEqual(list5.data.length, 1);
    assert.strictEqual(list5.data[0]?.id, biz2);
  });

  it("PlatformAdminRepository: getBusinessDetail should aggregate metrics and owner info", async () => {
    const detail = await PlatformAdminRepository.getBusinessDetail(biz1);
    assert.ok(detail);
    assert.strictEqual(detail.business.id, biz1);
    assert.strictEqual(detail.owners.length, 1);
    assert.strictEqual(detail.owners[0]?.id, userOwner1);
    assert.strictEqual(detail.metrics.totalStaff, 0);
    assert.strictEqual(detail.metrics.totalAppointments, 0);
  });

  it("PlatformAdminService: toggleBusinessActive should fail if reason is empty", async () => {
    await assert.rejects(
      PlatformAdminService.toggleBusinessActive(biz1, false, uuid(9010), userSuperAdmin, "   "),
      { message: "Reason is required to toggle business active state." }
    );
  });

  it("PlatformAdminRepository: toggleBusinessActive should lock row and create audit log", async () => {
    const initialLogs = await PlatformAdminRepository.getBusinessAuditLogs(biz1);
    const initialCount = initialLogs.length;

    const updated = await PlatformAdminService.toggleBusinessActive(biz1, false, uuid(9010), userSuperAdmin, "Policy violation");
    assert.strictEqual(updated.active, false);

    const logs = await PlatformAdminRepository.getBusinessAuditLogs(biz1);
    assert.strictEqual(logs.length, initialCount + 1);
    assert.strictEqual(logs[0]?.action, "BUSINESS_DEACTIVATED");
    assert.strictEqual((logs[0]?.metadata as any).reason, "Policy violation");
    assert.strictEqual((logs[0]?.metadata as any).previousState, true);
  });
});
