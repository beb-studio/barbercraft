/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let auth: any;
let db: any;
let sessionModule: any;
let guardsModule: any;

let pgServer: any;

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;
  // Import dynamically AFTER database is started so process.env.DATABASE_URL is set
  const authLib = await import("../../src/lib/auth/auth");
  auth = authLib.auth;
  const dbLib = await import("../../src/db");
  db = dbLib.db;
  sessionModule = await import("../../src/lib/auth/session");
  guardsModule = await import("../../src/lib/auth/guards");
});

after(async () => {
  await pgServer?.stop();
});

describe("Authentication & RBAC Tests", () => {
  let createdUserId = "";

  before(async () => {
    const { createAdministrativeUser } = await import("../../src/lib/auth/admin-user");
    const user = await createAdministrativeUser({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
      emailVerified: true,
    });
    createdUserId = user.id;
  });

  it("rejects public self-registration with 400 (disableSignUp: true)", async () => {
    const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "unauthorized-registration@example.com",
        password: "password123",
        name: "Unauthorized User",
      }),
    });
    const res = await auth.handler(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });

  it("fails to register with a duplicate email safely", async () => {
    const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com", // Duplicate
        password: "password456",
        name: "Test User 2",
      }),
    });
    const res = await auth.handler(req);
    assert.notEqual(res.status, 200);
  });

  it("authenticates a user with correct credentials and creates a session", async () => {
    const req = new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });
    const res = await auth.handler(req);
    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie?.includes("better-auth.session_token="));
  });

  it("fails to authenticate with incorrect password", async () => {
    const req = new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "wrongpassword",
      }),
    });
    const res = await auth.handler(req);
    assert.notEqual(res.status, 200);
  });
});

describe("Role Resolution & Guards", () => {
  let user1 = "";
  let user2 = "";
  let user3 = ""; // ADMIN user
  let businessA = "00000000-0000-4000-8000-000000000100";
  let businessB = "00000000-0000-4000-8000-000000000101";

  before(async () => {
    const { createAdministrativeUser } = await import("../../src/lib/auth/admin-user");
    const res1 = await createAdministrativeUser({
      email: "owner@test.local", password: "password123", name: "O", emailVerified: true
    });
    user1 = res1.id;

    const res2 = await createAdministrativeUser({
      email: "staff@test.local", password: "password123", name: "S", emailVerified: true
    });
    user2 = res2.id;

    const res3 = await createAdministrativeUser({
      email: "admin@test.local", password: "password123", name: "A", emailVerified: true
    });
    user3 = res3.id;

    await db.execute(`INSERT INTO businesses (id, name, slug, timezone, currency) VALUES ('${businessA}', 'Biz A', 'biz-a', 'UTC', 'TRY')`);
    await db.execute(`INSERT INTO businesses (id, name, slug, timezone, currency) VALUES ('${businessB}', 'Biz B', 'biz-b', 'UTC', 'TRY')`);

    // User1 is OWNER of A, STAFF of B
    await db.execute(`INSERT INTO business_members (business_id, user_id, role) VALUES ('${businessA}', '${user1}', 'OWNER')`);
    await db.execute(`INSERT INTO business_members (business_id, user_id, role) VALUES ('${businessB}', '${user1}', 'STAFF')`);
    
    // User2 is STAFF of A
    await db.execute(`INSERT INTO business_members (business_id, user_id, role) VALUES ('${businessA}', '${user2}', 'STAFF')`);

    // User3 is MANAGER of A
    await db.execute(`INSERT INTO business_members (business_id, user_id, role) VALUES ('${businessA}', '${user3}', 'MANAGER')`);
  });

  it("resolves User1 as OWNER in Business A", async () => {
    const originalGetCurrentUser = sessionModule.sessionDependencies.getCurrentUser;
    // Mock the session getter
    
    sessionModule.sessionDependencies.getCurrentUser = async () => ({ id: user1, email: "owner@test.local" });
    
    try {
      const result = await guardsModule.requireOwner(businessA);
      assert.equal(result.membership.role, "OWNER");
    } finally {
      sessionModule.sessionDependencies.getCurrentUser = originalGetCurrentUser;
    }
  });

  it("resolves User1 as STAFF in Business B, rejecting requireOwner", async () => {
    const originalGetCurrentUser = sessionModule.sessionDependencies.getCurrentUser;
    
    sessionModule.sessionDependencies.getCurrentUser = async () => ({ id: user1, email: "owner@test.local" });
    
    try {
      await assert.rejects(guardsModule.requireOwner(businessB), { name: "ForbiddenError" });
      const result = await guardsModule.requireBusinessMembership(businessB);
      assert.equal(result.membership.role, "STAFF");
    } finally {
      sessionModule.sessionDependencies.getCurrentUser = originalGetCurrentUser;
    }
  });

  it("User2 (STAFF) cannot pass MANAGER or OWNER guard in Business A", async () => {
    const originalGetCurrentUser = sessionModule.sessionDependencies.getCurrentUser;
    
    sessionModule.sessionDependencies.getCurrentUser = async () => ({ id: user2, email: "staff@test.local" });
    
    try {
      await assert.rejects(guardsModule.requireManagerOrOwner(businessA), { name: "ForbiddenError" });
      await assert.rejects(guardsModule.requireOwner(businessA), { name: "ForbiddenError" });
    } finally {
      sessionModule.sessionDependencies.getCurrentUser = originalGetCurrentUser;
    }
  });

  it("User3 (MANAGER) cannot pass OWNER guard but passes MANAGER guard in Business A", async () => {
    const originalGetCurrentUser = sessionModule.sessionDependencies.getCurrentUser;
    
    sessionModule.sessionDependencies.getCurrentUser = async () => ({ id: user3, email: "admin@test.local" });
    
    try {
      // MANAGER cannot pass requireOwner
      await assert.rejects(guardsModule.requireOwner(businessA), { name: "ForbiddenError" });
      
      // MANAGER can pass requireManagerOrOwner
      const result = await guardsModule.requireManagerOrOwner(businessA);
      assert.equal(result.membership.role, "MANAGER");
    } finally {
      sessionModule.sessionDependencies.getCurrentUser = originalGetCurrentUser;
    }
  });

  it("rejects unauthorized access when no session", async () => {
    const originalGetCurrentUser = sessionModule.sessionDependencies.getCurrentUser;
    
    sessionModule.sessionDependencies.getCurrentUser = async () => null;
    
    try {
      await assert.rejects(guardsModule.requireBusinessMembership(businessA), { name: "UnauthorizedError" });
    } finally {
      sessionModule.sessionDependencies.getCurrentUser = originalGetCurrentUser;
    }
  });

  it("rejects access for a valid user with no membership", async () => {
    const originalGetCurrentUser = sessionModule.sessionDependencies.getCurrentUser;
    
    sessionModule.sessionDependencies.getCurrentUser = async () => ({ id: user2, email: "staff@test.local" }); // User2 is NOT in BizB
    
    try {
      await assert.rejects(guardsModule.requireBusinessMembership(businessB), { name: "ForbiddenError", message: "Not a member of this business" });
    } finally {
      sessionModule.sessionDependencies.getCurrentUser = originalGetCurrentUser;
    }
  });
});
