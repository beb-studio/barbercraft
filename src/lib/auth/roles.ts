import type { BusinessMemberRole } from "@/types";
import type { PlatformAdminRole } from "@/db/schema/platform";

/**
 * Platform administration roles. Completely separate from tenant membership.
 */
export const PLATFORM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
} as const satisfies Record<PlatformAdminRole, PlatformAdminRole>;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

/**
 * Authenticated business membership roles. These mirror the `business_member_role` enum.
 * PUBLIC CUSTOMER is intentionally absent: customers have no auth
 * account and are not part of RBAC.
 */
export const MEMBER_ROLES = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
} as const satisfies Record<BusinessMemberRole, BusinessMemberRole>;

export type BusinessRole = (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES];

export function isOwner(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.OWNER;
}

export function isManager(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.MANAGER;
}

/** OWNER or MANAGER: operational, tenant-wide access. */
export function isManagerOrOwner(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.OWNER || role === MEMBER_ROLES.MANAGER;
}

/** Backward-compatible alias for isManagerOrOwner. */
export const isAdminLevel = isManagerOrOwner;

export function isStaff(role?: BusinessMemberRole | null): boolean {
  return role === MEMBER_ROLES.STAFF;
}
