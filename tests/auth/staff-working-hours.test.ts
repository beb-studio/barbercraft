/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let staffActions: any;
let businesses: any;
let businessMembers: any;
let staffProfiles: any;
let services: any;
let staffServices: any;
let businessWorkingHours: any;
let staffWorkingHours: any;
let eq: any;
let and: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Test Users
const userOwnerA = uuid(801);
const userAdminA = uuid(802);
const userStaffA = uuid(803);
const userStaffA2 = uuid(804);
const userOwnerB = uuid(805);
const userStaffB = uuid(806);
const userNoBiz = uuid(807);
const userOwnerIncomplete = uuid(808);

// Test Businesses
const bizA = uuid(821);
const bizB = uuid(822);
const bizIncomplete = uuid(823);

// Test Memberships
const memOwnerA = uuid(831);
const memAdminA = uuid(832);
const memStaffA = uuid(833);
const memStaffA2 = uuid(834);
const memOwnerB = uuid(835);
const memStaffB = uuid(836);
const memOwnerIncomplete = uuid(837);

// Test Staff Profiles
const staffOwnerA = uuid(841);
const staffMemberA = uuid(842);
const staffMemberA2 = uuid(843);
const staffMemberB = uuid(844);
const staffMemberIncomplete = uuid(845);

// Test Services
const svcA1 = uuid(851);
const svcA2 = uuid(852);
const svcB1 = uuid(853);

before(async () => {
  // Use dedicated port 54409
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  staffActions = await import("../../src/actions/staff.actions");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  staffProfiles = schema.staffProfiles;
  services = schema.services;
  staffServices = schema.staffServices;
  businessWorkingHours = schema.businessWorkingHours;
  staffWorkingHours = schema.staffWorkingHours;

  const orm = await import("drizzle-orm");
  eq = orm.eq;
  and = orm.and;

  // 1. Insert mock users
  await db.execute(
    `INSERT INTO users (id, name, email, email_verified) VALUES ` +
      `('${userOwnerA}', 'Owner A', 'owner@biz-a.com', true), ` +
      `('${userAdminA}', 'Admin A', 'admin@biz-a.com', true), ` +
      `('${userStaffA}', 'Staff A', 'staff@biz-a.com', true), ` +
      `('${userStaffA2}', 'Staff A2', 'staff2@biz-a.com', true), ` +
      `('${userOwnerB}', 'Owner B', 'owner@biz-b.com', true), ` +
      `('${userStaffB}', 'Staff B', 'staff@biz-b.com', true), ` +
      `('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true), ` +
      `('${userOwnerIncomplete}', 'Owner Incomplete', 'incomplete@biz.com', true)`
  );

  // 2. Insert businesses
  await db.insert(businesses).values([
    {
      id: bizA,
      name: "Business Alpha",
      slug: "biz-alpha",
      currency: "TRY",
      timezone: "Europe/Istanbul",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizB,
      name: "Business Beta",
      slug: "biz-beta",
      currency: "TRY",
      timezone: "Europe/Istanbul",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizIncomplete,
      name: "Business Incomplete",
      slug: "biz-incomplete",
      currency: "TRY",
      timezone: "Europe/Istanbul",
      onboardingCompletedAt: null,
    },
  ]);

  // 3. Insert complete 7-day business hours for bizA and bizB (days 1..6 open, day 0 closed)
  for (let day = 0; day <= 6; day++) {
    await db.insert(businessWorkingHours).values([
      {
        businessId: bizA,
        dayOfWeek: day,
        startTime: day === 0 ? null : "09:00",
        endTime: day === 0 ? null : "19:00",
        isClosed: day === 0,
      },
      {
        businessId: bizB,
        dayOfWeek: day,
        startTime: day === 0 ? null : "09:00",
        endTime: day === 0 ? null : "19:00",
        isClosed: day === 0,
      },
    ]);
  }

  // Insert incomplete business hours for bizIncomplete (only days 1..3)
  for (let day = 1; day <= 3; day++) {
    await db.insert(businessWorkingHours).values({
      businessId: bizIncomplete,
      dayOfWeek: day,
      startTime: "10:00",
      endTime: "18:00",
      isClosed: false,
    });
  }

  // 4. Insert memberships
  await db.insert(businessMembers).values([
    { id: memOwnerA, businessId: bizA, userId: userOwnerA, role: "OWNER", active: true },
    { id: memAdminA, businessId: bizA, userId: userAdminA, role: "ADMIN", active: true },
    { id: memStaffA, businessId: bizA, userId: userStaffA, role: "STAFF", active: true },
    { id: memStaffA2, businessId: bizA, userId: userStaffA2, role: "STAFF", active: true },
    { id: memOwnerB, businessId: bizB, userId: userOwnerB, role: "OWNER", active: true },
    { id: memStaffB, businessId: bizB, userId: userStaffB, role: "STAFF", active: true },
    { id: memOwnerIncomplete, businessId: bizIncomplete, userId: userOwnerIncomplete, role: "OWNER", active: true },
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
      lastName: "One",
      active: true,
      publicBookingEnabled: false,
      usesBusinessHours: true,
    },
    {
      id: staffMemberA2,
      businessId: bizA,
      businessMemberId: memStaffA2,
      firstName: "Staff",
      lastName: "Two",
      active: true,
      publicBookingEnabled: false,
      usesBusinessHours: true,
    },
    {
      id: staffMemberB,
      businessId: bizB,
      businessMemberId: memStaffB,
      firstName: "Staff",
      lastName: "Beta",
      active: true,
      publicBookingEnabled: false,
      usesBusinessHours: true,
    },
    {
      id: staffMemberIncomplete,
      businessId: bizIncomplete,
      businessMemberId: memOwnerIncomplete,
      firstName: "Owner",
      lastName: "Incomplete",
      active: true,
      publicBookingEnabled: false,
      usesBusinessHours: true,
    },
  ]);

  // 6. Insert services
  await db.insert(services).values([
    {
      id: svcA1,
      businessId: bizA,
      name: "Saç Kesimi",
      description: "Klasik kesim",
      durationMinutes: 30,
      price: "300.00",
      active: true,
    },
    {
      id: svcA2,
      businessId: bizA,
      name: "Sakal Tıraşı",
      description: "Sakal bakım",
      durationMinutes: 20,
      price: "200.00",
      active: true,
    },
    {
      id: svcB1,
      businessId: bizB,
      name: "Beta Hizmet",
      description: "Beta bakım",
      durationMinutes: 30,
      price: "350.00",
      active: true,
    },
  ]);

  // 7. Assign active services to staffOwnerA and staffMemberA
  await db.insert(staffServices).values([
    { businessId: bizA, staffId: staffOwnerA, serviceId: svcA1 },
    { businessId: bizA, staffId: staffMemberA, serviceId: svcA1 },
    { businessId: bizA, staffId: staffMemberA2, serviceId: svcA1 },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("Custom Staff Working Hours (TASK 005C.2) Tests", () => {
  const mockSession = (user: { id: string; email: string } | null) => {
    sessionModule.sessionDependencies.getCurrentUser = async () => user;
  };

  const sampleValidSchedule = [
    { dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 2, isWorking: true, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 3, isWorking: true, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 4, isWorking: true, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 5, isWorking: true, startTime: "09:00", endTime: "18:00" },
    { dayOfWeek: 6, isWorking: true, startTime: "10:00", endTime: "16:00" },
    { dayOfWeek: 0, isWorking: false, startTime: null, endTime: null },
  ];

  const sampleAllClosedSchedule = [
    { dayOfWeek: 1, isWorking: false, startTime: null, endTime: null },
    { dayOfWeek: 2, isWorking: false, startTime: null, endTime: null },
    { dayOfWeek: 3, isWorking: false, startTime: null, endTime: null },
    { dayOfWeek: 4, isWorking: false, startTime: null, endTime: null },
    { dayOfWeek: 5, isWorking: false, startTime: null, endTime: null },
    { dayOfWeek: 6, isWorking: false, startTime: null, endTime: null },
    { dayOfWeek: 0, isWorking: false, startTime: null, endTime: null },
  ];

  describe("1. Authentication and RBAC Guards", () => {
    it("1.1 rejects unauthenticated user calling saveStaffWorkingHoursAction", async () => {
      mockSession(null);
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.2 rejects unauthenticated user calling setStaffScheduleModeAction", async () => {
      mockSession(null);
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: false,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.3 rejects user without business membership calling saveStaffWorkingHoursAction", async () => {
      mockSession({ id: userNoBiz, email: "nobiz@test.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı|üyeliğiniz/i);
    });

    it("1.4 rejects user without business membership calling setStaffScheduleModeAction", async () => {
      mockSession({ id: userNoBiz, email: "nobiz@test.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: false,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı|üyeliğiniz/i);
    });

    it("1.5 rejects STAFF role calling saveStaffWorkingHoursAction (Forbidden)", async () => {
      mockSession({ id: userStaffA, email: "staff@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /role required|yetkiniz yok/i);
    });

    it("1.6 rejects STAFF role calling setStaffScheduleModeAction (Forbidden)", async () => {
      mockSession({ id: userStaffA, email: "staff@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: false,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /role required|yetkiniz yok/i);
    });

    it("1.7 rejects ADMIN attempting to update OWNER's working hours (Forbidden)", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffOwnerA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /OWNER/i);
    });

    it("1.8 rejects ADMIN attempting to switch OWNER's schedule mode (Forbidden)", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffOwnerA,
        usesBusinessHours: false,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /OWNER/i);
    });

    it("1.9 ADMIN can successfully save custom working hours for a STAFF member", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.hours.length, 7);
      assert.strictEqual(res.staff.usesBusinessHours, false);
    });

    it("1.10 ADMIN can successfully switch schedule mode for a STAFF member", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: true,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.usesBusinessHours, true);
      assert.strictEqual(res.staff.usesBusinessHours, true);
    });

    it("1.11 OWNER can successfully save custom hours for their OWN profile", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffOwnerA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.usesBusinessHours, false);
    });

    it("1.12 OWNER can switch schedule mode for their own profile", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffOwnerA,
        usesBusinessHours: true,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.usesBusinessHours, true);
    });
  });

  describe("2. Multi-Tenant Isolation", () => {
    it("2.1 rejects OWNER A attempting to save hours for Staff B from Business B", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberB,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı/i);
    });

    it("2.2 rejects OWNER A attempting to switch schedule mode for Staff B from Business B", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberB,
        usesBusinessHours: false,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı/i);
    });

    it("2.3 rejects ADMIN A attempting to save hours for Staff B from Business B", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberB,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /bulunamadı/i);
    });
  });

  describe("3. Schedule Validation & Normalization Rules", () => {
    it("3.1 rejects schedule with fewer than 7 days (e.g. 6 days)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const incompleteDays = sampleValidSchedule.slice(0, 6);
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: incompleteDays,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /7 gün/i);
    });

    it("3.2 rejects schedule with duplicate dayOfWeek", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const duplicateDays = [
        ...sampleValidSchedule.slice(0, 6),
        { dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "18:00" }, // Duplicate day 1
      ];
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: duplicateDays,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /mükerrer|tekrar|7 gün/i);
    });

    it("3.3 rejects schedule with invalid dayOfWeek value (e.g. 7)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const invalidDay = [
        ...sampleValidSchedule.slice(0, 6),
        { dayOfWeek: 7, isWorking: false, startTime: null, endTime: null },
      ];
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: invalidDay,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /0 ile 6/i);
    });

    it("3.4 rejects working day with missing start_time", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const invalidTimes = sampleValidSchedule.map((d) =>
        d.dayOfWeek === 1 ? { ...d, startTime: null } : d
      );
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: invalidTimes,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /geçersiz|başlangıç|formatı/i);
    });

    it("3.5 rejects working day with invalid time format (e.g. 25:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const invalidTimes = sampleValidSchedule.map((d) =>
        d.dayOfWeek === 1 ? { ...d, startTime: "25:00" } : d
      );
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: invalidTimes,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /geçersiz/i);
    });

    it("3.6 rejects working day with startTime >= endTime (e.g. 18:00 to 09:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const invertedTimes = sampleValidSchedule.map((d) =>
        d.dayOfWeek === 1 ? { ...d, startTime: "18:00", endTime: "09:00" } : d
      );
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: invertedTimes,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /önce olmalıdır/i);
    });

    it("3.7 rejects working day with startTime === endTime (e.g. 10:00 to 10:00)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const sameTimes = sampleValidSchedule.map((d) =>
        d.dayOfWeek === 1 ? { ...d, startTime: "10:00", endTime: "10:00" } : d
      );
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sameTimes,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /önce olmalıdır/i);
    });

    it("3.8 normalizes closed days to null start_time and end_time in DB", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Client sends closed day with dummy times
      const closedWithTimes = sampleValidSchedule.map((d) =>
        d.dayOfWeek === 0
          ? { ...d, isWorking: false, startTime: "09:00", endTime: "18:00" }
          : d
      );
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: closedWithTimes,
      });
      assert.strictEqual(res.success, true);

      // Verify in DB that day 0 has isWorking = false and start_time = null, end_time = null
      const rows = await db
        .select()
        .from(staffWorkingHours)
        .where(
          and(
            eq(staffWorkingHours.businessId, bizA),
            eq(staffWorkingHours.staffId, staffMemberA),
            eq(staffWorkingHours.dayOfWeek, 0)
          )
        );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].isWorking, false);
      assert.strictEqual(rows[0].startTime, null);
      assert.strictEqual(rows[0].endTime, null);
    });

    it("3.9 atomic replace completely overwrites previous custom hours", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Change day 1 to closed, day 0 to open
      const newSchedule = sampleValidSchedule.map((d) => {
        if (d.dayOfWeek === 1) return { ...d, isWorking: false, startTime: null, endTime: null };
        if (d.dayOfWeek === 0) return { ...d, isWorking: true, startTime: "11:00", endTime: "17:00" };
        return d;
      });

      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: newSchedule,
      });
      assert.strictEqual(res.success, true);

      // Verify exactly 7 rows exist
      const rows = await db
        .select()
        .from(staffWorkingHours)
        .where(
          and(
            eq(staffWorkingHours.businessId, bizA),
            eq(staffWorkingHours.staffId, staffMemberA)
          )
        );
      assert.strictEqual(rows.length, 7);

      const day1 = rows.find((r: any) => r.dayOfWeek === 1);
      assert.strictEqual(day1.isWorking, false);

      const day0 = rows.find((r: any) => r.dayOfWeek === 0);
      assert.strictEqual(day0.isWorking, true);
      assert.strictEqual(day0.startTime, "11:00:00");
    });
  });

  describe("4. Mode Switching & Schedule Persistence", () => {
    it("4.1 saving custom hours sets usesBusinessHours = false", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.usesBusinessHours, false);

      // Verify in DB
      const [profile] = await db
        .select()
        .from(staffProfiles)
        .where(eq(staffProfiles.id, staffMemberA));
      assert.strictEqual(profile.usesBusinessHours, false);
    });

    it("4.2 switching mode to usesBusinessHours = true does NOT delete custom hours in DB", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: true,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.usesBusinessHours, true);

      // Custom rows MUST still exist in staff_working_hours
      const rows = await db
        .select()
        .from(staffWorkingHours)
        .where(
          and(
            eq(staffWorkingHours.businessId, bizA),
            eq(staffWorkingHours.staffId, staffMemberA)
          )
        );
      assert.strictEqual(rows.length, 7);
    });

    it("4.3 switching mode back to usesBusinessHours = false retains existing custom hours", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: false,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.usesBusinessHours, false);

      // Detail service should return custom hours
      const detail = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.staff.usesBusinessHours, false);
      assert.strictEqual(detail.staff.customWorkingHours.length, 7);
    });
  });

  describe("5. Booking Readiness Under Both Modes", () => {
    it("5.1 when usesBusinessHours = true, evaluates business_working_hours (ready if business has 7 days & >= 1 open day)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Put staff in business mode
      await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: true,
      });

      const detail = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.details.usesBusinessHours, true);
      assert.strictEqual(detail.bookingReadiness.details.hasValidSchedule, true);
      assert.strictEqual(detail.bookingReadiness.details.hasOpenDays, true);
    });

    it("5.2 when usesBusinessHours = true but business has incomplete hours, readiness fails", async () => {
      mockSession({ id: userOwnerIncomplete, email: "incomplete@biz.com" });
      // staffMemberIncomplete belongs to bizIncomplete (which has only 3 days defined)
      const detail = await staffActions.getStaffDetailAction(staffMemberIncomplete);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) =>
          r.includes("İşletmenin haftalık çalışma saatleri eksik")
        )
      );
    });

    it("5.3 when usesBusinessHours = false with 0 custom rows in DB, readiness fails", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // staffMemberA2 has 0 custom rows
      await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA2,
        usesBusinessHours: false,
      });

      const detail = await staffActions.getStaffDetailAction(staffMemberA2);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) =>
          r.includes("Personele ait özel çalışma saatleri eksik")
        )
      );
    });

    it("5.4 when usesBusinessHours = false and all 7 days are closed, readiness fails with specific reason", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA2,
        schedule: sampleAllClosedSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.bookingReadiness.isReady, false);
      assert.ok(
        res.bookingReadiness.reasons.some((r: string) =>
          r.includes("Personelin özel çalışma saatlerinde en az bir gün açık olmalıdır")
        )
      );
    });

    it("5.5 when usesBusinessHours = false and custom hours are valid (>= 1 working day), schedule is valid", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA2,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.bookingReadiness.details.hasValidSchedule, true);
      assert.strictEqual(res.bookingReadiness.details.hasOpenDays, true);
    });
  });

  describe("6. Public Booking Auto-Disable & Enabling Prerequisites", () => {
    it("6.1 allows enabling publicBookingEnabled when all readiness criteria are met", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // staffMemberA2 now has active service, valid custom schedule
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA2,
        enabled: true,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.publicBookingEnabled, true);
      assert.strictEqual(res.bookingReadiness.isReady, true);
    });

    it("6.2 automatically disables publicBookingEnabled when saving an all-closed custom schedule", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // staffMemberA2 currently has publicBookingEnabled = true
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA2,
        schedule: sampleAllClosedSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.publicBookingAutoDisabled, true);
      assert.strictEqual(res.staff.publicBookingEnabled, false);

      // Verify in DB
      const [profile] = await db
        .select()
        .from(staffProfiles)
        .where(eq(staffProfiles.id, staffMemberA2));
      assert.strictEqual(profile.publicBookingEnabled, false);
    });

    it("6.3 does NEVER auto-enable publicBookingEnabled when saving valid schedule again", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Re-save valid schedule
      const res = await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA2,
        schedule: sampleValidSchedule,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.publicBookingAutoDisabled, false);
      // publicBookingEnabled MUST remain false until user explicitly enables it
      assert.strictEqual(res.staff.publicBookingEnabled, false);
    });

    it("6.4 automatically disables publicBookingEnabled when switching mode to a non-ready schedule", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // 1. First enable public booking for staffMemberA (currently in custom mode with valid schedule)
      const enableRes = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        enabled: true,
      });
      assert.strictEqual(enableRes.success, true);
      assert.strictEqual(enableRes.staff.publicBookingEnabled, true);

      // 2. Overwrite custom hours to all closed
      await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleAllClosedSchedule,
      });

      // 3. Switch to business hours mode (which is valid for bizA), and enable public booking
      await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: true,
      });
      const enableBizRes = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        enabled: true,
      });
      assert.strictEqual(enableBizRes.success, true);
      assert.strictEqual(enableBizRes.staff.publicBookingEnabled, true);

      // 4. Now switch mode to custom hours (which has all 7 days closed)
      const switchRes = await staffActions.setStaffScheduleModeAction({
        staffId: staffMemberA,
        usesBusinessHours: false,
      });
      assert.strictEqual(switchRes.success, true);
      assert.strictEqual(switchRes.publicBookingAutoDisabled, true);
      assert.strictEqual(switchRes.staff.publicBookingEnabled, false);
    });

    it("6.5 rejects enabling public booking when staff is not booking ready (all closed custom hours)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // staffMemberA has all-closed custom hours
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        enabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /en az bir gün açık/i);
    });

    it("6.6 rejects enabling public booking when staff has 0 active services", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // staffMemberA: remove service assignment
      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [],
      });

      // Fix custom schedule to be valid
      await staffActions.saveStaffWorkingHoursAction({
        staffId: staffMemberA,
        schedule: sampleValidSchedule,
      });

      // Attempt to enable public booking
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        enabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /en az bir aktif hizmet/i);
    });
  });
});
