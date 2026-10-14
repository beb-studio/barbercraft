/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `99110000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  ownerA: uuid(1),
  adminA: uuid(2),
  staffA: uuid(3),
  customer1: uuid(10),
  businessA: uuid(20),
  ownerMemberA: uuid(30),
  adminMemberA: uuid(31),
  staffMemberA: uuid(32),
  staffProfileA: uuid(40),
  service1: uuid(50),
  appointment1: uuid(60),
};

let pgServer: any;
let db: any;
let schema: any;
let sessionModule: any;
let analyticsService: any;
let dashboardAppointmentsService: any;

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? {
          id: userId,
          email: `${userId}@test.local`,
          forcePasswordChange: false,
        }
      : null;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  sessionModule = await import("../../src/lib/auth/session");

  const analyticsModule = await import("../../src/services/business-analytics.service");
  analyticsService = analyticsModule.BusinessAnalyticsService;

  dashboardAppointmentsService = await import("../../src/services/dashboard-appointments.service");

  // Seed Users
  await db.insert(schema.users).values([
    { id: ids.ownerA, name: "Patron Burak", email: "owner@test.local", emailVerified: true },
    { id: ids.adminA, name: "Yönetici Ahmet", email: "admin@test.local", emailVerified: true },
    { id: ids.staffA, name: "Berber Mehmet", email: "staff@test.local", emailVerified: true },
  ]);

  // Seed Business
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "Ustalar Berber",
      slug: "ustalar-berber",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
  ]);

  // Seed Memberships
  await db.insert(schema.businessMembers).values([
    { id: ids.ownerMemberA, businessId: ids.businessA, userId: ids.ownerA, role: "OWNER" },
    { id: ids.adminMemberA, businessId: ids.businessA, userId: ids.adminA, role: "MANAGER" },
    { id: ids.staffMemberA, businessId: ids.businessA, userId: ids.staffA, role: "STAFF" },
  ]);

  // Seed Staff Profile for staffA
  await db.insert(schema.staffProfiles).values([
    {
      id: ids.staffProfileA,
      businessId: ids.businessA,
      businessMemberId: ids.staffMemberA,
      firstName: "Mehmet",
      lastName: "Usta",
      active: true,
      publicBookingEnabled: true,
    },
  ]);

  // Seed Service
  await db.insert(schema.services).values([
    {
      id: ids.service1,
      businessId: ids.businessA,
      name: "Saç & Sakal Tıraşı",
      price: "350.00",
      durationMinutes: 45,
      active: true,
    },
  ]);

  // Seed Customer
  await db.insert(schema.customers).values([
    {
      id: ids.customer1,
      businessId: ids.businessA,
      firstName: "Ali",
      lastName: "Kaya",
      phone: "+905551234567",
      normalizedPhone: "+905551234567",
    },
  ]);

  // Seed Today's Appointment
  const { getBusinessLocalToday, parseDateTimeInBusinessTimezone } = await import(
    "../../src/lib/timezone"
  );
  const todayStr = getBusinessLocalToday("Europe/Istanbul");
  const startAt = parseDateTimeInBusinessTimezone(todayStr, "14:00", "Europe/Istanbul");
  const endAt = parseDateTimeInBusinessTimezone(todayStr, "14:45", "Europe/Istanbul");

  await db.insert(schema.appointments).values([
    {
      id: ids.appointment1,
      businessId: ids.businessA,
      customerId: ids.customer1,
      staffId: ids.staffProfileA,
      serviceId: ids.service1,
      startTime: startAt,
      endTime: endAt,
      status: "CONFIRMED",
      source: "MANUAL_ADMIN",
      serviceNameSnapshot: "Saç & Sakal Tıraşı",
      servicePriceSnapshot: "350.00",
      serviceDurationSnapshot: 45,
    },
  ]);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

beforeEach(() => {
  mockSession(null);
});

describe("TASK 017B: Business Dashboard & Analytics UX Integration", () => {
  describe("1. Role-Aware Dashboard Routing & View Separation", () => {
    it("source audit: verifies page strictly isolates STAFF from business-wide analytics", async () => {
      const pageCode = await readFile("src/app/(dashboard)/dashboard/page.tsx", "utf8");

      // Verify STAFF check is performed early
      assert.match(pageCode, /if\s*\(\s*role\s*===\s*"STAFF"\s*\)/);
      // Verify STAFF receives StaffDashboardView exclusively
      assert.match(pageCode, /<StaffDashboardView/);
      // Verify BusinessAnalyticsService is ONLY called after the STAFF check
      const staffIndex = pageCode.indexOf('role === "STAFF"');
      const analyticsCallIndex = pageCode.indexOf("BusinessAnalyticsService.getDashboardAnalytics");
      assert.ok(
        analyticsCallIndex > staffIndex,
        "BusinessAnalyticsService call occurs strictly AFTER STAFF guard"
      );
    });

    it("verifies STAFF operational agenda service scopes strictly to the staff member", async () => {
      mockSession(ids.staffA);

      const agenda = await dashboardAppointmentsService.getDashboardDailyAgenda(
        ids.businessA,
        ids.staffA,
        "STAFF"
      );

      assert.ok(agenda, "Agenda returned for STAFF");
      assert.equal(agenda.appointments.length, 1);
      assert.equal(agenda.appointments[0].staff.id, ids.staffProfileA);
    });

    it("verifies OWNER receives complete analytics read model for dashboard command center", async () => {
      mockSession(ids.ownerA);

      const analytics = await analyticsService.getDashboardAnalytics({
        businessId: ids.businessA,
        preset: "LAST_7_DAYS",
      });

      assert.ok(analytics, "Analytics returned for OWNER");
      assert.equal(analytics.businessId, ids.businessA);
      assert.equal(analytics.currency, "TRY");
      assert.equal(analytics.selectedRange.preset, "LAST_7_DAYS");
      assert.ok(analytics.todaySummary, "Has todaySummary");
      assert.ok(analytics.upcomingSummary, "Has upcomingSummary");
      assert.ok(analytics.rangeSummary, "Has rangeSummary");
      assert.ok(Array.isArray(analytics.dailyTrend), "Has dailyTrend");
      assert.ok(Array.isArray(analytics.topServices), "Has topServices");
      assert.ok(Array.isArray(analytics.staffPerformance), "Has staffPerformance");
      assert.ok(analytics.busyPeriods, "Has busyPeriods");
    });
  });

  describe("2. Date Range Parameter Parsing & Fallback", () => {
    it("source audit: verifies range presets are strictly validated with safe fallback", async () => {
      const pageCode = await readFile("src/app/(dashboard)/dashboard/page.tsx", "utf8");

      assert.match(
        pageCode,
        /isValidAnalyticsPreset\(rangeInput\)\s*\?\s*rangeInput\s*:\s*"LAST_7_DAYS"/,
        "Ensures invalid or missing range searchParam safely falls back to LAST_7_DAYS"
      );
    });

    it("accepts valid TODAY and LAST_30_DAYS presets in service query", async () => {
      const [todayData, thirtyDaysData] = await Promise.all([
        analyticsService.getDashboardAnalytics({
          businessId: ids.businessA,
          preset: "TODAY",
        }),
        analyticsService.getDashboardAnalytics({
          businessId: ids.businessA,
          preset: "LAST_30_DAYS",
        }),
      ]);

      assert.equal(todayData.selectedRange.preset, "TODAY");
      assert.equal(todayData.selectedRange.daysCount, 1);
      assert.equal(thirtyDaysData.selectedRange.preset, "LAST_30_DAYS");
      assert.equal(thirtyDaysData.selectedRange.daysCount, 30);
    });
  });

  describe("3. Non-Revenue Turkish Semantic Verification", () => {
    it("ensures completed service value is never labeled as revenue, ciro, or tahsilat in KPI cards", async () => {
      const kpiCode = await readFile(
        "src/components/dashboard/analytics/kpi-metric-cards.tsx",
        "utf8"
      );

      // Must contain authoritative concept
      assert.match(kpiCode, /Tamamlanan Hizmet Tutarı/);
      // Must contain explanation subtitle / tooltip
      assert.match(
        kpiCode,
        /Tamamlanan randevuların kayıtlı hizmet tutarıdır; tahsilat verisi değildir\./
      );

      // Must NOT contain forbidden terms as labels
      assert.doesNotMatch(kpiCode, />Ciro</i);
      assert.doesNotMatch(kpiCode, />Gelir</i);
      assert.doesNotMatch(kpiCode, />Tahsilat</i);
      assert.doesNotMatch(kpiCode, />Net Gelir</i);
      assert.doesNotMatch(kpiCode, />Revenue</i);
      assert.doesNotMatch(kpiCode, />Kâr</i);
    });

    it("ensures StaffWorkloadCard uses strictly neutral workload terminology", async () => {
      const staffCardCode = await readFile(
        "src/components/dashboard/analytics/staff-workload-card.tsx",
        "utf8"
      );

      assert.match(staffCardCode, /Personel İş Yükü Dağılımı/);
      assert.match(staffCardCode, /tamamlandı/);
      assert.doesNotMatch(staffCardCode, /Maaş/);
      assert.doesNotMatch(staffCardCode, /Prim/);
      assert.doesNotMatch(staffCardCode, /Ciro/);
      assert.doesNotMatch(staffCardCode, /Personel Geliri/);
    });

    it("ensures StaffDashboardView contains zero financial, revenue, or internal note metrics", async () => {
      const staffViewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.doesNotMatch(staffViewCode, /Tamamlanan Hizmet Tutarı/);
      assert.doesNotMatch(staffViewCode, /formatCurrency/);
      assert.doesNotMatch(staffViewCode, /priceSnapshot/);
      assert.doesNotMatch(staffViewCode, /Ciro/i);
      assert.doesNotMatch(staffViewCode, /Gelir/i);
      assert.doesNotMatch(staffViewCode, /\.notes\b/);
      assert.doesNotMatch(staffViewCode, /customerNotes/i);
      assert.doesNotMatch(staffViewCode, /internalNotes/i);
    });
  });

  describe("4. Rate Formatting & Null Division-by-Zero Safety", () => {
    it("formats percentage rates correctly and handles null safely", async () => {
      const { formatPercentage } = await import("../../src/lib/presentation");

      assert.equal(formatPercentage(0.25), "%25");
      assert.equal(formatPercentage(0.125), "%12,5");
      assert.equal(formatPercentage(0), "%0");
      assert.equal(formatPercentage(null), "—");
      assert.equal(formatPercentage(undefined), "—");
      assert.equal(formatPercentage(NaN), "—");
    });

    it("formats currency amounts using Turkish conventions", async () => {
      const { formatCurrency } = await import("../../src/lib/presentation");

      assert.equal(formatCurrency("350.00", "TRY"), "350 ₺");
      assert.equal(formatCurrency("1250.50", "TRY"), "1.250,5 ₺");
      assert.equal(formatCurrency(0, "TRY"), "0 ₺");
    });
  });

  describe("5. Mobile Touch Target & Accessibility Validation", () => {
    it("RangeSelector enforces min-h-[44px] touch target and accessible tablist semantics", async () => {
      const selectorCode = await readFile(
        "src/components/dashboard/analytics/range-selector.tsx",
        "utf8"
      );

      assert.match(selectorCode, /min-h-\[44px\]/);
      assert.match(selectorCode, /role="tablist"/);
      assert.match(selectorCode, /role="tab"/);
      assert.match(selectorCode, /aria-selected=\{isActive\}/);
    });

    it("DailyTrendChart provides accessible table toggle and region semantics", async () => {
      const trendCode = await readFile(
        "src/components/dashboard/analytics/daily-trend-chart.tsx",
        "utf8"
      );

      assert.match(trendCode, /role="region"/);
      assert.match(trendCode, /aria-label="Günlük randevu trend grafiği"/);
      assert.match(trendCode, /tabIndex=\{0\}/);
      assert.match(trendCode, /showTable/);
    });

    it("Dashboard page actions meet minimum 44px touch targets", async () => {
      const pageCode = await readFile("src/app/(dashboard)/dashboard/page.tsx", "utf8");

      assert.match(pageCode, /min-h-\[44px\]/);
    });
  });
});
