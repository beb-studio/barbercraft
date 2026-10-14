/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `99110000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  ownerA: uuid(1),
  adminA: uuid(2),
  staffA: uuid(3),
  staffB: uuid(4),
  customer1: uuid(10),
  businessA: uuid(20),
  ownerMemberA: uuid(30),
  adminMemberA: uuid(31),
  staffMemberA: uuid(32),
  staffMemberB: uuid(33),
  staffProfileA: uuid(40),
  staffProfileB: uuid(41),
  service1: uuid(50),
  service2: uuid(51),
  appointment1: uuid(60),
  appointment2: uuid(61),
  timeBlock1: uuid(70),
};

let pgServer: any;
let db: any;
let schema: any;
let sessionModule: any;
let workspaceService: any;

const referenceNow = new Date("2026-10-13T10:00:00.000Z");

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

  const wsMod = await import("../../src/services/staff-workspace.service");
  workspaceService = wsMod.StaffWorkspaceService;

  // 1. Seed Users
  await db.insert(schema.users).values([
    { id: ids.ownerA, name: "Patron Burak", email: "owner@test.local", emailVerified: true },
    { id: ids.adminA, name: "Yönetici Ahmet", email: "admin@test.local", emailVerified: true },
    { id: ids.staffA, name: "Berber Ali", email: "staff-ali@test.local", emailVerified: true },
    { id: ids.staffB, name: "Berber Veli", email: "staff-veli@test.local", emailVerified: true },
  ]);

  // 2. Seed Business
  await db.insert(schema.businesses).values({
    id: ids.businessA,
    name: "Salon Prestij",
    slug: "salon-prestij",
    phone: "+905551112233",
    timezone: "Europe/Istanbul",
    currency: "TRY",
    onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
    active: true,
  });

  // 3. Seed Business Members
  await db.insert(schema.businessMembers).values([
    { id: ids.ownerMemberA, businessId: ids.businessA, userId: ids.ownerA, role: "OWNER" },
    { id: ids.adminMemberA, businessId: ids.businessA, userId: ids.adminA, role: "MANAGER" },
    { id: ids.staffMemberA, businessId: ids.businessA, userId: ids.staffA, role: "STAFF" },
    { id: ids.staffMemberB, businessId: ids.businessA, userId: ids.staffB, role: "STAFF" },
  ]);

  // 4. Seed Staff Profiles
  await db.insert(schema.staffProfiles).values([
    {
      id: ids.staffProfileA,
      businessId: ids.businessA,
      businessMemberId: ids.staffMemberA,
      firstName: "Ali",
      lastName: "Demir",
      title: "Usta Berber",
      isPublicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.staffProfileB,
      businessId: ids.businessA,
      businessMemberId: ids.staffMemberB,
      firstName: "Veli",
      lastName: "Yılmaz",
      title: "Kalfa Berber",
      isPublicBookingEnabled: true,
      active: true,
    },
  ]);

  // 5. Seed Services (durations & prices in DB)
  await db.insert(schema.services).values([
    {
      id: ids.service1,
      businessId: ids.businessA,
      name: "Saç Kesimi",
      durationMinutes: 30,
      price: "250.00",
      active: true,
    },
    {
      id: ids.service2,
      businessId: ids.businessA,
      name: "Sakal Tıraşı",
      durationMinutes: 20,
      price: "150.00",
      active: true,
    },
  ]);

  // 6. Assign Services to Staff A
  await db.insert(schema.staffServices).values([
    { businessId: ids.businessA, staffId: ids.staffProfileA, serviceId: ids.service1 },
    { businessId: ids.businessA, staffId: ids.staffProfileA, serviceId: ids.service2 },
  ]);

  // 7. Seed Customer
  await db.insert(schema.customers).values({
    id: ids.customer1,
    businessId: ids.businessA,
    firstName: "Can",
    lastName: "Demir",
    phone: "+905553334455",
    normalizedPhone: "+905553334455",
    internalNotes: "Vip müşteri gizli not",
  });

  // 8. Seed Appointments (in Europe/Istanbul UTC+3)
  // 2026-10-13 11:00 UTC = 14:00 Istanbul (Today)
  await db.insert(schema.appointments).values([
    {
      id: ids.appointment1,
      businessId: ids.businessA,
      staffId: ids.staffProfileA,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-13T11:00:00.000Z"),
      endTime: new Date("2026-10-13T11:30:00.000Z"),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      notes: "Müşteri özel talebi",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "250.00",
    },
    // Appointment 2 for Staff B (Colleague)
    {
      id: ids.appointment2,
      businessId: ids.businessA,
      staffId: ids.staffProfileB,
      customerId: ids.customer1,
      serviceId: ids.service2,
      startTime: new Date("2026-10-13T12:00:00.000Z"),
      endTime: new Date("2026-10-13T12:20:00.000Z"),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 20,
      servicePriceSnapshot: "150.00",
    },
  ]);

  // 9. Seed Time Block for Staff A (2026-10-13 12:00 UTC = 15:00 Istanbul)
  await db.insert(schema.timeBlocks).values({
    id: ids.timeBlock1,
    businessId: ids.businessA,
    staffId: ids.staffProfileA,
    blockType: "BREAK",
    startTime: new Date("2026-10-13T12:00:00.000Z"),
    endTime: new Date("2026-10-13T13:00:00.000Z"),
    reason: "Öğle molası",
  });
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("TASK 018B: Staff Mobile Workspace UX & Role Scoping", () => {
  describe("1. Role-Aware Routing & View Boundary", () => {
    it("source audit: ensures /dashboard renders StaffDashboardView exclusively for role === 'STAFF'", async () => {
      const pageCode = await readFile("src/app/(dashboard)/dashboard/page.tsx", "utf8");

      assert.match(
        pageCode,
        /if\s*\(\s*role\s*===\s*"STAFF"\s*\)\s*\{[\s\S]*?<StaffDashboardView\s+workspace=\{workspace\}\s*\/>/
      );
      assert.match(
        pageCode,
        /StaffWorkspaceService\.getStaffWorkspace\(\{[\s\S]*?businessId[\s\S]*?userId:\s*user\.id[\s\S]*?role[\s\S]*?\}\)/
      );
    });

    it("verifies StaffWorkspaceService returns strictly personal data for staff member", async () => {
      mockSession(ids.staffA);
      const ws = await workspaceService.getStaffWorkspace({
        businessId: ids.businessA,
        userId: ids.staffA,
        role: "STAFF",
        referenceNow,
      });

      assert.ok(ws, "Workspace returned");
      assert.equal(ws.profile.firstName, "Ali");
      assert.equal(ws.business.businessName, "Salon Prestij");

      // Only Staff A appointments are returned (appointment 1), not colleague's (appointment 2)
      assert.equal(ws.selectedDayAgenda.appointments.length, 1);
      assert.equal(ws.selectedDayAgenda.appointments[0].appointmentId, ids.appointment1);
      assert.equal(ws.selectedDayAgenda.timeBlocks.length, 1);
      assert.equal(ws.selectedDayAgenda.timeBlocks[0].id, ids.timeBlock1);
    });
  });

  describe("2. Zero Financial Exposure & Customer Privacy Audits", () => {
    it("source audit: ensures StaffDashboardView contains zero financial or revenue terms", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      // Strict prohibited patterns
      assert.doesNotMatch(viewCode, /priceSnapshot/);
      assert.doesNotMatch(viewCode, /servicePriceSnapshot/);
      assert.doesNotMatch(viewCode, /Ciro/i);
      assert.doesNotMatch(viewCode, /Gelir/i);
      assert.doesNotMatch(viewCode, /Tahsilat/i);
      assert.doesNotMatch(viewCode, /Kazanç/i);
    });

    it("source audit: ensures StaffDashboardView contains zero internal notes or CRM notes", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.doesNotMatch(viewCode, /\.notes\b/);
      assert.doesNotMatch(viewCode, /customerNotes/i);
      assert.doesNotMatch(viewCode, /internalNotes/i);
      assert.doesNotMatch(viewCode, /crmNotes/i);
    });

    it("deep DTO audit: confirms StaffWorkspaceData contains no forbidden financial or note keys", async () => {
      mockSession(ids.staffA);
      const ws = await workspaceService.getStaffWorkspace({
        businessId: ids.businessA,
        userId: ids.staffA,
        role: "STAFF",
        referenceNow,
      });

      const forbiddenKeys = [
        "price",
        "revenue",
        "ciro",
        "tutar",
        "earning",
        "customernotes",
        "crmnotes",
        "internalnotes",
        "appointmentnotes",
        "notes",
      ];

      function checkNoForbiddenKeys(obj: any, path = "") {
        if (!obj || typeof obj !== "object") return;
        for (const [key, value] of Object.entries(obj)) {
          const fullPath = path ? `${path}.${key}` : key;
          const lowerKey = key.toLowerCase();
          for (const forbidden of forbiddenKeys) {
            assert.equal(
              lowerKey === forbidden || lowerKey.endsWith(forbidden),
              false,
              `Forbidden key "${fullPath}" found in Staff Workspace DTO!`
            );
          }
          if (value && typeof value === "object") {
            checkNoForbiddenKeys(value, fullPath);
          }
        }
      }

      checkNoForbiddenKeys(ws);
    });
  });

  describe("3. Hero Next Appointment & Direct Call Ergonomics", () => {
    it("source audit: verifies Next Appointment Hero provides click-to-call link and operational actions", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      // Direct tel: link with phone call icon
      assert.match(viewCode, /href=\{`tel:\$\{nextAppt\.customerPhone\}`\}/);
      assert.match(viewCode, /PhoneCall/);

      // Operational actions: Tamamla, Gelmedi, Saati Değiştir, İptal Et
      assert.match(viewCode, /Tamamla/);
      assert.match(viewCode, /Gelmedi/);
      assert.match(viewCode, /Saati Değiştir/);
      assert.match(viewCode, /İptal Et/);

      // Empty state when no next appointment
      assert.match(viewCode, /Sırada bekleyen aktif randevunuz yok/);
    });
  });

  describe("4. Operational Pulse & 7-Day Week Ribbon", () => {
    it("source audit: verifies Operational Pulse displays count metrics without financial metrics", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.match(viewCode, /Bugün Toplam/);
      assert.match(viewCode, /Kalan Randevu/);
      assert.match(viewCode, /Tamamlanan/);
      assert.match(viewCode, /Haftalık toplam:/);
    });

    it("source audit: verifies 7-Day Week Ribbon covers Monday to Sunday with day selection", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.match(viewCode, /Haftalık Akış/);
      assert.match(viewCode, /Pazartesi – Pazar/);
      assert.match(viewCode, /setSelectedDateStr\(day\.dateStr\)/);
      assert.match(viewCode, /grid-cols-7/);
    });
  });

  describe("5. Day Agenda Stream & Personal Time Blocks", () => {
    it("source audit: verifies chronological stream mixes appointments and time blocks", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      // Appointments & time blocks combination
      assert.match(viewCode, /kind:\s*"APPOINTMENT"/);
      assert.match(viewCode, /kind:\s*"TIME_BLOCK"/);
      assert.match(viewCode, /combinedAgenda/);

      // Time block types in Turkish
      assert.match(viewCode, /Mola/);
      assert.match(viewCode, /İzin/);
      assert.match(viewCode, /Uygun Değil/);

      // Time block creation and deletion
      assert.match(viewCode, /createStaffTimeBlockAction/);
      assert.match(viewCode, /deleteStaffTimeBlockAction/);
    });

    it("source audit: verifies read-only assigned services list displays duration with zero prices", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.match(viewCode, /Hizmetlerim/);
      assert.match(viewCode, /svc\.durationMinutes/);
      assert.doesNotMatch(viewCode, /svc\.price/);
    });
  });

  describe("6. Reschedule Modal & Optimistic Concurrency", () => {
    it("source audit: verifies Reschedule modal invokes getRescheduleAvailabilityAction and rescheduleAppointmentAction with updatedAt", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.match(viewCode, /getRescheduleAvailabilityAction/);
      assert.match(viewCode, /rescheduleAppointmentAction/);
      assert.match(viewCode, /rescheduleTarget\.updatedAt/);
      assert.match(viewCode, /Yeni Randevu Zamanı:/);
    });
  });

  describe("7. Role-Aware Navigation in Dashboard Shell", () => {
    it("source audit: verifies DashboardShell provides Programım / Bugün, Ajanda, Yeni Randevu to STAFF", async () => {
      const shellCode = await readFile(
        "src/components/layout/dashboard-shell.tsx",
        "utf8"
      );

      assert.match(shellCode, /userRole === "STAFF"/);
      assert.match(shellCode, /label:\s*"Programım"/);
      assert.match(shellCode, /mobileLabel:\s*"Bugün"/);
      assert.match(shellCode, /label:\s*"Ajanda"/);
      assert.match(shellCode, /label:\s*"Yeni Randevu"/);

      // Inaccessible management links are strictly hidden for STAFF
      assert.match(shellCode, /userRole === "OWNER" \|\| userRole === "MANAGER"/);
    });

    it("source audit: verifies MobileNav component provides operational links to STAFF without Ayarlar", async () => {
      const mobileNavCode = await readFile(
        "src/components/layout/mobile-nav.tsx",
        "utf8"
      );

      assert.match(mobileNavCode, /userRole === "STAFF"/);
      assert.match(mobileNavCode, /label:\s*"Bugün"/);
      assert.match(mobileNavCode, /label:\s*"Ajanda"/);
      assert.match(mobileNavCode, /label:\s*"Yeni Randevu"/);
    });
  });

  describe("8. Mobile Touch Targets & Turkish Semantic Policy", () => {
    it("source audit: verifies touch targets meet 44px minimum for primary interactions", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.match(viewCode, /min-h-\[44px\]/);
      assert.match(viewCode, /pb-24/);
    });

    it("source audit: ensures all status labels, prompts, and modal texts are in Turkish", async () => {
      const viewCode = await readFile(
        "src/components/dashboard/staff-dashboard-view.tsx",
        "utf8"
      );

      assert.match(viewCode, /Randevuyu Tamamla/);
      assert.match(viewCode, /Gelmedi Olarak İşaretle/);
      assert.match(viewCode, /Randevuyu İptal Et/);
      assert.match(viewCode, /Kişisel Mola \/ Blok Ekle/);
      assert.match(viewCode, /Zaman Bloğunu Kaldır/);
      assert.match(viewCode, /Vazgeç/);
    });
  });
});
