/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let serviceActions: any;
let businesses: any;
let businessMembers: any;
let services: any;
let appointments: any;
let customers: any;
let staffProfiles: any;
let eq: any;
let and: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Users
const userNoBiz = uuid(601);
const userStaff = uuid(602);
const userAdmin = uuid(603);
const userOwnerA = uuid(604);
const userOwnerB = uuid(605);

// Businesses
const bizA = uuid(610);
const bizB = uuid(620);

// Memberships
const memOwnerA = uuid(631);
const memAdminA = uuid(632);
const memStaffA = uuid(633);
const memOwnerB = uuid(634);

// Services
const svcA1 = uuid(641);
const svcA2 = uuid(642);
const svcB1 = uuid(651);

// Staff & Customer for appointment snapshot tests
const staffA = uuid(661);
const customerA = uuid(671);
const apptA = uuid(681);

before(async () => {
  pgServer = await startDatabase({ port: 54405 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  serviceActions = await import("../../src/actions/service.actions");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  services = schema.services;
  appointments = schema.appointments;
  customers = schema.customers;
  staffProfiles = schema.staffProfiles;

  const orm = await import("drizzle-orm");
  eq = orm.eq;
  and = orm.and;

  // Insert mock users
  await db.execute(
    `INSERT INTO users (id, name, email, email_verified) VALUES ` +
      `('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true), ` +
      `('${userStaff}', 'Staff User', 'staff@test.com', true), ` +
      `('${userAdmin}', 'Admin User', 'admin@test.com', true), ` +
      `('${userOwnerA}', 'Owner A User', 'ownera@test.com', true), ` +
      `('${userOwnerB}', 'Owner B User', 'ownerb@test.com', true)`
  );

  // Insert businesses
  await db.insert(businesses).values([
    {
      id: bizA,
      name: "Barber Shop A",
      slug: "barber-a",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizB,
      name: "Barber Shop B",
      slug: "barber-b",
      timezone: "Europe/Istanbul",
      currency: "USD",
      onboardingCompletedAt: new Date(),
    },
  ]);

  // Insert memberships
  await db.insert(businessMembers).values([
    { id: memOwnerA, businessId: bizA, userId: userOwnerA, role: "OWNER" },
    { id: memAdminA, businessId: bizA, userId: userAdmin, role: "ADMIN" },
    { id: memStaffA, businessId: bizA, userId: userStaff, role: "STAFF" },
    { id: memOwnerB, businessId: bizB, userId: userOwnerB, role: "OWNER" },
  ]);

  // Insert initial services
  await db.insert(services).values([
    {
      id: svcA1,
      businessId: bizA,
      name: "Saç Kesimi",
      description: "Klasik makas ve makine kesimi",
      durationMinutes: 30,
      price: "250.00",
      active: true,
    },
    {
      id: svcA2,
      businessId: bizA,
      name: "Sakal Tıraşı",
      description: "Sıcak havlu ve ustura bakımı",
      durationMinutes: 20,
      price: "150.00",
      active: true,
    },
    {
      id: svcB1,
      businessId: bizB,
      name: "Shop B Special Haircut",
      description: "Exclusive haircut for Shop B",
      durationMinutes: 45,
      price: "50.00",
      active: true,
    },
  ]);

  // Insert staff profile for Biz A
  await db.insert(staffProfiles).values({
    id: staffA,
    businessId: bizA,
    businessMemberId: memOwnerA,
    firstName: "Owner",
    lastName: "Staff",
    active: true,
  });

  // Insert customer for Biz A
  await db.insert(customers).values({
    id: customerA,
    businessId: bizA,
    firstName: "Test",
    lastName: "Customer",
    phone: "05551112233",
    normalizedPhone: "+905551112233",
  });

  // Insert appointment referencing svcA1 with snapshots
  await db.insert(appointments).values({
    id: apptA,
    businessId: bizA,
    customerId: customerA,
    staffId: staffA,
    serviceId: svcA1,
    startTime: new Date("2026-10-20T10:00:00Z"),
    endTime: new Date("2026-10-20T10:30:00Z"),
    status: "CONFIRMED",
    source: "PUBLIC_WEB",
    serviceNameSnapshot: "Saç Kesimi",
    serviceDurationSnapshot: 30,
    servicePriceSnapshot: "250.00",
  });
});

after(async () => {
  await pgServer?.stop();
});

describe("Service Management (TASK 005A) Tests", () => {
  const mockSession = (userId: string | null) => {
    if (!userId) {
      sessionModule.sessionDependencies.getCurrentUser = async () => null;
    } else {
      sessionModule.sessionDependencies.getCurrentUser = async () => ({
        id: userId,
        email: "user@example.com",
      });
    }
  };

  // ==========================================
  // 1. Unauthenticated checks
  // ==========================================
  it("1. unauthenticated user cannot list dashboard services", async () => {
    mockSession(null);
    const res = await serviceActions.getDashboardServicesAction();
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Yetkisiz/i);
  });

  it("2. unauthenticated user cannot create dashboard service", async () => {
    mockSession(null);
    const res = await serviceActions.createDashboardServiceAction({
      name: "New Service",
      durationMinutes: 30,
      price: "100.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Yetkisiz/i);
  });

  it("3. unauthenticated user cannot update dashboard service", async () => {
    mockSession(null);
    const res = await serviceActions.updateDashboardServiceAction({
      serviceId: svcA1,
      name: "Updated",
      durationMinutes: 40,
      price: "120.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Yetkisiz/i);
  });

  it("4. unauthenticated user cannot toggle dashboard service active status", async () => {
    mockSession(null);
    const res = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA1,
      active: false,
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Yetkisiz/i);
  });

  // ==========================================
  // 2. User with no business membership
  // ==========================================
  it("5. user with no business cannot list or create services", async () => {
    mockSession(userNoBiz);
    const listRes = await serviceActions.getDashboardServicesAction();
    assert.strictEqual(listRes.success, false);

    const createRes = await serviceActions.createDashboardServiceAction({
      name: "Test",
      durationMinutes: 30,
      price: "100.00",
    });
    assert.strictEqual(createRes.success, false);
  });

  // ==========================================
  // 3. STAFF Role Boundaries (Strict Forbidden)
  // ==========================================
  it("6. STAFF cannot list dashboard services", async () => {
    mockSession(userStaff);
    const res = await serviceActions.getDashboardServicesAction();
    assert.strictEqual(res.success, false);
    assert.match(res.error, /yetkiniz yok/i);
  });

  it("7. STAFF cannot create dashboard service", async () => {
    mockSession(userStaff);
    const res = await serviceActions.createDashboardServiceAction({
      name: "Staff Haircut",
      durationMinutes: 30,
      price: "200.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /yetkiniz yok/i);
  });

  it("8. STAFF cannot update dashboard service", async () => {
    mockSession(userStaff);
    const res = await serviceActions.updateDashboardServiceAction({
      serviceId: svcA1,
      name: "Staff Modified Haircut",
      durationMinutes: 35,
      price: "220.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /yetkiniz yok/i);
  });

  it("9. STAFF cannot toggle dashboard service active status", async () => {
    mockSession(userStaff);
    const res = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA1,
      active: false,
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /yetkiniz yok/i);
  });

  // ==========================================
  // 4. OWNER Authorized Capabilities
  // ==========================================
  it("10. OWNER can list dashboard services", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.getDashboardServicesAction();
    assert.strictEqual(res.success, true);
    assert.ok(Array.isArray(res.services));
    assert.ok(res.services.some((s: any) => s.id === svcA1));
    assert.ok(res.services.some((s: any) => s.id === svcA2));
    // Must NOT contain services from Biz B
    assert.ok(!res.services.some((s: any) => s.id === svcB1));
  });

  it("11. OWNER can create a new dynamic service", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.createDashboardServiceAction({
      name: "Cilt Bakımı & Maske",
      description: "Doğal kil maskesi ve buhar bakımı",
      durationMinutes: 45,
      price: "350.00",
      active: true,
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.service?.id);
    assert.strictEqual(res.service.name, "Cilt Bakımı & Maske");
    assert.strictEqual(res.service.durationMinutes, 45);
    assert.strictEqual(res.service.price, "350.00");
    assert.strictEqual(res.service.active, true);
    assert.strictEqual(res.service.businessId, bizA);
  });

  it("12. OWNER can update an existing service", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.updateDashboardServiceAction({
      serviceId: svcA2,
      name: "Premium Sakal Bakımı",
      description: "Özel yağlar ile sakal bakımı",
      durationMinutes: 25,
      price: "180.00",
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.service.name, "Premium Sakal Bakımı");
    assert.strictEqual(res.service.durationMinutes, 25);
    assert.strictEqual(res.service.price, "180.00");

    // Verify persisted in DB
    const [persisted] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, bizA), eq(services.id, svcA2)));
    assert.strictEqual(persisted.name, "Premium Sakal Bakımı");
    assert.strictEqual(persisted.durationMinutes, 25);
    assert.strictEqual(persisted.price, "180.00");
  });

  it("13. OWNER can toggle service active status (deactivate and reactivate)", async () => {
    mockSession(userOwnerA);

    // Deactivate
    const deactRes = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA2,
      active: false,
    });
    assert.strictEqual(deactRes.success, true);
    assert.strictEqual(deactRes.service.active, false);

    const [deactivated] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, bizA), eq(services.id, svcA2)));
    assert.strictEqual(deactivated.active, false);

    // Reactivate
    const reactRes = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA2,
      active: true,
    });
    assert.strictEqual(reactRes.success, true);
    assert.strictEqual(reactRes.service.active, true);

    const [reactivated] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, bizA), eq(services.id, svcA2)));
    assert.strictEqual(reactivated.active, true);
  });

  // ==========================================
  // 5. ADMIN Authorized Capabilities
  // ==========================================
  it("14. ADMIN can list dashboard services", async () => {
    mockSession(userAdmin);
    const res = await serviceActions.getDashboardServicesAction();
    assert.strictEqual(res.success, true);
    assert.ok(res.services.some((s: any) => s.id === svcA1));
  });

  it("15. ADMIN can create a dynamic service", async () => {
    mockSession(userAdmin);
    const res = await serviceActions.createDashboardServiceAction({
      name: "Admin Eklenen Saç Yıkama",
      description: "Ferahlatıcı şampuan ile yıkama",
      durationMinutes: 15,
      price: "80.00",
      active: true,
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.service?.id);
    assert.strictEqual(res.service.name, "Admin Eklenen Saç Yıkama");
    assert.strictEqual(res.service.businessId, bizA);
  });

  it("16. ADMIN can update an existing service", async () => {
    mockSession(userAdmin);
    const res = await serviceActions.updateDashboardServiceAction({
      serviceId: svcA1,
      name: "Saç Kesimi & Yıkama",
      description: "Klasik kesim ve ferahlatıcı saç yıkama",
      durationMinutes: 40,
      price: "300.00",
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.service.name, "Saç Kesimi & Yıkama");
    assert.strictEqual(res.service.durationMinutes, 40);
    assert.strictEqual(res.service.price, "300.00");
  });

  it("17. ADMIN can toggle service active status", async () => {
    mockSession(userAdmin);
    const res = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA1,
      active: false,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.service.active, false);

    // Toggle back to active
    await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA1,
      active: true,
    });
  });

  // ==========================================
  // 6. Input Validation
  // ==========================================
  it("18. validation: empty or invalid name is rejected", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.createDashboardServiceAction({
      name: "   ",
      durationMinutes: 30,
      price: "100.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Hizmet adı/i);
  });

  it("19. validation: non-positive or too large duration is rejected", async () => {
    mockSession(userOwnerA);

    const zeroRes = await serviceActions.createDashboardServiceAction({
      name: "Invalid Duration",
      durationMinutes: 0,
      price: "100.00",
    });
    assert.strictEqual(zeroRes.success, false);
    assert.match(zeroRes.error, /Süre/i);

    const largeRes = await serviceActions.createDashboardServiceAction({
      name: "Invalid Large Duration",
      durationMinutes: 1441,
      price: "100.00",
    });
    assert.strictEqual(largeRes.success, false);
    assert.match(largeRes.error, /1440/i);
  });

  it("20. validation: negative or malformed price is rejected", async () => {
    mockSession(userOwnerA);

    const negRes = await serviceActions.createDashboardServiceAction({
      name: "Negative Price",
      durationMinutes: 30,
      price: "-50.00",
    });
    assert.strictEqual(negRes.success, false);
    assert.match(negRes.error, /fiyat/i);

    const invalidRes = await serviceActions.createDashboardServiceAction({
      name: "Invalid Price Format",
      durationMinutes: 30,
      price: "abc",
    });
    assert.strictEqual(invalidRes.success, false);
    assert.match(invalidRes.error, /fiyat/i);
  });

  it("21. validation: description exceeding 500 characters is rejected", async () => {
    mockSession(userOwnerA);
    const longDesc = "a".repeat(501);
    const res = await serviceActions.createDashboardServiceAction({
      name: "Long Description",
      description: longDesc,
      durationMinutes: 30,
      price: "100.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /500 karakter/i);
  });

  // ==========================================
  // 7. Tenant Isolation Tests
  // ==========================================
  it("22. tenant isolation: Owner of Biz A cannot update service of Biz B", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.updateDashboardServiceAction({
      serviceId: svcB1, // Belongs to Biz B
      name: "Hacked Service Name",
      durationMinutes: 60,
      price: "999.00",
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Hizmet bulunamadı/i);

    // Verify service of Biz B was not altered
    const [bizBSvc] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, bizB), eq(services.id, svcB1)));
    assert.strictEqual(bizBSvc.name, "Shop B Special Haircut");
    assert.strictEqual(bizBSvc.price, "50.00");
  });

  it("23. tenant isolation: Owner of Biz A cannot toggle active status of Biz B service", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcB1, // Belongs to Biz B
      active: false,
    });
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Hizmet bulunamadı/i);

    // Verify Biz B service is still active = true
    const [bizBSvc] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, bizB), eq(services.id, svcB1)));
    assert.strictEqual(bizBSvc.active, true);
  });

  // ==========================================
  // 8. Soft Deactivation & No Physical Deletion
  // ==========================================
  it("24. soft deactivation keeps the row in database with active = false", async () => {
    mockSession(userOwnerA);
    const res = await serviceActions.toggleDashboardServiceActiveAction({
      serviceId: svcA2,
      active: false,
    });
    assert.strictEqual(res.success, true);

    const [row] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, bizA), eq(services.id, svcA2)));
    assert.ok(row !== undefined);
    assert.strictEqual(row.active, false);
  });

  // ==========================================
  // 9. Snapshot Preservation Tests
  // ==========================================
  it("25. updating service does not alter snapshot on existing appointments", async () => {
    mockSession(userOwnerA);

    // Original appointment snapshot was: "Saç Kesimi", 30, "250.00"
    const [beforeAppt] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, apptA));
    assert.strictEqual(beforeAppt.serviceNameSnapshot, "Saç Kesimi");
    assert.strictEqual(beforeAppt.serviceDurationSnapshot, 30);
    assert.strictEqual(beforeAppt.servicePriceSnapshot, "250.00");

    // Update svcA1 to new name, duration, and price
    const updateRes = await serviceActions.updateDashboardServiceAction({
      serviceId: svcA1,
      name: "Yeni Nesil VIP Saç Kesimi",
      durationMinutes: 50,
      price: "500.00",
    });
    assert.strictEqual(updateRes.success, true);

    // Verify appointment snapshot remains exactly unchanged!
    const [afterAppt] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, apptA));
    assert.strictEqual(afterAppt.serviceNameSnapshot, "Saç Kesimi");
    assert.strictEqual(afterAppt.serviceDurationSnapshot, 30);
    assert.strictEqual(afterAppt.servicePriceSnapshot, "250.00");
  });

  it("26. foreign key constraint prevents physical DELETE of a service with appointments", async () => {
    // Attempt physical deletion on svcA1 which is referenced by apptA
    await assert.rejects(
      async () => {
        await db.delete(services).where(eq(services.id, svcA1));
      },
      (err: any) => {
        const fullMessage = `${err?.message || ""} ${err?.cause?.message || ""}`;
        return (
          fullMessage.includes("violates RESTRICT setting") ||
          fullMessage.includes("violates foreign key constraint") ||
          fullMessage.includes("appointments_service_fkey")
        );
      }
    );
  });
});
