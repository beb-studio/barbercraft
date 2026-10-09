import type { BusinessMemberRole } from "@/types";

/**
 * Authenticated membership roles. These mirror the `business_member_role` enum.
 * PUBLIC CUSTOMER is intentionally absent: customers have no Supabase Auth
 * account and are not part of RBAC.
 */
export const MEMBER_ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  STAFF: "STAFF",
} as const satisfies Record<BusinessMemberRole, BusinessMemberRole>;

export function isOwner(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.OWNER;
}

/** OWNER or ADMIN: operational, tenant-wide access. */
export function isAdminLevel(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.OWNER || role === MEMBER_ROLES.ADMIN;
}

export function isStaff(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.STAFF;
}
