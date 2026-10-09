/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let db: any;
let pgServer: any;
let sessionModule: any;
let onboardingModule: any;
let businessActions: any;
let users: any;
let eq: any;

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  
  sessionModule = await import("../../src/lib/auth/session");
  onboardingModule = await import("../../src/lib/auth/onboarding");
  businessActions = await import("../../src/actions/business.actions");
  
  const schema = await import("../../src/db/schema");
  users = schema.users;
  
  const drizzleOrm = await import("drizzle-orm");
  eq = drizzleOrm.eq;
});

after(async () => {
  await pgServer.stop();
});

describe("Onboarding Refactoring (TASK 012A)", () => {
  it("Business creation action is removed from business.actions.ts", async () => {
    assert.strictEqual(typeof businessActions.createOnboardingBusinessAction, "undefined");
  });

  it("getOnboardingStep returns NO_BUSINESS if user has no memberships", async () => {
    const [testUser] = await db.insert(users).values({
      name: "No Biz User",
      email: "nobiz@example.com",
      emailVerified: true
    }).returning();
    
    sessionModule.sessionDependencies.getCurrentUser = async () => ({
      id: testUser.id,
      email: testUser.email
    });
    
    const step = await onboardingModule.getOnboardingStep();
    assert.strictEqual(step, "NO_BUSINESS");
  });
});
