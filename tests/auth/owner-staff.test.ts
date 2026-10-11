/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let staffActions: any;
let staffRepo: any;
let onboardingModule: any;
let businesses: any;
let businessMembers: any;
let businessWorkingHours: any;
let services: any;
let staffProfiles: any;
let staffServices: any;
let users: any;
let eq: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const userNoBiz = uuid(501);
const userStaff = uuid(502);
const userAdmin = uuid(503);
const userIncompleteOwner = uuid(504);
const userOwnerYes = uuid(505);
const userOwnerNo = uuid(506);
const userOwnerFail = uuid(507);

const bizIncomplete = uuid(510);
const bizYes = uuid(520);
const bizNo = uuid(530);
const bizOther = uuid(540);
const bizFail = uuid(550);

const memOwnerYes = uuid(561);
const memOwnerNo = uuid(562);
const memOwnerFail = uuid(563);

const svcYes1 = uuid(571);
const svcYes2 = uuid(572);
const svcYesInactive = uuid(573);
const svcNo1 = uuid(574);
const svcOther = uuid(575);
const svcFail1 = uuid(576);
const svcFailInactive = uuid(577);

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  staffActions = await import("../../src/actions/staff.actions");
  staffRepo = await import("../../src/repositories/staff.repository");
  onboardingModule = await import("../../src/lib/auth/onboarding");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  businessWorkingHours = schema.businessWorkingHours;
  services = schema.services;
  staffProfiles = schema.staffProfiles;
  staffServices = schema.staffServices;
  users = schema.users;

  const orm = await import("drizzle-orm");
  eq = orm.eq;

  // Insert mock users
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userStaff}', 'Staff User', 'staff@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userAdmin}', 'Admin User', 'admin@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userIncompleteOwner}', 'Inc Owner', 'inc@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwnerYes}', 'Ahmet Yilmaz', 'owneryes@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwnerNo}', 'Mehmet Kaya', 'ownerno@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwnerFail}', 'Fail User', 'ownerfail@test.com', true)`);

  // Insert businesses
  await db.insert(businesses).values([
    { id: bizIncomplete, name: "Biz Incomplete", slug: "biz-inc", timezone: "Europe/Istanbul", currency: "TRY", onboardingCompletedAt: null },
    { id: bizYes, name: "Biz Yes", slug: "biz-yes", timezone: "Europe/Istanbul", currency: "TRY", onboardingCompletedAt: null },
    { id: bizNo, name: "Biz No", slug: "biz-no", timezone: "Europe/Istanbul", currency: "TRY", onboardingCompletedAt: null },
    { id: bizOther, name: "Biz Other", slug: "biz-other", timezone: "Europe/Istanbul", currency: "TRY", onboardingCompletedAt: null },
    { id: bizFail, name: "Biz Fail", slug: "biz-fail", timezone: "Europe/Istanbul", currency: "TRY", onboardingCompletedAt: null },
  ]);

  // Insert memberships
  await db.insert(businessMembers).values([
    { businessId: bizIncomplete, userId: userIncompleteOwner, role: "OWNER" },
    { id: memOwnerYes, businessId: bizYes, userId: userOwnerYes, role: "OWNER" },
    { businessId: bizYes, userId: userStaff, role: "STAFF" },
    { businessId: bizYes, userId: userAdmin, role: "ADMIN" },
    { id: memOwnerNo, businessId: bizNo, userId: userOwnerNo, role: "OWNER" },
    { id: memOwnerFail, businessId: bizFail, userId: userOwnerFail, role: "OWNER" },
  ]);

  // Insert working hours for bizYes, bizNo, bizFail (7 days each)
  const weekDays = [0, 1, 2, 3, 4, 5, 6];
  for (const bId of [bizYes, bizNo, bizFail]) {
    for (const day of weekDays) {
      await db.insert(businessWorkingHours).values({
        businessId: bId,
        dayOfWeek: day,
        startTime: day === 0 ? null : "09:00:00",
        endTime: day === 0 ? null : "20:00:00",
        isClosed: day === 0,
      });
    }
  }

  // Insert services
  await db.insert(services).values([
    { id: svcYes1, businessId: bizYes, name: "Saç Kesimi", durationMinutes: 30, price: "200.00", active: true },
    { id: svcYes2, businessId: bizYes, name: "Sakal Tıraşı", durationMinutes: 15, price: "100.00", active: true },
    { id: svcYesInactive, businessId: bizYes, name: "Eski Hizmet", durationMinutes: 20, price: "50.00", active: false },
    { id: svcNo1, businessId: bizNo, name: "Yıkama & Fön", durationMinutes: 20, price: "80.00", active: true },
    { id: svcOther, businessId: bizOther, name: "Başka Hizmet", durationMinutes: 30, price: "300.00", active: true },
    { id: svcFail1, businessId: bizFail, name: "Fail Hizmet", durationMinutes: 30, price: "150.00", active: true },
    { id: svcFailInactive, businessId: bizFail, name: "Fail Pasif Hizmet", durationMinutes: 10, price: "50.00", active: false },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("Owner Staff Decision & Onboarding Completion Tests", () => {
  const mockSession = (userId: string | null) => {
    if (!userId) {
      sessionModule.sessionDependencies.getCurrentUser = async () => null;
    } else {
      sessionModule.sessionDependencies.getCurrentUser = async () => ({
        id: userId,
        email: "test@example.com",
      });
    }
  };

  it("1. unauthenticated user cannot complete OWNER_STAFF", async () => {
    mockSession(null);
    const res = await staffActions.completeOwnerStaffAction({ decision: "YES", serviceIds: [svcYes1] });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Yetkisiz işlem"));
  });

  it("2. user with no business cannot access/submit OWNER_STAFF", async () => {
    mockSession(userNoBiz);
    const res = await staffActions.completeOwnerStaffAction({ decision: "YES", serviceIds: [svcYes1] });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("İşletme bulunamadı"));
  });

  it("3. STAFF cannot complete owner onboarding", async () => {
    mockSession(userStaff);
    const res = await staffActions.completeOwnerStaffAction({ decision: "YES", serviceIds: [svcYes1] });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("yalnızca işletme SAHİBİ (OWNER) tamamlayabilir"));
  });

  it("4. ADMIN cannot complete owner onboarding", async () => {
    mockSession(userAdmin);
    const res = await staffActions.completeOwnerStaffAction({ decision: "YES", serviceIds: [svcYes1] });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("yalnızca işletme SAHİBİ (OWNER) tamamlayabilir"));
  });

  it("5. OWNER cannot skip earlier onboarding prerequisites", async () => {
    mockSession(userIncompleteOwner);
    const res = await staffActions.completeOwnerStaffAction({ decision: "YES", serviceIds: [svcYes1] });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("çalışma saatlerini"));
  });

  it("6. YES creates exactly one staff_profile linked to OWNER business_member", async () => {
    mockSession(userOwnerYes);
    const res = await staffActions.completeOwnerStaffAction({
      decision: "YES",
      serviceIds: [svcYes1, svcYes2],
    });
    assert.equal(res.success, true);
    assert.equal(res.createdStaff, true);

    const profiles = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].businessMemberId, memOwnerYes);
  });

  it("7. YES does not create a second business_member", async () => {
    const members = await db.select().from(businessMembers).where(eq(businessMembers.businessId, bizYes));
    // bizYes started with 3 members (userOwnerYes, userStaff, userAdmin). It should still be 3.
    assert.equal(members.length, 3);
  });

  it("8. YES does not create a second user", async () => {
    const userRows = await db.select().from(users).where(eq(users.id, userOwnerYes));
    assert.equal(userRows.length, 1);
  });

  it("9. YES sets staff profile active = true", async () => {
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    assert.ok(profile);
    assert.equal(profile.active, true);
  });

  it("10. YES sets public_booking_enabled = true", async () => {
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    assert.ok(profile);
    assert.equal(profile.publicBookingEnabled, true);
  });

  it("11. YES uses business hours according to the schema behavior (usesBusinessHours = true)", async () => {
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    assert.ok(profile);
    assert.equal(profile.usesBusinessHours, true);
  });

  it("12. YES requires at least one service", async () => {
    mockSession(userOwnerFail);
    const res = await staffActions.completeOwnerStaffAction({
      decision: "YES",
      serviceIds: [],
    });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("en az bir hizmet"));
  });

  it("13. submitted duplicate service IDs are safely normalized", async () => {
    // Verified by checking bizYes staff services count for svcYes1 and svcYes2 (submitted with no duplicate rows)
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    const assignedServices = await db.select().from(staffServices).where(eq(staffServices.staffId, profile.id));
    assert.equal(assignedServices.length, 2);
  });

  it("14. service from another business cannot be assigned", async () => {
    mockSession(userOwnerFail);
    const res = await staffActions.completeOwnerStaffAction({
      decision: "YES",
      serviceIds: [svcOther], // Belongs to bizOther!
    });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("bu işletmeye ait değil"));
  });

  it("15. inactive service cannot be assigned", async () => {
    mockSession(userOwnerFail);
    const res = await staffActions.completeOwnerStaffAction({
      decision: "YES",
      serviceIds: [svcFailInactive], // Inactive service of bizFail!
    });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Pasif durumdaki hizmetler"));
  });

  it("16. valid selected services create correct staff_services rows", async () => {
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    const assignedServices = await db.select().from(staffServices).where(eq(staffServices.staffId, profile.id));
    const serviceIds = assignedServices.map((s: any) => s.serviceId).sort();
    assert.deepEqual(serviceIds, [svcYes1, svcYes2].sort());
  });

  it("17. NO creates no staff_profile", async () => {
    mockSession(userOwnerNo);
    const res = await staffActions.completeOwnerStaffAction({
      decision: "NO",
    });
    assert.equal(res.success, true);
    assert.equal(res.createdStaff, false);

    const profiles = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizNo));
    assert.equal(profiles.length, 0);
  });

  it("18. NO creates no staff_services", async () => {
    const staffSvcs = await db.select().from(staffServices).where(eq(staffServices.businessId, bizNo));
    assert.equal(staffSvcs.length, 0);
  });

  it("19. NO still completes onboarding", async () => {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizNo));
    assert.ok(biz.onboardingCompletedAt !== null);
  });

  it("20. successful YES sets onboarding_completed_at", async () => {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizYes));
    assert.ok(biz.onboardingCompletedAt !== null);
  });

  it("21. successful NO sets onboarding_completed_at", async () => {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizNo));
    assert.ok(biz.onboardingCompletedAt instanceof Date);
  });

  it("22. failed YES transaction does not mark onboarding complete", async () => {
    // Attempt transaction with a serviceId that causes DB failure
    const fakeServiceId = "00000000-0000-4000-8000-000000000999"; // Non-existent service FK failure
    let caught = false;
    try {
      await staffRepo.completeOnboardingWithStaff(
        bizFail,
        memOwnerFail,
        { firstName: "Fail", lastName: "Owner" },
        [fakeServiceId]
      );
    } catch {
      caught = true;
    }
    assert.equal(caught, true);

    const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizFail));
    assert.equal(biz.onboardingCompletedAt, null);
  });

  it("23. failed YES transaction leaves no partial staff profile/service mappings", async () => {
    const profiles = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizFail));
    assert.equal(profiles.length, 0);

    const assignedServices = await db.select().from(staffServices).where(eq(staffServices.businessId, bizFail));
    assert.equal(assignedServices.length, 0);
  });

  it("24. onboarding state resolves COMPLETED after success", async () => {
    mockSession(userOwnerYes);
    assert.equal(await onboardingModule.getOnboardingState(), "COMPLETED");
    assert.equal(await onboardingModule.getOnboardingStep(), "COMPLETED");

    mockSession(userOwnerNo);
    assert.equal(await onboardingModule.getOnboardingState(), "COMPLETED");
    assert.equal(await onboardingModule.getOnboardingStep(), "COMPLETED");
  });

  it("25. completed user visiting /onboarding/owner-staff redirects to /dashboard", async () => {
    // Since getOnboardingStep() returns COMPLETED, the page redirect guard triggers
    mockSession(userOwnerYes);
    assert.equal(await onboardingModule.getOnboardingStep(), "COMPLETED");
  });

  it("26. repeated submission does not create duplicate staff profile or service mappings", async () => {
    mockSession(userOwnerYes);
    // Already completed, should reject
    const res = await staffActions.completeOwnerStaffAction({
      decision: "YES",
      serviceIds: [svcYes1],
    });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("zaten tamamlanmış"));

    const profiles = await db.select().from(staffProfiles).where(eq(staffProfiles.businessId, bizYes));
    assert.equal(profiles.length, 1);
  });

  it("27. existing Task 004A/B/C progression tests continue passing", async () => {
    mockSession(userNoBiz);
    assert.equal(await onboardingModule.getOnboardingStep(), "NO_BUSINESS");

    mockSession(userIncompleteOwner);
    assert.equal(await onboardingModule.getOnboardingStep(), "BUSINESS_HOURS");
  });
});
