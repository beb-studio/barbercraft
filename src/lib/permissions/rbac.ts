import type { BusinessMemberRole } from "@/types";

/**
 * Application-level permission map.
 *
 * IMPORTANT: this is a convenience for server actions and for deciding what UI
 * to show. Server-side code and database queries enforce business boundaries.
 * Public (unauthenticated) visitors have no role and therefore no permissions here.
 */
export type Permission =
  | "business:manage"
  | "members:manage_admins"
  | "members:manage_staff"
  | "services:manage"
  | "staff_profiles:manage"
  | "working_hours:manage"
  | "customers:manage"
  | "customers:delete"
  | "appointments:view_all"
  | "appointments:view_own"
  | "appointments:manage_all"
  | "appointments:manage_own"
  | "time_blocks:manage_all"
  | "time_blocks:manage_own";

const STAFF_PERMISSIONS: Permission[] = [
  "customers:manage",
  "appointments:view_own",
  "appointments:manage_own",
  "time_blocks:manage_own",
];

const ADMIN_PERMISSIONS: Permission[] = [
  "members:manage_staff",
  "services:manage",
  "staff_profiles:manage",
  "working_hours:manage",
  "customers:manage",
  "customers:delete",
  "appointments:view_all",
  "appointments:view_own",
  "appointments:manage_all",
  "appointments:manage_own",
  "time_blocks:manage_all",
  "time_blocks:manage_own",
];

const ROLE_PERMISSIONS: Record<BusinessMemberRole, Permission[]> = {
  STAFF: STAFF_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  // OWNER = everything ADMIN can do + business configuration + managing admins.
  OWNER: [...ADMIN_PERMISSIONS, "business:manage", "members:manage_admins"],
};

export function hasPermission(
  role: BusinessMemberRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role || !ROLE_PERMISSIONS[role]) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertPermission(
  role: BusinessMemberRole | null | undefined,
  permission: Permission,
): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: role '${role ?? "none"}' lacks permission '${permission}'`);
  }
}
