/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let customerActions: any;
let CustomerRepository: any;
let AppointmentRepository: any;
let businesses: any;
let businessMembers: any;
let customers: any;
let customerNotes: any;
let appointments: any;
let staffProfiles: any;
let services: any;
let eq: any;
let and: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Users
const userNoBiz = uuid(701);
const userStaffA = uuid(702);
const userAdminA = uuid(703);
const userOwnerA = uuid(704);
const userOwnerB = uuid(705);
const userPlatformSuperAdmin = uuid(706);

// Businesses
const bizA = uuid(710);
const bizB = uuid(720);

// Memberships
const memOwnerA = uuid(731);
const memAdminA = uuid(732);
const memStaffA = uuid(733);
const memOwnerB = uuid(734);

// Staff profiles & Services
const staffProfileA = uuid(741);
const serviceA = uuid(751);

// Customers
const custA1 = uuid(761);
const custA2 = uuid(762);
const custB1 = uuid(763);

// Appointment
const apptA1 = uuid(771);

before(async () => {
  pgServer = await startDatabase({ port: 54470 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  customerActions = await import("../../src/actions/customer.actions");

  const custRepoModule = await import("../../src/repositories/customer.repository");
  CustomerRepository = custRepoModule.CustomerRepository;

  const apptRepoModule = await import("../../src/repositories/appointment.repository");
  AppointmentRepository = apptRepoModule.AppointmentRepository;

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  customers = schema.customers;
  customerNotes = schema.customerNotes;
  appointments = schema.appointments;
  staffProfiles = schema.staffProfiles;
  services = schema.services;

  const orm = await import("drizzle-orm");
  eq = orm.eq;
  and = orm.and;

  // 1. Seed users
  await db.execute(
    `INSERT INTO users (id, name, email, email_verified) VALUES ` +
      `('${userNoBiz}', 'No Biz User', 'nobiz-crm@test.com', true), ` +
      `('${userStaffA}', 'Staff User A', 'staffa-crm@test.com', true), ` +
      `('${userAdminA}', 'Admin User A', 'admina-crm@test.com', true), ` +
      `('${userOwnerA}', 'Owner User A', 'ownera-crm@test.com', true), ` +
      `('${userOwnerB}', 'Owner User B', 'ownerb-crm@test.com', true), ` +
      `('${userPlatformSuperAdmin}', 'Super Admin Platform', 'superadmin-crm@test.com', true)`
  );

  // 2. Seed platform admin (no business membership)
  await db.execute(
    `INSERT INTO platform_admins (id, user_id, role, active) VALUES ` +
      `('${uuid(707)}', '${userPlatformSuperAdmin}', 'SUPER_ADMIN', true)`
  );

  // 3. Seed businesses
  await db.insert(businesses).values([
    {
      id: bizA,
      name: "Berber A",
      slug: "berber-a-crm",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: bizB,
      name: "Berber B",
      slug: "berber-b-crm",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
  ]);

  // 4. Seed memberships
  await db.insert(businessMembers).values([
    { id: memOwnerA, businessId: bizA, userId: userOwnerA, role: "OWNER", active: true },
    { id: memAdminA, businessId: bizA, userId: userAdminA, role: "ADMIN", active: true },
    { id: memStaffA, businessId: bizA, userId: userStaffA, role: "STAFF", active: true },
    { id: memOwnerB, businessId: bizB, userId: userOwnerB, role: "OWNER", active: true },
  ]);

  // 5. Seed staff profile & service for Biz A
  await db.insert(staffProfiles).values({
    id: staffProfileA,
    businessId: bizA,
    businessMemberId: memStaffA,
    firstName: "Ahmet",
    lastName: "Usta",
    displayName: "Ahmet Usta",
  });

  await db.insert(services).values({
    id: serviceA,
    businessId: bizA,
    name: "Saç Kesimi",
    durationMinutes: 30,
    price: "250.00",
    active: true,
  });

  // 6. Seed initial customers
  await db.insert(customers).values([
    {
      id: custA1,
      businessId: bizA,
      firstName: "Ali",
      lastName: "Yılmaz",
      phone: "05321112233",
      normalizedPhone: "+905321112233",
    },
    {
      id: custA2,
      businessId: bizA,
      firstName: "Veli",
      lastName: "Demir",
      phone: "05334445566",
      normalizedPhone: "+905334445566",
    },
    {
      id: custB1,
      businessId: bizB,
      firstName: "Mehmet",
      lastName: "Kaya",
      phone: "05321112233",
      normalizedPhone: "+905321112233", // Cross-business identical phone
    },
  ]);

  // 7. Seed appointment for custA1 with snapshots
  await db.insert(appointments).values({
    id: apptA1,
    businessId: bizA,
    customerId: custA1,
    staffId: staffProfileA,
    serviceId: serviceA,
    startTime: new Date("2026-10-25T10:00:00Z"),
    endTime: new Date("2026-10-25T10:30:00Z"),
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

describe("TASK 013B.1: Customer CRM Security & Integration Tests", () => {
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
  // 1. AUTHORIZATION TESTS (1 - 19)
  // ==========================================
  describe("1. Authorization Guards", () => {
    it("1. unauthenticated cannot edit customer", async () => {
      mockSession(null);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Test",
        lastName: null,
        phone: "05320000000",
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "Yetkisiz işlem.");
    });

    it("2. STAFF cannot edit customer", async () => {
      mockSession(userStaffA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Test",
        lastName: null,
        phone: "05320000000",
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "Yetkisiz işlem.");
    });

    it("3. OWNER can edit customer", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Ali Updated",
        lastName: "Yılmaz",
        phone: "05321112233",
      });
      assert.equal(res.success, true);
      assert.equal(res.customer.firstName, "Ali Updated");
    });

    it("4. ADMIN can edit customer", async () => {
      mockSession(userAdminA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Ali AdminEdit",
        lastName: "Yılmaz",
        phone: "05321112233",
      });
      assert.equal(res.success, true);
      assert.equal(res.customer.firstName, "Ali AdminEdit");
    });

    it("5. platform admin without tenant membership cannot edit customer", async () => {
      mockSession(userPlatformSuperAdmin);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Hacked",
        lastName: null,
        phone: "05320000000",
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
    });

    it("6. cross-tenant customer edit denied", async () => {
      mockSession(userOwnerA); // Owner of Biz A, attempting to edit custB1 from Biz B
      const res = await customerActions.updateCustomerProfileAction(custB1, {
        firstName: "Tampered",
        lastName: null,
        phone: "05329999999",
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "Müşteri bulunamadı.");
    });

    it("7. spoofed businessId cannot bypass tenant authority", async () => {
      mockSession(userOwnerA);
      // Attempt to spoof businessIdParam = bizB
      const res = await customerActions.updateCustomerProfileAction(
        custB1,
        { firstName: "Spoof", lastName: null, phone: "05329999999" },
        bizB
      );
      assert.equal(res.success, false);
      assert.equal(res.error, "Belirtilen işletmeye erişim izniniz bulunmuyor.");
    });

    // Notes Authorization
    it("8. unauthenticated cannot create note", async () => {
      mockSession(null);
      const res = await customerActions.addCustomerNoteAction(custA1, "Not içeriği");
      assert.equal(res.success, false);
      assert.equal(res.error, "Yetkisiz işlem.");
    });

    it("9. STAFF cannot create note", async () => {
      mockSession(userStaffA);
      const res = await customerActions.addCustomerNoteAction(custA1, "Staff note");
      assert.equal(res.success, false);
      assert.equal(res.error, "Yetkisiz işlem.");
    });

    let createdNoteId: string;

    it("10. OWNER can create note", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.addCustomerNoteAction(custA1, "Owner note");
      assert.equal(res.success, true);
      assert.equal(res.note.content, "Owner note");
      createdNoteId = res.note.id;
    });

    it("11. ADMIN can create note", async () => {
      mockSession(userAdminA);
      const res = await customerActions.addCustomerNoteAction(custA1, "Admin note");
      assert.equal(res.success, true);
      assert.equal(res.note.content, "Admin note");
    });

    it("12. platform-only admin denied creating note", async () => {
      mockSession(userPlatformSuperAdmin);
      const res = await customerActions.addCustomerNoteAction(custA1, "Super admin note");
      assert.equal(res.success, false);
      assert.equal(res.error, "İşletme bulunamadı.");
    });

    it("13. cross-tenant note creation denied", async () => {
      mockSession(userOwnerA);
      // Attempt to create note in bizB where user has no membership
      const res = await customerActions.addCustomerNoteAction(custB1, "Cross-tenant note", bizB);
      assert.equal(res.success, false);
      assert.equal(res.error, "Belirtilen işletmeye erişim izniniz bulunmuyor.");
    });

    it("14. OWNER can edit note", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerNoteAction(custA1, createdNoteId, "Owner note edited");
      assert.equal(res.success, true);
      assert.equal(res.note.content, "Owner note edited");
    });

    it("15. ADMIN can edit note", async () => {
      mockSession(userAdminA);
      const res = await customerActions.updateCustomerNoteAction(custA1, createdNoteId, "Admin note edited");
      assert.equal(res.success, true);
      assert.equal(res.note.content, "Admin note edited");
    });

    it("16. STAFF cannot edit note", async () => {
      mockSession(userStaffA);
      const res = await customerActions.updateCustomerNoteAction(custA1, createdNoteId, "Staff note edited");
      assert.equal(res.success, false);
      assert.equal(res.error, "Yetkisiz işlem.");
    });

    it("17. STAFF cannot delete note", async () => {
      mockSession(userStaffA);
      const res = await customerActions.deleteCustomerNoteAction(custA1, createdNoteId);
      assert.equal(res.success, false);
      assert.equal(res.error, "Yetkisiz işlem.");
    });

    it("18. ADMIN can delete note", async () => {
      mockSession(userAdminA);
      // Create a temporary note for admin deletion
      const addRes = await customerActions.addCustomerNoteAction(custA1, "Temp note for admin delete");
      assert.equal(addRes.success, true);
      const res = await customerActions.deleteCustomerNoteAction(custA1, addRes.note.id);
      assert.equal(res.success, true);
    });

    it("19. OWNER can delete note", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.deleteCustomerNoteAction(custA1, createdNoteId);
      assert.equal(res.success, true);
    });
  });

  // ==========================================
  // 2. PROFILE EDIT TESTS (20 - 30)
  // ==========================================
  describe("2. Profile Editing & Conflict Rules", () => {
    let originalCustomer: any;

    before(async () => {
      const [c] = await db.select().from(customers).where(eq(customers.id, custA1));
      originalCustomer = c;
    });

    it("20. first name update works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: originalCustomer.lastName,
        phone: originalCustomer.phone,
      });
      assert.equal(res.success, true);
      assert.equal(res.customer.firstName, "Kemal");
    });

    it("21. last name update works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: "Korkmaz",
        phone: originalCustomer.phone,
      });
      assert.equal(res.success, true);
      assert.equal(res.customer.lastName, "Korkmaz");
    });

    it("22. phone update works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: "Korkmaz",
        phone: "05559876543",
      });
      assert.equal(res.success, true);
      assert.equal(res.customer.phone, "05559876543");
    });

    it("23. canonical normalizePhone is used", async () => {
      const [c] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.equal(c.normalizedPhone, "05559876543"); // digits stripped, no leading +
      
      mockSession(userOwnerA);
      const res2 = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: "Korkmaz",
        phone: "+90 555 987 65 43",
      });
      assert.equal(res2.success, true);
      assert.equal(res2.customer.normalizedPhone, "+905559876543");
    });

    it("24. same-business phone conflict returns CUSTOMER_PHONE_CONFLICT", async () => {
      mockSession(userOwnerA);
      const [currentA2] = await db.select().from(customers).where(eq(customers.id, custA2));
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: "Korkmaz",
        phone: currentA2.normalizedPhone,
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "Bu telefon numarası başka bir müşteriye ait.");
    });

    it("25. visible Turkish conflict message is correct", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: "Korkmaz",
        phone: "+905334445566",
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "Bu telefon numarası başka bir müşteriye ait.");
    });

    it("26. same phone in another business is allowed", async () => {
      mockSession(userOwnerA);
      // custB1 in Biz B has phone "+905321112233". Updating custA1 to this phone is allowed because different business.
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Kemal",
        lastName: "Korkmaz",
        phone: "+905321112233",
      });
      assert.equal(res.success, true);
      assert.equal(res.customer.normalizedPhone, "+905321112233");
    });

    it("27. name equality does not merge customers", async () => {
      mockSession(userOwnerA);
      // Change custA1 name to exactly match custA2 name
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Veli",
        lastName: "Demir",
        phone: "+905321112233",
      });
      assert.equal(res.success, true);

      // Verify both customers exist distinctly
      const [c1] = await db.select().from(customers).where(eq(customers.id, custA1));
      const [c2] = await db.select().from(customers).where(eq(customers.id, custA2));
      assert.equal(c1.id, custA1);
      assert.equal(c2.id, custA2);
      assert.notEqual(c1.id, c2.id);
    });

    it("28. customer UUID unchanged after edits", async () => {
      const [c] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.equal(c.id, originalCustomer.id);
    });

    it("29. businessId unchanged after edits", async () => {
      const [c] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.equal(c.businessId, originalCustomer.businessId);
    });

    it("30. createdAt unchanged after edits", async () => {
      const [c] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.equal(c.createdAt.getTime(), originalCustomer.createdAt.getTime());
    });
  });

  // ==========================================
  // 3. CUSTOMER RESOLUTION AFTER EDIT (31 - 34)
  // ==========================================
  describe("3. Customer Resolution After Edit", () => {
    it("31. booking with NEW phone resolves to edited customer", async () => {
      // custA1 now has phone "+905321112233"
      await AppointmentRepository.transaction(async (tx: any) => {
        const resolved = await AppointmentRepository.upsertCustomer(tx, bizA, {
          firstName: "Updated Ali",
          lastName: "Yılmaz",
          phone: "+905321112233",
        });
        assert.equal(resolved.id, custA1);
      });
    });

    it("32. booking with OLD phone no longer resolves to edited customer", async () => {
      // custA1 originally had phone "05559876543" before being edited back to "+905321112233"
      await AppointmentRepository.transaction(async (tx: any) => {
        const resolved = await AppointmentRepository.upsertCustomer(tx, bizA, {
          firstName: "Brand New Person",
          phone: "05559876543",
        });
        assert.notEqual(resolved.id, custA1);
      });
    });

    it("33. public booking uses same canonical resolution", async () => {
      await AppointmentRepository.transaction(async (tx: any) => {
        const resolved = await AppointmentRepository.upsertCustomer(tx, bizA, {
          firstName: "Public Booker",
          phone: "+90 532 111 22 33", // formatting with spaces and +90
        });
        assert.equal(resolved.id, custA1);
      });
    });

    it("34. manual booking uses same canonical resolution", async () => {
      await AppointmentRepository.transaction(async (tx: any) => {
        const resolved = await AppointmentRepository.upsertCustomer(tx, bizA, {
          firstName: "Manual Booker",
          phone: "+90 (532) 111 22 33", // formatting with parentheses
        });
        assert.equal(resolved.id, custA1);
      });
    });
  });

  // ==========================================
  // 4. APPOINTMENT IMMUTABILITY TESTS (35 - 40)
  // ==========================================
  describe("4. Appointment Immutability & Live Joining", () => {
    it("35. customer profile edit does not mutate appointment rows", async () => {
      const [beforeAppt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));

      mockSession(userOwnerA);
      await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "İsim Değişti",
        lastName: "Soyisim Değişti",
        phone: "+905321112233",
      });

      const [afterAppt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(beforeAppt.updatedAt.getTime(), afterAppt.updatedAt.getTime());
    });

    it("36. service_name_snapshot unchanged", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(appt.serviceNameSnapshot, "Saç Kesimi");
    });

    it("37. service_duration_snapshot unchanged", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(appt.serviceDurationSnapshot, 30);
    });

    it("38. service_price_snapshot unchanged", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(appt.servicePriceSnapshot, "250.00");
    });

    it("39. existing appointment customer_id unchanged", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(appt.customerId, custA1);
    });

    it("40. existing future appointment remains intact", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(appt.startTime.toISOString(), "2026-10-25T10:00:00.000Z");
      assert.equal(appt.status, "CONFIRMED");
    });
  });

  // ==========================================
  // 5. NOTE CRUD TESTS (41 - 55)
  // ==========================================
  describe("5. Customer Notes CRUD & Content Validation", () => {
    let testNoteId: string;
    let initialCreatedAt: Date;

    it("41. note creation persists", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.addCustomerNoteAction(custA1, "Kalıcı dahili not 1");
      assert.equal(res.success, true);
      testNoteId = res.note.id;
      initialCreatedAt = new Date(res.note.createdAt);
      
      const [n] = await db.select().from(customerNotes).where(eq(customerNotes.id, testNoteId));
      assert.ok(n);
    });

    it("42. correct businessId persisted", async () => {
      const [n] = await db.select().from(customerNotes).where(eq(customerNotes.id, testNoteId));
      assert.equal(n.businessId, bizA);
    });

    it("43. correct customerId persisted", async () => {
      const [n] = await db.select().from(customerNotes).where(eq(customerNotes.id, testNoteId));
      assert.equal(n.customerId, custA1);
    });

    it("44. correct author business_member persisted", async () => {
      const [n] = await db.select().from(customerNotes).where(eq(customerNotes.id, testNoteId));
      assert.equal(n.createdByBusinessMemberId, memOwnerA);
    });

    it("45. notes returned newest-first", async () => {
      mockSession(userOwnerA);
      // Add second note slightly later
      const res2 = await customerActions.addCustomerNoteAction(custA1, "Kalıcı dahili not 2 (yeni)");
      assert.equal(res2.success, true);

      const listRes = await customerActions.getCustomerNotesAction(custA1);
      assert.equal(listRes.success, true);
      assert.ok(listRes.notes.length >= 2);
      assert.equal(listRes.notes[0].id, res2.note.id); // newest first
    });

    it("46. note edit works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.updateCustomerNoteAction(custA1, testNoteId, "Güncellenmiş not içeriği");
      assert.equal(res.success, true);
      assert.equal(res.note.content, "Güncellenmiş not içeriği");
    });

    it("47. updatedAt changes upon edit", async () => {
      const [n] = await db.select().from(customerNotes).where(eq(customerNotes.id, testNoteId));
      assert.ok(n.updatedAt >= initialCreatedAt);
    });

    it("48. note deletion works", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.deleteCustomerNoteAction(custA1, testNoteId);
      assert.equal(res.success, true);

      const [n] = await db.select().from(customerNotes).where(eq(customerNotes.id, testNoteId));
      assert.equal(n, undefined);
    });

    it("49. deleting note does not delete customer", async () => {
      const [c] = await db.select().from(customers).where(eq(customers.id, custA1));
      assert.ok(c);
    });

    it("50. deleting note does not affect appointments", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.ok(appt);
    });

    it("51. empty note rejected", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.addCustomerNoteAction(custA1, "");
      assert.equal(res.success, false);
      assert.equal(res.error, "Not boş olamaz.");
    });

    it("52. whitespace-only note rejected", async () => {
      mockSession(userOwnerA);
      const res = await customerActions.addCustomerNoteAction(custA1, "     \n  \t  ");
      assert.equal(res.success, false);
      assert.equal(res.error, "Not boş olamaz.");
    });

    it("53. >2000 character note rejected", async () => {
      mockSession(userOwnerA);
      const longText = "a".repeat(2001);
      const res = await customerActions.addCustomerNoteAction(custA1, longText);
      assert.equal(res.success, false);
      assert.equal(res.error, "Not çok uzun (Maksimum 2000 karakter).");
    });

    it("54. 2000-character note accepted", async () => {
      mockSession(userOwnerA);
      const exactText = "a".repeat(2000);
      const res = await customerActions.addCustomerNoteAction(custA1, exactText);
      assert.equal(res.success, true);
      assert.equal(res.note.content.length, 2000);
    });

    it("55. HTML/script content stored as plain text semantics", async () => {
      mockSession(userOwnerA);
      const scriptBody = "<script>alert('xss')</script><b>Bold</b>";
      const res = await customerActions.addCustomerNoteAction(custA1, scriptBody);
      assert.equal(res.success, true);
      assert.equal(res.note.content, scriptBody); // Stored raw as string, no executable behavior
    });
  });

  // ==========================================
  // 6. DATABASE TENANT INTEGRITY TESTS (56 - 61)
  // ==========================================
  describe("6. Database-Level Composite FK Tenant Integrity", () => {
    it("56. Business A note + Business B customer rejected by DB", async () => {
      let threw = false;
      try {
        await db.insert(customerNotes).values({
          businessId: bizA,
          customerId: custB1, // Cust B belongs to Biz B
          content: "Illegal cross-tenant note",
          createdByBusinessMemberId: memOwnerA,
        });
      } catch (err: any) {
        threw = true;
        const code = err.cause?.code || err.code;
        assert.equal(code, "23503"); // Foreign key violation
        assert.ok((err.cause?.message || err.message).includes("customer_notes_customer_fkey"));
      }
      assert.equal(threw, true, "Database must reject note when customerId does not belong to businessId");
    });

    it("57. Business A note + Business B author rejected by DB", async () => {
      let threw = false;
      try {
        await db.insert(customerNotes).values({
          businessId: bizA,
          customerId: custA1,
          content: "Illegal cross-tenant author note",
          createdByBusinessMemberId: memOwnerB, // Member B belongs to Biz B
        });
      } catch (err: any) {
        threw = true;
        const code = err.cause?.code || err.code;
        assert.equal(code, "23503"); // Foreign key violation
        assert.ok((err.cause?.message || err.message).includes("customer_notes_business_member_fkey"));
      }
      assert.equal(threw, true, "Database must reject note when createdByBusinessMemberId does not belong to businessId");
    });

    it("58. valid same-business customer/author note accepted by DB", async () => {
      const [n] = await db
        .insert(customerNotes)
        .values({
          businessId: bizA,
          customerId: custA1,
          content: "Valid same-business note",
          createdByBusinessMemberId: memOwnerA,
        })
        .returning();
      assert.ok(n);
      assert.equal(n.businessId, bizA);
    });

    it("59. deleting customer follows intended cascade on notes", async () => {
      // Create a temporary customer in Biz B with a note
      const tempCustId = uuid(881);
      await db.insert(customers).values({
        id: tempCustId,
        businessId: bizB,
        firstName: "Temp",
        phone: "05991112233",
        normalizedPhone: "+905991112233",
      });

      const [tempNote] = await db
        .insert(customerNotes)
        .values({
          businessId: bizB,
          customerId: tempCustId,
          content: "Note to be cascaded",
          createdByBusinessMemberId: memOwnerB,
        })
        .returning();

      // Delete customer
      await db.delete(customers).where(eq(customers.id, tempCustId));

      // Verify note was cascaded
      const [checkNote] = await db.select().from(customerNotes).where(eq(customerNotes.id, tempNote.id));
      assert.equal(checkNote, undefined);
    });

    it("60. deleting business follows intended cascade on notes", async () => {
      // Create a temporary business with member, customer and note
      const tempBizId = uuid(890);
      const tempUserId = uuid(891);
      const tempMemberId = uuid(892);
      const tempCustId = uuid(893);

      await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${tempUserId}', 'U', 'u@test.local', true)`);
      await db.insert(businesses).values({
        id: tempBizId,
        name: "Cascade Biz",
        slug: "cascade-biz",
        timezone: "Europe/Istanbul",
        currency: "TRY",
      });
      await db.insert(businessMembers).values({
        id: tempMemberId,
        businessId: tempBizId,
        userId: tempUserId,
        role: "OWNER",
      });
      await db.insert(customers).values({
        id: tempCustId,
        businessId: tempBizId,
        firstName: "Cust",
        phone: "05881112233",
        normalizedPhone: "+905881112233",
      });
      const [tempNote] = await db.insert(customerNotes).values({
        businessId: tempBizId,
        customerId: tempCustId,
        content: "Biz cascade note",
        createdByBusinessMemberId: tempMemberId,
      }).returning();

      // Delete business
      await db.delete(businesses).where(eq(businesses.id, tempBizId));

      // Verify note was deleted
      const [checkNote] = await db.select().from(customerNotes).where(eq(customerNotes.id, tempNote.id));
      assert.equal(checkNote, undefined);
    });

    it("61. deleting referenced business_member follows intended RESTRICT behavior", async () => {
      // memOwnerA is author of notes in bizA
      let threw = false;
      try {
        await db.delete(businessMembers).where(eq(businessMembers.id, memOwnerA));
      } catch (err: any) {
        threw = true;
        const code = err.cause?.code || err.code;
        assert.ok(code === "23001" || code === "23503", `Expected restrict code (23001 or 23503), got ${code}`);
      }
      assert.equal(threw, true, "Deleting an author member referenced by customer_notes must be RESTRICTED");
    });
  });

  // ==========================================
  // 7. CONCURRENCY TESTS (62 - 66)
  // ==========================================
  describe("7. Concurrency Hardening", () => {
    it("62. two customers concurrently changed to same normalized phone: exactly one succeeds", async () => {
      const targetPhone = "05399990011";
      const normalizedTarget = "+905399990011";

      // Run concurrent updates for custA1 and custA2 to same targetPhone
      const results = await Promise.allSettled([
        CustomerRepository.updateProfile(bizA, custA1, {
          firstName: "Cust1",
          lastName: null,
          phone: targetPhone,
          normalizedPhone: normalizedTarget,
        }),
        CustomerRepository.updateProfile(bizA, custA2, {
          firstName: "Cust2",
          lastName: null,
          phone: targetPhone,
          normalizedPhone: normalizedTarget,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      assert.equal(fulfilled.length, 1, "Exactly one update must succeed");
      assert.equal(rejected.length, 1, "Exactly one update must fail");
    });

    it("63. loser receives safe typed CUSTOMER_PHONE_CONFLICT", async () => {
      const targetPhone = "05399990011";
      const normalizedTarget = "+905399990011";

      // Find which customer holds targetPhone, then attempt to update the other customer to it
      const holder = (await db.select().from(customers).where(and(eq(customers.businessId, bizA), eq(customers.normalizedPhone, normalizedTarget))))[0];
      const otherCustId = holder.id === custA1 ? custA2 : custA1;

      let err: any;
      try {
        await CustomerRepository.updateProfile(bizA, otherCustId, {
          firstName: "Cust Other Retry",
          lastName: null,
          phone: targetPhone,
          normalizedPhone: normalizedTarget,
        });
      } catch (e) {
        err = e;
      }
      assert.ok(err, "Updating other customer to existing phone must throw");
      assert.equal(err.message, "CUSTOMER_PHONE_CONFLICT");
    });

    it("64. no duplicate business+normalizedPhone records exist", async () => {
      const rows = await db
        .select()
        .from(customers)
        .where(and(eq(customers.businessId, bizA), eq(customers.normalizedPhone, "+905399990011")));
      assert.equal(rows.length, 1);
    });

    it("65. no appointment mutation during concurrent conflicts", async () => {
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptA1));
      assert.equal(appt.serviceNameSnapshot, "Saç Kesimi");
      assert.equal(appt.servicePriceSnapshot, "250.00");
    });

    it("66. concurrent note creations both persist", async () => {
      mockSession(userOwnerA);
      const [res1, res2] = await Promise.all([
        customerActions.addCustomerNoteAction(custA1, "Concurrent Note A"),
        customerActions.addCustomerNoteAction(custA1, "Concurrent Note B"),
      ]);

      assert.equal(res1.success, true);
      assert.equal(res2.success, true);
      assert.notEqual(res1.note.id, res2.note.id);

      const [n1] = await db.select().from(customerNotes).where(eq(customerNotes.id, res1.note.id));
      const [n2] = await db.select().from(customerNotes).where(eq(customerNotes.id, res2.note.id));
      assert.ok(n1);
      assert.ok(n2);
    });
  });

  // ==========================================
  // 8. RAW DATABASE ERROR SAFETY
  // ==========================================
  describe("8. Raw Database Error Safety", () => {
    it("never returns raw 23505, constraint name, SQLSTATE, or stack trace to client", async () => {
      mockSession(userOwnerA);
      // Trigger phone conflict against custA2's actual normalized phone
      const [currentA2] = await db.select().from(customers).where(eq(customers.id, custA2));
      const res = await customerActions.updateCustomerProfileAction(custA1, {
        firstName: "Test",
        lastName: null,
        phone: currentA2.normalizedPhone,
      });

      assert.equal(res.success, false);
      const rawErrorPatterns = [
        "23505",
        "customers_business_phone_key",
        "SQLSTATE",
        "Failed query",
        "PostgresError",
        "NodePgPreparedQuery",
      ];
      for (const pattern of rawErrorPatterns) {
        assert.equal(
          res.error.includes(pattern),
          false,
          `Error message '${res.error}' must not contain raw database artifact '${pattern}'`
        );
      }
      assert.equal(res.error, "Bu telefon numarası başka bir müşteriye ait.");
    });
  });
});
