/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let guardsModule: any;
let onboardingModule: any;
let publicBookingServiceModule: any;
let appointmentServiceModule: any;
let qaBootstrapModule: any;
let authModule: any;
let schema: any;

const TEST_CREDENTIALS = {
  superAdminEmail: "superadmin.qa@barbercraft.local",
  superAdminPassword: "SuperSecurePassword123!",
  ownerEmail: "owner.qa@barbercraft.local",
  ownerPassword: "OwnerSecurePassword123!",
  adminEmail: "admin.qa@barbercraft.local",
  adminPassword: "AdminSecurePassword123!",
  staffEmail: "staff.qa@barbercraft.local",
  staffPassword: "StaffSecurePassword123!",
};

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  sessionModule = await import("../../src/lib/auth/session");
  guardsModule = await import("../../src/lib/auth/guards");
  onboardingModule = await import("../../src/lib/auth/onboarding");
  publicBookingServiceModule = await import("../../src/services/public-booking.service");
  appointmentServiceModule = await import("../../src/services/appointment.service");
  qaBootstrapModule = await import("../../src/services/qa-bootstrap.service");
  authModule = await import("../../src/lib/auth/auth");
  schema = await import("../../src/db/schema");
});

after(async () => {
  await pgServer?.stop();
});

describe("PRE-011: QA Bootstrap & Route Security Audit Tests", () => {
  let bootstrapResult: any;

  const mockSession = (userId: string | null) => {
    if (!userId) {
      sessionModule.sessionDependencies.getCurrentUser = async () => null;
    } else {
      sessionModule.sessionDependencies.getCurrentUser = async () => ({
        id: userId,
        email: "mock@example.com",
      });
    }
  };

  it("1. qa bootstrap refuses production execution", async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    await assert.rejects(
      async () => {
        await qaBootstrapModule.bootstrapQA(TEST_CREDENTIALS);
      },
      (err: any) => {
        assert.match(err.message, /production/i);
        return true;
      }
    );

    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it("16. no password is logged during bootstrap execution", async () => {
    const originalLog = console.log;
    const originalError = console.error;
    const loggedMessages: string[] = [];

    console.log = (...args: any[]) => {
      loggedMessages.push(args.map(String).join(" "));
    };
    console.error = (...args: any[]) => {
      loggedMessages.push(args.map(String).join(" "));
    };

    try {
      bootstrapResult = await qaBootstrapModule.bootstrapQA(TEST_CREDENTIALS);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    const allLogs = loggedMessages.join("\n");
    assert.doesNotMatch(allLogs, new RegExp(TEST_CREDENTIALS.superAdminPassword, "i"));
    assert.doesNotMatch(allLogs, new RegExp(TEST_CREDENTIALS.ownerPassword, "i"));
    assert.doesNotMatch(allLogs, new RegExp(TEST_CREDENTIALS.adminPassword, "i"));
    assert.doesNotMatch(allLogs, new RegExp(TEST_CREDENTIALS.staffPassword, "i"));
  });

  it("2, 3, 4. bootstrap is idempotent and creates no duplicate users or businesses", async () => {
    const usersBefore = await db.select().from(schema.users);
    const businessesBefore = await db.select().from(schema.businesses);
    const membersBefore = await db.select().from(schema.businessMembers);
    const staffBefore = await db.select().from(schema.staffProfiles);
    const servicesBefore = await db.select().from(schema.services);

    // Run bootstrap a second time
    const secondResult = await qaBootstrapModule.bootstrapQA(TEST_CREDENTIALS);

    const usersAfter = await db.select().from(schema.users);
    const businessesAfter = await db.select().from(schema.businesses);
    const membersAfter = await db.select().from(schema.businessMembers);
    const staffAfter = await db.select().from(schema.staffProfiles);
    const servicesAfter = await db.select().from(schema.services);

    assert.equal(usersAfter.length, usersBefore.length, "No duplicate users created");
    assert.equal(businessesAfter.length, businessesBefore.length, "No duplicate businesses created");
    assert.equal(membersAfter.length, membersBefore.length, "No duplicate memberships created");
    assert.equal(staffAfter.length, staffBefore.length, "No duplicate staff profiles created");
    assert.equal(servicesAfter.length, servicesBefore.length, "No duplicate services created");

    assert.equal(secondResult.business.id, bootstrapResult.business.id);
    assert.equal(secondResult.users.superAdmin.id, bootstrapResult.users.superAdmin.id);
    assert.equal(secondResult.users.owner.id, bootstrapResult.users.owner.id);
    assert.equal(secondResult.users.admin.id, bootstrapResult.users.admin.id);
    assert.equal(secondResult.users.staff.id, bootstrapResult.users.staff.id);
  });

  it("5. SUPER_ADMIN can access /platform", async () => {
    mockSession(bootstrapResult.users.superAdmin.id);
    const adminContext = await guardsModule.requirePlatformAdmin();
    assert.equal(adminContext.platformRole, "SUPER_ADMIN");
    assert.equal(adminContext.userId, bootstrapResult.users.superAdmin.id);
  });

  it("6. OWNER cannot access /platform", async () => {
    mockSession(bootstrapResult.users.owner.id);
    await assert.rejects(
      async () => {
        await guardsModule.requirePlatformAdmin();
      },
      (err: any) => {
        assert.equal(err.name, "ForbiddenError");
        return true;
      }
    );
  });

  it("7. BUSINESS MANAGER cannot access /platform", async () => {
    mockSession(bootstrapResult.users.admin.id);
    await assert.rejects(
      async () => {
        await guardsModule.requirePlatformAdmin();
      },
      (err: any) => {
        assert.equal(err.name, "ForbiddenError");
        return true;
      }
    );
  });

  it("8. STAFF cannot access /platform", async () => {
    mockSession(bootstrapResult.users.staff.id);
    await assert.rejects(
      async () => {
        await guardsModule.requirePlatformAdmin();
      },
      (err: any) => {
        assert.equal(err.name, "ForbiddenError");
        return true;
      }
    );
  });

  it("9. OWNER can access dashboard without onboarding redirection", async () => {
    mockSession(bootstrapResult.users.owner.id);
    const step = await onboardingModule.getOnboardingStep();
    assert.equal(step, "COMPLETED", "Owner onboarding step should be COMPLETED");
  });

  it("10. MANAGER can access dashboard according to existing business rules", async () => {
    mockSession(bootstrapResult.users.admin.id);
    const step = await onboardingModule.getOnboardingStep();
    assert.equal(step, "NOT_APPLICABLE", "Manager onboarding step should be NOT_APPLICABLE");
    const { user, membership } = await guardsModule.requireBusinessMembership(bootstrapResult.business.id);
    assert.equal(membership.role, "MANAGER");
    assert.equal(user.id, bootstrapResult.users.admin.id);
  });

  it("11. STAFF can access allowed dashboard routes", async () => {
    mockSession(bootstrapResult.users.staff.id);
    const step = await onboardingModule.getOnboardingStep();
    assert.equal(step, "NOT_APPLICABLE", "Staff onboarding step should be NOT_APPLICABLE");
    const { user, membership } = await guardsModule.requireBusinessMembership(bootstrapResult.business.id);
    assert.equal(membership.role, "STAFF");
    assert.equal(user.id, bootstrapResult.users.staff.id);
  });

  it("12. public /book/qa-berber does not require auth", async () => {
    mockSession(null); // Unauthenticated public customer
    const biz = await publicBookingServiceModule.PublicBookingService.getPublicBusiness("qa-berber");
    assert.ok(biz, "Business should be retrieved without session");
    assert.equal(biz.slug, "qa-berber");
    assert.equal(biz.name, "QA Berber");

    const services = await publicBookingServiceModule.PublicBookingService.getPublicServices("qa-berber");
    assert.ok(services.length >= 2, "Should have at least 2 services");
  });

  it("13. public schedule does not require auth", async () => {
    mockSession(null); // Unauthenticated public customer
    const service = bootstrapResult.services[0];
    const avail = await publicBookingServiceModule.PublicBookingService.getPublicAnyStaffAvailability({
      slug: "qa-berber",
      serviceId: service.id,
      localDate: "2026-10-15", // A Thursday with full working hours
    });

    assert.equal(avail.success, true);
    assert.ok(avail.slots.length > 0, "Slots should be returned without authentication");
  });

  it("14. public confirm does not require auth", async () => {
    mockSession(null); // Unauthenticated public customer
    const service = bootstrapResult.services[0];
    const avail = await publicBookingServiceModule.PublicBookingService.getPublicAnyStaffAvailability({
      slug: "qa-berber",
      serviceId: service.id,
      localDate: "2026-10-15",
    });

    assert.ok(avail.slots.length > 0);
    const slot = avail.slots[0];

    const validation = await publicBookingServiceModule.PublicBookingService.validatePublicAnyStaffSlotSelection({
      slug: "qa-berber",
      serviceId: service.id,
      startAt: slot.startAt,
    });

    assert.equal(validation.valid, true);
    assert.ok(validation.business);
    assert.ok(validation.service);
    assert.ok(validation.slot);
  });

  it("15. public booking still works end-to-end without auth", async () => {
    mockSession(null); // Unauthenticated public customer
    const service = bootstrapResult.services[0];
    const avail = await publicBookingServiceModule.PublicBookingService.getPublicAnyStaffAvailability({
      slug: "qa-berber",
      serviceId: service.id,
      localDate: "2026-10-15",
    });

    const slot = avail.slots[1]; // Use slot index 1

    const bookingResult = await appointmentServiceModule.AppointmentService.createAnyStaffAppointment({
      businessId: bootstrapResult.business.id,
      candidateStaffIds: [bootstrapResult.staffProfiles.ownerStaffId, bootstrapResult.staffProfiles.staffStaffId],
      serviceId: service.id,
      startAt: slot.startAt,
      customer: {
        firstName: "Kemal",
        lastName: "Sunal",
        phone: "+905553334455",
      },
    });

    assert.ok(bookingResult.appointment.id);
    assert.equal(bookingResult.appointment.businessId, bootstrapResult.business.id);
    assert.ok(bookingResult.assignedStaffId);
  });

  it("17. all 4 QA roles can successfully authenticate via Better Auth signInEmail using their credentials", async () => {
    const roles = [
      { email: TEST_CREDENTIALS.superAdminEmail, password: TEST_CREDENTIALS.superAdminPassword, id: bootstrapResult.users.superAdmin.id },
      { email: TEST_CREDENTIALS.ownerEmail, password: TEST_CREDENTIALS.ownerPassword, id: bootstrapResult.users.owner.id },
      { email: TEST_CREDENTIALS.adminEmail, password: TEST_CREDENTIALS.adminPassword, id: bootstrapResult.users.admin.id },
      { email: TEST_CREDENTIALS.staffEmail, password: TEST_CREDENTIALS.staffPassword, id: bootstrapResult.users.staff.id },
    ];

    for (const r of roles) {
      const res = await authModule.auth.api.signInEmail({
        body: { email: r.email, password: r.password },
        asResponse: false,
      });
      assert.ok(res.token, `Token should be issued for ${r.email}`);
      assert.equal(res.user.id, r.id, `User ID should match for ${r.email}`);
    }
  });

  it("18. invalid password rejects signInEmail", async () => {
    await assert.rejects(
      async () => {
        await authModule.auth.api.signInEmail({
          body: { email: TEST_CREDENTIALS.ownerEmail, password: "WrongPassword999!" },
          asResponse: false,
        });
      },
      (err: any) => {
        assert.ok(err);
        return true;
      }
    );
  });

  it("19. updating credentials via bootstrap syncs password and enables login with new password", async () => {
    const updatedCreds = {
      ...TEST_CREDENTIALS,
      ownerPassword: "NewOwnerPassword456!",
    };

    await qaBootstrapModule.bootstrapQA(updatedCreds);

    // Old password should now fail
    await assert.rejects(
      async () => {
        await authModule.auth.api.signInEmail({
          body: { email: updatedCreds.ownerEmail, password: TEST_CREDENTIALS.ownerPassword },
          asResponse: false,
        });
      }
    );

    // New password must succeed
    const newSignIn = await authModule.auth.api.signInEmail({
      body: { email: updatedCreds.ownerEmail, password: "NewOwnerPassword456!" },
      asResponse: false,
    });
    assert.equal(newSignIn.user.id, bootstrapResult.users.owner.id);
  });

  it("20. adopting existing memberships when credentials change preserves staff profiles", async () => {
    const changedEmailsCreds = {
      ...TEST_CREDENTIALS,
      ownerEmail: "reassigned.owner@test.local",
      ownerPassword: "ReassignedOwnerPass123!",
    };

    const thirdResult = await qaBootstrapModule.bootstrapQA(changedEmailsCreds);

    // Staff profile ID for owner must remain the same
    assert.equal(thirdResult.staffProfiles.ownerStaffId, bootstrapResult.staffProfiles.ownerStaffId);

    // New owner can sign in
    const reassignedSignIn = await authModule.auth.api.signInEmail({
      body: { email: changedEmailsCreds.ownerEmail, password: changedEmailsCreds.ownerPassword },
      asResponse: false,
    });
    assert.equal(reassignedSignIn.user.id, thirdResult.users.owner.id);
  });
});
