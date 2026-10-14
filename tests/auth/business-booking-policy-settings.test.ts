/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `84000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  owner: uuid(1),
  admin: uuid(2),
  staff: uuid(3),
  platform: uuid(4),
  ownerB: uuid(5),
  businessA: uuid(10),
  businessB: uuid(11),
  ownerMember: uuid(20),
  adminMember: uuid(21),
  staffMember: uuid(22),
  ownerBMember: uuid(23),
  staffProfile: uuid(30),
  service: uuid(40),
  customer: uuid(50),
  appointment: uuid(60),
};

let pgServer: any;
let db: any;
let schema: any;
let eq: any;
let sessionModule: any;
let actions: any;
let presentation: any;
let policyService: any;
let appointmentAccessService: any;
const rawCapability = "A".repeat(43);

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? {
          id: userId,
          email: `${userId}@settings.test`,
          forcePasswordChange: false,
        }
      : null;
}

function payload(
  version: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    expectedVersion: version,
    minimumBookingLeadAmount: "2",
    minimumBookingLeadUnit: "HOUR",
    maximumAdvanceUnlimited: false,
    maximumAdvanceBookingDays: "30",
    cancellationNoticeAmount: "4",
    cancellationNoticeUnit: "HOUR",
    rescheduleNoticeAmount: "12",
    rescheduleNoticeUnit: "HOUR",
    ...overrides,
  };
}

async function record() {
  return policyService.BusinessBookingPolicyService.getForBusiness(ids.businessA);
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  ({ eq } = await import("drizzle-orm"));
  sessionModule = await import("../../src/lib/auth/session");
  actions = await import(
    "../../src/actions/business-booking-policy.actions"
  );
  presentation = await import(
    "../../src/lib/business-booking-policy-presentation"
  );
  policyService = await import(
    "../../src/services/business-booking-policy.service"
  );
  appointmentAccessService = await import(
    "../../src/services/appointment-access.service"
  );

  await db.insert(schema.users).values([
    { id: ids.owner, name: "Sahip", email: "settings-owner@test.local", emailVerified: true },
    { id: ids.admin, name: "Yönetici", email: "settings-admin@test.local", emailVerified: true },
    { id: ids.staff, name: "Personel", email: "settings-staff@test.local", emailVerified: true },
    { id: ids.platform, name: "Platform", email: "settings-platform@test.local", emailVerified: true },
    { id: ids.ownerB, name: "Sahip B", email: "settings-owner-b@test.local", emailVerified: true },
  ]);
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "A İşletmesi",
      slug: "settings-a",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      bookingIntervalMinutes: 30,
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "B İşletmesi",
      slug: "settings-b",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
  ]);
  await db.insert(schema.businessMembers).values([
    { id: ids.ownerMember, businessId: ids.businessA, userId: ids.owner, role: "OWNER" },
    { id: ids.adminMember, businessId: ids.businessA, userId: ids.admin, role: "MANAGER" },
    { id: ids.staffMember, businessId: ids.businessA, userId: ids.staff, role: "STAFF" },
    { id: ids.ownerBMember, businessId: ids.businessB, userId: ids.ownerB, role: "OWNER" },
  ]);
  await db.insert(schema.platformAdmins).values({
    userId: ids.platform,
    role: "SUPER_ADMIN",
  });
  await db.insert(schema.staffProfiles).values({
    id: ids.staffProfile,
    businessId: ids.businessA,
    businessMemberId: ids.staffMember,
    firstName: "Test",
    lastName: "Personeli",
  });
  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.businessA,
    name: "Test Hizmeti",
    durationMinutes: 30,
    price: "350.00",
  });
  await db.insert(schema.staffServices).values({
    businessId: ids.businessA,
    staffId: ids.staffProfile,
    serviceId: ids.service,
  });
  await db.insert(schema.businessWorkingHours).values(
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      businessId: ids.businessA,
      dayOfWeek,
      isClosed: false,
      startTime: "00:00:00",
      endTime: "23:59:00",
    }))
  );
  await db.insert(schema.customers).values({
    id: ids.customer,
    businessId: ids.businessA,
    firstName: "Test",
    phone: "+905550000840",
    normalizedPhone: "+905550000840",
    phoneComparisonKey: "905550000840",
  });
  const startTime = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await db.insert(schema.appointments).values({
    id: ids.appointment,
    businessId: ids.businessA,
    customerId: ids.customer,
    staffId: ids.staffProfile,
    serviceId: ids.service,
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60_000),
    status: "CONFIRMED",
    source: "PUBLIC_WEB",
    serviceNameSnapshot: "Test Hizmeti",
    serviceDurationSnapshot: 30,
    servicePriceSnapshot: "350.00",
  });
  await db.insert(schema.appointmentAccessTokens).values({
    businessId: ids.businessA,
    appointmentId: ids.appointment,
    tokenHash: createHash("sha256").update(rawCapability).digest("hex"),
    expiresAt: new Date(startTime.getTime() + 2 * 24 * 60 * 60_000),
  });
});

after(async () => {
  await pgServer?.stop();
});

beforeEach(async () => {
  mockSession(ids.owner);
  await db
    .update(schema.businesses)
    .set({
      minimumBookingLeadMinutes: 0,
      maximumAdvanceBookingDays: null,
      cancellationNoticeMinutes: 0,
      rescheduleNoticeMinutes: 0,
    })
    .where(eq(schema.businesses.id, ids.businessA));
});

describe("TASK 015B booking policy settings", { concurrency: false }, () => {
  it("denies unauthenticated, STAFF, and platform-only callers", async () => {
    for (const userId of [null, ids.staff, ids.platform]) {
      mockSession(userId);
      const result = await actions.updateBusinessBookingPolicyAction(
        payload((await record()).version)
      );
      assert.equal(result.success, false);
      assert.equal(result.type, "FORBIDDEN");
      assert.doesNotMatch(JSON.stringify(result), /SQLSTATE|constraint|stack/i);
    }
  });

  it("allows OWNER and ADMIN to update all four values", async () => {
    for (const userId of [ids.owner, ids.admin]) {
      mockSession(userId);
      const current = await record();
      const result = await actions.updateBusinessBookingPolicyAction(
        payload(current.version)
      );
      assert.equal(result.success, true);
      const persisted = await record();
      assert.deepEqual(
        {
          lead: persisted.minimumBookingLeadMinutes,
          horizon: persisted.maximumAdvanceBookingDays,
          cancellation: persisted.cancellationNoticeMinutes,
          reschedule: persisted.rescheduleNoticeMinutes,
        },
        { lead: 120, horizon: 30, cancellation: 240, reschedule: 720 }
      );
      await db
        .update(schema.businesses)
        .set({
          minimumBookingLeadMinutes: 0,
          maximumAdvanceBookingDays: null,
          cancellationNoticeMinutes: 0,
          rescheduleNoticeMinutes: 0,
        })
        .where(eq(schema.businesses.id, ids.businessA));
    }
  });

  it("ignores a forged business ID and cannot mutate another tenant", async () => {
    const current = await record();
    const beforeB = await policyService.BusinessBookingPolicyService.getForBusiness(
      ids.businessB
    );
    const result = await actions.updateBusinessBookingPolicyAction({
      ...payload(current.version),
      businessId: ids.businessB,
    } as any);
    assert.equal(result.success, true);
    const afterB = await policyService.BusinessBookingPolicyService.getForBusiness(
      ids.businessB
    );
    assert.equal(afterB.minimumBookingLeadMinutes, beforeB.minimumBookingLeadMinutes);
    assert.equal(afterB.version, beforeB.version);
  });

  it("converts minute/hour/day inputs losslessly and preserves non-divisible minutes", () => {
    assert.equal(
      presentation.parseBookingPolicyFormValues({
        minimumBookingLead: { amount: "30", unit: "MINUTE" },
        maximumAdvanceUnlimited: true,
        maximumAdvanceBookingDays: "",
        cancellationNotice: { amount: "2", unit: "HOUR" },
        rescheduleNotice: { amount: "1", unit: "DAY" },
      }).policy.minimumBookingLeadMinutes,
      30
    );
    assert.equal(
      presentation.parseBookingPolicyFormValues({
        minimumBookingLead: { amount: "30", unit: "MINUTE" },
        maximumAdvanceUnlimited: true,
        maximumAdvanceBookingDays: "",
        cancellationNotice: { amount: "2", unit: "HOUR" },
        rescheduleNotice: { amount: "1", unit: "DAY" },
      }).policy.cancellationNoticeMinutes,
      120
    );
    assert.equal(
      presentation.parseBookingPolicyFormValues({
        minimumBookingLead: { amount: "30", unit: "MINUTE" },
        maximumAdvanceUnlimited: true,
        maximumAdvanceBookingDays: "",
        cancellationNotice: { amount: "2", unit: "HOUR" },
        rescheduleNotice: { amount: "1", unit: "DAY" },
      }).policy.rescheduleNoticeMinutes,
      1_440
    );
    assert.deepEqual(presentation.minutesToPolicyDurationInput(120), {
      amount: "2",
      unit: "HOUR",
    });
    assert.deepEqual(presentation.minutesToPolicyDurationInput(1_500), {
      amount: "1500",
      unit: "MINUTE",
    });
  });

  it("supports zero notices, finite horizon, and unlimited NULL", async () => {
    let current = await record();
    let result = await actions.updateBusinessBookingPolicyAction(
      payload(current.version, {
        cancellationNoticeAmount: "0",
        cancellationNoticeUnit: "MINUTE",
        rescheduleNoticeAmount: "0",
        rescheduleNoticeUnit: "MINUTE",
        maximumAdvanceUnlimited: true,
        maximumAdvanceBookingDays: "730",
      })
    );
    assert.equal(result.success, true);
    current = await record();
    assert.equal(current.maximumAdvanceBookingDays, null);
    assert.equal(current.cancellationNoticeMinutes, 0);
    assert.equal(current.rescheduleNoticeMinutes, 0);

    result = await actions.updateBusinessBookingPolicyAction(
      payload(current.version, { maximumAdvanceBookingDays: "45" })
    );
    assert.equal(result.success, true);
    assert.equal((await record()).maximumAdvanceBookingDays, 45);
  });

  it("rejects negative, decimal, overflow, and excessive values with zero mutation", async () => {
    for (const overrides of [
      { minimumBookingLeadAmount: "-1" },
      { cancellationNoticeAmount: "1.5" },
      { rescheduleNoticeAmount: "9007199254740992", rescheduleNoticeUnit: "DAY" },
      { maximumAdvanceBookingDays: "731" },
    ]) {
      const before = await record();
      const result = await actions.updateBusinessBookingPolicyAction(
        payload(before.version, overrides)
      );
      assert.equal(result.success, false);
      assert.equal(result.type, "INVALID");
      const after = await record();
      assert.deepEqual(
        [
          after.minimumBookingLeadMinutes,
          after.maximumAdvanceBookingDays,
          after.cancellationNoticeMinutes,
          after.rescheduleNoticeMinutes,
        ],
        [
          before.minimumBookingLeadMinutes,
          before.maximumAdvanceBookingDays,
          before.cancellationNoticeMinutes,
          before.rescheduleNoticeMinutes,
        ]
      );
    }
  });

  it("updates atomically without touching unrelated business, appointment, or token fields", async () => {
    const [businessBefore] = await db
      .select()
      .from(schema.businesses)
      .where(eq(schema.businesses.id, ids.businessA));
    const [appointmentBefore] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, ids.appointment));
    const [tokenBefore] = await db.select().from(schema.appointmentAccessTokens);

    const result = await actions.updateBusinessBookingPolicyAction(
      payload((await record()).version)
    );
    assert.equal(result.success, true);

    const [businessAfter] = await db
      .select()
      .from(schema.businesses)
      .where(eq(schema.businesses.id, ids.businessA));
    const [appointmentAfter] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, ids.appointment));
    const [tokenAfter] = await db.select().from(schema.appointmentAccessTokens);
    for (const field of [
      "name",
      "slug",
      "timezone",
      "currency",
      "bookingIntervalMinutes",
      "active",
      "onboardingCompletedAt",
    ]) {
      assert.deepEqual(businessAfter[field], businessBefore[field], field);
    }
    assert.deepEqual(appointmentAfter, appointmentBefore);
    assert.deepEqual(tokenAfter, tokenBefore);
  });

  it("rejects stale OWNER and ADMIN forms and reloads current truth", async () => {
    const initial = await record();
    mockSession(ids.owner);
    const winner = await actions.updateBusinessBookingPolicyAction(
      payload(initial.version, { minimumBookingLeadAmount: "3" })
    );
    assert.equal(winner.success, true);

    for (const userId of [ids.owner, ids.admin]) {
      mockSession(userId);
      const stale = await actions.updateBusinessBookingPolicyAction(
        payload(initial.version, { minimumBookingLeadAmount: "9" })
      );
      assert.equal(stale.success, false);
      assert.equal(stale.type, "STALE");
      assert.equal(stale.data.values.minimumBookingLead.amount, "3");
      assert.equal(stale.data.values.minimumBookingLead.unit, "HOUR");
      assert.doesNotMatch(JSON.stringify(stale), /SQLSTATE|constraint|stack/i);
    }
    assert.equal((await record()).minimumBookingLeadMinutes, 180);
  });

  it("serializes two concurrent updates with exactly one winner", async () => {
    mockSession(ids.owner);
    const initial = await record();
    const results = await Promise.all([
      actions.updateBusinessBookingPolicyAction(
        payload(initial.version, { minimumBookingLeadAmount: "5" })
      ),
      actions.updateBusinessBookingPolicyAction(
        payload(initial.version, { minimumBookingLeadAmount: "6" })
      ),
    ]);
    assert.equal(results.filter((result: any) => result.success).length, 1);
    assert.equal(
      results.filter((result: any) => result.type === "STALE").length,
      1
    );
    assert.ok([300, 360].includes((await record()).minimumBookingLeadMinutes));
  });

  it("keeps navigation role-aware and public policy guidance accessible", async () => {
    const [shell, page, form, schedule, management] = await Promise.all([
      readFile("src/components/layout/dashboard-shell.tsx", "utf8"),
      readFile(
        "src/app/(dashboard)/dashboard/settings/booking/page.tsx",
        "utf8"
      ),
      readFile(
        "src/app/(dashboard)/dashboard/settings/booking/booking-policy-settings-form.tsx",
        "utf8"
      ),
      readFile("src/app/book/[slug]/schedule/schedule-flow.tsx", "utf8"),
      readFile(
        "src/app/(public)/randevu/appointment-management-client.tsx",
        "utf8"
      ),
    ]);
    assert.match(shell, /userRole === "OWNER" \|\| userRole === "MANAGER"/);
    assert.match(shell, /\/dashboard\/settings\/booking/);
    assert.match(page, /membership\.role !== "OWNER"/);
    assert.match(form, /Sınırsız/);
    assert.match(form, /aria-live/);
    assert.match(form, /Müşteri İşlem Kuralları/);
    assert.match(schedule, /max=\{maximumLocalDate \?\? undefined\}/);
    assert.match(management, /Çevrim içi iptal süresi doldu/);
    assert.match(management, /Çevrim içi değişiklik süresi doldu/);
  });

  it("reflects current notice policy and horizon in the secure management DTO", async () => {
    const before = await appointmentAccessService.AppointmentAccessService.resolve(
      rawCapability
    );
    assert.equal(before.canCancel, true);
    assert.equal(before.canReschedule, true);
    assert.equal(before.cancellationWindowClosed, false);
    assert.equal(before.rescheduleWindowClosed, false);

    await db
      .update(schema.businesses)
      .set({
        maximumAdvanceBookingDays: 30,
        cancellationNoticeMinutes: 8 * 24 * 60,
        rescheduleNoticeMinutes: 8 * 24 * 60,
      })
      .where(eq(schema.businesses.id, ids.businessA));

    const after = await appointmentAccessService.AppointmentAccessService.resolve(
      rawCapability
    );
    assert.equal(after.canCancel, false);
    assert.equal(after.canReschedule, false);
    assert.equal(after.cancellationWindowClosed, true);
    assert.equal(after.rescheduleWindowClosed, true);
    assert.match(after.maximumRescheduleLocalDate, /^\d{4}-\d{2}-\d{2}$/);
  });
});
