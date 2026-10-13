/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let timeBlocksActions: any;
let staffActions: any;
let businesses: any;
let businessMembers: any;
let staffProfiles: any;
let services: any;
let staffServices: any;
let businessWorkingHours: any;
let timeBlocks: any;
let eq: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Test Users
const userOwnerA = uuid(701);
const userAdminA = uuid(702);
const userStaffA = uuid(703);
const userOwnerB = uuid(704);
const userStaffB = uuid(705);
const userNoBiz = uuid(706);

// Test Businesses
const bizA = uuid(721); // Europe/Istanbul (UTC+3)
const bizB = uuid(722); // America/New_York (UTC-4/5)
const bizUtc = uuid(723); // UTC

// Test Memberships
const memOwnerA = uuid(731);
const memAdminA = uuid(732);
const memStaffA = uuid(733);
const memOwnerB = uuid(734);
const memStaffB = uuid(735);

// Test Staff Profiles
const staffOwnerA = uuid(741);
const staffMemberA = uuid(742);
const staffMemberB = uuid(743);

// Test Services
const svcA1 = uuid(751);

before(async () => {
  // Use dedicated port 54410
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  timeBlocksActions = await import("../../src/actions/time-blocks.actions");
  staffActions = await import("../../src/actions/staff.actions");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  staffProfiles = schema.staffProfiles;
  services = schema.services;
  staffServices = schema.staffServices;
  businessWorkingHours = schema.businessWorkingHours;
  timeBlocks = schema.timeBlocks;

  const orm = await import("drizzle-orm");
  eq = orm.eq;

  // 1. Insert mock users
  await db.execute(
    `INSERT INTO users (id, name, email, email_verified) VALUES ` +
      `('${userOwnerA}', 'Owner A', 'owner@biz-a.com', true), ` +
      `('${userAdminA}', 'Admin A', 'admin@biz-a.com', true), ` +
      `('${userStaffA}', 'Staff A', 'staff@biz-a.com', true), ` +
      `('${userOwnerB}', 'Owner B', 'owner@biz-b.com', true), ` +
      `('${userStaffB}', 'Staff B', 'staff@biz-b.com', true), ` +
      `('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true)`
  );

  // 2. Insert businesses with different IANA timezones
  await db.insert(businesses).values([
    {
      id: bizA,
      name: "Business Alpha Istanbul",
      slug: "biz-alpha-ist",
      currency: "TRY",
      timezone: "Europe/Istanbul",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizB,
      name: "Business Beta New York",
      slug: "biz-beta-ny",
      currency: "USD",
      timezone: "America/New_York",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizUtc,
      name: "Business UTC",
      slug: "biz-utc",
      currency: "EUR",
      timezone: "UTC",
      onboardingCompletedAt: new Date(),
    },
  ]);

  // 3. Insert complete business hours for bizA
  for (let day = 0; day <= 6; day++) {
    await db.insert(businessWorkingHours).values({
      businessId: bizA,
      dayOfWeek: day,
      startTime: day === 0 ? null : "09:00",
      endTime: day === 0 ? null : "19:00",
      isClosed: day === 0,
    });
  }

  // 4. Insert memberships
  await db.insert(businessMembers).values([
    { id: memOwnerA, businessId: bizA, userId: userOwnerA, role: "OWNER", active: true },
    { id: memAdminA, businessId: bizA, userId: userAdminA, role: "ADMIN", active: true },
    { id: memStaffA, businessId: bizA, userId: userStaffA, role: "STAFF", active: true },
    { id: memOwnerB, businessId: bizB, userId: userOwnerB, role: "OWNER", active: true },
    { id: memStaffB, businessId: bizB, userId: userStaffB, role: "STAFF", active: true },
  ]);

  // 5. Insert staff profiles
  await db.insert(staffProfiles).values([
    {
      id: staffOwnerA,
      businessId: bizA,
      businessMemberId: memOwnerA,
      firstName: "Owner",
      lastName: "Alpha",
      active: true,
      publicBookingEnabled: false,
      usesBusinessHours: true,
    },
    {
      id: staffMemberA,
      businessId: bizA,
      businessMemberId: memStaffA,
      firstName: "Staff",
      lastName: "Alpha",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
    {
      id: staffMemberB,
      businessId: bizB,
      businessMemberId: memStaffB,
      firstName: "Staff",
      lastName: "Beta",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
  ]);

  // 6. Assign active service to staffMemberA
  await db.insert(services).values({
    id: svcA1,
    businessId: bizA,
    name: "Saç Kesimi",
    durationMinutes: 30,
    price: "300.00",
    active: true,
  });

  await db.insert(staffServices).values({
    businessId: bizA,
    staffId: staffMemberA,
    serviceId: svcA1,
  });
});

after(async () => {
  await pgServer?.stop();
});

describe("Staff Time Off / Break / Block Management (TASK 006A) Tests", () => {
  const mockSession = (user: { id: string; email: string } | null) => {
    sessionModule.sessionDependencies.getCurrentUser = async () => user;
  };

  describe("1. Authentication and RBAC Guards", () => {
    it("1.1 rejects unauthenticated user calling getTimeBlocksAction", async () => {
      mockSession(null);
      const res = await timeBlocksActions.getStaffTimeBlocksAction({ staffId: staffMemberA });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.2 rejects unauthenticated user calling createStaffTimeBlockAction", async () => {
      mockSession(null);
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.3 rejects user without business membership calling createStaffTimeBlockAction", async () => {
      mockSession({ id: userNoBiz, email: "nobiz@test.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı|üyeliğiniz/i);
    });

    it("1.4 rejects STAFF role calling createStaffTimeBlockAction for another staff profile (Forbidden)", async () => {
      mockSession({ id: userStaffA, email: "staff@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffOwnerA,
        blockType: "BREAK",
        startDate: "2026-11-10",
        startTime: "12:00",
        endDate: "2026-11-10",
        endTime: "13:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /role required|yetkiniz yok|kendi personel profiliniz/i);
    });

    it("1.5 rejects ADMIN attempting to create a time block for OWNER's profile (Forbidden)", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffOwnerA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /OWNER/i);
    });

    it("1.6 ADMIN can successfully manage time blocks for a STAFF profile", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-01",
        startTime: "12:00",
        endDate: "2026-11-01",
        endTime: "13:00",
        reason: "Admin created lunch break",
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.block.blockType, "BREAK");
      assert.strictEqual(res.block.reason, "Admin created lunch break");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: res.block.id,
      });
    });

    it("1.7 OWNER can successfully manage time blocks for their OWN profile", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffOwnerA,
        blockType: "TIME_OFF",
        startDate: "2026-11-02",
        startTime: "09:00",
        endDate: "2026-11-02",
        endTime: "18:00",
        reason: "Owner time off",
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.block.blockType, "TIME_OFF");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffOwnerA,
        blockId: res.block.id,
      });
    });

    it("1.8 OWNER can successfully manage time blocks for STAFF profiles", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BLOCKED",
        startDate: "2026-11-03",
        startTime: "14:00",
        endDate: "2026-11-03",
        endTime: "16:00",
        reason: "Training session",
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.block.blockType, "BLOCKED");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: res.block.id,
      });
    });
  });

  describe("2. Multi-Tenant Isolation", () => {
    it("2.1 rejects OWNER A attempting to manage time blocks for Staff B (Business B)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberB,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı/i);
    });

    it("2.2 rejects ADMIN A attempting to get time blocks for Staff B (Business B)", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await timeBlocksActions.getStaffTimeBlocksAction({ staffId: staffMemberB });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı/i);
    });

    it("2.3 prevents cross-tenant block spoofing on update or delete", async () => {
      // 1. Create a block in Business B by Owner B
      mockSession({ id: userOwnerB, email: "owner@biz-b.com" });
      const createRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberB,
        blockType: "BREAK",
        startDate: "2026-11-05",
        startTime: "12:00",
        endDate: "2026-11-05",
        endTime: "13:00",
      });
      assert.strictEqual(createRes.success, true);
      const bBlockId = createRes.block.id;

      // 2. Owner A attempts to delete block belonging to Business B
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const delRes = await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: bBlockId,
      });
      assert.strictEqual(delRes.success, false);
      assert.match(delRes.error, /bulunamadı/i);

      // Verify block in Business B still exists
      const [blockInDb] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, bBlockId));
      assert.ok(blockInDb);

      // Cleanup
      mockSession({ id: userOwnerB, email: "owner@biz-b.com" });
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberB,
        blockId: bBlockId,
      });
    });
  });

  describe("3. Block Types & Input Validation", () => {
    it("3.1 allows all 3 valid block types (TIME_OFF, BREAK, BLOCKED)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      const t1 = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "11:00",
      });
      assert.strictEqual(t1.success, true);
      assert.strictEqual(t1.block.blockType, "TIME_OFF");

      const t2 = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-10",
        startTime: "12:00",
        endDate: "2026-11-10",
        endTime: "13:00",
      });
      assert.strictEqual(t2.success, true);
      assert.strictEqual(t2.block.blockType, "BREAK");

      const t3 = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BLOCKED",
        startDate: "2026-11-10",
        startTime: "14:00",
        endDate: "2026-11-10",
        endTime: "15:00",
      });
      assert.strictEqual(t3.success, true);
      assert.strictEqual(t3.block.blockType, "BLOCKED");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: t1.block.id });
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: t2.block.id });
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: t3.block.id });
    });

    it("3.2 rejects invalid or legacy block types (VACATION, OTHER, APPOINTMENT, free-form)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      const invalidTypes = ["VACATION", "OTHER", "APPOINTMENT", "MEETING", ""];
      for (const inv of invalidTypes) {
        const res = await timeBlocksActions.createStaffTimeBlockAction({
          staffId: staffMemberA,
          blockType: inv,
          startDate: "2026-11-10",
          startTime: "09:00",
          endDate: "2026-11-10",
          endTime: "11:00",
        });
        assert.strictEqual(res.success, false);
        assert.match(res.error, /geçersiz zaman bloğu türü/i);
      }
    });

    it("3.3 rejects start >= end (same time or start after end)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      // Same start and end
      const equalRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-10",
        startTime: "12:00",
        endDate: "2026-11-10",
        endTime: "12:00",
      });
      assert.strictEqual(equalRes.success, false);
      assert.match(equalRes.error, /önce olmalıdır/i);

      // Start after end (same day)
      const afterRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-10",
        startTime: "15:00",
        endDate: "2026-11-10",
        endTime: "12:00",
      });
      assert.strictEqual(afterRes.success, false);
      assert.match(afterRes.error, /önce olmalıdır/i);

      // Start date after end date
      const afterDateRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-15",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(afterDateRes.success, false);
      assert.match(afterDateRes.error, /önce olmalıdır/i);
    });

    it("3.4 rejects malformed date or time strings", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      const badDateRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "10-11-2026",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(badDateRes.success, false);
      assert.match(badDateRes.error, /formatı/i);

      const badTimeRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "25:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(badTimeRes.success, false);
      assert.match(badTimeRes.error, /formatı/i);
    });

    it("3.5 rejects notes exceeding 500 characters", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const longNote = "a".repeat(501);
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
        reason: longNote,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /500 karakter/i);
    });
  });

  describe("4. Timezone Strategy & Conversions", () => {
    it("4.1 interprets wall-clock times in business timezone (Europe/Istanbul UTC+3)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // In Europe/Istanbul (UTC+3), 2026-11-10 09:00 local is 2026-11-10 06:00:00 UTC
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "18:00",
      });
      assert.strictEqual(res.success, true);

      // Verify raw instant stored in DB
      const [blockInDb] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, res.block.id));

      const startUtcIso = blockInDb.startTime.toISOString();
      assert.strictEqual(startUtcIso, "2026-11-10T06:00:00.000Z");

      const endUtcIso = blockInDb.endTime.toISOString();
      assert.strictEqual(endUtcIso, "2026-11-10T15:00:00.000Z");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: res.block.id });
    });

    it("4.2 interprets wall-clock times in business timezone (America/New_York)", async () => {
      mockSession({ id: userOwnerB, email: "owner@biz-b.com" });
      // In America/New_York on 2026-11-10 (Standard Time, UTC-5), 09:00 is 14:00 UTC
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberB,
        blockType: "BREAK",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-10",
        endTime: "10:00",
      });
      assert.strictEqual(res.success, true);

      const [blockInDb] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, res.block.id));

      const startUtcIso = blockInDb.startTime.toISOString();
      assert.strictEqual(startUtcIso, "2026-11-10T14:00:00.000Z");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberB, blockId: res.block.id });
    });

    it("4.3 rejects nonexistent wall-clock time caused by DST spring-forward transition", async () => {
      mockSession({ id: userOwnerB, email: "owner@biz-b.com" });
      // In America/New_York, on 2026-03-08 at 02:00, clocks jump to 03:00.
      // 02:30 does NOT exist!
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberB,
        blockType: "TIME_OFF",
        startDate: "2026-03-08",
        startTime: "02:30",
        endDate: "2026-03-08",
        endTime: "04:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /yaz saati|DST/i);
    });

    it("4.4 formats stored instants back to local dates and times in business timezone", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-10",
        startTime: "09:00",
        endDate: "2026-11-12",
        endTime: "18:00",
      });
      assert.strictEqual(res.success, true);

      assert.strictEqual(res.block.startFormatted.dateStr, "2026-11-10");
      assert.strictEqual(res.block.startFormatted.timeStr, "09:00");
      assert.strictEqual(res.block.endFormatted.dateStr, "2026-11-12");
      assert.strictEqual(res.block.endFormatted.timeStr, "18:00");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: res.block.id });
    });
  });

  describe("5. Overlap Prevention & Concurrency Serialization", () => {
    let existingBlockId: string;

    before(async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Create a base block: 2026-11-20 10:00 to 12:00 (Istanbul)
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-20",
        startTime: "10:00",
        endDate: "2026-11-20",
        endTime: "12:00",
        reason: "Base block",
      });
      existingBlockId = res.block.id;
    });

    after(async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: existingBlockId,
      });
    });

    it("5.1 rejects newly created block completely inside existing interval (10:30 - 11:30)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "10:30",
        endDate: "2026-11-20",
        endTime: "11:30",
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.isOverlap, true);
      assert.match(res.error, /çakışmaktadır/i);
    });

    it("5.2 rejects newly created block starting before and ending inside existing interval (09:00 - 11:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "09:00",
        endDate: "2026-11-20",
        endTime: "11:00",
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.isOverlap, true);
      assert.match(res.error, /çakışmaktadır/i);
    });

    it("5.3 rejects newly created block starting inside and ending after existing interval (11:00 - 13:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "11:00",
        endDate: "2026-11-20",
        endTime: "13:00",
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.isOverlap, true);
      assert.match(res.error, /çakışmaktadır/i);
    });

    it("5.4 rejects newly created block completely enveloping existing interval (08:00 - 14:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-20",
        startTime: "08:00",
        endDate: "2026-11-20",
        endTime: "14:00",
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.isOverlap, true);
      assert.match(res.error, /çakışmaktadır/i);
    });

    it("5.5 allows back-to-back blocks (ending exactly when existing starts: 09:00 - 10:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "09:00",
        endDate: "2026-11-20",
        endTime: "10:00",
      });
      assert.strictEqual(res.success, true);

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: res.block.id });
    });

    it("5.6 allows back-to-back blocks (starting exactly when existing ends: 12:00 - 13:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "12:00",
        endDate: "2026-11-20",
        endTime: "13:00",
      });
      assert.strictEqual(res.success, true);

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: res.block.id });
    });

    it("5.7 editing a block allows keeping the same time without self-overlap error", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.updateStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: existingBlockId,
        blockType: "BLOCKED",
        startDate: "2026-11-20",
        startTime: "10:00",
        endDate: "2026-11-20",
        endTime: "12:00",
        reason: "Updated reason without self overlap",
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.block.blockType, "BLOCKED");
      assert.strictEqual(res.block.reason, "Updated reason without self overlap");
    });

    it("5.8 editing a block to overlap another block is rejected", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Create a second block: 14:00 - 16:00
      const b2 = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "14:00",
        endDate: "2026-11-20",
        endTime: "16:00",
      });
      assert.strictEqual(b2.success, true);

      // Try updating b2 to overlap existingBlock (which is 10:00 - 12:00)
      const res = await timeBlocksActions.updateStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: b2.block.id,
        blockType: "BREAK",
        startDate: "2026-11-20",
        startTime: "11:00",
        endDate: "2026-11-20",
        endTime: "13:00",
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.isOverlap, true);

      // Cleanup b2
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: b2.block.id });
    });

    it("5.9 concurrent requests attempting to create overlapping blocks are serialized by row lock", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const p1 = timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-21",
        startTime: "10:00",
        endDate: "2026-11-21",
        endTime: "12:00",
        reason: "Concurrent 1",
      });
      const p2 = timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "BREAK",
        startDate: "2026-11-21",
        startTime: "11:00",
        endDate: "2026-11-21",
        endTime: "13:00",
        reason: "Concurrent 2",
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      const successes = [r1, r2].filter((r: any) => r.success);
      const failures = [r1, r2].filter((r: any) => !r.success);

      assert.strictEqual(successes.length, 1);
      assert.strictEqual(failures.length, 1);
      assert.strictEqual(failures[0].isOverlap, true);

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: successes[0].block.id,
      });
    });
  });

  describe("6. Schedule Independence & Multi-Day Spans", () => {
    it("6.1 allows block on a closed day (e.g. Sunday) or completely outside working hours", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // 2026-11-22 is Sunday (closed in bizA)
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-22",
        startTime: "00:00",
        endDate: "2026-11-22",
        endTime: "23:59",
        reason: "Sunday full day off",
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.block.blockType, "TIME_OFF");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: res.block.id });
    });

    it("6.2 supports multi-day block spans (e.g. 3-day vacation)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-24",
        startTime: "09:00",
        endDate: "2026-11-27",
        endTime: "18:00",
        reason: "Multi-day vacation",
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.block.startFormatted.dateStr, "2026-11-24");
      assert.strictEqual(res.block.endFormatted.dateStr, "2026-11-27");

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: res.block.id });
    });

    it("6.3 creating a time block does NOT alter public_booking_enabled or booking readiness", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Check readiness before
      const beforeDetail = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(beforeDetail.staff.publicBookingEnabled, true);
      assert.strictEqual(beforeDetail.bookingReadiness.isReady, true);

      // Create a time block
      const blockRes = await timeBlocksActions.createStaffTimeBlockAction({
        staffId: staffMemberA,
        blockType: "TIME_OFF",
        startDate: "2026-11-30",
        startTime: "09:00",
        endDate: "2026-11-30",
        endTime: "18:00",
      });
      assert.strictEqual(blockRes.success, true);

      // Check readiness after: must still be completely ready!
      const afterDetail = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(afterDetail.staff.publicBookingEnabled, true);
      assert.strictEqual(afterDetail.bookingReadiness.isReady, true);

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({ staffId: staffMemberA, blockId: blockRes.block.id });
    });
  });

  describe("7. Status Evaluation & Past Block Immutability", () => {
    let pastBlockId: string;
    let upcomingBlockId: string;

    before(async () => {
      // Direct DB insert of a past block (endTime in past)
      const [pastBlock] = await db
        .insert(timeBlocks)
        .values({
          businessId: bizA,
          staffId: staffMemberA,
          blockType: "TIME_OFF",
          startTime: new Date("2025-01-01T08:00:00Z"),
          endTime: new Date("2025-01-01T17:00:00Z"),
          reason: "Old 2025 vacation",
        })
        .returning();
      pastBlockId = pastBlock.id;

      // Direct DB insert of an upcoming block (startTime in future)
      const [upcomingBlock] = await db
        .insert(timeBlocks)
        .values({
          businessId: bizA,
          staffId: staffMemberA,
          blockType: "BREAK",
          startTime: new Date("2028-06-01T10:00:00Z"),
          endTime: new Date("2028-06-01T11:00:00Z"),
          reason: "Future break",
        })
        .returning();
      upcomingBlockId = upcomingBlock.id;
    });

    after(async () => {
      await db.delete(timeBlocks).where(eq(timeBlocks.id, pastBlockId));
      await db.delete(timeBlocks).where(eq(timeBlocks.id, upcomingBlockId));
    });

    it("7.1 listing accurately calculates PAST and UPCOMING status using server time", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.getStaffTimeBlocksAction({ staffId: staffMemberA });
      assert.strictEqual(res.success, true);

      const past = res.blocks.find((b: any) => b.id === pastBlockId);
      assert.ok(past);
      assert.strictEqual(past.status, "PAST");
      assert.strictEqual(past.isEditable, false);
      assert.strictEqual(past.isDeletable, false);

      const upcoming = res.blocks.find((b: any) => b.id === upcomingBlockId);
      assert.ok(upcoming);
      assert.strictEqual(upcoming.status, "UPCOMING");
      assert.strictEqual(upcoming.isEditable, true);
      assert.strictEqual(upcoming.isDeletable, true);
    });

    it("7.2 rejects editing a fully past block (read-only enforcement)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.updateStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: pastBlockId,
        blockType: "BREAK",
        startDate: "2025-01-01",
        startTime: "09:00",
        endDate: "2025-01-01",
        endTime: "12:00",
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /geçmiş zaman blokları değiştirilemez/i);
    });

    it("7.3 rejects deleting a fully past block (audit preservation)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: pastBlockId,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /geçmiş zaman blokları silinemez/i);

      // Verify still in DB
      const [block] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, pastBlockId));
      assert.ok(block);
    });

    it("7.4 allows editing and deleting a future block", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Edit future block
      const updateRes = await timeBlocksActions.updateStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: upcomingBlockId,
        blockType: "BLOCKED",
        startDate: "2028-06-01",
        startTime: "10:00",
        endDate: "2028-06-01",
        endTime: "12:00",
        reason: "Edited future block",
      });
      assert.strictEqual(updateRes.success, true);
      assert.strictEqual(updateRes.block.blockType, "BLOCKED");

      // Delete future block
      const delRes = await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: upcomingBlockId,
      });
      assert.strictEqual(delRes.success, true);

      // Verify removed from DB
      const [block] = await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.id, upcomingBlockId));
      assert.strictEqual(block, undefined);
    });

    it("7.5 correctly calculates ACTIVE status for an ongoing time block", async () => {
      // Direct DB insert of an active block (startTime 1 hour ago, endTime 1 hour ahead)
      const now = new Date();
      const [activeBlock] = await db
        .insert(timeBlocks)
        .values({
          businessId: bizA,
          staffId: staffMemberA,
          blockType: "BREAK",
          startTime: new Date(now.getTime() - 3600000),
          endTime: new Date(now.getTime() + 3600000),
          reason: "Active lunch break",
        })
        .returning();

      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await timeBlocksActions.getStaffTimeBlocksAction({ staffId: staffMemberA });
      assert.strictEqual(res.success, true);

      const found = res.blocks.find((b: any) => b.id === activeBlock.id);
      assert.ok(found);
      assert.strictEqual(found.status, "ACTIVE");
      assert.strictEqual(found.isEditable, true);
      assert.strictEqual(found.isDeletable, true);

      // Cleanup
      await timeBlocksActions.deleteStaffTimeBlockAction({
        staffId: staffMemberA,
        blockId: activeBlock.id,
      });
    });
  });
});
