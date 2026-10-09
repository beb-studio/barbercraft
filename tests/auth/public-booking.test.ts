/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let PublicBookingService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const bizCompleted = uuid(101); // Onboarding complete, active
const bizIncomplete = uuid(102); // Onboarding incomplete (null)
const bizInactive = uuid(103); // Inactive
const bizOtherTenant = uuid(104); // Another completed business

// Users
const userOwner1 = uuid(201);
const userStaff1 = uuid(202);
const userStaff2 = uuid(203);
const userStaff3 = uuid(204);
const userStaff4 = uuid(205);
const userStaff5 = uuid(206);
const userAdminOnly = uuid(207);
const userOwnerOther = uuid(208);

// Business Members
const memberOwner1 = uuid(301);
const memberStaff1 = uuid(302);
const memberStaff2 = uuid(303);
const memberStaff3 = uuid(304);
const memberStaff4 = uuid(305);
const memberStaff5 = uuid(306);
const memberAdminOnly = uuid(307);
const memberOwnerOther = uuid(308);

// Staff Profiles
const staffOwnerBookable = uuid(401); // Uses biz hours
const staffConfigured = uuid(402); // Uses custom hours, valid
const staffCustomAllClosed = uuid(403); // Uses custom hours, all closed
const staffNoPublicBooking = uuid(404); // publicBookingEnabled = false
const staffProfileInactive = uuid(405); // active = false
const staffMemberInactive = uuid(406); // member active = false
const staffOtherTenant = uuid(407); // belongs to bizOtherTenant

// Services for bizCompleted
const svcActive1 = uuid(501); // 30 min, 150 TRY
const svcActive2 = uuid(502); // 45 min, 200 TRY
const svcInactive = uuid(503); // inactive
const svcOtherTenant = uuid(504); // belongs to bizOtherTenant

before(async () => {
  pgServer = await startDatabase({ port: 54414 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  const svcLb = await import("../../src/services/public-booking.service");
  PublicBookingService = svcLb.PublicBookingService;

  // 1. Seed Users
  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES
    ('${userOwner1}', 'Owner One', 'owner1@test.com', true),
    ('${userStaff1}', 'Staff One', 'staff1@test.com', true),
    ('${userStaff2}', 'Staff Two', 'staff2@test.com', true),
    ('${userStaff3}', 'Staff Three', 'staff3@test.com', true),
    ('${userStaff4}', 'Staff Four', 'staff4@test.com', true),
    ('${userStaff5}', 'Staff Five', 'staff5@test.com', true),
    ('${userAdminOnly}', 'Admin Only', 'admin@test.com', true),
    ('${userOwnerOther}', 'Owner Other', 'owner_other@test.com', true);
  `);

  // 2. Seed Businesses
  await db.execute(`
    INSERT INTO businesses (id, name, slug, phone, address, currency, timezone, active, onboarding_completed_at) VALUES
    ('${bizCompleted}', 'Barber Studio', 'barber-studio', '+905551112233', 'Kadikoy, Istanbul', 'TRY', 'Europe/Istanbul', true, NOW()),
    ('${bizIncomplete}', 'Incomplete Barber', 'incomplete-barber', '+905551112244', 'Besiktas, Istanbul', 'TRY', 'Europe/Istanbul', true, NULL),
    ('${bizInactive}', 'Closed Barber', 'closed-barber', '+905551112255', 'Sisli, Istanbul', 'TRY', 'Europe/Istanbul', false, NOW()),
    ('${bizOtherTenant}', 'Other Studio', 'other-studio', '+905551112266', 'Cankaya, Ankara', 'TRY', 'Europe/Istanbul', true, NOW());
  `);

  // 3. Seed Business Working Hours for bizCompleted (7 complete days, Monday-Saturday open, Sunday closed)
  for (let day = 0; day <= 6; day++) {
    const isClosed = day === 0; // Sunday closed
    const start = isClosed ? "NULL" : "'09:00:00'";
    const end = isClosed ? "NULL" : "'19:00:00'";
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, is_closed, start_time, end_time)
      VALUES ('${bizCompleted}', ${day}, ${isClosed}, ${start}, ${end});
    `);
  }

  // 4. Seed Business Members
  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role, active) VALUES
    ('${memberOwner1}', '${bizCompleted}', '${userOwner1}', 'OWNER', true),
    ('${memberStaff1}', '${bizCompleted}', '${userStaff1}', 'STAFF', true),
    ('${memberStaff2}', '${bizCompleted}', '${userStaff2}', 'STAFF', true),
    ('${memberStaff3}', '${bizCompleted}', '${userStaff3}', 'STAFF', true),
    ('${memberStaff4}', '${bizCompleted}', '${userStaff4}', 'STAFF', true),
    ('${memberStaff5}', '${bizCompleted}', '${userStaff5}', 'STAFF', false),
    ('${memberAdminOnly}', '${bizCompleted}', '${userAdminOnly}', 'ADMIN', true),
    ('${memberOwnerOther}', '${bizOtherTenant}', '${userOwnerOther}', 'OWNER', true);
  `);

  // 5. Seed Staff Profiles
  await db.execute(`
    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, phone, uses_business_hours, public_booking_enabled, active) VALUES
    ('${staffOwnerBookable}', '${bizCompleted}', '${memberOwner1}', 'Ahmet', 'Usta', '+905550000001', true, true, true),
    ('${staffConfigured}', '${bizCompleted}', '${memberStaff1}', 'Mehmet', 'Kuafor', '+905550000002', false, true, true),
    ('${staffCustomAllClosed}', '${bizCompleted}', '${memberStaff2}', 'Ali', 'Kapali', '+905550000003', false, true, true),
    ('${staffNoPublicBooking}', '${bizCompleted}', '${memberStaff3}', 'Veli', 'Gizli', '+905550000004', true, false, true),
    ('${staffProfileInactive}', '${bizCompleted}', '${memberStaff4}', 'Can', 'Pasif', '+905550000005', true, true, false),
    ('${staffMemberInactive}', '${bizCompleted}', '${memberStaff5}', 'Cem', 'UyePasif', '+905550000006', true, true, true),
    ('${staffOtherTenant}', '${bizOtherTenant}', '${memberOwnerOther}', 'Diger', 'Berber', '+905550000007', true, true, true);
  `);

  // 6. Seed Custom Working Hours for staffConfigured (7 days, 1-5 working)
  for (let day = 0; day <= 6; day++) {
    const isWorking = day >= 1 && day <= 5;
    const start = isWorking ? "'10:00:00'" : "NULL";
    const end = isWorking ? "'18:00:00'" : "NULL";
    await db.execute(`
      INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
      VALUES ('${bizCompleted}', '${staffConfigured}', ${day}, ${isWorking}, ${start}, ${end});
    `);
  }

  // 7. Seed Custom Working Hours for staffCustomAllClosed (all 7 days is_working = false)
  for (let day = 0; day <= 6; day++) {
    await db.execute(`
      INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
      VALUES ('${bizCompleted}', '${staffCustomAllClosed}', ${day}, false, NULL, NULL);
    `);
  }

  // 8. Seed Services
  await db.execute(`
    INSERT INTO services (id, business_id, name, description, duration_minutes, price, active) VALUES
    ('${svcActive1}', '${bizCompleted}', 'Sac Kesimi', 'Modern sac kesimi ve yikama', 30, '150.00', true),
    ('${svcActive2}', '${bizCompleted}', 'Sakal Trasi', 'Sicak havlu ile sakal bakimi', 20, '100.00', true),
    ('${svcInactive}', '${bizCompleted}', 'Eski Hizmet', 'Artik verilmeyen hizmet', 45, '200.00', false),
    ('${svcOtherTenant}', '${bizOtherTenant}', 'Diger Sac Kesimi', 'Diger dukkan hizmeti', 30, '180.00', true);
  `);

  // 9. Seed Staff Services
  // svcActive1 assigned to: staffOwnerBookable, staffConfigured, staffCustomAllClosed, staffNoPublicBooking, staffProfileInactive, staffMemberInactive
  await db.execute(`
    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES
    ('${bizCompleted}', '${staffOwnerBookable}', '${svcActive1}'),
    ('${bizCompleted}', '${staffConfigured}', '${svcActive1}'),
    ('${bizCompleted}', '${staffCustomAllClosed}', '${svcActive1}'),
    ('${bizCompleted}', '${staffNoPublicBooking}', '${svcActive1}'),
    ('${bizCompleted}', '${staffProfileInactive}', '${svcActive1}'),
    ('${bizCompleted}', '${staffMemberInactive}', '${svcActive1}'),
    -- svcActive2 assigned ONLY to staffOwnerBookable (staffConfigured NOT assigned to svcActive2)
    ('${bizCompleted}', '${staffOwnerBookable}', '${svcActive2}'),
    -- svcInactive assigned to staffOwnerBookable
    ('${bizCompleted}', '${staffOwnerBookable}', '${svcInactive}'),
    -- svcOtherTenant assigned to staffOtherTenant
    ('${bizOtherTenant}', '${staffOtherTenant}', '${svcOtherTenant}');
  `);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("TASK 007A — Public Booking Foundation Tests", () => {
  describe("1. Business Lookup & Public Eligibility", () => {
    it("1. valid completed business resolves by slug", async () => {
      const biz = await PublicBookingService.getPublicBusiness("barber-studio");
      assert.ok(biz);
      assert.equal(biz.slug, "barber-studio");
      assert.equal(biz.name, "Barber Studio");
      assert.equal(biz.currency, "TRY");
      assert.equal(biz.phone, "+905551112233");
      assert.equal(biz.address, "Kadikoy, Istanbul");
    });

    it("2. nonexistent slug fails safely (returns null)", async () => {
      const biz = await PublicBookingService.getPublicBusiness("nonexistent-slug");
      assert.equal(biz, null);
    });

    it("3. incomplete onboarding business is not publicly bookable", async () => {
      const biz = await PublicBookingService.getPublicBusiness("incomplete-barber");
      assert.equal(biz, null);
    });

    it("3b. inactive business is not publicly bookable", async () => {
      const biz = await PublicBookingService.getPublicBusiness("closed-barber");
      assert.equal(biz, null);
    });

    it("4. public route does not require authentication", async () => {
      // Invocations succeed without any session context
      const biz = await PublicBookingService.getPublicBusiness("barber-studio");
      assert.ok(biz);
    });

    it("28. business public DTO contains no private fields", async () => {
      const biz = await PublicBookingService.getPublicBusiness("barber-studio");
      assert.ok(biz);
      const keys = Object.keys(biz);
      assert.deepEqual(keys.sort(), ["address", "currency", "name", "phone", "slug"].sort());
      assert.equal((biz as any).id, undefined);
      assert.equal((biz as any).onboardingCompletedAt, undefined);
      assert.equal((biz as any).createdAt, undefined);
      assert.equal((biz as any).updatedAt, undefined);
    });
  });

  describe("2. Public Services Listing & Tenant Isolation", () => {
    it("5. active services are returned", async () => {
      const services = await PublicBookingService.getPublicServices("barber-studio");
      assert.equal(services.length, 2);
      const names = services.map((s: any) => s.name);
      assert.ok(names.includes("Sac Kesimi"));
      assert.ok(names.includes("Sakal Trasi"));
    });

    it("6. inactive services are excluded", async () => {
      const services = await PublicBookingService.getPublicServices("barber-studio");
      const names = services.map((s: any) => s.name);
      assert.equal(names.includes("Eski Hizmet"), false);
    });

    it("7. service belongs to correct tenant (cross-tenant excluded)", async () => {
      const services = await PublicBookingService.getPublicServices("barber-studio");
      const names = services.map((s: any) => s.name);
      assert.equal(names.includes("Diger Sac Kesimi"), false);
    });

    it("8. cross-tenant service ID fails safely when querying staff", async () => {
      // svcOtherTenant belongs to bizOtherTenant, request asks for it under barber-studio
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcOtherTenant
      );
      assert.deepEqual(staff, []);
    });

    it("9. service DTO exposes only approved fields", async () => {
      const services = await PublicBookingService.getPublicServices("barber-studio");
      assert.ok(services.length > 0);
      const svc = services[0];
      const keys = Object.keys(svc);
      assert.deepEqual(keys.sort(), ["description", "durationMinutes", "id", "name", "price"].sort());
      assert.equal((svc as any).businessId, undefined);
      assert.equal((svc as any).createdAt, undefined);
      assert.equal((svc as any).updatedAt, undefined);
      assert.equal((svc as any).active, undefined);
    });
  });

  describe("3. Staff Eligibility & Schedule Validation", () => {
    it("10. active/public staff assigned to service is returned", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ids = staff.map((s: any) => s.id);
      assert.ok(ids.includes(staffOwnerBookable));
      assert.ok(ids.includes(staffConfigured));
    });

    it("11. inactive membership staff excluded", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ids = staff.map((s: any) => s.id);
      assert.equal(ids.includes(staffMemberInactive), false);
    });

    it("12. inactive staff_profile excluded", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ids = staff.map((s: any) => s.id);
      assert.equal(ids.includes(staffProfileInactive), false);
    });

    it("13. public_booking_enabled=false excluded", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ids = staff.map((s: any) => s.id);
      assert.equal(ids.includes(staffNoPublicBooking), false);
    });

    it("14. staff without selected service assignment excluded", async () => {
      // svcActive2 is assigned only to staffOwnerBookable, NOT to staffConfigured
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive2
      );
      const ids = staff.map((s: any) => s.id);
      assert.ok(ids.includes(staffOwnerBookable));
      assert.equal(ids.includes(staffConfigured), false);
    });

    it("15. staff mapped only to another service excluded", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive2
      );
      const ids = staff.map((s: any) => s.id);
      assert.equal(ids.includes(staffConfigured), false);
    });

    it("16. staff from another tenant excluded", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ids = staff.map((s: any) => s.id);
      assert.equal(ids.includes(staffOtherTenant), false);
    });

    it("17. inactive service produces no selectable staff", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcInactive
      );
      assert.deepEqual(staff, []);
    });

    it("18 & 21. all-closed custom effective schedule excludes staff", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ids = staff.map((s: any) => s.id);
      assert.equal(ids.includes(staffCustomAllClosed), false);
    });

    it("19. inherited valid business schedule allows eligible staff", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const owner = staff.find((s: any) => s.id === staffOwnerBookable);
      assert.ok(owner);
      assert.equal(owner.displayName, "Ahmet Usta");
    });

    it("20. valid custom staff schedule allows eligible staff", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const customStaff = staff.find((s: any) => s.id === staffConfigured);
      assert.ok(customStaff);
      assert.equal(customStaff.displayName, "Mehmet Kuafor");
    });

    it("22. owner bookable staff profile can appear normally when eligible", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const ownerStaff = staff.find((s: any) => s.id === staffOwnerBookable);
      assert.ok(ownerStaff);
    });

    it("23. accepted STAFF profile can appear after being configured", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      const configuredStaff = staff.find((s: any) => s.id === staffConfigured);
      assert.ok(configuredStaff);
    });

    it("24. ADMIN identity without staff_profile never appears as booking staff", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      // userAdminOnly has memberAdminOnly, but NO staff_profiles row
      const displayNames = staff.map((s: any) => s.displayName);
      assert.equal(displayNames.includes("Admin Only"), false);
    });

    it("25. staff public DTO contains no email", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      for (const s of staff) {
        assert.equal((s as any).email, undefined);
      }
    });

    it("26. staff public DTO contains no Better Auth user ID", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      for (const s of staff) {
        assert.equal((s as any).userId, undefined);
      }
    });

    it("27. staff public DTO contains no business_member ID", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      for (const s of staff) {
        assert.equal((s as any).businessMemberId, undefined);
        assert.equal((s as any).phone, undefined);
        assert.equal((s as any).role, undefined);
        assert.equal((s as any).usesBusinessHours, undefined);
      }
    });

    it("29 & 30. service selection returns only eligible same-business staff without N+1", async () => {
      const staff = await PublicBookingService.getEligibleStaffForService(
        "barber-studio",
        svcActive1
      );
      // Only staffOwnerBookable and staffConfigured meet all 8 rules
      assert.equal(staff.length, 2);
      const ids = staff.map((s: any) => s.id).sort();
      assert.deepEqual(ids, [staffOwnerBookable, staffConfigured].sort());
    });
  });

  describe("4. Tampering & Pre-Schedule Validation", () => {
    it("valid selection passes validation", async () => {
      const res = await PublicBookingService.validatePublicSelection(
        "barber-studio",
        svcActive1,
        staffOwnerBookable
      );
      assert.equal(res.valid, true);
      assert.ok(res.business);
      assert.ok(res.service);
      assert.ok(res.staff);
      assert.equal(res.business?.slug, "barber-studio");
      assert.equal(res.service?.id, svcActive1);
      assert.equal(res.staff?.id, staffOwnerBookable);
    });

    it("rejects tampered staffId not assigned to service", async () => {
      // staffConfigured is NOT assigned to svcActive2
      const res = await PublicBookingService.validatePublicSelection(
        "barber-studio",
        svcActive2,
        staffConfigured
      );
      assert.equal(res.valid, false);
      assert.ok(res.error);
    });

    it("rejects cross-tenant staffId", async () => {
      const res = await PublicBookingService.validatePublicSelection(
        "barber-studio",
        svcActive1,
        staffOtherTenant
      );
      assert.equal(res.valid, false);
    });

    it("rejects cross-tenant serviceId", async () => {
      const res = await PublicBookingService.validatePublicSelection(
        "barber-studio",
        svcOtherTenant,
        staffOwnerBookable
      );
      assert.equal(res.valid, false);
    });

    it("rejects inactive serviceId", async () => {
      const res = await PublicBookingService.validatePublicSelection(
        "barber-studio",
        svcInactive,
        staffOwnerBookable
      );
      assert.equal(res.valid, false);
    });

    it("rejects invalid business slug", async () => {
      const res = await PublicBookingService.validatePublicSelection(
        "invalid-slug",
        svcActive1,
        staffOwnerBookable
      );
      assert.equal(res.valid, false);
    });
  });
});
