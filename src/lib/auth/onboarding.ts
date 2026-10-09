import "server-only";
import { getCurrentUser, getMemberships } from "./session";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { businesses, businessWorkingHours, services } from "@/db/schema";

export type OnboardingState =
  | "UNAUTHENTICATED"
  | "NO_BUSINESS"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "NOT_APPLICABLE";

export type OnboardingStep =
  | "UNAUTHENTICATED"
  | "NO_BUSINESS"
  | "BUSINESS_HOURS"
  | "FIRST_SERVICE"
  | "OWNER_STAFF"
  | "COMPLETED"
  | "NOT_APPLICABLE";

export async function getOnboardingStep(): Promise<OnboardingStep> {
  const user = await getCurrentUser();
  if (!user) {
    return "UNAUTHENTICATED";
  }

  const memberships = await getMemberships();
  if (memberships.length === 0) {
    return "NO_BUSINESS";
  }

  // Find OWNER membership: owner onboarding exclusively manages OWNER business setup
  const ownerMembership = memberships.find((m) => m.role === "OWNER");
  if (!ownerMembership) {
    // Non-owner staff member: OWNER onboarding does not apply
    return "NOT_APPLICABLE";
  }

  const businessId = ownerMembership.business_id;

  const [businessRow] = await db
    .select({ onboardingCompletedAt: businesses.onboardingCompletedAt })
    .from(businesses)
    .where(eq(businesses.id, businessId));

  if (!businessRow) {
    return "NO_BUSINESS";
  }

  if (businessRow.onboardingCompletedAt !== null) {
    return "COMPLETED";
  }

  // Check working hours count (must be exactly 7 for all days of week)
  const [hoursCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(businessWorkingHours)
    .where(eq(businessWorkingHours.businessId, businessId));

  const hoursCount = hoursCountResult?.count ?? 0;
  if (hoursCount < 7) {
    return "BUSINESS_HOURS";
  }

  // Check services count
  const [servicesCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(services)
    .where(eq(services.businessId, businessId));

  const servicesCount = servicesCountResult?.count ?? 0;
  if (servicesCount === 0) {
    return "FIRST_SERVICE";
  }

  // Next step after first service
  return "OWNER_STAFF";
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const step = await getOnboardingStep();
  if (
    step === "UNAUTHENTICATED" ||
    step === "NO_BUSINESS" ||
    step === "COMPLETED" ||
    step === "NOT_APPLICABLE"
  ) {
    return step;
  }
  return "IN_PROGRESS";
}

