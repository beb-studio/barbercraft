/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let guardsModule: any;
let qaBootstrapModule: any;
let authRouteModule: any;
let presentationModule: any;
let publicBookingServiceModule: any;
let middlewareModule: any;

const TEST_CREDENTIALS = {
  superAdminEmail: "superadmin.http@barbercraft.local",
  superAdminPassword: "SuperSecurePassword123!",
  ownerEmail: "owner.http@barbercraft.local",
  ownerPassword: "OwnerSecurePassword123!",
  adminEmail: "admin.http@barbercraft.local",
  adminPassword: "AdminSecurePassword123!",
  staffEmail: "staff.http@barbercraft.local",
  staffPassword: "StaffSecurePassword123!",
};

before(async () => {
  pgServer = await startDatabase({ port: 54495 });
  process.env.DATABASE_URL = pgServer.connectionString;
  process.env.BETTER_AUTH_SECRET = "test-secret-http-routing-32-chars-min";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";

  guardsModule = await import("../../src/lib/auth/guards");
  qaBootstrapModule = await import("../../src/services/qa-bootstrap.service");
  authRouteModule = await import("../../src/app/api/auth/[...all]/route");
  presentationModule = await import("../../src/lib/presentation");
  publicBookingServiceModule = await import("../../src/services/public-booking.service");
  middlewareModule = await import("../../src/middleware");
});

after(async () => {
  await pgServer?.stop();
});

describe("PRE-011D: Better Auth HTTP Route & Integration Tests", () => {
  let bootstrapResult: any;

  before(async () => {
    bootstrapResult = await qaBootstrapModule.bootstrapQA(TEST_CREDENTIALS);
  });

  it("1. Better Auth HTTP handler exists and exports GET and POST handlers", () => {
    assert.ok(authRouteModule.POST, "POST handler must be exported");
    assert.ok(authRouteModule.GET, "GET handler must be exported");
    assert.equal(typeof authRouteModule.POST, "function");
    assert.equal(typeof authRouteModule.GET, "function");
  });

  it("2. /api/auth/sign-in/email does not return 404", async () => {
    const req = new Request("http://localhost:3001/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3001",
      },
      body: JSON.stringify({ email: "invalid@example.com", password: "invalidpassword" }),
    });

    const res = await authRouteModule.POST(req);
    assert.notEqual(res.status, 404, "Endpoint must not return 404 Not Found");
  });

  it("3. valid QA credentials authenticate through HTTP handler", async () => {
    const req = new Request("http://localhost:3001/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3001",
      },
      body: JSON.stringify({
        email: TEST_CREDENTIALS.superAdminEmail,
        password: TEST_CREDENTIALS.superAdminPassword,
      }),
    });

    const res = await authRouteModule.POST(req);
    assert.equal(res.status, 200, "Sign-in must return 200 OK");
    const json = await res.json();
    assert.ok(json.token, "Token must be present in response");
    assert.equal(json.user.id, bootstrapResult.users.superAdmin.id);
    assert.ok(res.headers.get("set-cookie"), "Session cookie must be set in response");
  });

  it("4. invalid credentials return safe auth failure (401), not 404", async () => {
    const req = new Request("http://localhost:3001/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3001",
      },
      body: JSON.stringify({
        email: TEST_CREDENTIALS.ownerEmail,
        password: "WrongPassword999!",
      }),
    });

    const res = await authRouteModule.POST(req);
    assert.equal(res.status, 401, "Invalid password must return 401 Unauthorized");
    const json = await res.json();
    assert.equal(json.code, "INVALID_EMAIL_OR_PASSWORD");
  });

  it("5. session can access protected business route", async () => {
    const { sessionDependencies } = await import("../../src/lib/auth/session");
    sessionDependencies.getCurrentUser = async () => ({
      id: bootstrapResult.users.owner.id,
      forcePasswordChange: false,
      email: bootstrapResult.users.owner.email,
    });

    const { user, membership } = await guardsModule.requireBusinessMembership(bootstrapResult.business.id);
    assert.equal(user.id, bootstrapResult.users.owner.id);
    assert.equal(membership.role, "OWNER");
  });

  it("6. platform SUPER_ADMIN can access /platform", async () => {
    const { sessionDependencies } = await import("../../src/lib/auth/session");
    sessionDependencies.getCurrentUser = async () => ({
      id: bootstrapResult.users.superAdmin.id,
      forcePasswordChange: false,
      email: bootstrapResult.users.superAdmin.email,
    });

    const context = await guardsModule.requirePlatformAdmin();
    assert.equal(context.platformRole, "SUPER_ADMIN");
    assert.equal(context.userId, bootstrapResult.users.superAdmin.id);
  });

  it("7. OWNER cannot access /platform", async () => {
    const { sessionDependencies } = await import("../../src/lib/auth/session");
    sessionDependencies.getCurrentUser = async () => ({
      id: bootstrapResult.users.owner.id,
      forcePasswordChange: false,
      email: bootstrapResult.users.owner.email,
    });

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

  it("8. middleware does not block /api/auth/**", () => {
    const matcherPattern = middlewareModule.config.matcher[0];
    const regex = new RegExp("^" + matcherPattern + "$");

    // Paths starting with /api/auth should NOT match the middleware matcher
    assert.equal(regex.test("/api/auth/sign-in/email"), false, "/api/auth/sign-in/email should be excluded from middleware");
    assert.equal(regex.test("/api/auth/get-session"), false, "/api/auth/get-session should be excluded from middleware");
    assert.equal(regex.test("/api/auth/sign-out"), false, "/api/auth/sign-out should be excluded from middleware");

    // While protected paths SHOULD match
    assert.equal(regex.test("/dashboard"), true, "/dashboard must match middleware");
    assert.equal(regex.test("/platform"), true, "/platform must match middleware");
  });

  it("9. public booking remains unauthenticated", async () => {
    const { sessionDependencies } = await import("../../src/lib/auth/session");
    sessionDependencies.getCurrentUser = async () => null;

    const biz = await publicBookingServiceModule.PublicBookingService.getPublicBusiness("qa-berber");
    assert.ok(biz);
    assert.equal(biz.slug, "qa-berber");
  });

  it("10. Turkish auth error behavior remains intact", () => {
    const errorResult = presentationModule.mapAuthError({ code: "INVALID_EMAIL_OR_PASSWORD" });
    assert.equal(errorResult, "E-posta adresi veya şifre hatalı.");

    const unknownError = presentationModule.mapAuthError({ code: "UNKNOWN_ERROR" });
    assert.equal(unknownError, "İşlem başarısız oldu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.");
  });
});
