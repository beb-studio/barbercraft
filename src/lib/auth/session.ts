import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { businessMembers } from "@/db/schema";
import type { AuthenticatedUser, BusinessMembership } from "@/types";

/**
 * Returns the currently authenticated user, or null.
 * Uses Better Auth to validate the session.
 */

export const sessionDependencies = {
  getCurrentUser: async function(): Promise<AuthenticatedUser | null> {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    const [dbUser] = await db
      .select({ forcePasswordChange: (await import("@/db/schema")).users.forcePasswordChange })
      .from((await import("@/db/schema")).users)
      .where(eq((await import("@/db/schema")).users.id, session.user.id))
      .limit(1);

    return {
      id: session.user.id,
      email: session.user.email,
      forcePasswordChange: dbUser?.forcePasswordChange ?? false,
    };
  }
};

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  return sessionDependencies.getCurrentUser();
}

/**
 * Active memberships of the current user across businesses.
 */
export async function getMemberships(): Promise<BusinessMembership[]> {
  const user = await sessionDependencies.getCurrentUser();
  if (!user) return [];

  const memberships = await db
    .select({
      id: businessMembers.id,
      business_id: businessMembers.businessId,
      role: businessMembers.role,
      active: businessMembers.active,
    })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, user.id), eq(businessMembers.active, true)));

  return memberships;
}

/** Membership of the current user in one business, or null. */
export async function getMembership(businessId: string): Promise<BusinessMembership | null> {
  const memberships = await getMemberships();
  return memberships.find((m) => m.business_id === businessId) ?? null;
}
