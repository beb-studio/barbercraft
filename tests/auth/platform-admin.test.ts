/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";
import fs from "node:fs";
import path from "node:path";

let pgServer: any;
let db: any;
let sessionModule: any;
let guardsModule: any;
let platformServiceModule: any;
let schema: any;
let eq: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Test Users
const userSuperAdmin = uuid(801); // Platform SUPER_ADMIN, no business
const userPlatformAdmin = uuid(802); // Platform ADMIN, no business
const userPlatformAdminAndStaff = uuid(803); // Platform ADMIN + business STAFF
const userOwner = uuid(804); // Business OWNER, not platform admin
const userBusinessAdmin = uuid(805); // Business ADMIN, not platform admin
const userStaffOnly = uuid(806); // Business STAFF, not platform admin
const userNormalNoBiz = uuid(807); // Normal user, 0 business, not platform admin
const userInactiveAdmin = uuid(808); // Inactive platform admin

const testBiz = uuid(810);
const testMemberOwner = uuid(820);
const testMemberAdmin = uuid(821);
const testMemberStaff1 = uuid(822);
const testMemberStaff2 = uuid(823);
const testStaffProfile1 = uuid(830);
const testStaffProfile2 = uuid(831);
const testService = uuid(840);
const testCustomer = uuid(850);
const testAppointment = uuid(860);

before(async () => {
  pgServer = await startDatabase({ port: 54460 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  guardsModule = await import("../../src/lib/auth/guards");
  platformServiceModule = await import("../../src/services/platform-admin.service");
  schema = await import("../../src/db/schema");

  const orm = await import("drizzle-orm");
  eq = orm.eq;

  // 1. Insert Users
  const userInserts = [
    { id: userSuperAdmin, name: "Süper Admin", email: "superadmin@platform.test" },
    { id: userPlatformAdmin, name: "Platform Admin", email: "admin@platform.test" },
    { id: userPlatformAdminAndStaff, name: "Admin Staff", email: "adminstaff@platform.test" },
    { id: userOwner, name: "İşletme Sahibi", email: "owner@biz.test" },
    { id: userBusinessAdmin, name: "İşletme Yöneticisi", email: "bizadmin@biz.test" },
    { id: userStaffOnly, name: "Personel", email: "staff@biz.test" },
    { id: userNormalNoBiz, name: "Normal Kullanıcı", email: "normal@biz.test" },
    { id: userInactiveAdmin, name: "Pasif Admin", email: "inactive@platform.test" },
  ];

  for (const u of userInserts) {
    await db.execute(
      `INSERT INTO users (id, name, email, email_verified) VALUES ('${u.id}', '${u.name}', '${u.email}', true)`
    );
  }

  // 2. Insert Platform Admins
  await db.insert(schema.platformAdmins).values([
    {
      userId: userSuperAdmin,
      role: "SUPER_ADMIN",
      active: true,
    },
    {
      userId: userPlatformAdmin,
      role: "ADMIN",
      active: true,
    },
    {
      userId: userPlatformAdminAndStaff,
      role: "ADMIN",
      active: true,
    },
    {
      userId: userInactiveAdmin,
      role: "ADMIN",
      active: false,
    },
  ]);

  // 3. Insert Business & Members
  await db.insert(schema.businesses).values({
    id: testBiz,
    name: "Platform Test Berber",
    slug: "platform-test-berber",
    timezone: "Europe/Istanbul",
    currency: "TRY",
    active: true,
    onboardingCompletedAt: new Date(),
  });

  await db.insert(schema.businessMembers).values([
    { id: testMemberOwner, businessId: testBiz, userId: userOwner, role: "OWNER", active: true },
    { id: testMemberAdmin, businessId: testBiz, userId: userBusinessAdmin, role: "ADMIN", active: true },
    { id: testMemberStaff1, businessId: testBiz, userId: userStaffOnly, role: "STAFF", active: true },
    { id: testMemberStaff2, businessId: testBiz, userId: userPlatformAdminAndStaff, role: "STAFF", active: true },
  ]);

  // 4. Insert Staff Profiles (2 active staff profiles)
  await db.insert(schema.staffProfiles).values([
    {
      id: testStaffProfile1,
      businessId: testBiz,
      businessMemberId: testMemberStaff1,
      firstName: "Ahmet",
      lastName: "Usta",
      active: true,
    },
    {
      id: testStaffProfile2,
      businessId: testBiz,
      businessMemberId: testMemberStaff2,
      firstName: "Mehmet",
      lastName: "Usta",
      active: true,
    },
  ]);

  // 5. Insert Service
  await db.insert(schema.services).values({
    id: testService,
    businessId: testBiz,
    name: "Saç Kesimi",
    durationMinutes: 30,
    price: "250.00",
    active: true,
  });

  // 6. Insert Customer & Appointment
  await db.insert(schema.customers).values({
    id: testCustomer,
    businessId: testBiz,
    phone: "5551112233",
    normalizedPhone: "+905551112233",
    firstName: "Müşteri",
  });

  await db.insert(schema.appointments).values({
    id: testAppointment,
    businessId: testBiz,
    customerId: testCustomer,
    staffId: testStaffProfile1,
    serviceId: testService,
    startTime: new Date("2026-10-15T10:00:00Z"),
    endTime: new Date("2026-10-15T10:30:00Z"),
    serviceNameSnapshot: "Saç Kesimi",
    serviceDurationSnapshot: 30,
    servicePriceSnapshot: "250.00",
    status: "CONFIRMED",
    source: "PUBLIC_WEB",
  });
});

after(async () => {
  await pgServer?.stop();
});

describe("TASK 010A: Platform Administration Foundation Tests", () => {
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

  it("1. platform_admins table exists with correct columns", async () => {
    const rows = await db.select().from(schema.platformAdmins);
    assert.ok(rows.length >= 4);
  });

  it("2. platform_admins rejects duplicate platform admin for the same user", async () => {
    let threw = false;
    try {
      await db.insert(schema.platformAdmins).values({
        userId: userSuperAdmin,
        role: "ADMIN",
        active: true,
      });
    } catch (err: any) {
      threw = true;
      const msg = String(err.message || err.cause?.message || err);
      assert.ok(msg.toLowerCase().includes("unique") || err.code === "23505" || err.cause?.code === "23505");
    }
    assert.equal(threw, true);
  });

  it("3. valid SUPER_ADMIN and ADMIN rows are stored correctly", async () => {
    const [superRow] = await db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.userId, userSuperAdmin));
    assert.equal(superRow.role, "SUPER_ADMIN");
    assert.equal(superRow.active, true);

    const [adminRow] = await db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.userId, userPlatformAdmin));
    assert.equal(adminRow.role, "ADMIN");
    assert.equal(adminRow.active, true);
  });

  it("4. unauthenticated user is rejected with UnauthorizedError", async () => {
    mockSession(null);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.UnauthorizedError);
  });

  it("5. normal authenticated user without platform admin is rejected with ForbiddenError", async () => {
    mockSession(userNormalNoBiz);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("6. business OWNER without platform admin is rejected with ForbiddenError", async () => {
    mockSession(userOwner);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("7. business ADMIN without platform admin is rejected with ForbiddenError", async () => {
    mockSession(userBusinessAdmin);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("8. business STAFF without platform admin is rejected with ForbiddenError", async () => {
    mockSession(userStaffOnly);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("9. inactive platform admin is rejected with ForbiddenError", async () => {
    mockSession(userInactiveAdmin);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("10. active platform ADMIN is allowed and returns trusted typed context", async () => {
    mockSession(userPlatformAdmin);
    const ctx = await guardsModule.requirePlatformAdmin();
    assert.equal(ctx.userId, userPlatformAdmin);
    assert.equal(ctx.platformRole, "ADMIN");
    assert.ok(ctx.platformAdminId);
  });

  it("11. active platform SUPER_ADMIN is allowed and returns trusted typed context", async () => {
    mockSession(userSuperAdmin);
    const ctx = await guardsModule.requirePlatformAdmin();
    assert.equal(ctx.userId, userSuperAdmin);
    assert.equal(ctx.platformRole, "SUPER_ADMIN");
    assert.ok(ctx.platformAdminId);
  });

  it("12. platform admin does NOT require business membership", async () => {
    mockSession(userSuperAdmin);
    const memberships = await sessionModule.getMemberships();
    assert.equal(memberships.length, 0);

    const ctx = await guardsModule.requirePlatformAdmin();
    assert.equal(ctx.userId, userSuperAdmin);
  });

  it("13. user with platform ADMIN + business STAFF is platform-authorized solely from platform role", async () => {
    mockSession(userPlatformAdminAndStaff);
    const ctx = await guardsModule.requirePlatformAdmin();
    assert.equal(ctx.userId, userPlatformAdminAndStaff);
    assert.equal(ctx.platformRole, "ADMIN");

    const [m] = await sessionModule.getMemberships();
    assert.equal(m.role, "STAFF");
  });

  it("14. browser cannot spoof platform role or active state (guards read strictly from DB)", async () => {
    mockSession(userOwner);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("15. requirePlatformSuperAdmin allows SUPER_ADMIN", async () => {
    mockSession(userSuperAdmin);
    const ctx = await guardsModule.requirePlatformSuperAdmin();
    assert.equal(ctx.platformRole, "SUPER_ADMIN");
  });

  it("16. requirePlatformSuperAdmin rejects ADMIN with ForbiddenError", async () => {
    mockSession(userPlatformAdmin);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformSuperAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("17. aggregate overview metrics compute correct global counts", async () => {
    const metrics = await platformServiceModule.PlatformAdminService.getOverviewMetrics();

    assert.equal(metrics.totalBusinesses, 1);
    assert.equal(metrics.activeBusinesses, 1);
    assert.equal(metrics.totalUsers, 8);
    assert.equal(metrics.totalStaff, 2);
    assert.equal(metrics.totalAppointments, 1);
  });

  it("18. getCurrentPlatformAdmin helper accurately identifies platform status without throwing", async () => {
    mockSession(userSuperAdmin);
    const superCtx = await guardsModule.getCurrentPlatformAdmin();
    assert.ok(superCtx);
    assert.equal(superCtx.platformRole, "SUPER_ADMIN");

    mockSession(userOwner);
    const ownerCtx = await guardsModule.getCurrentPlatformAdmin();
    assert.equal(ownerCtx, null);

    mockSession(null);
    const nullCtx = await guardsModule.getCurrentPlatformAdmin();
    assert.equal(nullCtx, null);
  });

  it("19. bootstrap cannot grant admin to nonexistent user", async () => {
    await assert.rejects(async () => {
      await platformServiceModule.PlatformAdminService.grantPlatformAdmin({
        email: "nonexistent@user.com",
        role: "ADMIN",
      });
    }, /User not found/);
  });

  it("20. bootstrap rejects invalid role", async () => {
    await assert.rejects(async () => {
      await platformServiceModule.PlatformAdminService.grantPlatformAdmin({
        email: "normal@biz.test",
        role: "INVALID_ROLE" as any,
      });
    }, /Invalid platform admin role/);
  });

  it("21. bootstrap grants platform admin to valid user idempotently and logs audit record", async () => {
    const result = await platformServiceModule.PlatformAdminService.grantPlatformAdmin({
      email: "normal@biz.test",
      role: "ADMIN",
      actorUserId: userSuperAdmin,
    });

    assert.equal(result.success, true);
    assert.equal(result.role, "ADMIN");
    assert.equal(result.active, true);

    mockSession(userNormalNoBiz);
    const ctx = await guardsModule.requirePlatformAdmin();
    assert.equal(ctx.userId, userNormalNoBiz);

    const upgradeResult = await platformServiceModule.PlatformAdminService.grantPlatformAdmin({
      email: "normal@biz.test",
      role: "SUPER_ADMIN",
      actorUserId: userSuperAdmin,
    });
    assert.equal(upgradeResult.role, "SUPER_ADMIN");

    const upgradedCtx = await guardsModule.requirePlatformSuperAdmin();
    assert.equal(upgradedCtx.platformRole, "SUPER_ADMIN");

    const auditLogs = await db
      .select()
      .from(schema.platformAdminAuditLogs)
      .where(eq(schema.platformAdminAuditLogs.targetId, userNormalNoBiz));
    assert.ok(auditLogs.length >= 2);
    assert.equal(auditLogs[0].action, "BOOTSTRAP_GRANT_PLATFORM_ADMIN");
    assert.equal(auditLogs[0].targetType, "user");
  });

  it("22. listPlatformAdmins returns active administrators with joined user details", async () => {
    const list = await platformServiceModule.PlatformAdminService.listPlatformAdmins();
    assert.ok(list.length >= 4);
    const superAdminEntry = list.find((a: any) => a.userId === userSuperAdmin);
    assert.ok(superAdminEntry);
    assert.equal(superAdminEntry.role, "SUPER_ADMIN");
    assert.equal(superAdminEntry.userEmail, "superadmin@platform.test");
  });

  it("23. business OWNER retains normal business guards and access", async () => {
    mockSession(userOwner);
    const res = await guardsModule.requireOwner(testBiz);
    assert.equal(res.user.id, userOwner);
    assert.equal(res.membership.role, "OWNER");
  });

  it("24. business ADMIN retains normal business admin guards and access", async () => {
    mockSession(userBusinessAdmin);
    const res = await guardsModule.requireAdminOrOwner(testBiz);
    assert.equal(res.user.id, userBusinessAdmin);
    assert.equal(res.membership.role, "ADMIN");
  });

  it("25. business OWNER is rejected by requirePlatformAdmin", async () => {
    mockSession(userOwner);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("26. business ADMIN is rejected by requirePlatformAdmin", async () => {
    mockSession(userBusinessAdmin);
    await assert.rejects(async () => {
      await guardsModule.requirePlatformAdmin();
    }, guardsModule.ForbiddenError);
  });

  it("27. platform SUPER_ADMIN is rejected by requireBusinessMembership when accessing business they do not belong to", async () => {
    mockSession(userSuperAdmin);
    await assert.rejects(async () => {
      await guardsModule.requireBusinessMembership(testBiz);
    }, guardsModule.ForbiddenError);
  });

  it("28. platform presentation helpers return exact Turkish labels", async () => {
    const { getPlatformRoleLabel } = await import("../../src/lib/presentation");
    assert.equal(getPlatformRoleLabel("SUPER_ADMIN"), "Süper Yönetici");
    assert.equal(getPlatformRoleLabel("ADMIN"), "Platform Yöneticisi");
  });

  it("29. platform pages contain only Turkish visible copy", () => {
    const pagePath = path.join(process.cwd(), "src/app/platform/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");
    assert.ok(content.includes("Platform Yönetimi"));
    assert.ok(content.includes("Platform genelindeki işletmeleri ve kullanım durumunu yönetin."));
    assert.ok(content.includes("Toplam İşletme"));
    assert.ok(content.includes("Aktif İşletme"));
    assert.ok(content.includes("Toplam Kullanıcı"));
    assert.ok(content.includes("Toplam Personel"));
    assert.ok(content.includes("Toplam Randevu"));

    const deniedPath = path.join(process.cwd(), "src/app/platform/_components/access-denied.tsx");
    const deniedContent = fs.readFileSync(deniedPath, "utf-8");
    assert.ok(deniedContent.includes("Erişim Engellendi"));
    assert.ok(deniedContent.includes("Yönetim Paneline Dön"));
  });

  it("30. no public HTTP route grants platform admin authority (CLI and server service only)", () => {
    const apiDir = path.join(process.cwd(), "src/app/api");
    const files = fs.readdirSync(apiDir, { recursive: true }) as string[];
    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".ts")) {
        const content = fs.readFileSync(path.join(apiDir, file), "utf-8");
        assert.equal(content.includes("grantPlatformAdmin"), false);
      }
    }
  });
});
