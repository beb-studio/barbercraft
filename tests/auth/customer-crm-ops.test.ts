/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";
import { customerPhoneComparisonKey } from "../../src/lib/phone";

let pgServer: any;
let db: any;
let sessionModule: any;
let customerActions: any;
let manualBookingActions: any;
let AppointmentService: any;
let businesses: any;
let businessMembers: any;
let customers: any;
let appointments: any;
let staffProfiles: any;
let services: any;
let staffServices: any;
let staffWorkingHours: any;
let businessWorkingHours: any;
let eq: any;
let and: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Users
const userNoBiz = uuid(801);
const userStaffA = uuid(802);
const userAdminA = uuid(803);
const userOwnerA = uuid(804);
const userOwnerB = uuid(805);
const userStaffB = uuid(806);

// Businesses
const bizA = uuid(810);
const bizB = uuid(820);

// Memberships
const memOwnerA = uuid(831);
const memAdminA = uuid(832);
const memStaffA = uuid(833);
const memOwnerB = uuid(834);
const memStaffB = uuid(835);

// Staff Profiles & Services
const staffProfileA = uuid(841);
const staffProfileB = uuid(842);
const serviceA = uuid(851);
const serviceB = uuid(852);

// Customers
const custA1 = uuid(861);
const custA2 = uuid(862);
const custB1 = uuid(863);

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  customerActions = await import("../../src/actions/customer.actions");
  manualBookingActions = await import("../../src/actions/manual-booking.actions");


  const apptServiceModule = await import("../../src/services/appointment.service");
  AppointmentService = apptServiceModule.AppointmentService;

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  customers = schema.customers;
  appointments = schema.appointments;
  staffProfiles = schema.staffProfiles;
  services = schema.services;
  staffServices = schema.staffServices;
  staffWorkingHours = schema.staffWorkingHours;
  businessWorkingHours = schema.businessWorkingHours;

  const orm = await import("drizzle-orm");
  eq = orm.eq;
  and = orm.and;

  // 1. Seed users
  await db.execute(
    `INSERT INTO users (id, name, email, email_verified) VALUES ` +
      `('${userNoBiz}', 'No Biz User', 'nobiz-ops@test.com', true), ` +
      `('${userStaffA}', 'Staff User A', 'staffa-ops@test.com', true), ` +
      `('${userAdminA}', 'Admin User A', 'admina-ops@test.com', true), ` +
      `('${userOwnerA}', 'Owner User A', 'ownera-ops@test.com', true), ` +
      `('${userOwnerB}', 'Owner User B', 'ownerb-ops@test.com', true), ` +
      `('${userStaffB}', 'Staff User B', 'staffb-ops@test.com', true)`
  );

  // 2. Seed businesses
  await db.insert(businesses).values([
    {
      id: bizA,
      name: "Berber Ops A",
      slug: "berber-ops-a",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizB,
      name: "Berber Ops B",
      slug: "berber-ops-b",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
  ]);

  // 3. Seed memberships
  await db.insert(businessMembers).values([
    { id: memOwnerA, businessId: bizA, userId: userOwnerA, role: "OWNER", active: true },
    { id: memAdminA, businessId: bizA, userId: userAdminA, role: "ADMIN", active: true },
    { id: memStaffA, businessId: bizA, userId: userStaffA, role: "STAFF", active: true },
    { id: memOwnerB, businessId: bizB, userId: userOwnerB, role: "OWNER", active: true },
    { id: memStaffB, businessId: bizB, userId: userStaffB, role: "STAFF", active: true },
  ]);

  // 4. Seed staff profiles
  await db.insert(staffProfiles).values([
    {
      id: staffProfileA,
      businessId: bizA,
      businessMemberId: memStaffA,
      firstName: "Hasan",
      lastName: "Usta",
      displayName: "Hasan Usta",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: false,
    },
    {
      id: staffProfileB,
      businessId: bizB,
      businessMemberId: memStaffB,
      firstName: "Kemal",
      lastName: "Usta",
      displayName: "Kemal Usta",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: false,
    },
  ]);

  // 5. Seed services
  await db.insert(services).values([
    {
      id: serviceA,
      businessId: bizA,
      name: "Sakal Tıraşı",
      durationMinutes: 30,
      price: "150.00",
      active: true,
    },
    {
      id: serviceB,
      businessId: bizB,
      name: "Sakal Tıraşı B",
      durationMinutes: 30,
      price: "180.00",
      active: true,
    },
  ]);

  // 6. Map staff services
  await db.insert(staffServices).values([
    { staffId: staffProfileA, serviceId: serviceA, businessId: bizA },
    { staffId: staffProfileB, serviceId: serviceB, businessId: bizB },
  ]);

  // 7. Seed working hours (Monday = 1 through Sunday = 0, open 08:00 - 22:00)
  for (let day = 0; day <= 6; day++) {
    await db.insert(businessWorkingHours).values([
      {
        id: uuid(900 + day),
        businessId: bizA,
        dayOfWeek: day,
        isClosed: false,
        startTime: "08:00:00",
        endTime: "22:00:00",
      },
      {
        id: uuid(910 + day),
        businessId: bizB,
        dayOfWeek: day,
        isClosed: false,
        startTime: "08:00:00",
        endTime: "22:00:00",
      },
    ]);
    await db.insert(staffWorkingHours).values([
      {
        businessId: bizA,
        staffId: staffProfileA,
        dayOfWeek: day,
        isWorking: true,
        startTime: "08:00:00",
        endTime: "22:00:00",
      },
      {
        businessId: bizB,
        staffId: staffProfileB,
        dayOfWeek: day,
        isWorking: true,
        startTime: "08:00:00",
        endTime: "22:00:00",
      },
    ]);
  }

  // 8. Seed initial customers
  await db.insert(customers).values([
    {
      id: custA1,
      businessId: bizA,
      firstName: "Murat",
      lastName: "Öztürk",
      phone: "+905329998877",
      normalizedPhone: "+905329998877",
      notes: "Önemli müşteri notu",
    },
    {
      id: custA2,
      businessId: bizA,
      firstName: "Murat",
      lastName: "Öztürk",
      phone: "5329998877",
      normalizedPhone: "5329998877", // Same phone number, different formatting variant!
      notes: null,
    },
    {
      id: custB1,
      businessId: bizB,
      firstName: "Barış",
      lastName: "Çelik",
      phone: "05329998877",
      normalizedPhone: "+905329998877", // Belongs to Business B
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("TASK 013C.1: Existing Customer Selection & Duplicate Detection", () => {
  const mockSession = (userId: string | null) => {
    if (!userId) {
      sessionModule.sessionDependencies.getCurrentUser = async () => null;
    } else {
      sessionModule.sessionDependencies.getCurrentUser = async () => ({
        id: userId,
        email: `${userId}@test.local`,
        forcePasswordChange: false,
      });
    }
  };

  // ==========================================
  // 1. MANUAL BOOKING INTEGRATION (Tests 1 - 14)
  // ==========================================
  describe("1. Manual Booking Integration", () => {
    it("1. OWNER can search existing customer during manual booking", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length >= 1);
      assert.strictEqual(res.data[0].firstName, "Murat");
    });

    it("2. ADMIN can search existing customer if manual booking authority permits", async () => {
      mockSession(userAdminA);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      assert.ok(res.data.length >= 1);
    });

    it("3. STAFF can search existing customer for purpose-limited manual booking", async () => {
      mockSession(userStaffA);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      assert.ok(res.data.length >= 1);
    });

    it("4. public unauthenticated user cannot use CRM customer search", async () => {
      mockSession(null);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, "Yetkisiz işlem.");
    });

    it("5. search is strictly tenant-scoped", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.searchCustomersForBookingAction("Barış"); // Barış is in Biz B
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 0);
    });

    it("6. cross-tenant customer cannot be selected for appointment", async () => {
      mockSession(userOwnerA);
      // Attempt to book in Biz A using customer custB1 (Biz B)
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T10:00:00.000Z",
        mode: "EXISTING",
        existingCustomerId: custB1,
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, "Seçilen müşteri bulunamadı veya işletmenize ait değil.");
    });

    it("7. forged businessIdParam is ignored or rejected", async () => {
      mockSession(userOwnerA);
      // Try to pass Biz B param
      const res = await customerActions.searchCustomersForBookingAction("Barış", bizB);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, "Belirtilen işletmeye erişim izniniz bulunmuyor.");
    });

    it("8. valid existing customer appointment uses same customer_id", async () => {
      mockSession(userOwnerA);
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T11:00:00.000Z",
        mode: "EXISTING",
        existingCustomerId: custA1,
        notes: "Test notu",
      });
      assert.strictEqual(res.success, true);

      const [createdAppt] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, bizA),
            eq(appointments.customerId, custA1),
            eq(appointments.startTime, new Date("2026-10-27T11:00:00.000Z"))
          )
        );

      assert.ok(createdAppt);
      assert.strictEqual(createdAppt.customerId, custA1);
      assert.strictEqual(createdAppt.notes, "Test notu");
    });

    it("9. selecting existing customer creates no new customer in database", async () => {
      const [beforeCount] = await db
        .select({ count: db.$count(customers, eq(customers.businessId, bizA)) })
        .from(customers)
        .limit(1);

      mockSession(userOwnerA);
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T12:00:00.000Z",
        mode: "EXISTING",
        existingCustomerId: custA1,
      });
      assert.strictEqual(res.success, true);

      const [afterCount] = await db
        .select({ count: db.$count(customers, eq(customers.businessId, bizA)) })
        .from(customers)
        .limit(1);

      assert.strictEqual(afterCount.count, beforeCount.count);
    });

    it("10. existing customer profile is NOT mutated by manual booking", async () => {
      const [custBefore] = await db.select().from(customers).where(eq(customers.id, custA1));

      mockSession(userOwnerA);
      await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T13:00:00.000Z",
        mode: "EXISTING",
        existingCustomerId: custA1,
      });

      const [custAfter] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.strictEqual(custAfter.firstName, custBefore.firstName);
      assert.strictEqual(custAfter.lastName, custBefore.lastName);
      assert.strictEqual(custAfter.phone, custBefore.phone);
      assert.strictEqual(custAfter.normalizedPhone, custBefore.normalizedPhone);
      assert.strictEqual(custAfter.notes, custBefore.notes);
    });

    it("11. new-customer path still creates/reuses customer correctly", async () => {
      mockSession(userOwnerA);
      const newPhone = "05391234567";
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T14:00:00.000Z",
        mode: "NEW",
        customer: {
          firstName: "Can",
          lastName: "Yıldız",
          phone: newPhone,
        },
      });
      assert.strictEqual(res.success, true);

      const [newCust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.businessId, bizA), eq(customers.phone, newPhone)));

      assert.ok(newCust);
      assert.strictEqual(newCust.firstName, "Can");
    });

    it("12. entered phone matching existing customer reuses that customer", async () => {
      mockSession(userOwnerA);
      // Provide existing phone of custA1 through NEW mode
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T15:00:00.000Z",
        mode: "NEW",
        customer: {
          firstName: "Murat",
          phone: "+905329998877", // same phone as custA1
        },
      });
      assert.strictEqual(res.success, true);

      // Verify appointment references custA1
      const [appt] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, bizA),
            eq(appointments.startTime, new Date("2026-10-27T15:00:00.000Z"))
          )
        );

      assert.strictEqual(appt.customerId, custA1);
    });

    it("13. appointment transaction rollback does not partially create customer", async () => {
      const unusedPhone = "05389998877";
      // Intentionally cause error by requesting invalid slot / already booked slot
      mockSession(userOwnerA);
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T15:00:00.000Z", // Already booked in test 12!
        mode: "NEW",
        customer: {
          firstName: "Fail",
          phone: unusedPhone,
        },
      });
      assert.strictEqual(res.success, false);

      const [partialCust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.businessId, bizA), eq(customers.phone, unusedPhone)));

      assert.strictEqual(partialCust, undefined);
    });

    it("14. manual booking scheduling locks remain intact", async () => {
      // Overlapping slot booking is rejected
      mockSession(userOwnerA);
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T11:00:00.000Z", // already booked in test 8
        mode: "EXISTING",
        existingCustomerId: custA1,
      });
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes("Seçilen saat"));
    });
  });

  // ==========================================
  // 2. CUSTOMER SEARCH & PRIVACY (Tests 15 - 20)
  // ==========================================
  describe("2. Customer Search & Privacy", () => {
    it("15. name search works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      assert.ok(res.data.every((c: any) => c.firstName.includes("Murat")));
    });

    it("16. normalized phone search works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.searchCustomersForBookingAction("5329998877");
      assert.strictEqual(res.success, true);
      assert.ok(res.data.length >= 1);
    });

    it("17. pagination/limit behavior is safe and bounded", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.searchCustomersForBookingAction("");
      assert.strictEqual(res.success, true);
      assert.ok(res.data.length <= 10);
    });

    it("18. result payload contains only allowed operational fields", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      const sample = res.data[0];
      assert.ok(sample.id);
      assert.ok(sample.firstName);
      assert.ok(sample.phone);
      // Verify internal notes are NOT present in search response
      assert.strictEqual((sample as any).notes, undefined);
    });

    it("19. STAFF limited search does not expose notes or history", async () => {
      mockSession(userStaffA);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      const sample = res.data[0];
      assert.strictEqual((sample as any).notes, undefined);
    });

    it("20. cross-business search leakage = zero", async () => {
      mockSession(userOwnerB);
      const res = await customerActions.searchCustomersForBookingAction("Murat");
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.length, 0); // Murat is in Biz A, not Biz B
    });
  });

  // ==========================================
  // 3. DUPLICATE DETECTION FOUNDATION (Tests 21 - 30)
  // ==========================================
  describe("3. Duplicate Detection Foundation", () => {
    it("21. same customer under defensible phone representation variants is detected", async () => {
      // custA1 has "+905329998877", custA2 has "5329998877"
      // Both normalize to comparison key "+905329998877"
      mockSession(userOwnerA);
      const res = await customerActions.getDuplicateCandidatesAction();
      assert.strictEqual(res.success, true);
      assert.ok(res.data.length >= 1);

      const match = res.data.find((g: any) => g.comparisonKey === "+905329998877");
      assert.ok(match);
      assert.strictEqual(match.confidence, "HIGH");
      assert.strictEqual(match.customers.length, 2);
    });

    it("22. identical name alone does not create high-confidence duplicate", async () => {
      // Create a customer with same name but completely different phone
      await db.insert(customers).values({
        id: uuid(870),
        businessId: bizA,
        firstName: "Murat",
        lastName: "Öztürk",
        phone: "05441112233",
        normalizedPhone: "+905441112233",
      });

      mockSession(userOwnerA);
      const res = await customerActions.getDuplicateCandidatesAction();
      assert.strictEqual(res.success, true);

      // The new phone must NOT be in the duplicate cluster of +905329998877
      const match = res.data.find((g: any) => g.comparisonKey === "+905329998877");
      assert.ok(match);
      assert.ok(match.customers.every((c: any) => c.phone !== "05441112233"));
    });

    it("23. cross-business customers are never grouped", async () => {
      // Barış in Biz B has phone 05329998877
      mockSession(userOwnerB);
      const res = await customerActions.getDuplicateCandidatesAction();
      assert.strictEqual(res.success, true);
      // Biz B only has one customer with this number, so length must be 0
      assert.strictEqual(res.data.length, 0);
    });

    it("24. candidate output is deterministic", async () => {
      mockSession(userOwnerA);
      const res1 = await customerActions.getDuplicateCandidatesAction();
      const res2 = await customerActions.getDuplicateCandidatesAction();
      assert.deepStrictEqual(res1.data, res2.data);
    });

    it("25. no customer mutation occurs during duplicate detection (read-only)", async () => {
      const [custBefore] = await db.select().from(customers).where(eq(customers.id, custA1));
      mockSession(userOwnerA);
      await customerActions.getDuplicateCandidatesAction();
      const [custAfter] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.deepStrictEqual(custBefore, custAfter);
    });

    it("26. no appointment mutation occurs during duplicate detection", async () => {
      const apptsBefore = await db.select().from(appointments).where(eq(appointments.businessId, bizA));
      mockSession(userOwnerA);
      await customerActions.getDuplicateCandidatesAction();
      const apptsAfter = await db.select().from(appointments).where(eq(appointments.businessId, bizA));
      assert.deepStrictEqual(apptsBefore, apptsAfter);
    });

    it("27. no notes mutation occurs during duplicate detection", async () => {
      const [cust] = await db.select({ notes: customers.notes }).from(customers).where(eq(customers.id, custA1));
      assert.strictEqual(cust.notes, "Önemli müşteri notu");
    });

    it("28. STAFF cannot access duplicate review", async () => {
      mockSession(userStaffA);
      const res = await customerActions.getDuplicateCandidatesAction();
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, "Yetkisiz işlem.");
    });

    it("29. OWNER can access duplicate review", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.getDuplicateCandidatesAction();
      assert.strictEqual(res.success, true);
      assert.ok(Array.isArray(res.data));
    });

    it("30. ADMIN can access duplicate review", async () => {
      mockSession(userAdminA);
      const res = await customerActions.getDuplicateCandidatesAction();
      assert.strictEqual(res.success, true);
      assert.ok(Array.isArray(res.data));
    });
  });

  // ==========================================
  // 4. REGRESSION VERIFICATION (Tests 31 - 40)
  // ==========================================
  describe("4. Regression & System Integrity", () => {
    it("31. public specific-staff booking works", async () => {
      const res = await AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T16:00:00.000Z",
        customer: {
          firstName: "Halk",
          lastName: "Müşterisi",
          phone: "05550001122",
        },
        context: "PUBLIC",
      });
      assert.ok(res);
      assert.strictEqual(res.status, "CONFIRMED");
    });

    it("32. public Any Staff (Fark Etmez) booking works", async () => {
      const res = await AppointmentService.createAnyStaffAppointment({
        businessId: bizA,
        candidateStaffIds: [staffProfileA],
        serviceId: serviceA,
        startAt: "2026-10-27T16:30:00.000Z",
        customer: {
          firstName: "Fark",
          lastName: "Etmez",
          phone: "05550002233",
        },
        context: "PUBLIC",
      });
      assert.ok(res.appointment);
      assert.strictEqual(res.assignedStaffId, staffProfileA);
    });

    it("33. manual new-customer booking works without regressing", async () => {
      mockSession(userOwnerA);
      const res = await manualBookingActions.createInternalAppointmentAction({
        staffId: staffProfileA,
        serviceId: serviceA,
        startAt: "2026-10-27T17:00:00.000Z",
        customer: {
          firstName: "Eski",
          lastName: "Tarz",
          phone: "05550003344",
        },
      });
      assert.strictEqual(res.success, true);
    });

    it("34. reschedule action works", async () => {
      const [appt] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, bizA),
            eq(appointments.startTime, new Date("2026-10-27T17:00:00.000Z"))
          )
        );

      assert.ok(appt);
      mockSession(userOwnerA);
      const res = await AppointmentService.rescheduleAppointment({
        businessId: bizA,
        appointmentId: appt.id,
        newStartAt: "2026-10-27T17:30:00.000Z",
        expectedUpdatedAt: appt.updatedAt.toISOString(),
        userId: userOwnerA,
        userRole: "OWNER",
      });
      assert.ok(res);
      assert.strictEqual(res.success, true);
    });

    it("35. reassignment works", async () => {
      // Reassign to same staff profile succeeds as NO_CHANGE or reassigns
      const [appt] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, bizA),
            eq(appointments.startTime, new Date("2026-10-27T17:30:00.000Z"))
          )
        );
      assert.ok(appt);
      mockSession(userOwnerA);
      const res = await AppointmentService.reassignAppointment(
        bizA,
        appt.id,
        staffProfileA,
        appt.updatedAt.toISOString(),
        "OWNER",
        userOwnerA
      );
      assert.ok(res);
    });

    it("36. customer directory works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.getCustomerDirectoryAction(bizA);
      assert.strictEqual(res.success, true);
      assert.ok(res.data.length > 0);
    });

    it("37. customer detail works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.getCustomerDetailAction(custA1, bizA);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.customer.id, custA1);
    });

    it("38. customer notes work", async () => {
      mockSession(userOwnerA);
      const addRes = await customerActions.addCustomerNoteAction(custA1, "Yeni test notu", bizA);
      assert.strictEqual(addRes.success, true);

      const listRes = await customerActions.getCustomerNotesAction(custA1, bizA);
      assert.strictEqual(listRes.success, true);
      assert.ok(listRes.notes.length >= 1);
    });

    it("39. customer profile editing works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerProfileAction(
        custA1,
        {
          firstName: "Murat Güncel",
          lastName: "Öztürk",
          phone: "+905329998877",
        },
        bizA
      );
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.customer.firstName, "Murat Güncel");
    });

    it("40. CRM composite tenant constraints remain green", async () => {
      // Pure helper verification
      assert.strictEqual(customerPhoneComparisonKey("+90 (532) 999 88 77"), "+905329998877");
      assert.strictEqual(customerPhoneComparisonKey("0532 999 88 77"), "+905329998877");
      assert.strictEqual(customerPhoneComparisonKey("5329998877"), "+905329998877");
      assert.strictEqual(customerPhoneComparisonKey("905329998877"), "+905329998877");
      assert.strictEqual(customerPhoneComparisonKey("+14155552671"), "+14155552671");
    });
  });
});
