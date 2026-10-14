/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let envModule: any;
let rateLimitModule: any;

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  envModule = await import("../../src/lib/env");
  rateLimitModule = await import("../../src/lib/rate-limit");
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("Production Deployment & Operational Readiness", () => {
  // ===========================================================================
  // SECTION 1: PRODUCTION ENVIRONMENT VALIDATION
  // ===========================================================================
  describe("Production Environment Validation", () => {
    it("1.1 rejects HTTP protocol for base URL in production", () => {
      const res = envModule.validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/app",
        BETTER_AUTH_SECRET: "strong_production_secret_at_least_32_chars_ok",
        APP_BASE_URL: "http://barber.example.com",
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e: string) => e.includes("must use HTTPS in production")));
    });

    it("1.2 rejects localhost and loopback hostnames for base URL in production", () => {
      const res = envModule.validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/app",
        BETTER_AUTH_SECRET: "strong_production_secret_at_least_32_chars_ok",
        APP_BASE_URL: "https://localhost:3000",
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e: string) => e.includes("must not use localhost/loopback")));

      const resIp = envModule.validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/app",
        BETTER_AUTH_SECRET: "strong_production_secret_at_least_32_chars_ok",
        APP_BASE_URL: "https://127.0.0.1:3000",
      });
      assert.equal(resIp.isValid, false);
      assert.ok(resIp.errors.some((e: string) => e.includes("must not use localhost/loopback")));
    });

    it("1.3 rejects mismatched origins across APP_BASE_URL, BETTER_AUTH_URL, and NEXT_PUBLIC_APP_URL in production", () => {
      const res = envModule.validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/app",
        BETTER_AUTH_SECRET: "strong_production_secret_at_least_32_chars_ok",
        APP_BASE_URL: "https://barber.example.com",
        BETTER_AUTH_URL: "https://auth.otherdomain.com",
        NEXT_PUBLIC_APP_URL: "https://barber.example.com",
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Base URL origin mismatch")));
    });

    it("1.4 passes when all production variables are securely configured and origins match", () => {
      const res = envModule.validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/app",
        BETTER_AUTH_SECRET: "strong_production_secret_at_least_32_chars_ok",
        APP_BASE_URL: "https://barber.example.com",
        BETTER_AUTH_URL: "https://barber.example.com",
        NEXT_PUBLIC_APP_URL: "https://barber.example.com",
      });
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });

    it("1.5 worker environment validation does not require BETTER_AUTH_SECRET", () => {
      const res = envModule.validateWorkerEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db:5432/app",
        APP_BASE_URL: "https://barber.example.com",
        // BETTER_AUTH_SECRET omitted
      });
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });

    it("1.6 worker environment validation requires DATABASE_URL and valid HTTPS base URL", () => {
      const res = envModule.validateWorkerEnvironment({
        NODE_ENV: "production",
        // DATABASE_URL omitted
        APP_BASE_URL: "http://barber.example.com",
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e: string) => e.includes("DATABASE_URL is required for worker")));
      assert.ok(res.errors.some((e: string) => e.includes("must use HTTPS in production")));
    });
  });

  // ===========================================================================
  // SECTION 2: HEALTH & READINESS PROBES
  // ===========================================================================
  describe("Health & Readiness Probes", () => {
    it("2.1 GET /api/health returns HTTP 200 with minimal machine-readable payload", async () => {
      const { GET } = await import("../../src/app/api/health/route");
      const res = await GET();
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.status, "ok");
      assert.ok(typeof json.uptimeSeconds === "number");
      assert.ok(typeof json.timestamp === "string");

      // Verify no sensitive keys leaked
      assert.equal(json.databaseUrl, undefined);
      assert.equal(json.secret, undefined);
      assert.equal(json.db, undefined);

      // Verify no-store header
      const cacheControl = res.headers.get("Cache-Control");
      assert.ok(cacheControl?.includes("no-store"));
    });

    it("2.2 GET /api/ready returns HTTP 200 ready when database is connected", async () => {
      const { GET } = await import("../../src/app/api/ready/route");
      const res = await GET();
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.status, "ready");
      assert.ok(typeof json.latencyMs === "number");

      // Verify no sensitive keys leaked
      assert.equal(json.connectionString, undefined);
      assert.equal(json.stack, undefined);
    });

    it("2.3 checkDatabaseHealth handles bounded timeout cleanly", async () => {
      const { checkDatabaseHealth } = await import("../../src/db");
      const health = await checkDatabaseHealth(3000);
      assert.equal(health.ok, true);
      assert.ok(typeof health.latencyMs === "number");
    });

    it("2.4 GET /api/health remains DB-independent and succeeds without DB query", async () => {
      const { GET } = await import("../../src/app/api/health/route");
      // Even if database connection is corrupted, health check does not query DB
      const origUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = "postgresql://invalid:invalid@127.0.0.1:1/nonexistent";
        const res = await GET();
        assert.equal(res.status, 200);
        const json = await res.json();
        assert.equal(json.status, "ok");
      } finally {
        process.env.DATABASE_URL = origUrl;
      }
    });

    it("2.5 GET /api/ready returns HTTP 503 with minimal machine-safe payload when DB unavailable", async () => {
      const { pool } = await import("../../src/db");
      const origConnect = pool.connect;
      try {
        pool.connect = (async () => {
          throw new Error("Simulated connection refused on port 5432");
        }) as any;

        const { GET } = await import("../../src/app/api/ready/route");
        const res = await GET();
        assert.equal(res.status, 503);

        const json = await res.json();
        // Public payload must be strictly minimal
        assert.deepEqual(json, { status: "not_ready" });
        assert.deepEqual(Object.keys(json), ["status"]);
        assert.equal((json as any).reason, undefined);
        assert.equal((json as any).error, undefined);
        assert.equal((json as any).stack, undefined);
      } finally {
        pool.connect = origConnect;
      }
    });

    it("2.6 docker-compose.production.yml configures app healthcheck using /api/ready", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const composeContent = fs.readFileSync(
        path.resolve(process.cwd(), "docker-compose.production.yml"),
        "utf8"
      );

      assert.ok(
        composeContent.includes("http://127.0.0.1:3000/api/ready"),
        "docker-compose.production.yml app service healthcheck must use /api/ready"
      );
      assert.ok(
        !composeContent.includes("http://127.0.0.1:3000/api/health"),
        "docker-compose.production.yml app service healthcheck must not use liveness /api/health"
      );
    });
  });

  // ===========================================================================
  // SECTION 3: RATE LIMIT CLEANUP & PROXY CONTRACT
  // ===========================================================================
  describe("Rate Limit Housekeeping & Proxy Contract", () => {
    it("3.1 cleanupExpiredRateLimits safely purges expired rows and preserves active windows", async () => {
      const pastDate = new Date(Date.now() - 60_000); // Expired 1 min ago
      const futureDate = new Date(Date.now() + 60_000); // Valid for 1 more min

      // Insert test expired and active rows
      await db.execute(sql`
        INSERT INTO rate_limits (key, count, expires_at, created_at, updated_at)
        VALUES
          ('test-expired-1', 5, ${pastDate}, now(), now()),
          ('test-expired-2', 3, ${pastDate}, now(), now()),
          ('test-active-1', 1, ${futureDate}, now(), now())
        ON CONFLICT (key) DO UPDATE
        SET count = EXCLUDED.count, expires_at = EXCLUDED.expires_at;
      `);

      const cleaned = await rateLimitModule.cleanupExpiredRateLimits();
      assert.ok(cleaned >= 2);

      // Verify active row was preserved
      const activeRows = await db.execute(sql`
        SELECT key FROM rate_limits WHERE key = 'test-active-1';
      `);
      assert.equal(activeRows.rows.length, 1);

      // Verify expired rows were deleted
      const expiredRows = await db.execute(sql`
        SELECT key FROM rate_limits WHERE key IN ('test-expired-1', 'test-expired-2');
      `);
      assert.equal(expiredRows.rows.length, 0);

      // Clean up test active row
      await db.execute(sql`DELETE FROM rate_limits WHERE key = 'test-active-1';`);
    });

    it("3.2 hashIdentifier consistently produces 256-bit SHA-256 digest without raw IP persistence", () => {
      const ip = "203.0.113.195";
      const hash1 = rateLimitModule.hashIdentifier(ip);
      const hash2 = rateLimitModule.hashIdentifier(ip);

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
      assert.equal(hash1.includes(ip), false);
    });
  });

  // ===========================================================================
  // SECTION 4: ROUTE ACCURACY & IDENTITY MANAGEMENT INTEGRITY
  // ===========================================================================
  describe("Acceptance Route Accuracy & Identity Integrity", () => {
    it("4.1 verified acceptance routes match actual route tree and file system", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      // Staff appointments agenda page exists at /dashboard/appointments
      assert.ok(
        fs.existsSync(path.resolve(process.cwd(), "src/app/(dashboard)/dashboard/appointments/page.tsx")),
        "/dashboard/appointments route must exist"
      );

      // Staff workspace branch is handled on /dashboard
      const dashboardPage = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"),
        "utf8"
      );
      assert.ok(
        dashboardPage.includes('role === "STAFF"') && dashboardPage.includes("StaffDashboardView"),
        "/dashboard must render StaffDashboardView for STAFF role"
      );

      // Inexistent /dashboard/agenda must not exist
      assert.equal(
        fs.existsSync(path.resolve(process.cwd(), "src/app/(dashboard)/dashboard/agenda")),
        false,
        "/dashboard/agenda route must NOT exist"
      );

      // Customer capability access route exists at /randevu
      assert.ok(
        fs.existsSync(path.resolve(process.cwd(), "src/app/(public)/randevu/page.tsx")),
        "/randevu page must exist"
      );

      // Customer capability fragment format uses window.location.hash.slice(1) (#<token>)
      const clientContent = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/(public)/randevu/appointment-management-client.tsx"),
        "utf8"
      );
      assert.ok(
        clientContent.includes("window.location.hash.slice(1)"),
        "Client must parse raw fragment hash #<token>"
      );
    });

    it("4.2 public signup remains permanently disabled via Better Auth", async () => {
      const { auth } = await import("../../src/lib/auth/auth");
      const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "public-attacker@test.local",
          password: "password123",
          name: "Attacker",
        }),
      });
      const res = await auth.handler(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
    });

    it("4.3 trusted administrative user provisioning creates valid credentials and allows sign-in", async () => {
      const { createAdministrativeUser } = await import("../../src/lib/auth/admin-user");
      const { auth } = await import("../../src/lib/auth/auth");

      const testEmail = `admin-prov-${Date.now()}@test.local`;
      const testPassword = "AdminSecurePassword123!";

      const provisioned = await createAdministrativeUser({
        email: testEmail,
        password: testPassword,
        name: "Admin Provisioned",
        emailVerified: true,
      });

      assert.ok(provisioned.id);
      assert.equal(provisioned.email, testEmail);

      // Verify provisioned identity can sign in
      const signInReq = new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });
      const signInRes = await auth.handler(signInReq);
      assert.equal(signInRes.status, 200);
      const cookie = signInRes.headers.get("set-cookie");
      assert.ok(cookie?.includes("better-auth.session_token="));
    });
  });
});
