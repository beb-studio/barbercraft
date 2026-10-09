/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let workingHoursActions: any;
let workingHoursService: any;
let workingHoursRepo: any;
let onboardingModule: any;
let businesses: any;
let businessMembers: any;
let businessWorkingHours: any;
let eq: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const userNoBiz = uuid(301);
const userStaff = uuid(302);
const userOwner1 = uuid(303);
const userOwner2 = uuid(304);

const biz1 = uuid(10);
const biz2 = uuid(20);

before(async () => {
  pgServer = await startDatabase({ port: 54402 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  workingHoursActions = await import("../../src/actions/working-hours.actions");
  workingHoursService = await import("../../src/services/working-hours.service");
  workingHoursRepo = await import("../../src/repositories/working-hours.repository");
  onboardingModule = await import("../../src/lib/auth/onboarding");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  businessWorkingHours = schema.businessWorkingHours;

  const orm = await import("drizzle-orm");
  eq = orm.eq;

  // Insert mock users
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userStaff}', 'Staff User', 'staff@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwner1}', 'Owner 1', 'owner1@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwner2}', 'Owner 2', 'owner2@test.com', true)`);

  // Insert Businesses with onboardingCompletedAt = NULL
  await db.insert(businesses).values([
    {
      id: biz1,
      name: "Barber One",
      slug: "barber-one",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: null,
    },
    {
      id: biz2,
      name: "Barber Two",
      slug: "barber-two",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: null,
    },
  ]);

  // Insert Memberships:
  // userOwner1 is OWNER of biz1
  // userStaff is STAFF of biz1
  // userOwner2 is OWNER of biz2
  await db.insert(businessMembers).values([
    {
      businessId: biz1,
      userId: userOwner1,
      role: "OWNER",
    },
    {
      businessId: biz1,
      userId: userStaff,
      role: "STAFF",
    },
    {
      businessId: biz2,
      userId: userOwner2,
      role: "OWNER",
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("Business Working Hours Onboarding Tests", () => {
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

  const createValidSchedule = () => [
    { dayOfWeek: 1, startTime: "09:00", endTime: "20:00", isClosed: false },
    { dayOfWeek: 2, startTime: "09:00", endTime: "20:00", isClosed: false },
    { dayOfWeek: 3, startTime: "09:00", endTime: "20:00", isClosed: false },
    { dayOfWeek: 4, startTime: "09:00", endTime: "20:00", isClosed: false },
    { dayOfWeek: 5, startTime: "09:00", endTime: "20:00", isClosed: false },
    { dayOfWeek: 6, startTime: "09:00", endTime: "20:00", isClosed: false },
    { dayOfWeek: 0, startTime: "09:00", endTime: "20:00", isClosed: true },
  ];

  it("1. unauthenticated user cannot save working hours", async () => {
    mockSession(null);
    const res = await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());
    assert.equal(res.success, false);
    assert.equal(res.error, "Yetkisiz işlem. Lütfen giriş yapın.");
  });

  it("2. user with no business cannot save working hours", async () => {
    mockSession(userNoBiz);
    const res = await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());
    assert.equal(res.success, false);
    assert.equal(res.error, "İşletme bulunamadı. Lütfen önce işletme kaydını tamamlayın.");
  });

  it("3. STAFF cannot save business working hours", async () => {
    mockSession(userStaff);
    const res = await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());
    assert.equal(res.success, false);
    assert.equal(res.error, "Çalışma saatlerini yalnızca işletme SAHİBİ belirleyebilir.");
  });

  it("4. OWNER of another business cannot modify this business (target resolved from session)", async () => {
    // userOwner2 calls action, which resolves userOwner2's business (biz2), NOT biz1
    mockSession(userOwner2);
    const res = await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());
    assert.equal(res.success, true);

    // Verify biz1 still has 0 rows, biz2 received the rows
    const rowsBiz1 = await db.select().from(businessWorkingHours).where(eq(businessWorkingHours.businessId, biz1));
    assert.equal(rowsBiz1.length, 0);

    const rowsBiz2 = await db.select().from(businessWorkingHours).where(eq(businessWorkingHours.businessId, biz2));
    assert.equal(rowsBiz2.length, 7);
  });

  it("5. valid seven-day schedule saves successfully", async () => {
    mockSession(userOwner1);
    const res = await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());
    assert.equal(res.success, true);

    const rows = await db.select().from(businessWorkingHours).where(eq(businessWorkingHours.businessId, biz1));
    assert.equal(rows.length, 7);
  });

  it("6. open day with start >= end fails", async () => {
    mockSession(userOwner1);
    const invalidSchedule = createValidSchedule();
    // Monday open with start 20:00, end 09:00
    invalidSchedule[0] = { dayOfWeek: 1, startTime: "20:00", endTime: "09:00", isClosed: false };

    const res = await workingHoursActions.saveBusinessWorkingHoursAction(invalidSchedule);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("strictly before end time"));
  });

  it("7. malformed time fails", async () => {
    mockSession(userOwner1);
    const invalidSchedule = createValidSchedule();
    invalidSchedule[0] = { dayOfWeek: 1, startTime: "invalid-time", endTime: "20:00", isClosed: false };

    const res = await workingHoursActions.saveBusinessWorkingHoursAction(invalidSchedule);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("invalid start or end time format"));
  });

  it("8. duplicate day payload fails", async () => {
    mockSession(userOwner1);
    const duplicateSchedule = createValidSchedule();
    // Replace Sunday (0) with Monday (1)
    duplicateSchedule[6] = { dayOfWeek: 1, startTime: "09:00", endTime: "20:00", isClosed: false };

    const res = await workingHoursActions.saveBusinessWorkingHoursAction(duplicateSchedule);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Duplicate day of week"));
  });

  it("9. closed day ignores/normalizes submitted time values to NULL", async () => {
    mockSession(userOwner1);
    const schedule = createValidSchedule();
    // Sunday (0) marked closed with time submitted
    schedule[6] = { dayOfWeek: 0, startTime: "10:00", endTime: "18:00", isClosed: true };

    const res = await workingHoursActions.saveBusinessWorkingHoursAction(schedule);
    assert.equal(res.success, true);

    const sundayRow = (
      await db.select().from(businessWorkingHours).where(eq(businessWorkingHours.businessId, biz1))
    ).find((r: any) => r.dayOfWeek === 0);

    assert.ok(sundayRow);
    assert.equal(sundayRow.isClosed, true);
    assert.equal(sundayRow.startTime, null);
    assert.equal(sundayRow.endTime, null);
  });

  it("10. save operation creates no duplicate weekday rows", async () => {
    mockSession(userOwner1);
    // Save once
    await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());
    // Save twice
    await workingHoursActions.saveBusinessWorkingHoursAction(createValidSchedule());

    const rows = await db.select().from(businessWorkingHours).where(eq(businessWorkingHours.businessId, biz1));
    assert.equal(rows.length, 7);

    const days = rows.map((r: any) => r.dayOfWeek).sort();
    assert.deepEqual(days, [0, 1, 2, 3, 4, 5, 6]);
  });

  it("11. revisiting and editing working hours updates existing rows correctly", async () => {
    mockSession(userOwner1);
    const editedSchedule = createValidSchedule();
    // Change Saturday (6) to 10:00 - 18:00
    editedSchedule[5] = { dayOfWeek: 6, startTime: "10:00", endTime: "18:00", isClosed: false };

    const res = await workingHoursActions.saveBusinessWorkingHoursAction(editedSchedule);
    assert.equal(res.success, true);

    const rows = await workingHoursService.getWorkingHours(biz1);
    const sat = rows.find((r: any) => r.dayOfWeek === 6);
    assert.ok(sat);
    assert.equal(sat.startTime?.slice(0, 5), "10:00");
    assert.equal(sat.endTime?.slice(0, 5), "18:00");
  });

  it("12. transaction rollback prevents partial weekly schedule", async () => {
    // Attempting a raw repository replace with an invalid day number that triggers check constraint violation
    const invalidBatch = [
      { dayOfWeek: 1, startTime: "09:00:00", endTime: "20:00:00", isClosed: false },
      { dayOfWeek: 99, startTime: "09:00:00", endTime: "20:00:00", isClosed: false }, // violates check_bwh_day_of_week
    ];

    let caught = false;
    try {
      await workingHoursRepo.replaceBusinessWorkingHours(biz1, invalidBatch);
    } catch {
      caught = true;
    }
    assert.equal(caught, true);

    // Verify biz1 still retains previous intact 7 rows (not partially replaced or empty)
    const rows = await db.select().from(businessWorkingHours).where(eq(businessWorkingHours.businessId, biz1));
    assert.equal(rows.length, 7);
  });

  it("13. once all seven rows exist, onboarding progression resolves to FIRST_SERVICE", async () => {
    mockSession(userOwner1);
    const step = await onboardingModule.getOnboardingStep();
    assert.equal(step, "FIRST_SERVICE");
  });

  it("14. onboarding_completed_at remains NULL", async () => {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, biz1));
    assert.equal(biz.onboardingCompletedAt, null);
  });
});
