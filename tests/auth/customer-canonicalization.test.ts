/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";
import { customerPhoneComparisonKey } from "../../src/lib/phone";

const uuid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  owner: uuid(1),
  admin: uuid(2),
  staff: uuid(3),
  ownerB: uuid(4),
  businessA: uuid(10),
  businessB: uuid(11),
  ownerMember: uuid(20),
  adminMember: uuid(21),
  staffMember: uuid(22),
  ownerBMember: uuid(23),
  staffProfile: uuid(30),
  service: uuid(31),
  canonical: uuid(100),
  alias: uuid(101),
  aliasTwo: uuid(102),
  ambiguousOne: uuid(103),
  ambiguousTwo: uuid(104),
  standalone: uuid(105),
  crossTenant: uuid(106),
  singleTurkish: uuid(107),
  canonicalAppointment: uuid(200),
  aliasAppointment: uuid(201),
  canonicalNote: uuid(210),
  aliasNote: uuid(211),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let sessionModule: any;
let customerActions: any;
let manualActions: any;
let PublicBookingService: any;
let AppointmentRepository: any;
let CustomerMergeService: any;
let resolutionService: any;

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? { id: userId, email: `${userId}@test.local`, forcePasswordChange: false }
      : null;
}

async function customer(customerId: string) {
  const [row] = await db
    .select()
    .from(schema.customers)
    .where(orm.eq(schema.customers.id, customerId));
  return row;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  sessionModule = await import("../../src/lib/auth/session");
  customerActions = await import("../../src/actions/customer.actions");
  manualActions = await import("../../src/actions/manual-booking.actions");
  ({ PublicBookingService } = await import("../../src/services/public-booking.service"));
  ({ AppointmentRepository } = await import("../../src/repositories/appointment.repository"));
  ({ CustomerMergeService } = await import("../../src/services/customer-merge.service"));
  resolutionService = await import("../../src/services/customer-resolution.service");

  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES
    ('${ids.owner}', 'Owner', 'canonical-owner@test.local', true),
    ('${ids.admin}', 'Admin', 'canonical-admin@test.local', true),
    ('${ids.staff}', 'Staff', 'canonical-staff@test.local', true),
    ('${ids.ownerB}', 'Owner B', 'canonical-owner-b@test.local', true)`);

  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "Canonical A",
      slug: "canonical-a",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Canonical B",
      slug: "canonical-b",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
  ]);
  await db.insert(schema.businessMembers).values([
    { id: ids.ownerMember, businessId: ids.businessA, userId: ids.owner, role: "OWNER" },
    { id: ids.adminMember, businessId: ids.businessA, userId: ids.admin, role: "ADMIN" },
    { id: ids.staffMember, businessId: ids.businessA, userId: ids.staff, role: "STAFF" },
    { id: ids.ownerBMember, businessId: ids.businessB, userId: ids.ownerB, role: "OWNER" },
  ]);
  await db.insert(schema.staffProfiles).values({
    id: ids.staffProfile,
    businessId: ids.businessA,
    businessMemberId: ids.staffMember,
    firstName: "Usta",
    lastName: "Canonical",
    active: true,
    publicBookingEnabled: true,
    usesBusinessHours: true,
  });
  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.businessA,
    name: "Canonical Kesim",
    durationMinutes: 30,
    price: "300.00",
    active: true,
  });
  await db.insert(schema.staffServices).values({
    businessId: ids.businessA,
    staffId: ids.staffProfile,
    serviceId: ids.service,
  });
  await db.insert(schema.businessWorkingHours).values(
    Array.from({ length: 7 }, (_, day) => ({
      id: uuid(40 + day),
      businessId: ids.businessA,
      dayOfWeek: day,
      isClosed: false,
      startTime: "08:00:00",
      endTime: "22:00:00",
    }))
  );

  const mergedAt = new Date("2026-09-01T09:00:00Z");
  await db.insert(schema.customers).values([
    {
      id: ids.canonical,
      businessId: ids.businessA,
      firstName: "Canonical",
      lastName: "Müşteri",
      phone: "+905551110001",
      normalizedPhone: "+905551110001",
    },
    {
      id: ids.alias,
      businessId: ids.businessA,
      firstName: "Eski",
      lastName: "Kimlik",
      phone: "0555 111 00 01",
      normalizedPhone: "05551110001",
      mergedIntoCustomerId: ids.canonical,
      mergedAt,
      mergedByBusinessMemberId: ids.ownerMember,
    },
    {
      id: ids.aliasTwo,
      businessId: ids.businessA,
      firstName: "Diğer",
      lastName: "Takma",
      phone: "90 555 111 00 01",
      normalizedPhone: "905551110001",
      mergedIntoCustomerId: ids.canonical,
      mergedAt,
      mergedByBusinessMemberId: ids.ownerMember,
    },
    {
      id: ids.ambiguousOne,
      businessId: ids.businessA,
      firstName: "Belirsiz",
      lastName: "Bir",
      phone: "+905552220002",
      normalizedPhone: "+905552220002",
    },
    {
      id: ids.ambiguousTwo,
      businessId: ids.businessA,
      firstName: "Belirsiz",
      lastName: "İki",
      phone: "05552220002",
      normalizedPhone: "05552220002",
    },
    {
      id: ids.standalone,
      businessId: ids.businessA,
      firstName: "Tekil",
      phone: "+14155552671",
      normalizedPhone: "+14155552671",
    },
    {
      id: ids.crossTenant,
      businessId: ids.businessB,
      firstName: "Yabancı",
      phone: "+905551110001",
      normalizedPhone: "+905551110001",
    },
    {
      id: ids.singleTurkish,
      businessId: ids.businessA,
      firstName: "Tek Türk",
      phone: "+905554440004",
      normalizedPhone: "+905554440004",
    },
  ]);

  await db.insert(schema.appointments).values([
    {
      id: ids.canonicalAppointment,
      businessId: ids.businessA,
      customerId: ids.canonical,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: new Date("2026-01-10T09:00:00Z"),
      endTime: new Date("2026-01-10T09:30:00Z"),
      status: "COMPLETED",
      source: "MANUAL_ADMIN",
      serviceNameSnapshot: "Eski Canonical Hizmet",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "111.00",
    },
    {
      id: ids.aliasAppointment,
      businessId: ids.businessA,
      customerId: ids.alias,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: new Date("2027-01-10T09:00:00Z"),
      endTime: new Date("2027-01-10T09:45:00Z"),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Alias Tarihi Hizmet",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "222.00",
    },
  ]);
  await db.insert(schema.customerNotes).values([
    {
      id: ids.canonicalNote,
      businessId: ids.businessA,
      customerId: ids.canonical,
      content: "Canonical not",
      createdByBusinessMemberId: ids.ownerMember,
      createdAt: new Date("2026-08-01T09:00:00Z"),
    },
    {
      id: ids.aliasNote,
      businessId: ids.businessA,
      customerId: ids.alias,
      content: "Alias not",
      createdByBusinessMemberId: ids.adminMember,
      createdAt: new Date("2026-08-02T09:00:00Z"),
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("TASK 013C.2B canonical customer resolution", () => {
  describe("phone comparison parity", () => {
    const cases = [
      "+905551234567",
      "905551234567",
      "05551234567",
      "5551234567",
      "+14155552671",
      "14155552671",
      "+1 (415) 555-2671",
      "0555 123 45 67",
      "(0555) 123-45-67",
      "",
      "   ",
      "abc",
      "()+-",
    ];

    it("5-8. keeps TypeScript and PostgreSQL semantics identical", async () => {
      for (const value of cases) {
        const result = await pgServer.pool.query(
          "SELECT customer_phone_comparison_key($1) AS key",
          [value]
        );
        assert.equal(result.rows[0].key, customerPhoneComparisonKey(value), value);
      }
    });
  });

  describe("resolver and family primitives", () => {
    it("1. resolves a canonical ID to itself", async () => {
      const row = await resolutionService.resolveCanonicalCustomer(
        db,
        ids.businessA,
        ids.canonical
      );
      assert.equal(row.id, ids.canonical);
    });

    it("2. resolves an alias ID to the canonical root", async () => {
      const row = await resolutionService.resolveCanonicalCustomer(
        db,
        ids.businessA,
        ids.alias
      );
      assert.equal(row.id, ids.canonical);
    });

    it("3. does not resolve a cross-tenant ID", async () => {
      const row = await resolutionService.resolveCanonicalCustomer(
        db,
        ids.businessA,
        ids.crossTenant
      );
      assert.equal(row, null);
    });

    it("4. fails safely if a multi-hop state is visible inside a transaction", async () => {
      await assert.rejects(
        db.transaction(async (tx: any) => {
          await tx
            .update(schema.customers)
            .set({
              mergedIntoCustomerId: ids.standalone,
              mergedAt: new Date(),
              mergedByBusinessMemberId: ids.ownerMember,
            })
            .where(orm.eq(schema.customers.id, ids.canonical));
          await resolutionService.resolveCanonicalCustomer(
            tx,
            ids.businessA,
            ids.alias
          );
        }),
        (error: any) => error.code === "CUSTOMER_LINEAGE_CONFLICT"
      );
    });

    it("returns only the root and direct aliases", async () => {
      const family = await resolutionService.getCustomerFamily(
        db,
        ids.businessA,
        ids.alias
      );
      assert.equal(family.canonical.id, ids.canonical);
      assert.deepEqual(family.customerIds, [ids.canonical, ids.alias, ids.aliasTwo].sort());
    });
  });

  describe("booking identity resolution", () => {
    it("9. exact canonical normalized phone resolves canonical", async () => {
      const result = await AppointmentRepository.transaction((tx: any) =>
        AppointmentRepository.upsertCustomer(tx, ids.businessA, {
          firstName: "Ignored",
          phone: "+905551110001",
        })
      );
      assert.equal(result.id, ids.canonical);
    });

    it("10. exact alias normalized phone resolves canonical", async () => {
      const before = await customer(ids.alias);
      const result = await AppointmentRepository.transaction((tx: any) =>
        AppointmentRepository.upsertCustomer(tx, ids.businessA, {
          firstName: "Yeni ad yazılmasın",
          phone: "05551110001",
        })
      );
      assert.equal(result.id, ids.canonical);
      assert.deepEqual(await customer(ids.alias), before);
    });

    it("11. an equivalent representation resolves the one proven family", async () => {
      const result = await AppointmentRepository.transaction((tx: any) =>
        AppointmentRepository.upsertCustomer(tx, ids.businessA, {
          firstName: "Fallback",
          phone: "5551110001",
        })
      );
      assert.equal(result.id, ids.canonical);
    });

    it("allows comparison fallback to one lone canonical row", async () => {
      const result = await AppointmentRepository.transaction((tx: any) =>
        AppointmentRepository.upsertCustomer(tx, ids.businessA, {
          firstName: "Tek Fallback",
          phone: "5554440004",
        })
      );
      assert.equal(result.id, ids.singleTurkish);
    });

    it("12. ambiguous independent families are rejected", async () => {
      await assert.rejects(
        AppointmentRepository.transaction((tx: any) =>
          AppointmentRepository.upsertCustomer(tx, ids.businessA, {
            firstName: "Belirsiz",
            phone: "5552220002",
          })
        ),
        (error: any) => error.code === "CUSTOMER_IDENTITY_AMBIGUOUS"
      );
    });

    it("13. public specific-staff booking writes the canonical customer", async () => {
      await PublicBookingService.createPublicAppointment({
        slug: "canonical-a",
        serviceId: ids.service,
        staffId: ids.staffProfile,
        startAt: "2027-02-10T09:00:00.000Z",
        customerName: "Alias Public",
        customerPhone: "05551110001",
      });
      const [row] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.startTime, new Date("2027-02-10T09:00:00Z")));
      assert.equal(row.customerId, ids.canonical);
    });

    it("14. public Fark Etmez booking writes the canonical customer", async () => {
      await PublicBookingService.createPublicAppointment({
        slug: "canonical-a",
        serviceId: ids.service,
        staffId: "any",
        startAt: "2027-02-11T09:00:00.000Z",
        customerName: "Alias Any",
        customerPhone: "905551110001",
      });
      const [row] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.startTime, new Date("2027-02-11T09:00:00Z")));
      assert.equal(row.customerId, ids.canonical);
    });

    it("15. manual NEW booking uses comparison-family canonicalization", async () => {
      mockSession(ids.owner);
      const result = await manualActions.createInternalAppointmentAction({
        staffId: ids.staffProfile,
        serviceId: ids.service,
        startAt: "2027-02-12T09:00:00.000Z",
        mode: "NEW",
        customer: { firstName: "Manual", phone: "5551110001" },
      });
      assert.equal(result.success, true);
      const [row] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.startTime, new Date("2027-02-12T09:00:00Z")));
      assert.equal(row.customerId, ids.canonical);
    });

    it("16. a stale manual alias selection writes the canonical customer", async () => {
      mockSession(ids.owner);
      const result = await manualActions.createInternalAppointmentAction({
        staffId: ids.staffProfile,
        serviceId: ids.service,
        startAt: "2027-02-13T09:00:00.000Z",
        mode: "EXISTING",
        existingCustomerId: ids.alias,
      });
      assert.equal(result.success, true);
      const [row] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.startTime, new Date("2027-02-13T09:00:00Z")));
      assert.equal(row.customerId, ids.canonical);
    });

    it("17-18. booking neither edits aliases nor rewrites old appointments", async () => {
      assert.equal((await customer(ids.alias)).firstName, "Eski");
      const old = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, ids.aliasAppointment));
      assert.equal(old[0].customerId, ids.alias);
    });

    it("returns a safe Turkish outcome for ambiguous manual NEW booking", async () => {
      mockSession(ids.owner);
      const result = await manualActions.createInternalAppointmentAction({
        staffId: ids.staffProfile,
        serviceId: ids.service,
        startAt: "2027-02-14T09:00:00.000Z",
        mode: "NEW",
        customer: { firstName: "Belirsiz", phone: "5552220002" },
      });
      assert.equal(result.success, false);
      assert.match(result.error, /birden fazla bağımsız müşteri/);
      assert.doesNotMatch(result.error, /SQLSTATE|23505|constraint|stack/i);
    });

    it("returns a safe public outcome instead of choosing an ambiguous family", async () => {
      await assert.rejects(
        PublicBookingService.createPublicAppointment({
          slug: "canonical-a",
          serviceId: ids.service,
          staffId: ids.staffProfile,
          startAt: "2027-02-15T09:00:00.000Z",
          customerName: "Belirsiz Public",
          customerPhone: "5552220002",
        }),
        (error: any) =>
          error.message ===
          "VALIDATION_ERROR: Bu telefon numarasıyla birden fazla müşteri kaydı bulundu. Lütfen işletmeyle iletişime geçin."
      );
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.startTime, new Date("2027-02-15T09:00:00Z")));
      assert.equal(rows.length, 0);
    });
  });

  describe("family-aware CRM reads and notes", () => {
    it("19-22. directory shows one canonical row with family metrics", async () => {
      mockSession(ids.owner);
      const result = await customerActions.getCustomerDirectoryAction(ids.businessA);
      assert.equal(result.success, true);
      assert.ok(!result.data.some((item: any) => item.customer.id === ids.alias));
      const canonical = result.data.find((item: any) => item.customer.id === ids.canonical);
      assert.ok(canonical);
      const physicalCount = await db
        .select({ count: orm.sql<number>`count(*)::int` })
        .from(schema.appointments)
        .where(
          orm.inArray(schema.appointments.customerId, [
            ids.canonical,
            ids.alias,
            ids.aliasTwo,
          ])
        );
      assert.equal(canonical.appointmentCount, physicalCount[0].count);
      assert.equal(
        new Date(canonical.nextAppointmentDate).getTime(),
        new Date("2027-01-10T09:00:00Z").getTime()
      );
    });

    it("23-26. alias search canonicalizes once and pagination counts roots", async () => {
      mockSession(ids.owner);
      const byName = await customerActions.getCustomerDirectoryAction(
        ids.businessA,
        "Eski Kimlik"
      );
      assert.equal(byName.success, true);
      assert.deepEqual(byName.data.map((item: any) => item.customer.id), [ids.canonical]);
      const byPhone = await customerActions.getCustomerDirectoryAction(
        ids.businessA,
        "0555 111"
      );
      assert.deepEqual(byPhone.data.map((item: any) => item.customer.id), [ids.canonical]);
      const all = await customerActions.getCustomerDirectoryAction(ids.businessA);
      assert.equal(all.total, 5);
      assert.ok(!all.data.some((item: any) => item.customer.id === ids.crossTenant));
    });

    it("27-31. alias detail resolves canonical and aggregates immutable history", async () => {
      mockSession(ids.owner);
      const result = await customerActions.getCustomerDetailAction(
        ids.alias,
        ids.businessA
      );
      assert.equal(result.success, true);
      assert.equal(result.customer.id, ids.canonical);
      assert.equal(result.customer.firstName, "Canonical");
      assert.ok(result.history.some((row: any) => row.id === ids.aliasAppointment));
      assert.equal(result.stats.appointmentCount, result.history.length);
      const snapshot = result.history.find((row: any) => row.id === ids.aliasAppointment);
      assert.equal(snapshot.serviceNameSnapshot, "Alias Tarihi Hizmet");
      assert.equal(snapshot.serviceDurationSnapshot, 45);
      assert.equal(snapshot.servicePriceSnapshot, "222.00");
    });

    it("32-34. canonical and alias-origin notes are returned newest-first", async () => {
      mockSession(ids.admin);
      const result = await customerActions.getCustomerNotesAction(
        ids.canonical,
        ids.businessA
      );
      assert.equal(result.success, true);
      assert.ok(result.notes.some((note: any) => note.id === ids.canonicalNote));
      assert.ok(result.notes.some((note: any) => note.id === ids.aliasNote));
      assert.equal(result.notes[0].id, ids.aliasNote);
      assert.equal(
        result.notes.find((note: any) => note.id === ids.aliasNote).customerId,
        ids.alias
      );
    });

    let newNoteId: string;
    it("35-36. new notes, including stale alias submissions, attach to canonical", async () => {
      mockSession(ids.owner);
      const result = await customerActions.addCustomerNoteAction(
        ids.alias,
        "Alias rotasından yeni not",
        ids.businessA
      );
      assert.equal(result.success, true);
      newNoteId = result.note.id;
      assert.equal(result.note.customerId, ids.canonical);
    });

    it("37. alias-origin notes can be edited from the canonical family", async () => {
      mockSession(ids.admin);
      const result = await customerActions.updateCustomerNoteAction(
        ids.canonical,
        ids.aliasNote,
        "Alias not güncellendi",
        ids.businessA
      );
      assert.equal(result.success, true);
      assert.equal(result.note.customerId, ids.alias);
    });

    it("38. alias-origin notes can be deleted from the canonical family", async () => {
      mockSession(ids.owner);
      const result = await customerActions.deleteCustomerNoteAction(
        ids.canonical,
        ids.aliasNote,
        ids.businessA
      );
      assert.equal(result.success, true);
      const rows = await db
        .select()
        .from(schema.customerNotes)
        .where(orm.eq(schema.customerNotes.id, ids.aliasNote));
      assert.equal(rows.length, 0);
      assert.ok(newNoteId);
    });

    it("39. STAFF remains denied family notes", async () => {
      mockSession(ids.staff);
      const result = await customerActions.getCustomerNotesAction(
        ids.canonical,
        ids.businessA
      );
      assert.equal(result.success, false);
      assert.equal(result.error, "Yetkisiz işlem.");
    });
  });

  describe("search privacy, duplicates, and profile safety", () => {
    for (const [label, userId] of [
      ["OWNER", ids.owner],
      ["ADMIN", ids.admin],
      ["STAFF", ids.staff],
    ] as const) {
      it(`40-42. ${label} alias search returns the canonical minimum DTO`, async () => {
        mockSession(userId);
        const result = await customerActions.searchCustomersForBookingAction(
          "Eski Kimlik",
          ids.businessA
        );
        assert.equal(result.success, true);
        assert.deepEqual(result.data.map((row: any) => row.id), [ids.canonical]);
        assert.equal(result.data[0].notes, undefined);
        assert.equal(result.data[0].mergedIntoCustomerId, undefined);
        assert.equal(result.data[0].phoneComparisonKey, undefined);
      });
    }

    it("43-45. STAFF gets no notes/lineage and public callers get no search", async () => {
      mockSession(ids.staff);
      const staffResult = await customerActions.searchCustomersForBookingAction("Eski");
      assert.equal(staffResult.data[0].notes, undefined);
      assert.equal(staffResult.data[0].mergedIntoCustomerId, undefined);
      mockSession(null);
      const publicResult = await customerActions.searchCustomersForBookingAction("Eski");
      assert.equal(publicResult.success, false);
    });

    it("46-48. duplicate review excludes merged aliases and keeps independent roots read-only", async () => {
      mockSession(ids.owner);
      const before = await db.select().from(schema.customers);
      const result = await customerActions.getDuplicateCandidatesAction(ids.businessA);
      assert.equal(result.success, true);
      assert.ok(!result.data.some((group: any) => group.comparisonKey === "+905551110001"));
      const ambiguous = result.data.find(
        (group: any) => group.comparisonKey === "+905552220002"
      );
      assert.deepEqual(
        ambiguous.customers.map((row: any) => row.id).sort(),
        [ids.ambiguousOne, ids.ambiguousTwo].sort()
      );
      const afterRows = await db.select().from(schema.customers);
      assert.deepEqual(afterRows, before);
    });

    it("49. direct alias profile mutation remains forbidden", async () => {
      mockSession(ids.owner);
      const result = await customerActions.updateCustomerProfileAction(
        ids.alias,
        { firstName: "Olmamalı", lastName: null, phone: "05551110001" },
        ids.businessA
      );
      assert.equal(result.success, false);
      assert.match(result.error, /doğrudan düzenlenemez/);
    });

    it("50-51. canonical profile editing works and maintains its comparison key", async () => {
      mockSession(ids.owner);
      const result = await customerActions.updateCustomerProfileAction(
        ids.canonical,
        {
          firstName: "Canonical Güncel",
          lastName: "Müşteri",
          phone: "+90 555 111 00 01",
        },
        ids.businessA
      );
      assert.equal(result.success, true);
      assert.equal(result.customer.phoneComparisonKey, "+905551110001");
    });

    it("52. overlapping an independent family is rejected without auto-merge", async () => {
      mockSession(ids.owner);
      const result = await customerActions.updateCustomerProfileAction(
        ids.standalone,
        { firstName: "Tekil", lastName: null, phone: "5552220002" },
        ids.businessA
      );
      assert.equal(result.success, false);
      assert.match(result.error, /bağımsız müşteri ailesi/);
      assert.equal((await customer(ids.standalone)).mergedIntoCustomerId, null);
      assert.equal((await customer(ids.ambiguousOne)).mergedIntoCustomerId, null);
      assert.equal((await customer(ids.ambiguousTwo)).mergedIntoCustomerId, null);
    });
  });

  describe("booking concurrent with explicit merge", () => {
    it("53-57. preserves the booking and produces coherent canonical history", async () => {
      const root = uuid(300);
      const duplicate = uuid(301);
      await db.insert(schema.customers).values([
        {
          id: root,
          businessId: ids.businessA,
          firstName: "Race Root",
          phone: "+905553330003",
          normalizedPhone: "+905553330003",
        },
        {
          id: duplicate,
          businessId: ids.businessA,
          firstName: "Race Duplicate",
          phone: "05553330003",
          normalizedPhone: "05553330003",
        },
      ]);

      const appointmentId = uuid(302);
      const booking = AppointmentRepository.transaction(async (tx: any) => {
        const resolved = await AppointmentRepository.upsertCustomer(
          tx,
          ids.businessA,
          { firstName: "Race", phone: "05553330003" }
        );
        return AppointmentRepository.createAppointmentRecord(tx, {
          id: appointmentId,
          businessId: ids.businessA,
          customerId: resolved.id,
          staffId: ids.staffProfile,
          serviceId: ids.service,
          startTime: new Date("2027-03-01T09:00:00Z"),
          endTime: new Date("2027-03-01T09:30:00Z"),
          status: "CONFIRMED",
          source: "PUBLIC_WEB",
          serviceNameSnapshot: "Race Snapshot",
          serviceDurationSnapshot: 30,
          servicePriceSnapshot: "300.00",
        });
      });
      const merge = CustomerMergeService.mergeCustomers({
        actorUserId: ids.owner,
        canonicalCustomerId: root,
        selectedCustomerIds: [root, duplicate],
      });

      const results = await Promise.allSettled([booking, merge]);
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[1].status, "fulfilled");

      const [appointment] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointmentId));
      assert.ok(appointment);
      const originalCustomerId = appointment.customerId;
      assert.ok([root, duplicate].includes(originalCustomerId));

      const detail = await customerActions.getCustomerDetailAction(root, ids.businessA);
      assert.equal(detail.success, true);
      assert.ok(detail.history.some((row: any) => row.id === appointmentId));

      const [after] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointmentId));
      assert.equal(after.customerId, originalCustomerId);
      assert.ok(
        results.every(
          (result) =>
            result.status === "fulfilled" ||
            !/SQLSTATE|constraint|23505|stack/i.test(String(result.reason))
        )
      );
    });
  });
});
