import { db } from "@/db";
import { users, type PlatformAdminRole } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PlatformAdminRepository, PlatformOverviewMetrics } from "@/repositories/platform-admin.repository";

export interface GrantPlatformAdminInput {
  email: string;
  role: PlatformAdminRole;
  actorUserId?: string;
}

export class PlatformAdminService {
  /**
   * Fetches global read-only metrics after caller has been verified as platform admin.
   */
  static async getOverviewMetrics(): Promise<PlatformOverviewMetrics> {
    return PlatformAdminRepository.getOverviewMetrics();
  }

  /**
   * Safe server-side bootstrap/grant mechanism for platform administrators.
   * Never exposed via public HTTP endpoints.
   */
  static async grantPlatformAdmin(input: GrantPlatformAdminInput) {
    const { email, role, actorUserId } = input;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      throw new Error("Invalid email address format.");
    }

    if (role !== "SUPER_ADMIN" && role !== "PLATFORM_ADMIN") {
      throw new Error("Invalid platform admin role. Must be 'SUPER_ADMIN' or 'PLATFORM_ADMIN'.");
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      throw new Error(`User not found with email: ${email}`);
    }

    const admin = await PlatformAdminRepository.upsertPlatformAdmin(user.id, role);

    await PlatformAdminRepository.insertAuditLog({
      platformAdminId: admin.id,
      actorUserId: actorUserId ?? user.id,
      action: "BOOTSTRAP_GRANT_PLATFORM_ADMIN",
      targetType: "user",
      targetId: user.id,
      metadata: {
        targetEmail: user.email,
        assignedRole: role,
      },
    });

    return {
      success: true,
      adminId: admin.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: admin.role,
      active: admin.active,
    };
  }

  static async listPlatformAdmins() {
    return PlatformAdminRepository.listPlatformAdmins();
  }

  static async listBusinesses(params: {
    page: number;
    limit: number;
    search?: string;
    filterActive?: boolean;
  }) {
    return PlatformAdminRepository.listBusinesses(params);
  }

  static async getBusinessDetail(businessId: string) {
    return PlatformAdminRepository.getBusinessDetail(businessId);
  }

  static async getBusinessAuditLogs(businessId: string, limit: number = 20) {
    return PlatformAdminRepository.getBusinessAuditLogs(businessId, limit);
  }

  static async toggleBusinessActive(
    businessId: string,
    active: boolean,
    platformAdminId: string,
    actorUserId: string,
    reason: string
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new Error("Reason is required to toggle business active state.");
    }
    return PlatformAdminRepository.toggleBusinessActive(
      businessId,
      active,
      platformAdminId,
      actorUserId,
      reason.trim()
    );
  }
}
