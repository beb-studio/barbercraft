/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let sessionModule: any;
let onboardingModule: any;
let businesses: any;
let businessMembers: any;

before(async () => {
  pgServer = await startDatabase({ port: 54401 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  
  sessionModule = await import("../../src/lib/auth/session");
  onboardingModule = await import("../../src/lib/auth/onboarding");
  
  const schema = await import("../../src/db/schema");
  businesses = schema.businesses;
  businessMembers = schema.businessMembers;
});

after(async () => {
  await pgServer?.stop();
});

describe("Onboarding State Helper Tests", () => {
  const userNoBiz = "00000000-0000-4000-8000-000000000201";
  const userInProgress = "00000000-0000-4000-8000-000000000202";
  const userCompleted = "00000000-0000-4000-8000-000000000203";
  let bizInProgressId = "";
  let bizCompletedId = "";

  before(async () => {
    // Insert Users
    await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userNoBiz}', 'No Biz', 'u1@ex.com', true)`);
    await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userInProgress}', 'In Prog', 'u2@ex.com', true)`);
    await db.execute(`INSERT INTO users (id, name, email, email_verified) VALUES ('${userCompleted}', 'Completed', 'u3@ex.com', true)`);

    // Insert Businesses
    const biz1 = await db.insert(businesses).values({
      name: "Biz In Progress",
      slug: "biz-in-progress",
      timezone: "Europe/Istanbul",
      currency: "TRY"
    }).returning();
    bizInProgressId = biz1[0].id;

    const biz2 = await db.insert(businesses).values({
      name: "Biz Completed",
      slug: "biz-completed",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date()
    }).returning();
    bizCompletedId = biz2[0].id;

    // Insert Memberships
    await db.insert(businessMembers).values({
      businessId: bizInProgressId,
      userId: userInProgress,
      role: "OWNER"
    });

    await db.insert(businessMembers).values({
      businessId: bizCompletedId,
      userId: userCompleted,
      role: "OWNER"
    });
  });

  const mockSession = (userId: string | null) => {
    if (!userId) {
      sessionModule.sessionDependencies.getCurrentUser = async () => null;
    } else {
      sessionModule.sessionDependencies.getCurrentUser = async () => ({ id: userId, email: "test@example.com" });
    }
  };

  it("unauthenticated user cannot access authenticated onboarding state", async () => {
    mockSession(null);
    const state = await onboardingModule.getOnboardingState();
    assert.equal(state, "UNAUTHENTICATED");
  });

  it("authenticated user with no membership -> NO_BUSINESS", async () => {
    mockSession(userNoBiz);
    const state = await onboardingModule.getOnboardingState();
    assert.equal(state, "NO_BUSINESS");
  });

  it("user with OWNER membership and onboarding_completed_at = NULL -> IN_PROGRESS", async () => {
    mockSession(userInProgress);
    const state = await onboardingModule.getOnboardingState();
    assert.equal(state, "IN_PROGRESS");
  });

  it("user with completed business -> COMPLETED", async () => {
    mockSession(userCompleted);
    const state = await onboardingModule.getOnboardingState();
    assert.equal(state, "COMPLETED");
  });
});
