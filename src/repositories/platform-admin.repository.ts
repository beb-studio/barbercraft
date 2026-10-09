import { db } from "@/db";
import {
  businesses,
  users,
  staffProfiles,
  appointments,
  platformAdmins,
  platformAdminAuditLogs,
  type PlatformAdminRole,
  type PlatformAdmin,
} from "@/db/schema";
import { eq, count } from "drizzle-orm";

export interface PlatformOverviewMetrics {
  totalBusinesses: number;
  activeBusinesses: number;
  totalUsers: number;
  totalStaff: number;
  totalAppointments: number;
}

export class PlatformAdminRepository {
  /**
   * Reads platform-wide aggregate counts.
   * This is intentionally global and must only be called from platform-authorized services.
   */
  static async getOverviewMetrics(): Promise<PlatformOverviewMetrics> {
    const [
      businessesRes,
      activeBusinessesRes,
      usersRes,
      staffRes,
      appointmentsRes,
    ] = await Promise.all([
      db.select({ count: count() }).from(businesses),
      db.select({ count: count() }).from(businesses).where(eq(businesses.active, true)),
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(staffProfiles).where(eq(staffProfiles.active, true)),
      db.select({ count: count() }).from(appointments),
    ]);

    return {
      totalBusinesses: businessesRes[0]?.count ?? 0,
      activeBusinesses: activeBusinessesRes[0]?.count ?? 0,
      totalUsers: usersRes[0]?.count ?? 0,
      totalStaff: staffRes[0]?.count ?? 0,
      totalAppointments: appointmentsRes[0]?.count ?? 0,
    };
  }

  static async getPlatformAdminByUserId(userId: string): Promise<PlatformAdmin | null> {
    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, userId))
      .limit(1);

    return admin ?? null;
  }

  static async upsertPlatformAdmin(userId: string, role: PlatformAdminRole): Promise<PlatformAdmin> {
    const existing = await this.getPlatformAdminByUserId(userId);

    if (existing) {
      const [updated] = await db
        .update(platformAdmins)
        .set({
          role,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(platformAdmins.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await db
      .insert(platformAdmins)
      .values({
        userId,
        role,
        active: true,
      })
      .returning();

    return created;
  }

  static async listPlatformAdmins() {
    return db
      .select({
        id: platformAdmins.id,
        userId: platformAdmins.userId,
        userName: users.name,
        userEmail: users.email,
        role: platformAdmins.role,
        active: platformAdmins.active,
        createdAt: platformAdmins.createdAt,
        updatedAt: platformAdmins.updatedAt,
      })
      .from(platformAdmins)
      .innerJoin(users, eq(platformAdmins.userId, users.id));
  }

  static async insertAuditLog(params: {
    platformAdminId?: string;
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const [entry] = await db
      .insert(platformAdminAuditLogs)
      .values({
        platformAdminId: params.platformAdminId,
        actorUserId: params.actorUserId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata,
      })
      .returning();

    return entry;
  }

  static async listBusinesses(params: {
    page: number;
    limit: number;
    search?: string;
    filterActive?: boolean;
  }) {
    const offset = (params.page - 1) * params.limit;
    const { or, ilike, and, desc } = await import("drizzle-orm");

    const conditions = [];
    if (params.search) {
      conditions.push(
        or(
          ilike(businesses.name, `%${params.search}%`),
          ilike(businesses.slug, `%${params.search}%`)
        )
      );
    }
    if (params.filterActive !== undefined) {
      conditions.push(eq(businesses.active, params.filterActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRes] = await db
      .select({ total: count() })
      .from(businesses)
      .where(whereClause);

    const data = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        active: businesses.active,
        createdAt: businesses.createdAt,
        onboardingCompletedAt: businesses.onboardingCompletedAt,
      })
      .from(businesses)
      .where(whereClause)
      .orderBy(desc(businesses.createdAt))
      .limit(params.limit)
      .offset(offset);

    return {
      data,
      total: countRes.total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(countRes.total / params.limit),
    };
  }

  static async getBusinessDetail(businessId: string) {
    const { and } = await import("drizzle-orm");
    const { businessMembers } = await import("@/db/schema/members");
    
    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    if (!biz) return null;

    const owners = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        active: businessMembers.active,
      })
      .from(businessMembers)
      .innerJoin(users, eq(businessMembers.userId, users.id))
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "OWNER")
        )
      );

    const [appointmentsMetrics] = await db
      .select({ total: count() })
      .from(appointments)
      .where(eq(appointments.businessId, businessId));

    const [staffMetrics] = await db
      .select({ total: count() })
      .from(staffProfiles)
      .where(eq(staffProfiles.businessId, businessId));

    return {
      business: biz,
      owners,
      metrics: {
        totalAppointments: appointmentsMetrics?.total ?? 0,
        totalStaff: staffMetrics?.total ?? 0,
      },
    };
  }

  static async getBusinessAuditLogs(businessId: string, limit: number = 20) {
    const { desc } = await import("drizzle-orm");
    return db
      .select({
        id: platformAdminAuditLogs.id,
        action: platformAdminAuditLogs.action,
        createdAt: platformAdminAuditLogs.createdAt,
        metadata: platformAdminAuditLogs.metadata,
        adminName: users.name,
        adminEmail: users.email,
      })
      .from(platformAdminAuditLogs)
      .leftJoin(
        platformAdmins,
        eq(platformAdminAuditLogs.platformAdminId, platformAdmins.id)
      )
      .leftJoin(users, eq(platformAdmins.userId, users.id))
      .where(
        eq(platformAdminAuditLogs.targetId, businessId)
      )
      .orderBy(desc(platformAdminAuditLogs.createdAt))
      .limit(limit);
  }

  static async toggleBusinessActive(
    businessId: string,
    active: boolean,
    platformAdminId: string,
    actorUserId: string,
    reason: string
  ) {
    return db.transaction(async (tx) => {
      // Lock the row
      const [existing] = await tx
        .select({ id: businesses.id, active: businesses.active })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .for("update");

      if (!existing) {
        throw new Error("Business not found");
      }

      if (existing.active === active) {
        return existing;
      }

      const [updated] = await tx
        .update(businesses)
        .set({ active, updatedAt: new Date() })
        .where(eq(businesses.id, businessId))
        .returning();

      await tx.insert(platformAdminAuditLogs).values({
        platformAdminId,
        actorUserId,
        action: active ? "BUSINESS_ACTIVATED" : "BUSINESS_DEACTIVATED",
        targetType: "BUSINESS",
        targetId: businessId,
        metadata: { reason, previousState: existing.active },
      });

      return updated;
    });
  }
}
