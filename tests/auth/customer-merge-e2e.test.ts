/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  owner: uuid(1),
  admin: uuid(2),
  staff: uuid(3),
  ownerB: uuid(4),
  platform: uuid(5),
  businessA: uuid(10),
  businessB: uuid(11),
  ownerMember: uuid(20),
  adminMember: uuid(21),
  staffMember: uuid(22),
  ownerBMember: uuid(23),
  staffProfile: uuid(30),
  service: uuid(31),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let sessionModule: any;
let customerActions: any;
let CustomerMergeService: any;
let CustomerRepository: any;
let AppointmentRepository: any;
let resolutionService: any;

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? { id: userId, email: `${userId}@test.local`, forcePasswordChange: false }
      : null;
}

function phoneVariants(sequence: number) {
  const national = `557${String(sequence).padStart(7, "0")}`;
  return [`+90${national}`, `0${national}`, national];
}

async function createGroup(sequence: number, options: { crossTenant?: boolean } = {}) {
  const phones = phoneVariants(sequence);
  const rows = [
    {
      id: randomUUID(),
      businessId: ids.businessA,
      firstName: `A-${sequence}`,
      lastName: "Eski",
      phone: phones[0],
      normalizedPhone: phones[0],
      createdAt: new Date("2021-01-01T09:00:00Z"),
    },
    {
      id: randomUUID(),
      businessId: ids.businessA,
      firstName: `B-${sequence}`,
      lastName: "Birincil",
      phone: phones[1],
      normalizedPhone: phones[1],
      createdAt: new Date("2024-01-01T09:00:00Z"),
    },
    {
      id: randomUUID(),
      businessId: ids.businessA,
      firstName: `C-${sequence}`,
      lastName: "Eski",
      phone: phones[2],
      normalizedPhone: phones[2],
      createdAt: new Date("2022-01-01T09:00:00Z"),
    },
  ];
  await db.insert(schema.customers).values(rows);

  let crossTenantId: string | null = null;
  if (options.crossTenant) {
    crossTenantId = randomUUID();
    await db.insert(schema.customers).values({
      id: crossTenantId,
      businessId: ids.businessB,
      firstName: `Yabancı-${sequence}`,
      phone: phones[0],
      normalizedPhone: phones[0],
    });
  }

  return { rows, phones, ids: rows.map((row) => row.id), crossTenantId };
}

async function createHistoricalAppointment(
  customerId: string,
  startTime: Date,
  snapshot: string
) {
  const appointmentId = randomUUID();
  await db.insert(schema.appointments).values({
    id: appointmentId,
    businessId: ids.businessA,
    customerId,
    staffId: ids.staffProfile,
    serviceId: ids.service,
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
    status: "COMPLETED",
    source: "MANUAL_ADMIN",
    serviceNameSnapshot: snapshot,
    serviceDurationSnapshot: 30,
    servicePriceSnapshot: "275.00",
  });
  return appointmentId;
}

async function createHistoricalNote(customerId: string, content: string) {
  const noteId = randomUUID();
  await db.insert(schema.customerNotes).values({
    id: noteId,
    businessId: ids.businessA,
    customerId,
    content,
    createdByBusinessMemberId: ids.ownerMember,
  });
  return noteId;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  sessionModule = await import("../../src/lib/auth/session");
  customerActions = await import("../../src/actions/customer.actions");
  ({ CustomerMergeService } = await import("../../src/services/customer-merge.service"));
  ({ CustomerRepository } = await import("../../src/repositories/customer.repository"));
  ({ AppointmentRepository } = await import("../../src/repositories/appointment.repository"));
  resolutionService = await import("../../src/services/customer-resolution.service");

  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES
    ('${ids.owner}', 'E2E Sahibi', 'merge-e2e-owner@test.local', true),
    ('${ids.admin}', 'E2E Yöneticisi', 'merge-e2e-admin@test.local', true),
    ('${ids.staff}', 'E2E Personeli', 'merge-e2e-staff@test.local', true),
    ('${ids.ownerB}', 'E2E Başka Sahip', 'merge-e2e-owner-b@test.local', true),
    ('${ids.platform}', 'E2E Platform', 'merge-e2e-platform@test.local', true)`);

  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "Merge E2E A",
      slug: "merge-e2e-a",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Merge E2E B",
      slug: "merge-e2e-b",
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
  await db.execute(
    `INSERT INTO platform_admins (user_id, role, active) VALUES ('${ids.platform}', 'SUPER_ADMIN', true)`
  );
  await db.insert(schema.staffProfiles).values({
    id: ids.staffProfile,
    businessId: ids.businessA,
    businessMemberId: ids.staffMember,
    firstName: "E2E",
    lastName: "Usta",
    active: true,
    publicBookingEnabled: true,
  });
  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.businessA,
    name: "E2E Kesim",
    durationMinutes: 30,
    price: "275.00",
    active: true,
  });
});

after(async () => {
  await pgServer?.stop();
});

describe("TASK 013C.2C customer merge end-to-end hardening", () => {
  it("runs the explicit action flow and preserves all physical history", async () => {
    const group = await createGroup(1);
    const [customerA, customerB, customerC] = group.ids;

    const appointmentIds = await Promise.all([
      createHistoricalAppointment(customerA, new Date("2025-01-01T09:00:00Z"), "A Tarihi Hizmet"),
      createHistoricalAppointment(customerB, new Date("2025-01-02T09:00:00Z"), "B Tarihi Hizmet"),
      createHistoricalAppointment(customerC, new Date("2025-01-03T09:00:00Z"), "C Tarihi Hizmet"),
    ]);
    const noteIds = await Promise.all([
      createHistoricalNote(customerA, "A tarihi not"),
      createHistoricalNote(customerB, "B tarihi not"),
      createHistoricalNote(customerC, "C tarihi not"),
    ]);

    const beforeAppointments = await db
      .select({
        id: schema.appointments.id,
        customerId: schema.appointments.customerId,
        snapshot: schema.appointments.serviceNameSnapshot,
      })
      .from(schema.appointments)
      .where(orm.inArray(schema.appointments.id, appointmentIds));
    const beforeNotes = await db
      .select({ id: schema.customerNotes.id, customerId: schema.customerNotes.customerId })
      .from(schema.customerNotes)
      .where(orm.inArray(schema.customerNotes.id, noteIds));

    mockSession(ids.owner);
    const candidatesBeforeMerge = await customerActions.getDuplicateCandidatesAction(
      ids.businessA
    );
    assert.equal(candidatesBeforeMerge.success, true);
    const candidateGroup = candidatesBeforeMerge.data.find((candidate: any) =>
      candidate.customers.some((customer: any) => customer.id === customerA)
    );
    assert.ok(candidateGroup);
    assert.deepEqual(
      candidateGroup.customers
        .map((customer: any) => customer.appointmentCount)
        .sort(),
      [1, 1, 1]
    );

    // B is deliberately the newest candidate. Explicit operator choice wins;
    // no "oldest record" heuristic may override it.
    const merge = await customerActions.mergeCustomersAction(customerB, group.ids);
    assert.equal(merge.success, true);
    assert.equal(merge.data.canonicalCustomerId, customerB);
    assert.equal(merge.data.aliasCustomerIds, undefined);

    const customerRows = await db
      .select()
      .from(schema.customers)
      .where(orm.inArray(schema.customers.id, group.ids));
    assert.equal(customerRows.length, 3);
    assert.equal(customerRows.find((row: any) => row.id === customerB).mergedIntoCustomerId, null);
    assert.ok(
      customerRows
        .filter((row: any) => row.id !== customerB)
        .every(
          (row: any) =>
            row.mergedIntoCustomerId === customerB &&
            row.mergedAt instanceof Date &&
            row.mergedByBusinessMemberId === ids.ownerMember
        )
    );

    const directory = await customerActions.getCustomerDirectoryAction(ids.businessA);
    assert.equal(directory.success, true);
    const familyRows = directory.data.filter((entry: any) => group.ids.includes(entry.customer.id));
    assert.equal(familyRows.length, 1);
    assert.equal(familyRows[0].customer.id, customerB);
    assert.equal(familyRows[0].appointmentCount, 3);

    const duplicates = await customerActions.getDuplicateCandidatesAction(ids.businessA);
    assert.equal(duplicates.success, true);
    assert.ok(
      !duplicates.data.some((candidate: any) =>
        candidate.customers.some((customer: any) => group.ids.includes(customer.id))
      )
    );

    for (const staleAliasId of [customerA, customerC]) {
      const aliasDetail = await customerActions.getCustomerDetailAction(
        staleAliasId,
        ids.businessA
      );
      assert.equal(aliasDetail.success, true);
      assert.equal(aliasDetail.customer.id, customerB);
    }

    const detail = await customerActions.getCustomerDetailAction(customerB, ids.businessA);
    assert.equal(detail.success, true);
    assert.deepEqual(
      detail.history
        .filter((row: any) => appointmentIds.includes(row.id))
        .map((row: any) => row.id)
        .sort(),
      [...appointmentIds].sort()
    );
    assert.deepEqual(
      detail.lineage.map((row: any) => row.firstName).sort(),
      [`A-1`, `C-1`].sort()
    );
    assert.ok(detail.lineage.every((row: any) => row.mergedByName === "E2E Sahibi"));

    const notes = await customerActions.getCustomerNotesAction(customerB, ids.businessA);
    assert.equal(notes.success, true);
    assert.deepEqual(
      notes.notes
        .filter((note: any) => noteIds.includes(note.id))
        .map((note: any) => note.id)
        .sort(),
      [...noteIds].sort()
    );

    const newNote = await customerActions.addCustomerNoteAction(
      customerA,
      "Eski bağlantıdan yeni not",
      ids.businessA
    );
    assert.equal(newNote.success, true);
    assert.equal(newNote.note.customerId, customerB);

    const futureAppointmentId = randomUUID();
    await AppointmentRepository.transaction(async (tx: any) => {
      const resolved = await AppointmentRepository.upsertCustomer(tx, ids.businessA, {
        firstName: "Değişmemeli",
        phone: group.phones[0],
      });
      assert.equal(resolved.id, customerB);
      await AppointmentRepository.createAppointmentRecord(tx, {
        id: futureAppointmentId,
        businessId: ids.businessA,
        customerId: resolved.id,
        staffId: ids.staffProfile,
        serviceId: ids.service,
        startTime: new Date("2030-01-01T09:00:00Z"),
        endTime: new Date("2030-01-01T09:30:00Z"),
        status: "CONFIRMED",
        source: "PUBLIC_WEB",
        serviceNameSnapshot: "Gelecek Hizmet",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "275.00",
      });
    });

    const staleSelectionAppointmentId = randomUUID();
    await AppointmentRepository.transaction(async (tx: any) => {
      const resolved = await resolutionService.resolveCanonicalCustomer(
        tx,
        ids.businessA,
        customerC,
        { lock: true }
      );
      assert.equal(resolved.id, customerB);
      await AppointmentRepository.createAppointmentRecord(tx, {
        id: staleSelectionAppointmentId,
        businessId: ids.businessA,
        customerId: resolved.id,
        staffId: ids.staffProfile,
        serviceId: ids.service,
        startTime: new Date("2030-01-02T09:00:00Z"),
        endTime: new Date("2030-01-02T09:30:00Z"),
        status: "CONFIRMED",
        source: "MANUAL_ADMIN",
        serviceNameSnapshot: "Eski Seçim Hizmeti",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "275.00",
      });
    });

    const afterAppointments = await db
      .select({
        id: schema.appointments.id,
        customerId: schema.appointments.customerId,
        snapshot: schema.appointments.serviceNameSnapshot,
      })
      .from(schema.appointments)
      .where(orm.inArray(schema.appointments.id, appointmentIds));
    const afterNotes = await db
      .select({ id: schema.customerNotes.id, customerId: schema.customerNotes.customerId })
      .from(schema.customerNotes)
      .where(orm.inArray(schema.customerNotes.id, noteIds));
    assert.deepEqual(
      afterAppointments.sort((a: any, b: any) => a.id.localeCompare(b.id)),
      beforeAppointments.sort((a: any, b: any) => a.id.localeCompare(b.id))
    );
    assert.deepEqual(
      afterNotes.sort((a: any, b: any) => a.id.localeCompare(b.id)),
      beforeNotes.sort((a: any, b: any) => a.id.localeCompare(b.id))
    );
  });

  it("returns a safe stale result after another administrator completes the merge", async () => {
    const group = await createGroup(2);
    mockSession(ids.admin);
    const winner = await customerActions.mergeCustomersAction(group.ids[1], group.ids);
    assert.equal(winner.success, true);

    mockSession(ids.owner);
    const stale = await customerActions.mergeCustomersAction(group.ids[0], group.ids);
    assert.equal(stale.success, false);
    assert.ok(["CUSTOMER_MERGE_STALE", "CUSTOMER_MERGE_CONFLICT"].includes(stale.code));
    assert.match(stale.error, /değişti|güvenli biçimde/);
    assert.doesNotMatch(JSON.stringify(stale), /SQLSTATE|2350[345]|constraint|stack|customers_/i);

    const rows = await db
      .select()
      .from(schema.customers)
      .where(orm.inArray(schema.customers.id, group.ids));
    assert.equal(rows.filter((row: any) => row.mergedIntoCustomerId === null).length, 1);
    assert.ok(
      rows
        .filter((row: any) => row.id !== group.ids[1])
        .every((row: any) => row.mergedIntoCustomerId === group.ids[1])
    );
  });

  it("makes two rapid identical action submissions coherent and sanitized", async () => {
    const group = await createGroup(3);
    mockSession(ids.owner);
    const results = await Promise.all([
      customerActions.mergeCustomersAction(group.ids[2], group.ids),
      customerActions.mergeCustomersAction(group.ids[2], group.ids),
    ]);
    assert.equal(results.filter((result: any) => result.success).length, 1);
    const loser = results.find((result: any) => !result.success);
    assert.ok(["CUSTOMER_MERGE_STALE", "CUSTOMER_MERGE_CONFLICT"].includes(loser.code));
    assert.doesNotMatch(JSON.stringify(loser), /SQLSTATE|2350[345]|constraint|stack|customers_/i);

    const rows = await db
      .select()
      .from(schema.customers)
      .where(orm.inArray(schema.customers.id, group.ids));
    assert.equal(rows.filter((row: any) => row.mergedIntoCustomerId === null).length, 1);
    assert.ok(
      rows
        .filter((row: any) => row.id !== group.ids[2])
        .every((row: any) => row.mergedIntoCustomerId === group.ids[2])
    );
  });

  it("survives 25 overlapping owner/admin merges with one complete family each", async () => {
    const counters = {
      iterations: 25,
      coherentFamilies: 0,
      winners: 0,
      safeLosers: 0,
      cycles: 0,
      chains: 0,
      partialGroups: 0,
      lostAppointments: 0,
      lostNotes: 0,
      crossTenantLeaks: 0,
      rawErrors: 0,
    };

    for (let index = 0; index < counters.iterations; index++) {
      const group = await createGroup(100 + index, { crossTenant: true });
      const appointmentId = await createHistoricalAppointment(
        group.ids[0],
        new Date(Date.UTC(2031, 0, index + 1, 9)),
        `Stres ${index}`
      );
      const noteId = await createHistoricalNote(group.ids[2], `Stres not ${index}`);

      const results = await Promise.allSettled([
        CustomerMergeService.mergeCustomers({
          actorUserId: ids.owner,
          canonicalCustomerId: group.ids[0],
          selectedCustomerIds: group.ids,
        }),
        CustomerMergeService.mergeCustomers({
          actorUserId: ids.admin,
          canonicalCustomerId: group.ids[1],
          selectedCustomerIds: group.ids,
        }),
      ]);

      const winners = results.filter((result) => result.status === "fulfilled");
      const losers = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
      counters.winners += winners.length;
      counters.safeLosers += losers.filter((result) =>
        ["CUSTOMER_MERGE_STALE", "CUSTOMER_MERGE_CONFLICT"].includes(result.reason?.code)
      ).length;
      counters.rawErrors += losers.filter((result) =>
        /SQLSTATE|2350[345]|constraint|stack|customers_/i.test(String(result.reason?.message))
      ).length;

      const rows = await db
        .select()
        .from(schema.customers)
        .where(orm.inArray(schema.customers.id, group.ids));
      const roots = rows.filter((row: any) => row.mergedIntoCustomerId === null);
      if (roots.length !== 1) counters.partialGroups++;
      const root = roots[0];
      const aliases = rows.filter((row: any) => row.id !== root?.id);
      const coherent =
        root && aliases.every((row: any) => row.mergedIntoCustomerId === root.id);
      if (coherent) counters.coherentFamilies++;
      if (
        aliases.some((row: any) => {
          const target = rows.find((candidate: any) => candidate.id === row.mergedIntoCustomerId);
          return target?.mergedIntoCustomerId !== null;
        })
      ) {
        counters.chains++;
      }
      if (
        rows.some((row: any) => {
          const target = rows.find((candidate: any) => candidate.id === row.mergedIntoCustomerId);
          return target?.mergedIntoCustomerId === row.id;
        })
      ) {
        counters.cycles++;
      }

      const appointments = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointmentId));
      const notes = await db
        .select()
        .from(schema.customerNotes)
        .where(orm.eq(schema.customerNotes.id, noteId));
      if (appointments.length !== 1 || appointments[0].customerId !== group.ids[0]) {
        counters.lostAppointments++;
      }
      if (notes.length !== 1 || notes[0].customerId !== group.ids[2]) {
        counters.lostNotes++;
      }
      const crossTenant = await db
        .select()
        .from(schema.customers)
        .where(orm.eq(schema.customers.id, group.crossTenantId));
      if (crossTenant[0]?.mergedIntoCustomerId !== null) counters.crossTenantLeaks++;
    }

    assert.deepEqual(counters, {
      iterations: 25,
      coherentFamilies: 25,
      winners: 25,
      safeLosers: 25,
      cycles: 0,
      chains: 0,
      partialGroups: 0,
      lostAppointments: 0,
      lostNotes: 0,
      crossTenantLeaks: 0,
      rawErrors: 0,
    });
  });

  it("preserves five booking-vs-merge races without creating customers or rewriting appointments", async () => {
    for (let index = 0; index < 5; index++) {
      const group = await createGroup(200 + index);
      const appointmentId = randomUUID();
      const booking = AppointmentRepository.transaction(async (tx: any) => {
        const resolved = await AppointmentRepository.upsertCustomer(tx, ids.businessA, {
          firstName: "Yarış Rezervasyonu",
          phone: group.phones[2],
        });
        return AppointmentRepository.createAppointmentRecord(tx, {
          id: appointmentId,
          businessId: ids.businessA,
          customerId: resolved.id,
          staffId: ids.staffProfile,
          serviceId: ids.service,
          startTime: new Date(Date.UTC(2032, 0, index + 1, 9)),
          endTime: new Date(Date.UTC(2032, 0, index + 1, 9, 30)),
          status: "CONFIRMED",
          source: "PUBLIC_WEB",
          serviceNameSnapshot: `Rezervasyon Yarışı ${index}`,
          serviceDurationSnapshot: 30,
          servicePriceSnapshot: "275.00",
        });
      });
      const merge = CustomerMergeService.mergeCustomers({
        actorUserId: ids.owner,
        canonicalCustomerId: group.ids[1],
        selectedCustomerIds: group.ids,
      });
      const results = await Promise.allSettled([booking, merge]);
      assert.ok(results.every((result) => result.status === "fulfilled"));

      const [appointment] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointmentId));
      assert.ok(appointment);
      const originalCustomerId = appointment.customerId;
      assert.ok(group.ids.includes(originalCustomerId));

      const family = await resolutionService.getCustomerFamily(
        db,
        ids.businessA,
        group.ids[1]
      );
      assert.ok(family.customerIds.includes(originalCustomerId));
      const [after] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointmentId));
      assert.equal(after.customerId, originalCustomerId);

      const customers = await db
        .select()
        .from(schema.customers)
        .where(orm.inArray(schema.customers.id, group.ids));
      assert.equal(customers.length, 3);
    }
  });

  it("preserves five note-vs-merge races and exposes every note through the final family", async () => {
    for (let index = 0; index < 5; index++) {
      const group = await createGroup(300 + index);
      const note = CustomerRepository.addNote(
        ids.businessA,
        group.ids[2],
        `Not yarışı ${index}`,
        ids.ownerMember
      );
      const merge = CustomerMergeService.mergeCustomers({
        actorUserId: ids.admin,
        canonicalCustomerId: group.ids[0],
        selectedCustomerIds: group.ids,
      });
      const results = await Promise.allSettled([note, merge]);
      assert.ok(results.every((result) => result.status === "fulfilled"));
      const createdNote = (results[0] as PromiseFulfilledResult<any>).value;
      assert.ok([group.ids[0], group.ids[2]].includes(createdNote.customerId));

      const familyNotes = await CustomerRepository.getNotes(
        ids.businessA,
        group.ids[0]
      );
      assert.ok(familyNotes.some((row: any) => row.id === createdNote.id));
      const [persisted] = await db
        .select()
        .from(schema.customerNotes)
        .where(orm.eq(schema.customerNotes.id, createdNote.id));
      assert.ok(persisted);
      assert.equal(persisted.businessId, ids.businessA);
    }
  });

  it("keeps lineage management-only and the client workflow accessible", async () => {
    const group = await createGroup(400);
    mockSession(ids.owner);
    const merged = await customerActions.mergeCustomersAction(group.ids[0], group.ids);
    assert.equal(merged.success, true);
    const ownerDetail = await customerActions.getCustomerDetailAction(
      group.ids[0],
      ids.businessA
    );
    assert.equal(ownerDetail.success, true);
    assert.equal(ownerDetail.lineage.length, 2);

    mockSession(ids.staff);
    const staffDetail = await customerActions.getCustomerDetailAction(
      group.ids[0],
      ids.businessA
    );
    assert.equal(staffDetail.success, false);
    assert.equal(staffDetail.error, "Yetkisiz işlem.");

    mockSession(ids.platform);
    const platformMerge = await customerActions.mergeCustomersAction(group.ids[0], group.ids);
    assert.equal(platformMerge.success, false);
    assert.equal(platformMerge.code, "FORBIDDEN");

    mockSession(null);
    const publicDetail = await customerActions.getCustomerDetailAction(
      group.ids[0],
      ids.businessA
    );
    assert.equal(publicDetail.success, false);

    const source = readFileSync(
      "src/app/(dashboard)/dashboard/customers/duplicates/duplicate-merge-workflow.tsx",
      "utf8"
    );
    assert.match(source, /type="radio"/);
    assert.match(source, /AlertDialog\.Root/);
    assert.match(source, /aria-busy=\{isPending\}/);
    assert.match(source, /disabled=\{isPending \|\| !selectedCanonicalId\}/);
    assert.doesNotMatch(source, /window\.confirm|confirm\(/);

    const detailSource = readFileSync(
      "src/app/(dashboard)/dashboard/customers/\[customerId\]/page.tsx",
      "utf8"
    );
    assert.match(detailSource, /redirect\(`\/dashboard\/customers\/\$\{result\.customer\.id\}`\)/);
    assert.doesNotMatch(detailSource, /phoneComparisonKey|mergedIntoCustomerId/);
  });
});
