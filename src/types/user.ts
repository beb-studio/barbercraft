import type { BusinessMember } from "./business";

/** Minimal view of the authenticated user used by the app. */
export interface AuthenticatedUser {
  id: string;
  email: string | null;
  forcePasswordChange: boolean;
}

/** A user's membership in one business (a user may have several). */
export type BusinessMembership = Pick<BusinessMember, "id" | "business_id" | "role" | "active">;
