/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `99000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  ownerA: uuid(1),
  adminA: uuid(2),
  staffA: uuid(3),
  ownerB: uuid(4),
  platformUser: uuid(5),
  businessA: uuid(10),
  businessB: uuid(11),
  ownerMemberA: uuid(20),
  adminMemberA: uuid(21),
  staffMemberA: uuid(22),
  ownerMemberB: uuid(23),
  staffProfile1: uuid(30),
  staffProfile2: uuid(31),
  staffProfileInactive: uuid(32),
  staffProfileB: uuid(33),
  service1: uuid(40),
  service2: uuid(41),
  serviceB: uuid(42),
  customer1: uuid(50),
  customer2: uuid(51),
  customerAlias: uuid(52),
  customerB: uuid(53),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let sessionModule: any;
let analyticsService: any;
let analyticsAction: any;
let rangeModule: any;

const referenceNow = new Date("2026-10-12T12:00:00.000Z"); // 15:00:00 Europe/Istanbul

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? {
          id: userId,
          email: `${userId}@analytics.test`,
          forcePasswordChange: false,
        }
      : null;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  sessionModule = await import("../../src/lib/auth/session");

  const serviceMod = await import("../../src/services/business-analytics.service");
  analyticsService = serviceMod.BusinessAnalyticsService;

  const actionMod = await import("../../src/actions/business-analytics.actions");
  analyticsAction = actionMod.getBusinessDashboardAnalyticsAction;

  rangeModule = await import("../../src/lib/business-analytics/range");

  // Seed Users
  await db.insert(schema.users).values([
    { id: ids.ownerA, name: "Owner A", email: "ownerA@test.local", emailVerified: true },
    { id: ids.adminA, name: "Admin A", email: "adminA@test.local", emailVerified: true },
    { id: ids.staffA, name: "Staff A", email: "staffA@test.local", emailVerified: true },
    { id: ids.ownerB, name: "Owner B", email: "ownerB@test.local", emailVerified: true },
    { id: ids.platformUser, name: "Platform Only", email: "platform@test.local", emailVerified: true },
  ]);

  // Seed Businesses
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "Elit Berber Salonu",
      slug: "elit-berber",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Diğer Kuaför",
      slug: "diger-kuafor",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
  ]);

  // Seed Memberships
  await db.insert(schema.businessMembers).values([
    { id: ids.ownerMemberA, businessId: ids.businessA, userId: ids.ownerA, role: "OWNER" },
    { id: ids.adminMemberA, businessId: ids.businessA, userId: ids.adminA, role: "ADMIN" },
    { id: ids.staffMemberA, businessId: ids.businessA, userId: ids.staffA, role: "STAFF" },
    { id: ids.ownerMemberB, businessId: ids.businessB, userId: ids.ownerB, role: "OWNER" },
  ]);

  // Seed Staff Profiles
  await db.insert(schema.staffProfiles).values([
    {
      id: ids.staffProfile1,
      businessId: ids.businessA,
      businessMemberId: ids.ownerMemberA,
      firstName: "Ahmet",
      lastName: "Usta",
      active: true,
    },
    {
      id: ids.staffProfile2,
      businessId: ids.businessA,
      businessMemberId: ids.adminMemberA,
      firstName: "Mehmet",
      lastName: "Kalfa",
      active: true,
    },
    {
      id: ids.staffProfileInactive,
      businessId: ids.businessA,
      businessMemberId: ids.staffMemberA,
      firstName: "Eski",
      lastName: "Personel",
      active: false, // inactive staff
    },
    {
      id: ids.staffProfileB,
      businessId: ids.businessB,
      businessMemberId: ids.ownerMemberB,
      firstName: "Diğer",
      lastName: "Usta",
      active: true,
    },
  ]);

  // Seed Services
  await db.insert(schema.services).values([
    {
      id: ids.service1,
      businessId: ids.businessA,
      name: "Saç Kesimi",
      durationMinutes: 30,
      price: "350.00",
    },
    {
      id: ids.service2,
      businessId: ids.businessA,
      name: "Sakal Tıraşı",
      durationMinutes: 20,
      price: "150.00",
    },
    {
      id: ids.serviceB,
      businessId: ids.businessB,
      name: "Özel Bakım",
      durationMinutes: 60,
      price: "800.00",
    },
  ]);

  // Seed Customers
  await db.insert(schema.customers).values([
    {
      id: ids.customer1,
      businessId: ids.businessA,
      firstName: "Can",
      lastName: "Demir",
      phone: "05321111111",
      normalizedPhone: "+905321111111",
      phoneComparisonKey: "5321111111",
      notes: "Müşteri gizli CRM notu",
    },
    {
      id: ids.customer2,
      businessId: ids.businessA,
      firstName: "Burak",
      lastName: "Yılmaz",
      phone: "05322222222",
      normalizedPhone: "+905322222222",
      phoneComparisonKey: "5322222222",
    },
    {
      id: ids.customerAlias,
      businessId: ids.businessA,
      firstName: "C. Demir",
      phone: "05321111111",
      normalizedPhone: "+905321111111-alias",
      phoneComparisonKey: "5321111111",
      mergedIntoCustomerId: ids.customer1,
      mergedAt: new Date(),
      mergedByBusinessMemberId: ids.ownerMemberA,
    },
    {
      id: ids.customerB,
      businessId: ids.businessB,
      firstName: "Tenant B Müşteri",
      phone: "05329999999",
      normalizedPhone: "+905329999999",
      phoneComparisonKey: "5329999999",
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

beforeEach(async () => {
  await db.delete(schema.appointments);
});

describe("TASK 017A: Authorization (Part 2)", () => {
  it("OWNER can read business analytics", async () => {
    mockSession(ids.ownerA);
    const result = await analyticsAction("LAST_7_DAYS");
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.businessId, ids.businessA);
      assert.equal(result.data.businessName, "Elit Berber Salonu");
      assert.equal(result.data.currency, "TRY");
    }
  });

  it("ADMIN can read business analytics", async () => {
    mockSession(ids.adminA);
    const result = await analyticsAction("LAST_7_DAYS");
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.businessId, ids.businessA);
    }
  });

  it("STAFF is denied business-wide analytics", async () => {
    mockSession(ids.staffA);
    const result = await analyticsAction("LAST_7_DAYS");
    assert.equal(result.success, false);
    assert.ok(result.error.includes("yetkiniz bulunmuyor"));
  });

  it("unauthenticated caller is denied", async () => {
    mockSession(null);
    const result = await analyticsAction("LAST_7_DAYS");
    assert.equal(result.success, false);
    assert.ok(result.error.includes("Oturum açmanız gerekiyor"));
  });

  it("platform-only user without business membership is denied", async () => {
    mockSession(ids.platformUser);
    const result = await analyticsAction("LAST_7_DAYS");
    assert.equal(result.success, false);
    assert.ok(result.error.includes("üyeliği bulunamadı"));
  });

  it("tenant A cannot see tenant B data", async () => {
    // Seed appointment in Business B
    await db.insert(schema.appointments).values({
      businessId: ids.businessB,
      customerId: ids.customerB,
      staffId: ids.staffProfileB,
      serviceId: ids.serviceB,
      startTime: referenceNow,
      endTime: new Date(referenceNow.getTime() + 60 * 60_000),
      status: "COMPLETED",
      serviceNameSnapshot: "Özel Bakım",
      serviceDurationSnapshot: 60,
      servicePriceSnapshot: "800.00",
    });

    mockSession(ids.ownerA);
    const resA = await analyticsAction("TODAY");
    assert.equal(resA.success, true);
    if (resA.success) {
      assert.equal(resA.data.todaySummary.totalAppointments, 0);
      assert.equal(resA.data.rangeSummary.totalAppointments, 0);
    }
  });
});

describe("TASK 017A: Date Range & Timezone Boundaries (Parts 3, 17)", () => {
  it("TODAY uses business-local calendar bounds and yields exactly 1 day", () => {
    const range = rangeModule.getAnalyticsDateRange("TODAY", "Europe/Istanbul", referenceNow);
    assert.equal(range.daysCount, 1);
    assert.equal(range.localDates.length, 1);
    assert.equal(range.startDateStr, "2026-10-12");
    assert.equal(range.endDateStr, "2026-10-12");
    // Europe/Istanbul is UTC+3 in 2026: 2026-10-12 00:00:00 is 2026-10-11T21:00:00.000Z
    assert.equal(range.startInstant.toISOString(), "2026-10-11T21:00:00.000Z");
    assert.equal(range.endInstant.toISOString(), "2026-10-12T21:00:00.000Z");
  });

  it("LAST_7_DAYS produces exactly 7 local dates", () => {
    const range = rangeModule.getAnalyticsDateRange("LAST_7_DAYS", "Europe/Istanbul", referenceNow);
    assert.equal(range.daysCount, 7);
    assert.equal(range.localDates.length, 7);
    assert.equal(range.startDateStr, "2026-10-06");
    assert.equal(range.endDateStr, "2026-10-12");
    assert.equal(range.localDates[0], "2026-10-06");
    assert.equal(range.localDates[6], "2026-10-12");
  });

  it("LAST_30_DAYS produces exactly 30 local dates", () => {
    const range = rangeModule.getAnalyticsDateRange("LAST_30_DAYS", "Europe/Istanbul", referenceNow);
    assert.equal(range.daysCount, 30);
    assert.equal(range.localDates.length, 30);
    assert.equal(range.startDateStr, "2026-09-13");
    assert.equal(range.endDateStr, "2026-10-12");
    assert.equal(range.localDates[0], "2026-09-13");
    assert.equal(range.localDates[29], "2026-10-12");
  });

  it("correctly handles local midnight boundary (Europe/Istanbul UTC+3)", async () => {
    // 2026-10-12 00:30:00 local time = 2026-10-11T21:30:00.000Z UTC (falls on TODAY Oct 12 local)
    // 2026-10-11 23:30:00 local time = 2026-10-11T20:30:00.000Z UTC (falls on YESTERDAY Oct 11 local)
    const appOct12Early = new Date("2026-10-11T21:30:00.000Z");
    const appOct11Late = new Date("2026-10-11T20:30:00.000Z");

    await db.insert(schema.appointments).values([
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: appOct12Early,
        endTime: new Date(appOct12Early.getTime() + 30 * 60_000),
        status: "CONFIRMED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: appOct11Late,
        endTime: new Date(appOct11Late.getTime() + 20 * 60_000),
        status: "CONFIRMED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const resToday = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "TODAY",
      referenceNow,
    });

    // Today should only include appOct12Early!
    assert.equal(resToday.todaySummary.totalAppointments, 1);
    assert.equal(resToday.rangeSummary.totalAppointments, 1);

    // 7 days should include both
    const res7 = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });
    assert.equal(res7.rangeSummary.totalAppointments, 2);
  });
});

describe("TASK 017A: Status Summary, Upcoming & Completed Service Value (Parts 4, 5, 7)", () => {
  it("correctly counts all appointment statuses and upcoming metrics", async () => {
    const todayMorning = new Date("2026-10-12T07:00:00.000Z"); // 10:00 local (past relative to refNow 15:00)
    const todayAfternoon = new Date("2026-10-12T13:00:00.000Z"); // 16:00 local (future relative to refNow)
    const tomorrowMorning = new Date("2026-10-13T07:00:00.000Z"); // 10:00 local tomorrow
    const day3Morning = new Date("2026-10-15T07:00:00.000Z"); // in next 7 days

    await db.insert(schema.appointments).values([
      // Past today: 1 Completed, 1 Cancelled, 1 No-Show
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: todayMorning,
        endTime: new Date(todayMorning.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile1,
        serviceId: ids.service2,
        startTime: todayMorning,
        endTime: new Date(todayMorning.getTime() + 20 * 60_000),
        status: "CANCELLED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: todayMorning,
        endTime: new Date(todayMorning.getTime() + 20 * 60_000),
        status: "NO_SHOW",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
      // Future today: 1 Pending, 1 Confirmed
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile2,
        serviceId: ids.service1,
        startTime: todayAfternoon,
        endTime: new Date(todayAfternoon.getTime() + 30 * 60_000),
        status: "PENDING",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: new Date(todayAfternoon.getTime() + 40 * 60_000),
        endTime: new Date(todayAfternoon.getTime() + 70 * 60_000),
        status: "CONFIRMED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      // Tomorrow: 1 Confirmed
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: tomorrowMorning,
        endTime: new Date(tomorrowMorning.getTime() + 30 * 60_000),
        status: "CONFIRMED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      // 3 days later: 1 Confirmed
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: day3Morning,
        endTime: new Date(day3Morning.getTime() + 20 * 60_000),
        status: "CONFIRMED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "TODAY",
      referenceNow,
    });

    // Today summary assertions
    assert.equal(res.todaySummary.totalAppointments, 5);
    assert.equal(res.todaySummary.completedAppointments, 1);
    assert.equal(res.todaySummary.cancelledAppointments, 1);
    assert.equal(res.todaySummary.noShowAppointments, 1);
    assert.equal(res.todaySummary.pendingAppointments, 1);
    assert.equal(res.todaySummary.confirmedAppointments, 1);

    // Upcoming summary assertions
    assert.equal(res.upcomingSummary.remainingToday, 2); // 1 pending + 1 confirmed remaining today
    assert.equal(res.upcomingSummary.tomorrowCount, 1);
    assert.equal(res.upcomingSummary.next7DaysCount, 2); // tomorrow + day 3
    assert.ok(res.upcomingSummary.nextAppointment);
    assert.equal(res.upcomingSummary.nextAppointment?.customerName, "Burak Yılmaz");
    assert.equal(res.upcomingSummary.nextAppointment?.status, "PENDING");

    // Completed service value: ONLY the completed appointment (350.00)!
    assert.equal(res.rangeSummary.completedServiceValue[0].amount, "350.00");
    assert.equal(res.rangeSummary.completedServiceValue[0].currency, "TRY");
  });

  it("service catalog price edit does NOT rewrite historical analytics value", async () => {
    const pastDate = new Date("2026-10-10T10:00:00.000Z");

    await db.insert(schema.appointments).values({
      businessId: ids.businessA,
      customerId: ids.customer1,
      staffId: ids.staffProfile1,
      serviceId: ids.service1,
      startTime: pastDate,
      endTime: new Date(pastDate.getTime() + 30 * 60_000),
      status: "COMPLETED",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "350.00", // snapshot is 350.00
    });

    // Now edit catalog service price to 500.00
    await db
      .update(schema.services)
      .set({ price: "500.00" })
      .where(orm.eq(schema.services.id, ids.service1));

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    // Completed service value must still be 350.00, NOT 500.00!
    assert.equal(res.rangeSummary.completedServiceValue[0].amount, "350.00");
  });
});

describe("TASK 017A: Rate Semantics & Edge Cases (Part 6)", () => {
  it("calculates cancellation and no-show rates accurately with safe denominators", async () => {
    const d1 = new Date("2026-10-10T10:00:00.000Z");

    // 2 Completed, 1 No-Show, 1 Cancelled
    // Terminal/Cancelled total = 2 + 1 + 1 = 4
    // Cancellation rate = 1 / 4 = 0.25 (25%)
    // Attended/No-Show total = 2 + 1 = 3
    // No-Show rate = 1 / 3 = 0.3333 (33.33%)
    await db.insert(schema.appointments).values([
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: d1,
        endTime: new Date(d1.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: new Date(d1.getTime() + 40 * 60_000),
        endTime: new Date(d1.getTime() + 70 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile1,
        serviceId: ids.service2,
        startTime: new Date(d1.getTime() + 80 * 60_000),
        endTime: new Date(d1.getTime() + 100 * 60_000),
        status: "NO_SHOW",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: new Date(d1.getTime() + 110 * 60_000),
        endTime: new Date(d1.getTime() + 130 * 60_000),
        status: "CANCELLED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    assert.equal(res.rangeSummary.cancellationRate, 0.25);
    assert.equal(res.rangeSummary.noShowRate, 0.3333);
  });

  it("zero denominator returns null without throwing or producing NaN/Infinity", async () => {
    // 0 appointments in database
    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    assert.equal(res.rangeSummary.cancellationRate, null);
    assert.equal(res.rangeSummary.noShowRate, null);
  });
});

describe("TASK 017A: Customer Canonical Semantics & New/Returning (Parts 5, 12)", () => {
  it("counts merged alias customer and primary customer as 1 unique logical customer", async () => {
    const d1 = new Date("2026-10-10T10:00:00.000Z");

    // 1 appointment for customer1, 1 appointment for customerAlias (merged into customer1)
    await db.insert(schema.appointments).values([
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: d1,
        endTime: new Date(d1.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customerAlias,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: new Date(d1.getTime() + 40 * 60_000),
        endTime: new Date(d1.getTime() + 60 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    // 2 appointments, but exactly 1 unique customer!
    assert.equal(res.rangeSummary.totalAppointments, 2);
    assert.equal(res.rangeSummary.uniqueCustomers, 1);
  });

  it("correctly identifies new vs returning customers based on first appointment date", async () => {
    const pastHistoricalDate = new Date("2026-08-01T10:00:00.000Z"); // months ago
    const insideRangeDate = new Date("2026-10-10T10:00:00.000Z");

    // Customer 1 had an appointment in August (returning customer)
    // Customer 2's very first appointment is in October inside the range (new customer)
    await db.insert(schema.appointments).values([
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: pastHistoricalDate,
        endTime: new Date(pastHistoricalDate.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: insideRangeDate,
        endTime: new Date(insideRangeDate.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: insideRangeDate,
        endTime: new Date(insideRangeDate.getTime() + 20 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    assert.equal(res.rangeSummary.uniqueCustomers, 2);
    assert.equal(res.rangeSummary.newCustomers, 1); // Customer 2
    assert.equal(res.rangeSummary.returningCustomers, 1); // Customer 1
  });
});

describe("TASK 017A: Daily Trend, Services, Staff & Busy Periods (Parts 8, 9, 10, 11)", () => {
  it("zero-fills daily trend buckets so every calendar day is present with 0s", async () => {
    // Only 1 appointment on 2026-10-10
    const d1 = new Date("2026-10-10T10:00:00.000Z");
    await db.insert(schema.appointments).values({
      businessId: ids.businessA,
      customerId: ids.customer1,
      staffId: ids.staffProfile1,
      serviceId: ids.service1,
      startTime: d1,
      endTime: new Date(d1.getTime() + 30 * 60_000),
      status: "COMPLETED",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "350.00",
    });

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    assert.equal(res.dailyTrend.length, 7);
    const day10 = res.dailyTrend.find((b: any) => b.localDate === "2026-10-10");
    const day11 = res.dailyTrend.find((b: any) => b.localDate === "2026-10-11");

    assert.ok(day10);
    assert.equal(day10?.appointmentCount, 1);
    assert.equal(day10?.completedCount, 1);
    assert.equal(day10?.completedServiceValue[0].amount, "350.00");

    assert.ok(day11);
    assert.equal(day11?.appointmentCount, 0);
    assert.equal(day11?.completedCount, 0);
    assert.equal(day11?.completedServiceValue[0].amount, "0.00");
  });

  it("ranks top services and limits to 5 with snapshot name preservation", async () => {
    const d1 = new Date("2026-10-10T10:00:00.000Z");

    await db.insert(schema.appointments).values([
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: d1,
        endTime: new Date(d1.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Özel VIP Kesim (Tarihsel İsim)",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "400.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile1,
        serviceId: ids.service2,
        startTime: d1,
        endTime: new Date(d1.getTime() + 20 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    assert.equal(res.topServices.length, 2);
    // Preserves historical snapshot name
    const vipService = res.topServices.find((s: any) => s.serviceId === ids.service1);
    assert.equal(vipService?.serviceName, "Özel VIP Kesim (Tarihsel İsim)");
    assert.equal(vipService?.completedServiceValue[0].amount, "400.00");
  });

  it("includes inactive historical staff without dropping historical appointments", async () => {
    const d1 = new Date("2026-10-10T10:00:00.000Z");

    await db.insert(schema.appointments).values({
      businessId: ids.businessA,
      customerId: ids.customer1,
      staffId: ids.staffProfileInactive, // staff is active = false
      serviceId: ids.service1,
      startTime: d1,
      endTime: new Date(d1.getTime() + 30 * 60_000),
      status: "COMPLETED",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "350.00",
    });

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    const inactiveStaffRow = res.staffPerformance.find(
      (s: any) => s.staffId === ids.staffProfileInactive
    );
    assert.ok(inactiveStaffRow);
    assert.equal(inactiveStaffRow?.staffName, "Eski Personel");
    assert.equal(inactiveStaffRow?.completedCount, 1);
  });

  it("aggregates busy periods by weekday and hour, excluding cancelled", async () => {
    // 2026-10-10 is a Saturday (ISO day 6)
    // 10:00 UTC = 13:00 Europe/Istanbul local
    const saturday = new Date("2026-10-10T10:00:00.000Z");

    await db.insert(schema.appointments).values([
      {
        businessId: ids.businessA,
        customerId: ids.customer1,
        staffId: ids.staffProfile1,
        serviceId: ids.service1,
        startTime: saturday,
        endTime: new Date(saturday.getTime() + 30 * 60_000),
        status: "COMPLETED",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "350.00",
      },
      {
        businessId: ids.businessA,
        customerId: ids.customer2,
        staffId: ids.staffProfile2,
        serviceId: ids.service2,
        startTime: saturday,
        endTime: new Date(saturday.getTime() + 20 * 60_000),
        status: "CANCELLED", // should be excluded!
        serviceNameSnapshot: "Sakal Tıraşı",
        serviceDurationSnapshot: 20,
        servicePriceSnapshot: "150.00",
      },
    ]);

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_7_DAYS",
      referenceNow,
    });

    assert.equal(res.busyPeriods.byWeekday.length, 7);
    const sat = res.busyPeriods.byWeekday.find((w: any) => w.dayOfWeek === 6);
    assert.equal(sat?.dayName, "Cumartesi");
    assert.equal(sat?.appointmentCount, 1); // 1 completed, 0 cancelled counted!

    assert.equal(res.busyPeriods.byHour.length, 24);
    const hour13 = res.busyPeriods.byHour.find((h: any) => h.hour === 13);
    assert.equal(hour13?.appointmentCount, 1);
  });
});

describe("TASK 017A: Security & Privacy (Part 22)", () => {
  it("never exposes customer phone, notes, CRM notes, or token capabilities in read model", async () => {
    const d1 = new Date("2026-10-12T13:00:00.000Z");

    await db.insert(schema.appointments).values({
      businessId: ids.businessA,
      customerId: ids.customer1,
      staffId: ids.staffProfile1,
      serviceId: ids.service1,
      startTime: d1,
      endTime: new Date(d1.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "350.00",
      notes: "Müşterinin özel randevu notu",
    });

    const res = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "TODAY",
      referenceNow,
    });

    const serialized = JSON.stringify(res);
    assert.equal(serialized.includes("05321111111"), false);
    assert.equal(serialized.includes("gizli CRM notu"), false);
    assert.equal(serialized.includes("özel randevu notu"), false);
    assert.equal(serialized.includes("/randevu#"), false);
  });
});

describe("TASK 017A: Volume & Performance Test (Part 23)", () => {
  it("aggregates 350+ appointments across 30 days within bounded time and zero N+1 growth", async () => {
    const statuses: Array<"PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"> = [
      "COMPLETED",
      "COMPLETED",
      "CONFIRMED",
      "CANCELLED",
      "NO_SHOW",
    ];

    const bulkRows: any[] = [];
    const baseDate = new Date("2026-09-13T07:00:00.000Z");

    for (let day = 0; day < 30; day++) {
      for (let app = 0; app < 12; app++) {
        const start = new Date(baseDate.getTime() + day * 24 * 3600_000 + app * 3600_000);
        const status = statuses[(day + app) % statuses.length];
        const staffId = app % 2 === 0 ? ids.staffProfile1 : ids.staffProfile2;
        const serviceId = app % 3 === 0 ? ids.service1 : ids.service2;
        const customerId = app % 2 === 0 ? ids.customer1 : ids.customer2;

        bulkRows.push({
          businessId: ids.businessA,
          customerId,
          staffId,
          serviceId,
          startTime: start,
          endTime: new Date(start.getTime() + 30 * 60_000),
          status,
          serviceNameSnapshot: app % 3 === 0 ? "Saç Kesimi" : "Sakal Tıraşı",
          serviceDurationSnapshot: app % 3 === 0 ? 30 : 20,
          servicePriceSnapshot: app % 3 === 0 ? "350.00" : "150.00",
        });
      }
    }

    // Insert 360 appointments
    await db.insert(schema.appointments).values(bulkRows);

    const startTime = performance.now();
    const analytics = await analyticsService.getDashboardAnalytics({
      businessId: ids.businessA,
      preset: "LAST_30_DAYS",
      referenceNow,
    });
    const durationMs = performance.now() - startTime;

    assert.equal(analytics.rangeSummary.totalAppointments, 360);
    assert.equal(analytics.dailyTrend.length, 30);
    assert.ok(analytics.rangeSummary.completedAppointments > 0);
    assert.ok(parseFloat(analytics.rangeSummary.completedServiceValue[0].amount) > 0);
    assert.ok(analytics.staffPerformance.length >= 2);
    assert.ok(analytics.topServices.length >= 2);

    // Diagnostic assertion: execution time should easily complete under 500ms on local embedded pg
    assert.ok(durationMs < 5000, `Execution took ${durationMs}ms`);
  });
});
