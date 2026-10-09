/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const user = {
  owner: uuid(1),
  admin: uuid(2),
  staff: uuid(3),
  ownerB: uuid(4),
  platform: uuid(5),
};
const business = { a: uuid(10), b: uuid(11) };
const member = {
  owner: uuid(20),
  admin: uuid(21),
  staff: uuid(22),
  ownerB: uuid(23),
};
const staffProfileId = uuid(30);
const serviceId = uuid(31);

let pgServer: any;
let db: any;
let schema: any;
let sessionModule: any;
let customerActions: any;
let inArray: any;

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? { id: userId, email: `${userId}@test.local`, forcePasswordChange: false }
      : null;
}

function groupPhone(groupNumber: number, variant: number): string {
  const national = `555${String(groupNumber).padStart(7, "0")}`;
  if (variant === 0) return `+90${national}`;
  if (variant === 1) return `0${national}`;
  if (variant === 2) return national;
  return `90${national}`;
}

async function createGroup(groupNumber: number, count = 3, businessId = business.a) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuid(1000 + groupNumber * 10 + index),
    businessId,
    firstName: `Müşteri ${groupNumber}-${index}`,
    lastName: "Test",
    phone: groupPhone(groupNumber, index),
    normalizedPhone: groupPhone(groupNumber, index),
  }));
  await db.insert(schema.customers).values(rows);
  return rows.map((row) => row.id);
}

async function customerRows(ids: string[]) {
  return db
    .select()
    .from(schema.customers)
    .where(inArray(schema.customers.id, ids));
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  sessionModule = await import("../../src/lib/auth/session");
  customerActions = await import("../../src/actions/customer.actions");
  ({ inArray } = await import("drizzle-orm"));

  await db.execute(
    `INSERT INTO users (id, name, email, email_verified) VALUES
      ('${user.owner}', 'Owner', 'merge-owner@test.local', true),
      ('${user.admin}', 'Admin', 'merge-admin@test.local', true),
      ('${user.staff}', 'Staff', 'merge-staff@test.local', true),
      ('${user.ownerB}', 'Owner B', 'merge-owner-b@test.local', true),
      ('${user.platform}', 'Platform', 'merge-platform@test.local', true)`
  );
  await db.insert(schema.businesses).values([
    { id: business.a, name: "Merge A", slug: "domain-merge-a", timezone: "Europe/Istanbul", currency: "TRY" },
    { id: business.b, name: "Merge B", slug: "domain-merge-b", timezone: "Europe/Istanbul", currency: "TRY" },
  ]);
  await db.insert(schema.businessMembers).values([
    { id: member.owner, businessId: business.a, userId: user.owner, role: "OWNER" },
    { id: member.admin, businessId: business.a, userId: user.admin, role: "ADMIN" },
    { id: member.staff, businessId: business.a, userId: user.staff, role: "STAFF" },
    { id: member.ownerB, businessId: business.b, userId: user.ownerB, role: "OWNER" },
  ]);
  await db.execute(
    `INSERT INTO platform_admins (user_id, role, active) VALUES ('${user.platform}', 'SUPER_ADMIN', true)`
  );
  await db.insert(schema.staffProfiles).values({
    id: staffProfileId,
    businessId: business.a,
    businessMemberId: member.staff,
    firstName: "Usta",
    lastName: "Test",
  });
  await db.insert(schema.services).values({
    id: serviceId,
    businessId: business.a,
    name: "Kesim",
    durationMinutes: 30,
    price: "250.00",
  });
});

after(async () => {
  await pgServer?.stop();
});

describe("TASK 013C.2A logical customer merge domain", () => {
  it("12. denies unauthenticated callers", async () => {
    const ids = await createGroup(1, 2);
    mockSession(null);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, false);
    assert.equal(result.code, "FORBIDDEN");
  });

  it("13. denies STAFF", async () => {
    const ids = await createGroup(2, 2);
    mockSession(user.staff);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, false);
    assert.equal(result.code, "FORBIDDEN");
  });

  it("14. allows OWNER", async () => {
    const ids = await createGroup(3, 2);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, true);
  });

  it("15. allows ADMIN", async () => {
    const ids = await createGroup(4, 2);
    mockSession(user.admin);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, true);
  });

  it("16. denies a platform-only administrator", async () => {
    const ids = await createGroup(5, 2);
    mockSession(user.platform);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, false);
    assert.equal(result.code, "FORBIDDEN");
  });

  it("17. denies cross-tenant merge authority", async () => {
    const ids = await createGroup(6, 2, business.b);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, false);
    assert.equal(result.code, "FORBIDDEN");
  });

  it("18. accepts a complete same-comparison-key group", async () => {
    const ids = await createGroup(7, 3);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, true);
    assert.deepEqual(result.data.aliasCustomerIds.sort(), ids.slice(1).sort());
  });

  it("19. rejects differing comparison keys", async () => {
    const first = await createGroup(8, 2);
    const second = await createGroup(9, 2);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(first[0], [first[0], second[0]]);
    assert.equal(result.success, false);
    assert.equal(result.code, "CUSTOMER_MERGE_NOT_ELIGIBLE");
  });

  it("20. rejects an empty comparison key", async () => {
    const ids = [uuid(1200), uuid(1201)];
    await db.insert(schema.customers).values([
      { id: ids[0], businessId: business.a, firstName: "Boş A", phone: "()", normalizedPhone: "()" },
      { id: ids[1], businessId: business.a, firstName: "Boş B", phone: "-", normalizedPhone: "-" },
    ]);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(ids[0], ids);
    assert.equal(result.success, false);
    assert.equal(result.code, "CUSTOMER_MERGE_NOT_ELIGIBLE");
  });

  it("21. requires the chosen canonical to belong to the selected group", async () => {
    const ids = await createGroup(10, 3);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(ids[0], ids.slice(1));
    assert.equal(result.success, false);
    assert.equal(result.code, "CUSTOMER_MERGE_NOT_ELIGIBLE");
  });

  it("21b. rejects an incomplete stale group selection", async () => {
    const ids = await createGroup(14, 3);
    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(ids[0], ids.slice(0, 2));
    assert.equal(result.success, false);
    assert.equal(result.code, "CUSTOMER_MERGE_STALE");
  });

  const preserved = {
    ids: [] as string[],
    appointmentIds: [] as string[],
    noteIds: [] as string[],
    customerCount: 0,
  };

  it("22. keeps the selected canonical as the root", async () => {
    preserved.ids = await createGroup(11, 3);
    const [canonical, aliasOne, aliasTwo] = preserved.ids;
    const appointmentRows = [aliasOne, aliasTwo].map((customerId, index) => ({
      id: uuid(1300 + index),
      businessId: business.a,
      customerId,
      staffId: staffProfileId,
      serviceId,
      startTime: new Date(`2027-01-0${index + 1}T09:00:00Z`),
      endTime: new Date(`2027-01-0${index + 1}T09:30:00Z`),
      status: "CONFIRMED" as const,
      source: "MANUAL_ADMIN" as const,
      serviceNameSnapshot: "Kesim",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "250.00",
    }));
    await db.insert(schema.appointments).values(appointmentRows);
    preserved.appointmentIds = appointmentRows.map((row) => row.id);
    const notes = [aliasOne, aliasTwo].map((customerId, index) => ({
      id: uuid(1310 + index),
      businessId: business.a,
      customerId,
      content: `Korunan not ${index}`,
      createdByBusinessMemberId: member.owner,
    }));
    await db.insert(schema.customerNotes).values(notes);
    preserved.noteIds = notes.map((note) => note.id);
    preserved.customerCount = (await customerRows(preserved.ids)).length;

    mockSession(user.owner);
    const result = await customerActions.mergeCustomersAction(canonical, preserved.ids);
    assert.equal(result.success, true);
    const rows = await customerRows(preserved.ids);
    assert.equal(rows.find((row: any) => row.id === canonical)?.mergedIntoCustomerId, null);
  });

  it("23. points every alias directly to the canonical", async () => {
    const [canonical] = preserved.ids;
    const rows = await customerRows(preserved.ids);
    assert.ok(rows.filter((row: any) => row.id !== canonical).every((row: any) => row.mergedIntoCustomerId === canonical));
  });

  it("24. persists mergedAt", async () => {
    const rows = await customerRows(preserved.ids);
    assert.ok(rows.filter((row: any) => row.id !== preserved.ids[0]).every((row: any) => row.mergedAt instanceof Date));
  });

  it("25. persists the merge author", async () => {
    const rows = await customerRows(preserved.ids);
    assert.ok(rows.filter((row: any) => row.id !== preserved.ids[0]).every((row: any) => row.mergedByBusinessMemberId === member.owner));
  });

  it("26. leaves appointment customer IDs unchanged", async () => {
    const rows = await db.select().from(schema.appointments).where(inArray(schema.appointments.id, preserved.appointmentIds));
    assert.deepEqual(rows.map((row: any) => row.customerId).sort(), preserved.ids.slice(1).sort());
  });

  it("27. does not delete customer rows", async () => {
    assert.equal((await customerRows(preserved.ids)).length, preserved.customerCount);
  });

  it("28. does not move or delete customer notes", async () => {
    const rows = await db.select().from(schema.customerNotes).where(inArray(schema.customerNotes.id, preserved.noteIds));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row: any) => row.customerId).sort(), preserved.ids.slice(1).sort());
  });

  const flattened = { ids: [] as string[] };

  it("29. flattens an existing alias family into a new canonical", async () => {
    flattened.ids = await createGroup(12, 4);
    const [oldRoot, aliasOne, aliasTwo, newRoot] = flattened.ids;
    await db
      .update(schema.customers)
      .set({ mergedIntoCustomerId: oldRoot, mergedAt: new Date(), mergedByBusinessMemberId: member.owner })
      .where(inArray(schema.customers.id, [aliasOne, aliasTwo]));

    mockSession(user.admin);
    const result = await customerActions.mergeCustomersAction(newRoot, flattened.ids);
    assert.equal(result.success, true);
    const rows = await customerRows(flattened.ids);
    assert.equal(rows.find((row: any) => row.id === newRoot)?.mergedIntoCustomerId, null);
    assert.ok(rows.filter((row: any) => row.id !== newRoot).every((row: any) => row.mergedIntoCustomerId === newRoot));
  });

  it("30. never produces a multi-hop chain", async () => {
    const rows = await customerRows(flattened.ids);
    const byId = new Map(rows.map((row: any) => [row.id, row]));
    for (const row of rows) {
      if (row.mergedIntoCustomerId) {
        assert.equal((byId.get(row.mergedIntoCustomerId) as any).mergedIntoCustomerId, null);
      }
    }
  });

  it("31. never produces a cycle", async () => {
    const rows = await customerRows(flattened.ids);
    for (const row of rows) {
      assert.notEqual(row.mergedIntoCustomerId, row.id);
      const target = rows.find((candidate: any) => candidate.id === row.mergedIntoCustomerId);
      assert.notEqual(target?.mergedIntoCustomerId, row.id);
    }
  });

  const concurrency = { results: [] as any[], ids: [] as string[] };

  it("32. produces one coherent result for concurrent overlapping merges", async () => {
    concurrency.ids = await createGroup(13, 3);
    mockSession(user.owner);
    concurrency.results = await Promise.all([
      customerActions.mergeCustomersAction(concurrency.ids[0], concurrency.ids),
      customerActions.mergeCustomersAction(concurrency.ids[1], concurrency.ids),
    ]);
    assert.equal(concurrency.results.filter((result) => result.success).length, 1);
    const rows = await customerRows(concurrency.ids);
    const roots = rows.filter((row: any) => row.mergedIntoCustomerId === null);
    assert.equal(roots.length, 1);
    assert.ok(rows.filter((row: any) => row.id !== roots[0].id).every((row: any) => row.mergedIntoCustomerId === roots[0].id));
  });

  it("33. gives the concurrency loser a safe stale/conflict result", () => {
    const loser = concurrency.results.find((result) => !result.success);
    assert.ok(loser);
    assert.ok(["CUSTOMER_MERGE_STALE", "CUSTOMER_MERGE_CONFLICT"].includes(loser.code));
  });

  it("34. does not leak raw database errors", async () => {
    const text = JSON.stringify(concurrency.results.find((result) => !result.success));
    assert.doesNotMatch(text, /2350[345]|SQLSTATE|customers_|stack|constraint/i);

    mockSession(user.owner);
    const alias = preserved.ids[1];
    const row = (await customerRows([alias]))[0];
    const edit = await customerActions.updateCustomerProfileAction(alias, {
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
    });
    assert.equal(edit.success, false);
    assert.equal(edit.error, "Birleştirilmiş müşteri kaydı doğrudan düzenlenemez.");
  });
});
