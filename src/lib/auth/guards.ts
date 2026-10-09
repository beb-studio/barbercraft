import "server-only";
import { getCurrentUser, getMembership } from "./session";
import { assertPermission, type Permission } from "@/lib/permissions/rbac";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireSession() {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requireBusinessMembership(businessId: string) {
  const user = await requireSession();
  const membership = await getMembership(businessId);
  if (!membership) {
    throw new ForbiddenError("Not a member of this business");
  }
  return { user, membership };
}

export async function requireBusinessPermission(businessId: string, permission: Permission) {
  const { user, membership } = await requireBusinessMembership(businessId);
  try {
    assertPermission(membership.role, permission);
  } catch (error) {
    throw new ForbiddenError((error as Error).message);
  }
  return { user, membership };
}

export async function requireOwner(businessId: string) {
  const { user, membership } = await requireBusinessMembership(businessId);
  if (membership.role !== "OWNER") {
    throw new ForbiddenError("OWNER role required");
  }
  return { user, membership };
}

export async function requireAdminOrOwner(businessId: string) {
  const { user, membership } = await requireBusinessMembership(businessId);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw new ForbiddenError("ADMIN or OWNER role required");
  }
  return { user, membership };
}

export interface PlatformAdminContext {
  userId: string;
  platformAdminId: string;
  platformRole: import("@/db/schema").PlatformAdminRole;
}

/**
 * Ensures the caller is an authenticated user with an active platform admin record.
 * Returns typed trusted context. Never infers authority from business membership or headers.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const user = await requireSession();
  const { db } = await import("@/db");
  const { platformAdmins } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [admin] = await db
    .select({
      id: platformAdmins.id,
      userId: platformAdmins.userId,
      role: platformAdmins.role,
      active: platformAdmins.active,
    })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, user.id))
    .limit(1);

  if (!admin || !admin.active) {
    throw new ForbiddenError("Platform admin access denied");
  }

  return {
    userId: admin.userId,
    platformAdminId: admin.id,
    platformRole: admin.role,
  };
}

/**
 * Ensures the caller is an active platform SUPER_ADMIN.
 */
export async function requirePlatformSuperAdmin(): Promise<PlatformAdminContext> {
  const context = await requirePlatformAdmin();
  if (context.platformRole !== "SUPER_ADMIN") {
    throw new ForbiddenError("Platform super admin access required");
  }
  return context;
}

/**
 * Safe check for layout/navigation rendering without throwing.
 */
export async function getCurrentPlatformAdmin(): Promise<PlatformAdminContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { db } = await import("@/db");
  const { platformAdmins } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const [admin] = await db
    .select({
      id: platformAdmins.id,
      userId: platformAdmins.userId,
      role: platformAdmins.role,
      active: platformAdmins.active,
    })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, user.id), eq(platformAdmins.active, true)))
    .limit(1);

  if (!admin) return null;

  return {
    userId: admin.userId,
    platformAdminId: admin.id,
    platformRole: admin.role,
  };
}

