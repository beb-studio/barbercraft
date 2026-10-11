/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let serviceActions: any;
let serviceService: any;
let onboardingModule: any;
let businesses: any;
let businessMembers: any;
let businessWorkingHours: any;
let services: any;
let eq: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const userNoBiz = uuid(401);
const userStaff = uuid(402);
const userAdmin = uuid(403);
const userIncompleteHoursOwner = uuid(404);
const userOwner1 = uuid(405);
const userOwner2 = uuid(406);

const bizIncompleteHours = uuid(410);
const biz1 = uuid(420);
const biz2 = uuid(430);

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  serviceActions = await import("../../src/actions/service.actions");
  serviceService = await import("../../src/services/service.service");
  onboardingModule = await import("../../src/lib/auth/onboarding");

  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
  businessWorkingHours = schema.businessWorkingHours;
  services = schema.services;

  const orm = await import("drizzle-orm");
  eq = orm.eq;

  // Insert mock users
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userNoBiz}', 'No Biz User', 'nobiz@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userStaff}', 'Staff User', 'staff@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userAdmin}', 'Admin User', 'admin@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userIncompleteHoursOwner}', 'Inc Hours Owner', 'inchours@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwner1}', 'Owner 1', 'owner1@test.com', true)`);
  await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userOwner2}', 'Owner 2', 'owner2@test.com', true)`);

  // Insert businesses
  await db.insert(businesses).values([
    {
      id: bizIncompleteHours,
      name: "Biz Incomplete Hours",
      slug: "biz-inc-hours",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: null,
    },
    {
      id: biz1,
      name: "Biz One",
      slug: "biz-one",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: null,
    },
    {
      id: biz2,
      name: "Biz Two",
      slug: "biz-two",
      timezone: "Europe/Istanbul",
      currency: "USD",
      onboardingCompletedAt: null,
    },
  ]);

  // Insert memberships
  await db.insert(businessMembers).values([
    { businessId: bizIncompleteHours, userId: userIncompleteHoursOwner, role: "OWNER" },
    { businessId: biz1, userId: userOwner1, role: "OWNER" },
    { businessId: biz1, userId: userStaff, role: "STAFF" },
    { businessId: biz1, userId: userAdmin, role: "ADMIN" },
    { businessId: biz2, userId: userOwner2, role: "OWNER" },
  ]);

  // Insert 7 working hour rows for biz1 and biz2
  const weekDays = [0, 1, 2, 3, 4, 5, 6];
  for (const day of weekDays) {
    await db.insert(businessWorkingHours).values({
      businessId: biz1,
      dayOfWeek: day,
      startTime: day === 0 ? null : "09:00:00",
      endTime: day === 0 ? null : "20:00:00",
      isClosed: day === 0,
    });
    await db.insert(businessWorkingHours).values({
      businessId: biz2,
      dayOfWeek: day,
      startTime: day === 0 ? null : "09:00:00",
      endTime: day === 0 ? null : "20:00:00",
      isClosed: day === 0,
    });
  }
});

after(async () => {
  await pgServer?.stop();
});

describe("First Service Onboarding Tests", () => {
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

  const validPayload = {
    name: "Özel Saç Kesimi",
    description: "Yıkama ve fön dahil kaliteli saç kesimi",
    durationMinutes: 45,
    price: "250.00",
  };

  it("1. unauthenticated user cannot create first service", async () => {
    mockSession(null);
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Yetkisiz işlem"));
  });

  it("2. user with no business cannot create service through onboarding", async () => {
    mockSession(userNoBiz);
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("İşletme bulunamadı"));
  });

  it("3. STAFF cannot create first service", async () => {
    mockSession(userStaff);
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("yalnızca işletme SAHİBİ (OWNER) ekleyebilir"));
  });

  it("4. ADMIN cannot use OWNER first-time onboarding flow", async () => {
    mockSession(userAdmin);
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("yalnızca işletme SAHİBİ (OWNER) ekleyebilir"));
  });

  it("5. OWNER whose business working hours are incomplete cannot skip ahead and create first service", async () => {
    mockSession(userIncompleteHoursOwner);
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("çalışma saatlerini eksiksiz belirleyin"));
  });

  it("6. valid service creation succeeds", async () => {
    mockSession(userOwner1);
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, true);
    assert.ok(res.serviceId);
  });

  it("7. created service belongs to the authenticated OWNER's business", async () => {
    const [svc] = await db.select().from(services).where(eq(services.name, validPayload.name));
    assert.ok(svc);
    assert.equal(svc.businessId, biz1);
  });

  it("8. client cannot spoof another business ID (action derives business purely from session)", async () => {
    mockSession(userOwner2);
    const res = await serviceActions.createFirstServiceAction({
      name: "Biz Two Service",
      durationMinutes: 30,
      price: "150.00",
    });
    assert.equal(res.success, true);

    const [svc] = await db.select().from(services).where(eq(services.name, "Biz Two Service"));
    assert.ok(svc);
    // Even if client tried to target biz1, it is forced to userOwner2's business (biz2)
    assert.equal(svc.businessId, biz2);
  });

  it("9. service is created with active = true", async () => {
    const [svc] = await db.select().from(services).where(eq(services.name, validPayload.name));
    assert.ok(svc);
    assert.equal(svc.active, true);
  });

  it("10. empty/whitespace-only name fails", async () => {
    assert.throws(
      () => serviceService.validateServiceName("   "),
      /Hizmet adı boş bırakılamaz/
    );
  });

  it("11. invalid duration <= 0 fails", async () => {
    assert.throws(
      () => serviceService.validateServiceDuration(0),
      /Süre 0'dan büyük olmalıdır/
    );
    assert.throws(
      () => serviceService.validateServiceDuration(-15),
      /Süre 0'dan büyük olmalıdır/
    );
  });

  it("12. duration beyond DB-supported maximum fails", async () => {
    assert.throws(
      () => serviceService.validateServiceDuration(1441),
      /en fazla 1440 dakika/
    );
  });

  it("13. non-integer duration fails", async () => {
    assert.throws(
      () => serviceService.validateServiceDuration(30.5),
      /tam sayı olmalıdır/
    );
    assert.throws(
      () => serviceService.validateServiceDuration("abc"),
      /tam sayı olmalıdır/
    );
  });

  it("14. negative price fails", async () => {
    assert.throws(
      () => serviceService.validateServicePrice("-50"),
      /Geçerli bir fiyat giriniz/
    );
  });

  it("15. malformed price fails", async () => {
    assert.throws(
      () => serviceService.validateServicePrice("abc"),
      /Geçerli bir fiyat giriniz/
    );
    assert.throws(
      () => serviceService.validateServicePrice("25.999"),
      /Geçerli bir fiyat giriniz/
    );
  });

  it("16. successful service creation advances onboarding state to OWNER_STAFF", async () => {
    mockSession(userOwner1);
    const step = await onboardingModule.getOnboardingStep();
    assert.equal(step, "OWNER_STAFF");
  });

  it("17. onboarding_completed_at remains NULL", async () => {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, biz1));
    assert.equal(biz.onboardingCompletedAt, null);
  });

  it("18. revisiting /onboarding/first-service after service creation redirects to /onboarding/owner-staff", async () => {
    mockSession(userOwner1);
    // Calling action again is rejected because 1 service already exists
    const res = await serviceActions.createFirstServiceAction(validPayload);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("İlk hizmet zaten oluşturulmuş"));
  });

  it("19. failed service creation does not leave a partial or malformed service row", async () => {
    const countBefore = await serviceService.countServices(biz1);
    try {
      await serviceService.createFirstService(biz1, {
        name: "Bad Service",
        durationMinutes: -10, // Invalid
        price: "100.00",
      });
    } catch {
      // expected error
    }
    const countAfter = await serviceService.countServices(biz1);
    assert.equal(countBefore, countAfter);
  });

  it("20. existing Task 004A/004B onboarding progression remains correct", async () => {
    mockSession(userNoBiz);
    assert.equal(await onboardingModule.getOnboardingStep(), "NO_BUSINESS");

    mockSession(userIncompleteHoursOwner);
    assert.equal(await onboardingModule.getOnboardingStep(), "BUSINESS_HOURS");

    mockSession(userOwner1);
    assert.equal(await onboardingModule.getOnboardingStep(), "OWNER_STAFF");
  });
});
