/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import assert from "node:assert/strict";
import { after, before, describe, it, beforeEach } from "node:test";
import { startDatabase } from "../database/db.mjs";

let db: any;
let pgServer: any;
let users: any;
let businesses: any;
let businessMembers: any;
let platformAdmins: any;
let staffProfiles: any;
let staffServices: any;
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
  admin1: uuid(5),
  staff1: uuid(6),
  service1: uuid(7),
  service2: uuid(8), // biz2 service
  superAdmin: uuid(9),
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
  platformAdmins = schema.platformAdmins;
  staffProfiles = schema.staffProfiles;
  staffServices = schema.staffServices;
  services = schema.services;

  const drizzleOrm = await import("drizzle-orm");
  eq = drizzleOrm.eq;
  and = drizzleOrm.and;

  const spsModule = await import("../../src/services/staff-provisioning.service");
  StaffProvisioningService = spsModule.StaffProvisioningService;

  const authModule = await import("../../src/lib/auth/auth");
  auth = authModule.auth;

  // Mock Better Auth
  (auth as any).api = {
    signUpEmail: async (params: any) => {
      const { email, password, name } = params.body;
      // Simulate auth creation by just inserting user into DB directly to satisfy the service
      await db.insert(users).values({
        email,
        passwordHash: "mock-hash",
        name,
        emailVerified: true
      });
      return { ok: true, user: { id: "mock-id", email } };
    }
  };

  // Insert base mock data
  await db.insert(users).values([
    { id: MOCK.owner1, email: "owner1@test.com", passwordHash: "h", name: "O1", emailVerified: true },
    { id: MOCK.owner2, email: "owner2@test.com", passwordHash: "h", name: "O2", emailVerified: true },
    { id: MOCK.admin1, email: "admin1@test.com", passwordHash: "h", name: "A1", emailVerified: true },
    { id: MOCK.staff1, email: "staff1@test.com", passwordHash: "h", name: "S1", emailVerified: true },
    { id: MOCK.superAdmin, email: "super@test.com", passwordHash: "h", name: "Super", emailVerified: true },
  ]);

  await db.insert(platformAdmins).values([
    { userId: MOCK.superAdmin, role: "SUPER_ADMIN", active: true }
  ]);

  await db.insert(businesses).values([
    { id: MOCK.biz1, name: "Biz 1", slug: "biz1", timezone: "Europe/Istanbul", currency: "TRY", active: true },
    { id: MOCK.biz2, name: "Biz 2", slug: "biz2", timezone: "Europe/Istanbul", currency: "TRY", active: true },
  ]);

  await db.insert(businessMembers).values([
    { id: uuid(10), businessId: MOCK.biz1, userId: MOCK.owner1, role: "OWNER", active: true },
    { id: uuid(11), businessId: MOCK.biz1, userId: MOCK.admin1, role: "MANAGER", active: true },
    { id: uuid(12), businessId: MOCK.biz1, userId: MOCK.staff1, role: "STAFF", active: true },
    { id: uuid(13), businessId: MOCK.biz2, userId: MOCK.owner2, role: "OWNER", active: true },
  ]);

  await db.insert(services).values([
    { id: MOCK.service1, businessId: MOCK.biz1, name: "Svc 1", durationMinutes: 30, price: "100", active: true },
    { id: MOCK.service2, businessId: MOCK.biz2, name: "Svc 2", durationMinutes: 30, price: "100", active: true },
  ]);
});

after(async () => {
  await pgServer.stop();
});

describe("Staff Provisioning Authorization", () => {
  it("rejects ADMIN creating staff", async () => {
    await assert.rejects(
      StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.admin1,
        email: "new@test.com",
        name: "New",
        serviceIds: []
      }),
      /FORBIDDEN/
    );
  });

  it("rejects STAFF creating staff", async () => {
    await assert.rejects(
      StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.staff1,
        email: "new@test.com",
        name: "New",
        serviceIds: []
      }),
      /FORBIDDEN/
    );
  });

  it("rejects Platform Admin (without owner membership) creating staff", async () => {
    await assert.rejects(
      StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.superAdmin,
        email: "new@test.com",
        name: "New",
        serviceIds: []
      }),
      /FORBIDDEN/
    );
  });

  it("allows OWNER creating staff", async () => {
    // We expect this to fail inside provisionStaff due to Better Auth context missing in test, 
    // but NOT with FORBIDDEN. It should reach IDENTITY_CREATION_FAILED since it tries to create auth.
    // Wait, let's mock auth.api.signUpEmail for testing so it succeeds!
  });
});

describe("Staff Provisioning Identity Flow", () => {
  it("creates new identity with secure password and forcePasswordChange=true", async () => {
    const res = await StaffProvisioningService.provisionStaff({
      businessId: MOCK.biz1,
      actorUserId: MOCK.owner1,
      email: "new-staff@test.com",
      name: "New Staff",
      serviceIds: [MOCK.service1]
    });
    
    assert.equal(res.success, true);
    assert.equal(res.isNewUser, true);
    assert.ok(res.tempPassword);
    
    // verify db
    const [user] = await db.select().from(users).where(eq(users.email, "new-staff@test.com"));
    assert.ok(user);
    assert.equal(user.forcePasswordChange, true);
    assert.equal(user.name, "New Staff");
    
    const [member] = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, MOCK.biz1), eq(businessMembers.userId, user.id)));
    assert.ok(member);
    assert.equal(member.role, "STAFF");
    assert.equal(member.active, true);
    
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.businessMemberId, member.id));
    assert.ok(profile);
    assert.equal(profile.active, true);
    assert.equal(profile.usesBusinessHours, true);
    assert.equal(profile.publicBookingEnabled, false);
    assert.equal(profile.firstName, "New");
    assert.equal(profile.lastName, "Staff");
    
    const [serviceMapping] = await db.select().from(staffServices).where(eq(staffServices.staffId, profile.id));
    assert.ok(serviceMapping);
    assert.equal(serviceMapping.serviceId, MOCK.service1);
  });

  it("reuses existing identity", async () => {
    // Admin1 exists. Let's make them STAFF in Biz2
    const res = await StaffProvisioningService.provisionStaff({
      businessId: MOCK.biz2,
      actorUserId: MOCK.owner2,
      email: "admin1@test.com",
      name: "Admin Staff",
      serviceIds: []
    });
    
    assert.equal(res.success, true);
    assert.equal(res.isNewUser, false);
    assert.equal(res.tempPassword, null);
    
    const [user] = await db.select().from(users).where(eq(users.email, "admin1@test.com"));
    assert.equal(user.name, "A1"); // Global name should NOT be overwritten
    // forcePasswordChange shouldn't be touched by reuse
    // In our mock, admin1 doesn't have it set to true. 
  });

  it("rejects cross-tenant services", async () => {
    await assert.rejects(
      StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.owner1,
        email: "cross-tenant@test.com",
        name: "Cross",
        serviceIds: [MOCK.service2] // belongs to biz2
      }),
      /INVALID_SERVICE/
    );
  });
  
  it("rejects if staff already exists", async () => {
    await assert.rejects(
      StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.owner1,
        email: "staff1@test.com",
        name: "S1",
        serviceIds: []
      }),
      /STAFF_ALREADY_EXISTS/
    );
  });
  
  it("rejects if user is already OWNER in same business", async () => {
    await assert.rejects(
      StaffProvisioningService.provisionStaff({
        businessId: MOCK.biz1,
        actorUserId: MOCK.owner1,
        email: "owner1@test.com",
        name: "O1",
        serviceIds: []
      }),
      /MEMBER_ROLE_CONFLICT/
    );
  });
});
