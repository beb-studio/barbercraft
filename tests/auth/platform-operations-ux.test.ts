/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { startDatabase } from "../database/db.mjs";

const uuid = (prefix: number, n: number) =>
  `99220000-0000-4000-${String(prefix).padStart(4, "0")}-${String(n).padStart(12, "0")}`;

const ids = {
  // Platform Admins
  superAdminUser: uuid(1, 1),
  superAdminRecord: uuid(1, 2),
  adminUser: uuid(1, 3),
  adminRecord: uuid(1, 4),

  // Regular Tenant Users (Non-Platform)
  ownerUser: uuid(1, 10),
  staffUser: uuid(1, 11),

  // Tenant Alpha (Healthy)
  bizAlpha: uuid(2, 1),
  ownerAlpha: uuid(2, 2),
  memberOwnerAlpha: uuid(2, 3),
  staffAlpha: uuid(2, 4),
  memberStaffAlpha: uuid(2, 5),
  profileStaffAlpha: uuid(2, 6),
  customerAlpha: uuid(2, 7),
  serviceAlpha: uuid(2, 8),
  apptTodayAlpha: uuid(2, 9),

  // Tenant Beta (Attention - Terminal Delivery Failure)
  bizBeta: uuid(3, 1),
  ownerBeta: uuid(3, 2),
  memberOwnerBeta: uuid(3, 3),
  staffBeta: uuid(3, 4),
  memberStaffBeta: uuid(3, 5),
  profileStaffBeta: uuid(3, 6),
  customerBeta: uuid(3, 7),
  planBeta: uuid(3, 8),
  deliveryFailedBeta: uuid(3, 9),

  // Tenant Gamma (Suspended)
  bizGamma: uuid(4, 1),
  ownerGamma: uuid(4, 2),
  memberOwnerGamma: uuid(4, 3),

  // Tenant Delta (Incomplete Onboarding, No Owner)
  bizDelta: uuid(5, 1),
};

let pgServer: any;
let db: any;
let schema: any;
let sessionModule: any;
let platformOpsActions: any;

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? {
          id: userId,
          email: `${userId}@platform.test`,
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
  platformOpsActions = await import("../../src/actions/platform-operations.actions");

  // Clean
  await db.delete(schema.platformAdminAuditLogs);
  await db.delete(schema.platformAdmins);
  await db.delete(schema.notificationDeliveries);
  await db.delete(schema.notificationPlans);
  await db.delete(schema.notificationOutbox);
  await db.delete(schema.appointments);
  await db.delete(schema.staffServices);
  await db.delete(schema.staffProfiles);
  await db.delete(schema.businessMembers);
  await db.delete(schema.services);
  await db.delete(schema.customers);
  await db.delete(schema.businesses);
  await db.delete(schema.users);

  // Seed Users
  await db.insert(schema.users).values([
    { id: ids.superAdminUser, name: "Süper Yönetici", email: "superadmin@platform.test", emailVerified: true },
    { id: ids.adminUser, name: "Platform Yöneticisi", email: "admin@platform.test", emailVerified: true },
    { id: ids.ownerUser, name: "İşletme Sahibi", email: "owner@tenant.test", emailVerified: true },
    { id: ids.staffUser, name: "Personel Üye", email: "staff@tenant.test", emailVerified: true },
    { id: ids.ownerAlpha, name: "Alpha Sahip", email: "owner@alpha.test", emailVerified: true },
    { id: ids.staffAlpha, name: "Alpha Berber", email: "staff@alpha.test", emailVerified: true },
    { id: ids.ownerBeta, name: "Beta Sahip", email: "owner@beta.test", emailVerified: true },
    { id: ids.staffBeta, name: "Beta Berber", email: "staff@beta.test", emailVerified: true },
    { id: ids.ownerGamma, name: "Gamma Sahip", email: "owner@gamma.test", emailVerified: true },
  ]);

  // Seed Platform Admins
  await db.insert(schema.platformAdmins).values([
    { id: ids.superAdminRecord, userId: ids.superAdminUser, role: "SUPER_ADMIN", active: true },
    { id: ids.adminRecord, userId: ids.adminUser, role: "ADMIN", active: true },
  ]);

  // Seed Businesses
  await db.insert(schema.businesses).values([
    {
      id: ids.bizAlpha,
      name: "Alpha Barber Salon",
      slug: "alpha-barber",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-01T09:00:00Z"),
      updatedAt: new Date("2026-10-01T10:00:00Z"),
    },
    {
      id: ids.bizBeta,
      name: "Beta Grooming Studio",
      slug: "beta-grooming",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date("2026-10-02T10:00:00Z"),
      createdAt: new Date("2026-10-02T09:00:00Z"),
      updatedAt: new Date("2026-10-02T10:00:00Z"),
    },
    {
      id: ids.bizGamma,
      name: "Gamma Vintage Shave",
      slug: "gamma-vintage",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: false, // Suspended
      onboardingCompletedAt: new Date("2026-10-03T10:00:00Z"),
      createdAt: new Date("2026-10-03T09:00:00Z"),
      updatedAt: new Date("2026-10-03T10:00:00Z"),
    },
    {
      id: ids.bizDelta,
      name: "Delta New Wave",
      slug: "delta-new-wave",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: null, // Incomplete onboarding & no owner
      createdAt: new Date("2026-10-04T09:00:00Z"),
      updatedAt: new Date("2026-10-04T09:00:00Z"),
    },
  ]);

  // Seed Memberships
  await db.insert(schema.businessMembers).values([
    { id: ids.memberOwnerAlpha, businessId: ids.bizAlpha, userId: ids.ownerAlpha, role: "OWNER", active: true },
    { id: ids.memberStaffAlpha, businessId: ids.bizAlpha, userId: ids.staffAlpha, role: "STAFF", active: true },
    { id: ids.memberOwnerBeta, businessId: ids.bizBeta, userId: ids.ownerBeta, role: "OWNER", active: true },
    { id: ids.memberStaffBeta, businessId: ids.bizBeta, userId: ids.staffBeta, role: "STAFF", active: true },
    { id: ids.memberOwnerGamma, businessId: ids.bizGamma, userId: ids.ownerGamma, role: "OWNER", active: true },
  ]);

  // Seed Staff Profiles
  await db.insert(schema.staffProfiles).values([
    {
      id: ids.profileStaffAlpha,
      businessId: ids.bizAlpha,
      businessMemberId: ids.memberStaffAlpha,
      firstName: "Kemal",
      lastName: "Usta",
      active: true,
      publicBookingEnabled: true,
    },
    {
      id: ids.profileStaffBeta,
      businessId: ids.bizBeta,
      businessMemberId: ids.memberStaffBeta,
      firstName: "Selim",
      lastName: "Makas",
      active: true,
      publicBookingEnabled: true,
    },
  ]);

  // Seed Customers
  await db.insert(schema.customers).values([
    {
      id: ids.customerAlpha,
      businessId: ids.bizAlpha,
      firstName: "Müşteri",
      lastName: "Bir",
      phone: "+905321112233",
      normalizedPhone: "+905321112233",
      phoneComparisonKey: "5321112233",
    },
    {
      id: ids.customerBeta,
      businessId: ids.bizBeta,
      firstName: "Müşteri",
      lastName: "İki",
      phone: "+905324445566",
      normalizedPhone: "+905324445566",
      phoneComparisonKey: "5324445566",
    },
  ]);

  // Seed Service
  await db.insert(schema.services).values([
    {
      id: ids.serviceAlpha,
      businessId: ids.bizAlpha,
      name: "Saç Kesimi",
      price: "300.00",
      durationMinutes: 30,
      active: true,
    },
    {
      id: uuid(3, 20),
      businessId: ids.bizBeta,
      name: "Sakal Tıraşı",
      price: "150.00",
      durationMinutes: 20,
      active: true,
    },
  ]);

  // Seed Staff Services
  await db.insert(schema.staffServices).values([
    { businessId: ids.bizAlpha, staffId: ids.profileStaffAlpha, serviceId: ids.serviceAlpha },
    { businessId: ids.bizBeta, staffId: ids.profileStaffBeta, serviceId: uuid(3, 20) },
  ]);

  // Seed Appointments
  const today = new Date();
  const apptBetaId = uuid(3, 21);
  await db.insert(schema.appointments).values([
    {
      id: ids.apptTodayAlpha,
      businessId: ids.bizAlpha,
      customerId: ids.customerAlpha,
      staffId: ids.profileStaffAlpha,
      serviceId: ids.serviceAlpha,
      startTime: today,
      endTime: new Date(today.getTime() + 1800000),
      status: "CONFIRMED",
      servicePriceSnapshot: "300.00",
      serviceDurationSnapshot: 30,
      serviceNameSnapshot: "Saç Kesimi",
      source: "PUBLIC_WEB",
    },
    {
      id: apptBetaId,
      businessId: ids.bizBeta,
      customerId: ids.customerBeta,
      staffId: ids.profileStaffBeta,
      serviceId: uuid(3, 20),
      startTime: today,
      endTime: new Date(today.getTime() + 1200000),
      status: "CONFIRMED",
      servicePriceSnapshot: "150.00",
      serviceDurationSnapshot: 20,
      serviceNameSnapshot: "Sakal Tıraşı",
      source: "PUBLIC_WEB",
    },
  ]);

  // Seed Outbox & Notification Plan for Beta
  const outboxBetaId = uuid(3, 22);
  await db.insert(schema.notificationOutbox).values([
    {
      id: outboxBetaId,
      businessId: ids.bizBeta,
      appointmentId: apptBetaId,
      eventType: "APPOINTMENT_CREATED",
      payload: { dummy: true },
      idempotencyKey: "b-outbox-term-1".padEnd(64, "0"),
      status: "PROCESSED",
      attemptCount: 1,
      processedAt: new Date("2026-10-10T09:05:00Z"),
      createdAt: new Date("2026-10-10T09:00:00Z"),
    },
  ]);

  await db.insert(schema.notificationPlans).values([
    {
      id: ids.planBeta,
      businessId: ids.bizBeta,
      appointmentId: apptBetaId,
      sourceOutboxId: outboxBetaId,
      type: "APPOINTMENT_CREATED",
      idempotencyKey: "b-plan-term-1".padEnd(64, "0"),
      status: "PENDING",
      scheduledFor: new Date("2026-10-10T10:00:00Z"),
    },
  ]);

  await db.insert(schema.notificationDeliveries).values([
    {
      id: ids.deliveryFailedBeta,
      businessId: ids.bizBeta,
      planId: ids.planBeta,
      channel: "SMS",
      recipient: "+905324445566",
      provider: "NETGSM",
      status: "FAILED",
      attemptCount: 8, // Terminal delivery
      lastErrorCode: "NETGSM_30",
      availableAt: new Date("2026-10-10T11:00:00Z"),
      createdAt: new Date("2026-10-10T10:00:00Z"),
      updatedAt: new Date("2026-10-10T11:00:00Z"),
      failedAt: new Date("2026-10-10T11:00:00Z"),
    },
  ]);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("TASK 019B — Platform Operations Console UX", () => {
  describe("1. Platform Authentication & Role Authorization", () => {
    it("SUPER_ADMIN can retrieve platform summary action", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.getPlatformSummaryAction();
      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.totalBusinesses, 4);
    });

    it("ADMIN can retrieve platform summary action", async () => {
      mockSession(ids.adminUser);
      const res = await platformOpsActions.getPlatformSummaryAction();
      assert.equal(res.success, true);
      assert.ok(res.data);
    });

    it("OWNER is rejected from platform summary action", async () => {
      mockSession(ids.ownerUser);
      const res = await platformOpsActions.getPlatformSummaryAction();
      assert.equal(res.success, false);
      assert.match(res.error, /Platform admin access denied|erişim yetkiniz bulunmamaktadır|Yetkisiz/i);
    });

    it("STAFF is rejected from platform summary action", async () => {
      mockSession(ids.staffUser);
      const res = await platformOpsActions.getPlatformSummaryAction();
      assert.equal(res.success, false);
      assert.match(res.error, /Platform admin access denied|erişim yetkiniz bulunmamaktadır|Yetkisiz/i);
    });

    it("Anonymous user is rejected from platform actions", async () => {
      mockSession(null);
      const res = await platformOpsActions.getPlatformSummaryAction();
      assert.equal(res.success, false);
      assert.match(res.error, /Unauthorized|oturum/i);
    });
  });

  describe("2. Platform Command Center Overview Metrics & Zero Financial Leakage", () => {
    it("provides complete operational overview metrics matching system truth", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.getPlatformSummaryAction();
      assert.equal(res.success, true);
      const summary = res.data;

      assert.equal(summary.totalBusinesses, 4);
      assert.equal(summary.activeBusinesses, 3);
      assert.equal(summary.suspendedBusinesses, 1);
      assert.equal(summary.onboardingIncompleteBusinesses, 1);
      assert.equal(summary.activeStaffProfiles, 2);
      assert.equal(summary.terminalDeliveryFailures, 1);
    });

    it("guarantees absolute zero GMV, revenue, or financial keys in platform summary", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.getPlatformSummaryAction();
      const keys = Object.keys(res.data);

      const forbiddenTerms = ["revenue", "gmv", "ciro", "gelir", "totalAmount", "sales", "earnings"];
      for (const term of forbiddenTerms) {
        assert.ok(
          !keys.some((k) => k.toLowerCase().includes(term)),
          `Summary must not contain financial key matching '${term}'`
        );
      }
    });

    it("platform overview page source code complies with design system and Turkish terminology", async () => {
      const pageCode = await readFile("src/app/platform/page.tsx", "utf8");

      assert.match(pageCode, /Platform Komuta Merkezi/);
      assert.match(pageCode, /Toplam İşletme/);
      assert.match(pageCode, /Kurulum Bekleyenler/);
      assert.match(pageCode, /Aktif Kadro/);
      assert.match(pageCode, /Randevu Aktivitesi/);
      assert.match(pageCode, /Bildirim Dış Kutusu \(Outbox\)/);
      assert.match(pageCode, /SMS Teslimat Kuyruğu/);
      assert.match(pageCode, /Son Operasyonel İşletmeler/);

      // Verify zero forbidden financial terms in UI text
      assert.doesNotMatch(pageCode, />Ciro</i);
      assert.doesNotMatch(pageCode, />Gelir</i);
      assert.doesNotMatch(pageCode, />Tahsilat</i);
      assert.doesNotMatch(pageCode, />Revenue</i);
    });
  });

  describe("3. Tenant Operations Directory & Health Filtering", () => {
    it("lists all businesses paginated", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.listBusinessOperationsAction({ page: 1, limit: 10 });
      assert.equal(res.success, true);
      assert.equal(res.data.total, 4);
      assert.equal(res.data.items.length, 4);
    });

    it("filters businesses by health status ATTENTION", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.listBusinessOperationsAction({ healthStatus: "ATTENTION" });
      assert.equal(res.success, true);
      // Beta (delivery failure) and Delta (incomplete onboarding, no owner)
      const slugs = res.data.items.map((i: any) => i.slug);
      assert.ok(slugs.includes("beta-grooming"));
      assert.ok(slugs.includes("delta-new-wave"));
      assert.ok(!slugs.includes("alpha-barber"));
    });

    it("filters businesses by health status SUSPENDED", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.listBusinessOperationsAction({ healthStatus: "SUSPENDED" });
      assert.equal(res.success, true);
      assert.equal(res.data.items.length, 1);
      assert.equal(res.data.items[0].slug, "gamma-vintage");
    });

    it("filters businesses by health status HEALTHY", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.listBusinessOperationsAction({ healthStatus: "HEALTHY" });
      assert.equal(res.success, true);
      assert.equal(res.data.items.length, 1);
      assert.equal(res.data.items[0].slug, "alpha-barber");
    });

    it("searches businesses by name or slug safely", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.listBusinessOperationsAction({ search: "alpha" });
      assert.equal(res.success, true);
      assert.equal(res.data.items.length, 1);
      assert.equal(res.data.items[0].slug, "alpha-barber");
    });

    it("directory page code provides responsive table, mobile cards, and touch targets >= 44px", async () => {
      const dirCode = await readFile("src/app/platform/businesses/page.tsx", "utf8");

      assert.match(dirCode, /md:hidden/, "Must have mobile cards below md");
      assert.match(dirCode, /hidden md:block/, "Must have desktop table at and above md");
      assert.match(dirCode, /min-h-\[44px\]/, "Must enforce 44px touch targets on mobile interactive controls");
      assert.match(dirCode, /İşletme Operasyon Rehberi/);
      assert.match(dirCode, /Sağlık Durumu/);
    });
  });

  describe("4. Tenant Operations Detail View & 8 Structured Sections", () => {
    it("returns structured operations detail for a valid tenant", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.getBusinessOperationsDetailAction(ids.bizBeta);
      assert.equal(res.success, true);
      const detail = res.data;

      // Section 1: Tenant header & summary
      assert.equal(detail.summary.businessName, "Beta Grooming Studio");
      assert.equal(detail.summary.slug, "beta-grooming");

      // Section 2: Health & reasons
      assert.equal(detail.summary.health.status, "ATTENTION");
      assert.ok(detail.summary.health.reasons.includes("TERMINAL_DELIVERY_FAILURES"));

      // Section 3: Safe Rosters (Zero Customer PII)
      assert.equal(detail.owners.length, 1);
      assert.equal(detail.owners[0].email, "owner@beta.test");
      assert.equal(detail.staff.length, 1);
      assert.equal(detail.staff[0].name, "Selim Makas");

      // Section 4: Appointment aggregates
      assert.equal(typeof detail.summary.appointmentHealth.appointmentsToday, "number");

      // Section 5: Notification breakdown
      assert.equal(detail.notificationBreakdown.deliveries.terminalFailed, 1);

      // Section 6: Terminal failures list
      assert.equal(detail.recentFailures.length, 1);
      assert.equal(detail.recentFailures[0].type, "DELIVERY");
      assert.equal(detail.recentFailures[0].lastErrorCode, "NETGSM_30");

      // Section 7: Audit logs
      assert.ok(Array.isArray(detail.recentAuditLogs));
    });

    it("verifies absolute absence of customer PII in operations detail payload", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.getBusinessOperationsDetailAction(ids.bizAlpha);
      assert.equal(res.success, true);

      const jsonStr = JSON.stringify(res.data);
      // Ensure customer names, customer phones, or CRM notes are NEVER present
      assert.doesNotMatch(jsonStr, /Müşteri Bir/);
      assert.doesNotMatch(jsonStr, /\+905321112233/);
      assert.doesNotMatch(jsonStr, /crmNotes/i);
      assert.doesNotMatch(jsonStr, /internalNotes/i);
    });

    it("detail page source contains all 8 operational sections", async () => {
      const detailPageCode = await readFile(
        "src/app/platform/businesses/[businessId]/page.tsx",
        "utf8"
      );

      assert.match(detailPageCode, /Operasyonel Sağlık Durumu/);
      assert.match(detailPageCode, /İşletme Sahipleri/);
      assert.match(detailPageCode, /Personel Profilleri/);
      assert.match(detailPageCode, /Randevu Operasyon Özeti/);
      assert.match(detailPageCode, /Bildirim & Teslimat Kuyrukları/);
      assert.match(detailPageCode, /Kalıcı Başarısızlıklar & Yeniden Kuyruğa Alma/);
      assert.match(detailPageCode, /Platform Denetim Geçmişi/);
      assert.match(detailPageCode, /TenantLifecycleActions/);
    });
  });

  describe("5. Tenant Lifecycle Actions (Suspend & Reactivate)", () => {
    it("rejects suspension with short reason (< 5 chars)", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.suspendBusinessAction(ids.bizAlpha, "kısa");
      assert.equal(res.success, false);
      assert.match(res.error, /gerekçe|karakter/i);
    });

    it("suspends active business with valid reason, updating state and appending audit log", async () => {
      mockSession(ids.superAdminUser);
      const reason = "Ödeme gecikmesi ve kural ihlali nedeniyle askıya alındı";
      const res = await platformOpsActions.suspendBusinessAction(ids.bizAlpha, reason);
      assert.equal(res.success, true);
      assert.equal(res.data.active, false);

      // Verify detail reflects suspension
      const detailRes = await platformOpsActions.getBusinessOperationsDetailAction(ids.bizAlpha);
      assert.equal(detailRes.data.summary.active, false);
      assert.equal(detailRes.data.summary.health.status, "SUSPENDED");
      assert.ok(detailRes.data.summary.health.reasons.includes("BUSINESS_SUSPENDED"));

      // Verify audit log
      const logs = detailRes.data.recentAuditLogs;
      assert.ok(logs.some((l: any) => l.action === "BUSINESS_SUSPENDED" && l.metadata?.reason === reason));
    });

    it("reactivates suspended business with valid reason", async () => {
      mockSession(ids.superAdminUser);
      const reason = "İhlal giderildi, işletme yeniden aktife alınıyor";
      const res = await platformOpsActions.reactivateBusinessAction(ids.bizAlpha, reason);
      assert.equal(res.success, true);
      assert.equal(res.data.active, true);

      const detailRes = await platformOpsActions.getBusinessOperationsDetailAction(ids.bizAlpha);
      assert.equal(detailRes.data.summary.active, true);
      assert.equal(detailRes.data.summary.health.status, "HEALTHY");
    });

    it("lifecycle modal copy truthfully states suspension impact and does not claim tenant users lose dashboard access", async () => {
      const modalCode = await readFile(
        "src/app/platform/businesses/[businessId]/_components/tenant-lifecycle-actions.tsx",
        "utf8"
      );

      // 1. Suspension copy says new public booking is blocked
      assert.match(modalCode, /yeni herkese açık randevu oluşturulamaz/);
      assert.match(modalCode, /Mevcut randevular ve veriler korunur/);

      // 2. Suspension copy does not claim tenant users lose dashboard access
      assert.match(modalCode, /Mevcut işletme kullanıcılarının panel erişimi bu işlemle otomatik olarak kaldırılmaz/);
      assert.doesNotMatch(modalCode, /panel erişimi engellenir|oturumlar kapatılır|tüm erişim durdurulur/i);
    });

    it("reactivation copy truthfully states public booking accessibility and does not claim internal operations are restarted", async () => {
      const modalCode = await readFile(
        "src/app/platform/businesses/[businessId]/_components/tenant-lifecycle-actions.tsx",
        "utf8"
      );

      // 3. Reactivation copy does not claim internal operations are restarted
      assert.match(
        modalCode,
        /İşletmeyi yeniden aktifleştirmek, işletmenin herkese açık randevu erişilebilirliğini mevcut işletme ayarlarına göre tekrar kullanılabilir hale getirir/
      );
      assert.match(modalCode, /Mevcut veriler ve iç operasyon kayıtları değişmez/);
      assert.doesNotMatch(modalCode, /normal operasyonları tekrar başlatır/i);
      assert.doesNotMatch(modalCode, /iç operasyonlar durdurulmuştu|oturumlar yeniden açılır/i);
    });

    it("active business copy does not equate active=true with public booking enabled", async () => {
      const pageCode = await readFile("src/app/platform/page.tsx", "utf8");
      const dirCode = await readFile("src/app/platform/businesses/page.tsx", "utf8");
      const detailCode = await readFile("src/app/platform/businesses/[businessId]/page.tsx", "utf8");

      // 4. Active business copy explains not platform-suspended
      assert.match(pageCode, /Platform tarafından askıya alınmamış/);
      assert.match(dirCode, /Platform tarafından askıya alınmamış/);
      assert.match(detailCode, /Platform tarafından askıya alınmamış/);

      assert.doesNotMatch(pageCode, /herkese açık randevu alıyor|tüm aktif işletmeler randevuya açıktır/i);
      assert.doesNotMatch(dirCode, /herkese açık randevu alıyor|tüm aktif işletmeler randevuya açıktır/i);
      assert.doesNotMatch(detailCode, /herkese açık randevu alıyor|tüm aktif işletmeler randevuya açıktır/i);
    });
  });

  describe("6. Controlled Terminal Failure Recovery & Requeue Safety", () => {
    it("successfully requeues a terminal delivery failure", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.requeueTerminalDeliveryAction(ids.deliveryFailedBeta);
      assert.equal(res.success, true);
      assert.equal(res.data.status, "PENDING");
      assert.equal(res.data.attemptCount, 0);

      // Beta should now have 0 terminal delivery failures
      const detailRes = await platformOpsActions.getBusinessOperationsDetailAction(ids.bizBeta);
      assert.equal(detailRes.data.notificationBreakdown.deliveries.terminalFailed, 0);
      assert.equal(detailRes.data.notificationBreakdown.deliveries.pending, 1);
    });

    it("refuses to requeue an already pending delivery", async () => {
      mockSession(ids.superAdminUser);
      const res = await platformOpsActions.requeueTerminalDeliveryAction(ids.deliveryFailedBeta);
      assert.equal(res.success, false);
      assert.match(res.error, /yalnızca kalıcı başarısız olmuş teslimatlar/i);
    });

    it("recovery modal copy explains that requeueing does not mutate appointment or customer data", async () => {
      const recoveryCode = await readFile(
        "src/app/platform/businesses/[businessId]/_components/terminal-failure-recovery.tsx",
        "utf8"
      );

      // Requeue does not mutate appointment or customer data
      assert.match(recoveryCode, /Randevu veya müşteri durumu değişmez/);
    });

    it("terminal delivery recovery states a new SMS attempt may occur and provides no exactly-once guarantee", async () => {
      const recoveryCode = await readFile(
        "src/app/platform/businesses/[businessId]/_components/terminal-failure-recovery.tsx",
        "utf8"
      );

      // 5. Terminal delivery recovery states a new SMS attempt may occur
      assert.match(recoveryCode, /Yeniden kuyruğa alma işlemi yeni bir SMS gönderim denemesi oluşturabilir/);
      assert.match(recoveryCode, /Yeniden kuyruğa alma işlemi yeni bir bildirim işleme denemesi oluşturabilir/);

      // 6. No exactly-once guarantee exists
      assert.doesNotMatch(recoveryCode, /kesinlikle tek|exactly-once|garantili tek|mükerrer gönderim imkansız|kesinlikle ulaşmadı/i);
    });
  });

  describe("7. Zero Tenant Impersonation Guarantee", () => {
    it("audits platform code tree to guarantee absolute absence of impersonation buttons", async () => {
      const platformFiles = [
        "src/app/platform/page.tsx",
        "src/app/platform/businesses/page.tsx",
        "src/app/platform/businesses/[businessId]/page.tsx",
        "src/components/layout/platform-shell.tsx",
      ];

      for (const file of platformFiles) {
        const content = await readFile(file, "utf8");
        assert.doesNotMatch(content, /Login as/i, `${file} must not have 'Login as'`);
        assert.doesNotMatch(content, /Giriş yap olarak/i, `${file} must not have impersonation copy`);
        assert.doesNotMatch(content, /Switch tenant/i, `${file} must not have 'Switch tenant'`);
        assert.doesNotMatch(content, /İşletme adına giriş/i, `${file} must not have impersonation copy`);
        assert.doesNotMatch(content, /impersonat/i, `${file} must not have impersonate action`);
      }
    });
  });
});
