/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let staffActions: any;
let serviceActions: any;
let businesses: any;
let businessMembers: any;
let staffProfiles: any;
let services: any;
let staffServices: any;
let businessWorkingHours: any;
let eq: any;
let and: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Test IDs
const userOwnerA = uuid(901);
const userAdminA = uuid(902);
const userStaffA = uuid(903);
const userStaffA2 = uuid(904);
const userInactiveMember = uuid(905);
const userInactiveProfile = uuid(906);
const userOwnerB = uuid(907);
const userStaffB = uuid(908);
const userNoBiz = uuid(909);
const userOwnerIncomplete = uuid(910);

const bizA = uuid(921);
const bizB = uuid(922);
const bizIncomplete = uuid(923);

const memOwnerA = uuid(931);
const memAdminA = uuid(932);
const memStaffA = uuid(933);
const memStaffA2 = uuid(934);
const memInactiveMember = uuid(935);
const memInactiveProfile = uuid(936);
const memOwnerB = uuid(937);
const memStaffB = uuid(938);
const memOwnerIncomplete = uuid(939);

const staffOwnerA = uuid(941);
const staffMemberA = uuid(942);
const staffMemberA2 = uuid(943);
const staffMemberInactiveMember = uuid(944);
const staffMemberInactiveProfile = uuid(945);
const staffMemberB = uuid(946);
const staffMemberIncomplete = uuid(947);

const svcA1 = uuid(951);
const svcA2 = uuid(952);
const svcA3 = uuid(953);
const svcInactiveA = uuid(954);
const svcB1 = uuid(955);

before(async () => {
  pgServer = await startDatabase({ port: 54408 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  staffActions = await import("../../src/actions/staff.actions");
  serviceActions = await import("../../src/actions/service.actions");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  staffProfiles = schema.staffProfiles;
  services = schema.services;
  staffServices = schema.staffServices;
  businessWorkingHours = schema.businessWorkingHours;

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
      `('${userInactiveMember}', 'Inactive Member', 'inactive-mem@biz-a.com', true), ` +
      `('${userInactiveProfile}', 'Inactive Profile', 'inactive-prof@biz-a.com', true), ` +
      `('${userOwnerB}', 'Owner B', 'owner@biz-b.com', true), ` +
      `('${userStaffB}', 'Staff B', 'staff@biz-b.com', true), ` +
      `('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true), ` +
      `('${userOwnerIncomplete}', 'Owner Incomplete', 'incomplete@biz.com', true)`
  );

  // 2. Insert businesses
  await db.insert(businesses).values([
    {
      id: bizA,
      name: "Salon Alpha",
      slug: "salon-alpha",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizB,
      name: "Salon Beta",
      slug: "salon-beta",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizIncomplete,
      name: "Salon Incomplete",
      slug: "salon-incomplete",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
  ]);

  // 3. Insert working hours: bizA and bizB have full 7 days, bizIncomplete has only 3 days
  for (let day = 0; day < 7; day++) {
    await db.insert(businessWorkingHours).values([
      {
        businessId: bizA,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "19:00",
        isClosed: day === 0,
      },
      {
        businessId: bizB,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "19:00",
        isClosed: day === 0,
      },
    ]);
  }

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
    { id: memInactiveMember, businessId: bizA, userId: userInactiveMember, role: "STAFF", active: false },
    { id: memInactiveProfile, businessId: bizA, userId: userInactiveProfile, role: "STAFF", active: true },
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
      id: staffMemberInactiveMember,
      businessId: bizA,
      businessMemberId: memInactiveMember,
      firstName: "Inactive",
      lastName: "Member",
      active: true,
      publicBookingEnabled: false,
      usesBusinessHours: true,
    },
    {
      id: staffMemberInactiveProfile,
      businessId: bizA,
      businessMemberId: memInactiveProfile,
      firstName: "Inactive",
      lastName: "Profile",
      active: false,
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
      description: "Sıcak havlu bakım",
      durationMinutes: 20,
      price: "200.00",
      active: true,
    },
    {
      id: svcA3,
      businessId: bizA,
      name: "Saç Boyama",
      description: "Özel boya uygulaması",
      durationMinutes: 60,
      price: "600.00",
      active: true,
    },
    {
      id: svcInactiveA,
      businessId: bizA,
      name: "Eski Hizmet",
      description: "Artık sunulmuyor",
      durationMinutes: 15,
      price: "100.00",
      active: false,
    },
    {
      id: svcB1,
      businessId: bizB,
      name: "Beta Saç Kesimi",
      description: "Beta kesim",
      durationMinutes: 30,
      price: "350.00",
      active: true,
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("Staff Service Assignment & Booking Readiness (TASK 005C.1) Tests", () => {
  const mockSession = (user: { id: string; email: string } | null) => {
    sessionModule.sessionDependencies.getCurrentUser = async () => user;
  };

  describe("1. Authentication and RBAC Guards", () => {
    it("1.1 rejects unauthenticated user calling getStaffDetailAction", async () => {
      mockSession(null);
      const res = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.2 rejects unauthenticated user calling assignStaffServicesAction", async () => {
      mockSession(null);
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1],
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.3 rejects unauthenticated user calling toggleStaffPublicBookingAction", async () => {
      mockSession(null);
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /giriş yapın/i);
    });

    it("1.4 rejects STAFF role user calling getStaffDetailAction", async () => {
      mockSession({ id: userStaffA, email: "staff@biz-a.com" });
      const res = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(res.success, false);
      assert.match(res.error, /ADMIN or OWNER role required|yetkiniz/i);
    });

    it("1.5 rejects STAFF role user calling assignStaffServicesAction", async () => {
      mockSession({ id: userStaffA, email: "staff@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1],
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /ADMIN or OWNER role required|yetkiniz/i);
    });

    it("1.6 rejects STAFF role user calling toggleStaffPublicBookingAction", async () => {
      mockSession({ id: userStaffA, email: "staff@biz-a.com" });
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: false,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /ADMIN or OWNER role required|yetkiniz/i);
    });

    it("1.7 ADMIN role user CAN view and manage STAFF profile", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.id, staffMemberA);
      assert.strictEqual(res.staff.firstName, "Staff");
    });

    it("1.8 ADMIN role user is strictly FORBIDDEN from viewing OWNER staff profile", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.getStaffDetailAction(staffOwnerA);
      assert.strictEqual(res.success, false);
      assert.match(res.error, /işletme sahibinin.*yönetemez|yetkiniz/i);
    });

    it("1.9 ADMIN role user is strictly FORBIDDEN from assigning services to OWNER staff profile", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffOwnerA,
        serviceIds: [svcA1],
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /işletme sahibinin.*yönetemez|yetkiniz/i);
    });

    it("1.10 ADMIN role user is strictly FORBIDDEN from toggling public booking of OWNER staff profile", async () => {
      mockSession({ id: userAdminA, email: "admin@biz-a.com" });
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffOwnerA,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /işletme sahibinin.*yönetemez|yetkiniz/i);
    });

    it("1.11 OWNER role user CAN view and manage their own OWNER staff profile", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.getStaffDetailAction(staffOwnerA);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.id, staffOwnerA);
      assert.strictEqual(res.staff.member.role, "OWNER");
    });

    it("1.12 OWNER role user CAN view and manage other STAFF profiles in their business", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.id, staffMemberA);
    });

    it("1.13 Cross-tenant isolation: OWNER of Biz A cannot view staff profile from Biz B", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.getStaffDetailAction(staffMemberB);
      assert.strictEqual(res.success, false);
      assert.match(res.error, /personel bulunamadı/i);
    });

    it("1.14 Cross-tenant isolation: OWNER of Biz A cannot assign services to staff profile from Biz B", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberB,
        serviceIds: [svcA1],
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /personel bulunamadı/i);
    });
  });

  describe("2. Service Assignment & Normalization", () => {
    it("2.1 assigns active services to staff profile successfully", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1, svcA2],
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.assignedServices.length, 2);
      const assignedIds = res.staff.assignedServices.map((s: any) => s.id);
      assert.ok(assignedIds.includes(svcA1));
      assert.ok(assignedIds.includes(svcA2));
    });

    it("2.2 deduplicates duplicate service IDs in payload", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1, svcA1, svcA2, svcA2],
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.assignedServices.length, 2);
    });

    it("2.3 rejects service assignment when service belongs to another business", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1, svcB1], // svcB1 is from bizB
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error, /bu işletmeye ait değil/i);
    });

    it("2.4 rejects assigning a newly chosen service that is INACTIVE", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1, svcInactiveA], // svcInactiveA is active = false
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error, /pasif durumdaki hizmetler/i);
    });

    it("2.5 preserves legacy inactive mappings unless explicitly removed by user", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Direct DB insert of legacy inactive service mapping
      await db.insert(staffServices).values({
        businessId: bizA,
        staffId: staffMemberA,
        serviceId: svcInactiveA,
      });

      // Now caller submits update with only svcA1 and svcA3 (neither touches svcInactiveA)
      // Because legacy inactive mappings are preserved, svcInactiveA should still be mapped
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1, svcA3],
      });

      assert.strictEqual(res.success, true);
      const allMapped = await db
        .select()
        .from(staffServices)
        .where(eq(staffServices.staffId, staffMemberA));

      const mappedIds = allMapped.map((m: any) => m.serviceId);
      assert.ok(mappedIds.includes(svcA1));
      assert.ok(mappedIds.includes(svcA3));
      assert.ok(mappedIds.includes(svcInactiveA), "Legacy inactive mapping must be preserved");
    });

    it("2.6 removes legacy inactive mapping when explicitly removed", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Calling assignStaffServicesAction with removeInactiveServiceIds: [svcInactiveA]
      const res = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1],
        removeInactiveServiceIds: [svcInactiveA],
      });

      assert.strictEqual(res.success, true);
      const allMapped = await db
        .select()
        .from(staffServices)
        .where(eq(staffServices.staffId, staffMemberA));

      const mappedIds = allMapped.map((m: any) => m.serviceId);
      assert.ok(mappedIds.includes(svcA1));
      assert.ok(!mappedIds.includes(svcInactiveA), "Explicitly removed inactive mapping must be deleted");
    });

    it("2.7 automatically disables publicBookingEnabled when active assigned services becomes 0", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      // First give staffMemberA active service and enable public booking
      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1],
      });
      const enableRes = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: true,
      });
      assert.strictEqual(enableRes.success, true);
      assert.strictEqual(enableRes.staff.publicBookingEnabled, true);

      // Now clear active services
      const clearRes = await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [],
      });

      assert.strictEqual(clearRes.success, true);
      assert.strictEqual(clearRes.staff.assignedServices.length, 0);
      assert.strictEqual(
        clearRes.staff.publicBookingEnabled,
        false,
        "Public booking must be automatically disabled when 0 active services remain"
      );
    });
  });

  describe("3. Booking Readiness Evaluation (Derived Logic)", () => {
    it("3.1 evaluates ready=true when all 5 conditions are fulfilled", async () => {
      // 1: member active (memStaffA is active)
      // 2: profile active (staffMemberA is active)
      // 3: publicBookingEnabled true
      // 4: activeAssignedServices >= 1
      // 5: valid business working hours (7 days in bizA)
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1],
      });
      await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: true,
      });

      const detail = await staffActions.getStaffDetailAction(staffMemberA);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, true);
      assert.strictEqual(detail.bookingReadiness.reasons.length, 0);
      assert.strictEqual(detail.bookingReadiness.details.isMemberActive, true);
      assert.strictEqual(detail.bookingReadiness.details.isProfileActive, true);
      assert.strictEqual(detail.bookingReadiness.details.isPublicBookingEnabled, true);
      assert.strictEqual(detail.bookingReadiness.details.hasActiveAssignedService, true);
      assert.strictEqual(detail.bookingReadiness.details.hasCompleteBusinessHours, true);
    });

    it("3.2 evaluates ready=false when member is inactive", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const detail = await staffActions.getStaffDetailAction(staffMemberInactiveMember);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.strictEqual(detail.bookingReadiness.details.isMemberActive, false);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) => r.includes("İşletme üyeliği pasif"))
      );
    });

    it("3.3 evaluates ready=false when profile is inactive", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const detail = await staffActions.getStaffDetailAction(staffMemberInactiveProfile);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.strictEqual(detail.bookingReadiness.details.isProfileActive, false);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) => r.includes("profili pasif"))
      );
    });

    it("3.4 evaluates ready=false when publicBookingEnabled is false", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA2,
        serviceIds: [svcA1],
      });
      // publicBookingEnabled is initially false
      const detail = await staffActions.getStaffDetailAction(staffMemberA2);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.strictEqual(detail.bookingReadiness.details.isPublicBookingEnabled, false);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) => r.includes("devre dışı"))
      );
    });

    it("3.5 evaluates ready=false when 0 active services assigned (only legacy inactive assigned)", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Insert only inactive legacy service for staffMemberA2
      await db.delete(staffServices).where(eq(staffServices.staffId, staffMemberA2));
      await db.insert(staffServices).values({
        businessId: bizA,
        staffId: staffMemberA2,
        serviceId: svcInactiveA,
      });

      const detail = await staffActions.getStaffDetailAction(staffMemberA2);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.strictEqual(detail.bookingReadiness.details.hasActiveAssignedService, false);
      assert.strictEqual(detail.bookingReadiness.details.activeAssignedServicesCount, 0);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) => r.includes("aktif hizmet"))
      );
    });

    it("3.6 evaluates ready=false when business schedule is incomplete (< 7 days)", async () => {
      mockSession({ id: userOwnerIncomplete, email: "incomplete@biz.com" });
      const detail = await staffActions.getStaffDetailAction(staffMemberIncomplete);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.strictEqual(detail.bookingReadiness.details.hasCompleteBusinessHours, false);
      assert.ok(
        detail.bookingReadiness.reasons.some((r: string) => r.includes("çalışma saatleri"))
      );
    });
  });

  describe("4. Public Booking Toggle Guard Rules", () => {
    it("4.1 prevents enabling public booking if business member is inactive", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberInactiveMember,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /üyeliği aktif değil/i);
    });

    it("4.2 prevents enabling public booking if staff profile is inactive", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberInactiveProfile,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /profili aktif değil/i);
    });

    it("4.3 prevents enabling public booking if staff has 0 active services", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Ensure staffMemberA has 0 active services
      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [],
      });

      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /en az bir aktif hizmet/i);
    });

    it("4.4 prevents enabling public booking if business working hours are incomplete", async () => {
      mockSession({ id: userOwnerIncomplete, email: "incomplete@biz.com" });
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberIncomplete,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /çalışma saatleri/i);
    });

    it("4.5 allows disabling public booking at any time for authorized user", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: false,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.publicBookingEnabled, false);
    });

    it("4.6 allows enabling public booking when all prerequisites are met", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });
      // Assign active service
      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA,
        serviceIds: [svcA1],
      });

      const res = await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA,
        publicBookingEnabled: true,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.staff.publicBookingEnabled, true);
    });
  });

  describe("5. Service Catalog Deactivation Cascading Behavior", () => {
    it("5.1 preserves staff_services mappings when a service is deactivated", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      // Assign svcA2 and svcA3 to staffMemberA2
      await staffActions.assignStaffServicesAction({
        staffId: staffMemberA2,
        serviceIds: [svcA2, svcA3],
      });

      // Deactivate svcA2 via service management
      const deactRes = await serviceActions.toggleDashboardServiceActiveAction({
        serviceId: svcA2,
        active: false,
      });
      assert.strictEqual(deactRes.success, true);

      // Verify mapping in DB is NOT deleted
      const mappings = await db
        .select()
        .from(staffServices)
        .where(
          and(
            eq(staffServices.staffId, staffMemberA2),
            eq(staffServices.serviceId, svcA2)
          )
        );
      assert.strictEqual(mappings.length, 1, "Mapping must remain in staff_services");
    });

    it("5.2 keeps publicBookingEnabled true if staff still has another active service", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      // staffMemberA2 has svcA2 (now inactive) and svcA3 (active)
      // Enable public booking
      await staffActions.toggleStaffPublicBookingAction({
        staffId: staffMemberA2,
        publicBookingEnabled: true,
      });

      const detail = await staffActions.getStaffDetailAction(staffMemberA2);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(detail.staff.publicBookingEnabled, true);
      assert.strictEqual(detail.bookingReadiness.isReady, true);
      assert.strictEqual(detail.bookingReadiness.details.activeAssignedServicesCount, 1);
    });

    it("5.3 automatically turns publicBookingEnabled false when the LAST active service is deactivated", async () => {
      mockSession({ id: userOwnerA, email: "owner@biz-a.com" });

      // Deactivate svcA3 (the only remaining active service for staffMemberA2)
      const deactRes = await serviceActions.toggleDashboardServiceActiveAction({
        serviceId: svcA3,
        active: false,
      });
      assert.strictEqual(deactRes.success, true);

      // Check staffMemberA2: publicBookingEnabled must now be false
      const detail = await staffActions.getStaffDetailAction(staffMemberA2);
      assert.strictEqual(detail.success, true);
      assert.strictEqual(
        detail.staff.publicBookingEnabled,
        false,
        "Public booking must be disabled when last active service is deactivated"
      );
      assert.strictEqual(detail.bookingReadiness.isReady, false);
      assert.strictEqual(detail.bookingReadiness.details.activeAssignedServicesCount, 0);

      // Re-activate svcA2 and svcA3 for clean state
      await serviceActions.toggleDashboardServiceActiveAction({
        serviceId: svcA2,
        active: true,
      });
      await serviceActions.toggleDashboardServiceActiveAction({
        serviceId: svcA3,
        active: true,
      });
    });
  });
});
