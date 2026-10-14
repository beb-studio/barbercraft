import "server-only";

import { db } from "@/db";
import {
  businesses,
  users,
  businessMembers,
  notificationOutbox,
  notificationDeliveries,
  platformAdmins,
  platformAdminAuditLogs,
} from "@/db/schema";
import { eq, and, sql, desc, or, ilike } from "drizzle-orm";
import type { PlatformAdminContext } from "@/lib/auth/guards";
import {
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  isOutboxTerminalFailed,
} from "@/lib/notification-outbox";
import {
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
  PERMANENT_DELIVERY_ERROR_CODES,
  isDeliveryTerminalFailed,
} from "@/lib/notification-delivery";
import {
  BusinessHealthStatus,
  PlatformOperationsSummary,
  PlatformBusinessOperationsSummary,
  PlatformBusinessOperationsDetail,
  PlatformBusinessListParams,
  PaginatedPlatformBusinessOperations,
  PlatformTerminalFailureDetail,
  PlatformNotFoundError,
  CannotRequeueSentDeliveryError,
  NotEligibleForRequeueError,
} from "@/types/platform-operations";



function deriveBusinessHealth(
  active: boolean,
  onboardingCompleted: boolean,
  ownerCount: number,
  terminalOutboxFailures: number,
  terminalDeliveryFailures: number
): { status: BusinessHealthStatus; reasons: string[] } {
  if (!active) {
    return {
      status: "SUSPENDED",
      reasons: ["BUSINESS_SUSPENDED"],
    };
  }

  const reasons: string[] = [];
  if (terminalDeliveryFailures > 0) {
    reasons.push("TERMINAL_DELIVERY_FAILURES");
  }
  if (terminalOutboxFailures > 0) {
    reasons.push("TERMINAL_OUTBOX_FAILURES");
  }
  if (!onboardingCompleted) {
    reasons.push("ONBOARDING_INCOMPLETE");
  }
  if (ownerCount === 0) {
    reasons.push("NO_ACTIVE_OWNER");
  }

  if (reasons.length > 0) {
    return {
      status: "ATTENTION",
      reasons,
    };
  }

  return {
    status: "HEALTHY",
    reasons: [],
  };
}

export class PlatformOperationsRepository {
  /**
   * Fetches global platform operational summary metrics.
   * Constant bounded queries: zero N+1.
   */
  static async getPlatformSummary(referenceNow = new Date()): Promise<PlatformOperationsSummary> {
    const todayStart = new Date(Date.UTC(
      referenceNow.getUTCFullYear(),
      referenceNow.getUTCMonth(),
      referenceNow.getUTCDate(),
      0, 0, 0, 0
    ));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [
      businessMetrics,
      memberMetrics,
      staffMetrics,
      appointmentMetrics,
      outboxMetrics,
      deliveryMetrics,
    ] = await Promise.all([
      db.execute<{
        total_businesses: string;
        active_businesses: string;
        suspended_businesses: string;
        onboarding_incomplete_businesses: string;
      }>(sql`
        SELECT
          count(*)::text AS total_businesses,
          count(*) FILTER (WHERE active = true)::text AS active_businesses,
          count(*) FILTER (WHERE active = false)::text AS suspended_businesses,
          count(*) FILTER (WHERE onboarding_completed_at IS NULL)::text AS onboarding_incomplete_businesses
        FROM businesses;
      `),

      db.execute<{ active_members: string }>(sql`
        SELECT count(*)::text AS active_members
        FROM business_members
        WHERE active = true;
      `),

      db.execute<{ active_staff: string }>(sql`
        SELECT count(*)::text AS active_staff
        FROM staff_profiles
        WHERE active = true;
      `),

      db.execute<{
        appointments_today: string;
        appointments_last_7_days: string;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE start_time >= ${todayStart} AND start_time < ${todayEnd})::text AS appointments_today,
          count(*) FILTER (WHERE start_time >= ${sevenDaysAgo} AND start_time < ${todayEnd})::text AS appointments_last_7_days
        FROM appointments;
      `),


      db.execute<{
        backlog: string;
        retryable_failures: string;
        terminal_failures: string;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING') OR (status = 'FAILED' AND attempt_count < ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS}))::text AS backlog,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count < ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS})::text AS retryable_failures,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count >= ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS})::text AS terminal_failures
        FROM notification_outbox;
      `),

      db.execute<{
        backlog: string;
        retryable_failures: string;
        terminal_failures: string;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING') OR (status = 'FAILED' AND attempt_count < ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} AND (last_error_code IS NULL OR last_error_code NOT IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)}))))::text AS backlog,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count < ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} AND (last_error_code IS NULL OR last_error_code NOT IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))::text AS retryable_failures,
          count(*) FILTER (WHERE status = 'FAILED' AND (attempt_count >= ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} OR last_error_code IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))::text AS terminal_failures
        FROM notification_deliveries;
      `),
    ]);

    const bRow = businessMetrics.rows[0] || {
      total_businesses: "0",
      active_businesses: "0",
      suspended_businesses: "0",
      onboarding_incomplete_businesses: "0",
    };
    const mRow = memberMetrics.rows[0] || { active_members: "0" };
    const sRow = staffMetrics.rows[0] || { active_staff: "0" };
    const aRow = appointmentMetrics.rows[0] || { appointments_today: "0", appointments_last_7_days: "0" };
    const oRow = outboxMetrics.rows[0] || { backlog: "0", retryable_failures: "0", terminal_failures: "0" };
    const dRow = deliveryMetrics.rows[0] || { backlog: "0", retryable_failures: "0", terminal_failures: "0" };

    return {
      totalBusinesses: Number(bRow.total_businesses),
      activeBusinesses: Number(bRow.active_businesses),
      suspendedBusinesses: Number(bRow.suspended_businesses),
      onboardingIncompleteBusinesses: Number(bRow.onboarding_incomplete_businesses),
      activeTenantMembers: Number(mRow.active_members),
      activeStaffProfiles: Number(sRow.active_staff),
      appointmentsToday: Number(aRow.appointments_today),
      appointmentsLast7Days: Number(aRow.appointments_last_7_days),
      notificationOutboxBacklog: Number(oRow.backlog),
      retryableOutboxFailures: Number(oRow.retryable_failures),
      terminalOutboxFailures: Number(oRow.terminal_failures),
      deliveryBacklog: Number(dRow.backlog),
      retryableDeliveryFailures: Number(dRow.retryable_failures),
      terminalDeliveryFailures: Number(dRow.terminal_failures),
    };
  }


  /**
   * Lists business operations with aggregate health data.
   * Paginated and strictly bounded queries to avoid N+1.
   */
  static async listBusinessOperations(
    params: PlatformBusinessListParams = {},
    referenceNow = new Date()
  ): Promise<PaginatedPlatformBusinessOperations> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.search?.trim()) {
      const s = params.search.trim();
      conditions.push(or(ilike(businesses.name, `%${s}%`), ilike(businesses.slug, `%${s}%`)));
    }
    if (params.filterActive !== undefined) {
      conditions.push(eq(businesses.active, params.filterActive));
    } else if (params.healthStatus === "SUSPENDED") {
      conditions.push(eq(businesses.active, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, businessRows] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(businesses)
        .where(whereClause),
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          active: businesses.active,
          onboardingCompletedAt: businesses.onboardingCompletedAt,
          timezone: businesses.timezone,
          currency: businesses.currency,
          createdAt: businesses.createdAt,
          updatedAt: businesses.updatedAt,
        })
        .from(businesses)
        .where(whereClause)
        .orderBy(desc(businesses.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = countResult[0]?.total ?? 0;
    if (businessRows.length === 0) {
      return {
        items: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    const businessIds = businessRows.map((b) => b.id);
    const todayStart = new Date(Date.UTC(
      referenceNow.getUTCFullYear(),
      referenceNow.getUTCMonth(),
      referenceNow.getUTCDate(),
      0, 0, 0, 0
    ));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    // Batch aggregations grouped by business_id
    const [
      membersRes,
      staffRes,
      appointmentsRes,
      outboxRes,
      plansRes,
      deliveriesRes,
    ] = await Promise.all([
      db.execute<{
        business_id: string;
        owner_count: string;
        manager_count: string;
        staff_count: string;
        total_active: string;
      }>(sql`
        SELECT
          business_id,
          count(*) FILTER (WHERE role = 'OWNER' AND active = true)::text AS owner_count,
          count(*) FILTER (WHERE role = 'MANAGER' AND active = true)::text AS manager_count,
          count(*) FILTER (WHERE role = 'STAFF' AND active = true)::text AS staff_count,
          count(*) FILTER (WHERE active = true)::text AS total_active
        FROM business_members
        WHERE business_id IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY business_id;
      `),

      db.execute<{
        business_id: string;
        total_staff: string;
        active_staff: string;
        bookable_staff: string;
      }>(sql`
        SELECT
          business_id,
          count(*)::text AS total_staff,
          count(*) FILTER (WHERE active = true)::text AS active_staff,
          count(*) FILTER (WHERE active = true AND public_booking_enabled = true)::text AS bookable_staff
        FROM staff_profiles
        WHERE business_id IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY business_id;
      `),

      db.execute<{
        business_id: string;
        appointments_today: string;
        future_operational: string;
        appointments_last_7_days: string;
        last_appointment_at: string | null;
        last_appointment_created_at: string | null;
        last_appointment_updated_at: string | null;
      }>(sql`
        SELECT
          business_id,
          count(*) FILTER (WHERE start_time >= ${todayStart} AND start_time < ${todayEnd})::text AS appointments_today,
          count(*) FILTER (WHERE status IN ('PENDING', 'CONFIRMED') AND start_time >= ${referenceNow})::text AS future_operational,
          count(*) FILTER (WHERE start_time >= ${sevenDaysAgo} AND start_time < ${todayEnd})::text AS appointments_last_7_days,
          max(start_time)::text AS last_appointment_at,
          max(created_at) FILTER (WHERE created_at <= ${referenceNow})::text AS last_appointment_created_at,
          max(updated_at) FILTER (WHERE updated_at <= ${referenceNow})::text AS last_appointment_updated_at
        FROM appointments
        WHERE business_id IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY business_id;
      `),

      db.execute<{
        business_id: string;
        pending_outbox: string;
        retryable_outbox_failures: string;
        terminal_outbox_failures: string;
        last_outbox_created_at: string | null;
        last_outbox_processed_at: string | null;
      }>(sql`
        SELECT
          business_id,
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending_outbox,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count < ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS})::text AS retryable_outbox_failures,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count >= ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS})::text AS terminal_outbox_failures,
          max(created_at) FILTER (WHERE created_at <= ${referenceNow})::text AS last_outbox_created_at,
          max(processed_at) FILTER (WHERE processed_at <= ${referenceNow})::text AS last_outbox_processed_at
        FROM notification_outbox
        WHERE business_id IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY business_id;
      `),

      db.execute<{
        business_id: string;
        pending_plans: string;
      }>(sql`
        SELECT
          business_id,
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending_plans
        FROM notification_plans
        WHERE business_id IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY business_id;
      `),

      db.execute<{
        business_id: string;
        pending_deliveries: string;
        retryable_delivery_failures: string;
        terminal_delivery_failures: string;
        last_successful_delivery_at: string | null;
        last_delivery_created_at: string | null;
        last_delivery_sent_at: string | null;
        last_delivery_failed_at: string | null;
        last_delivery_updated_at: string | null;
      }>(sql`
        SELECT
          business_id,
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending_deliveries,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count < ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} AND (last_error_code IS NULL OR last_error_code NOT IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))::text AS retryable_delivery_failures,
          count(*) FILTER (WHERE status = 'FAILED' AND (attempt_count >= ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} OR last_error_code IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))::text AS terminal_delivery_failures,
          max(sent_at) FILTER (WHERE status = 'SENT' AND sent_at <= ${referenceNow})::text AS last_successful_delivery_at,
          max(created_at) FILTER (WHERE created_at <= ${referenceNow})::text AS last_delivery_created_at,
          max(sent_at) FILTER (WHERE sent_at <= ${referenceNow})::text AS last_delivery_sent_at,
          max(failed_at) FILTER (WHERE failed_at <= ${referenceNow})::text AS last_delivery_failed_at,
          max(updated_at) FILTER (WHERE updated_at <= ${referenceNow})::text AS last_delivery_updated_at
        FROM notification_deliveries
        WHERE business_id IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY business_id;
      `),
    ]);

    const membersMap = new Map(membersRes.rows.map((r) => [r.business_id, r]));
    const staffMap = new Map(staffRes.rows.map((r) => [r.business_id, r]));
    const apptMap = new Map(appointmentsRes.rows.map((r) => [r.business_id, r]));
    const outboxMap = new Map(outboxRes.rows.map((r) => [r.business_id, r]));
    const plansMap = new Map(plansRes.rows.map((r) => [r.business_id, r]));
    const deliveriesMap = new Map(deliveriesRes.rows.map((r) => [r.business_id, r]));

    const summaries: PlatformBusinessOperationsSummary[] = businessRows.map((biz) => {
      const m = membersMap.get(biz.id);
      const s = staffMap.get(biz.id);
      const a = apptMap.get(biz.id);
      const o = outboxMap.get(biz.id);
      const p = plansMap.get(biz.id);
      const d = deliveriesMap.get(biz.id);

      const ownerCount = m ? Number(m.owner_count) : 0;
      const managerCount = m ? Number(m.manager_count) : 0;
      const staffMemberCount = m ? Number(m.staff_count) : 0;
      const totalActiveMembers = m ? Number(m.total_active) : 0;

      const totalStaff = s ? Number(s.total_staff) : 0;
      const activeStaff = s ? Number(s.active_staff) : 0;
      const bookableStaff = s ? Number(s.bookable_staff) : 0;

      const appointmentsToday = a ? Number(a.appointments_today) : 0;
      const futureOperationalAppointments = a ? Number(a.future_operational) : 0;
      const appointmentsLast7Days = a ? Number(a.appointments_last_7_days) : 0;
      const lastAppointmentAt = a?.last_appointment_at ? new Date(a.last_appointment_at).toISOString() : null;

      const pendingOutbox = o ? Number(o.pending_outbox) : 0;
      const retryableOutboxFailures = o ? Number(o.retryable_outbox_failures) : 0;
      const terminalOutboxFailures = o ? Number(o.terminal_outbox_failures) : 0;

      const pendingPlans = p ? Number(p.pending_plans) : 0;

      const pendingDeliveries = d ? Number(d.pending_deliveries) : 0;
      const retryableDeliveryFailures = d ? Number(d.retryable_delivery_failures) : 0;
      const terminalDeliveryFailures = d ? Number(d.terminal_delivery_failures) : 0;
      const lastSuccessfulDeliveryAt = d?.last_successful_delivery_at
        ? new Date(d.last_successful_delivery_at).toISOString()
        : null;

      // Authoritative historical operational activity calculation (strictly <= referenceNow, NEVER future start_time)
      const historicalTimestamps: number[] = [biz.createdAt.getTime()];
      if (biz.updatedAt.getTime() <= referenceNow.getTime()) {
        historicalTimestamps.push(biz.updatedAt.getTime());
      }
      if (a?.last_appointment_created_at) {
        historicalTimestamps.push(new Date(a.last_appointment_created_at).getTime());
      }
      if (a?.last_appointment_updated_at) {
        historicalTimestamps.push(new Date(a.last_appointment_updated_at).getTime());
      }
      if (o?.last_outbox_created_at) {
        historicalTimestamps.push(new Date(o.last_outbox_created_at).getTime());
      }
      if (o?.last_outbox_processed_at) {
        historicalTimestamps.push(new Date(o.last_outbox_processed_at).getTime());
      }
      if (d?.last_delivery_created_at) {
        historicalTimestamps.push(new Date(d.last_delivery_created_at).getTime());
      }
      if (d?.last_delivery_sent_at) {
        historicalTimestamps.push(new Date(d.last_delivery_sent_at).getTime());
      }
      if (d?.last_delivery_failed_at) {
        historicalTimestamps.push(new Date(d.last_delivery_failed_at).getTime());
      }
      if (d?.last_delivery_updated_at) {
        historicalTimestamps.push(new Date(d.last_delivery_updated_at).getTime());
      }
      const lastOperationalActivityAt = new Date(Math.max(...historicalTimestamps)).toISOString();

      const onboardingCompleted = biz.onboardingCompletedAt !== null;
      const health = deriveBusinessHealth(
        biz.active,
        onboardingCompleted,
        ownerCount,
        terminalOutboxFailures,
        terminalDeliveryFailures
      );

      return {
        businessId: biz.id,
        businessName: biz.name,
        slug: biz.slug,
        active: biz.active,
        onboardingCompleted,
        onboardingCompletedAt: biz.onboardingCompletedAt ? biz.onboardingCompletedAt.toISOString() : null,
        timezone: biz.timezone,
        currency: biz.currency,
        createdAt: biz.createdAt.toISOString(),
        updatedAt: biz.updatedAt.toISOString(),
        memberCounts: {
          owner: ownerCount,
          manager: managerCount,
          staff: staffMemberCount,
          totalActive: totalActiveMembers,
        },
        staffCounts: {
          total: totalStaff,
          active: activeStaff,
          bookable: bookableStaff,
        },
        appointmentHealth: {
          appointmentsToday,
          futureOperationalAppointments,
          appointmentsLast7Days,
          lastAppointmentAt,
        },
        notificationHealth: {
          pendingOutbox,
          retryableOutboxFailures,
          terminalOutboxFailures,
          pendingPlans,
          pendingDeliveries,
          retryableDeliveryFailures,
          terminalDeliveryFailures,
          lastSuccessfulDeliveryAt,
        },
        activity: {
          lastOperationalActivityAt,
        },

        health,
      };
    });

    const items = params.healthStatus
      ? summaries.filter((s) => s.health.status === params.healthStatus)
      : summaries;

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Fetches full operational detail for a single business.
   */
  static async getBusinessDetail(
    businessId: string,
    referenceNow = new Date()
  ): Promise<PlatformBusinessOperationsDetail | null> {
    // Fetch the single business row
    const [biz] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        active: businesses.active,
        onboardingCompletedAt: businesses.onboardingCompletedAt,
        timezone: businesses.timezone,
        currency: businesses.currency,
        createdAt: businesses.createdAt,
        updatedAt: businesses.updatedAt,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    if (!biz) return null;

    // Fetch summary for this business using listBusinessOperations with search or direct query
    const [summaryItem] = (
      await this.listBusinessOperations(
        { page: 1, limit: 1, search: biz.slug },
        referenceNow
      )
    ).items.filter((item) => item.businessId === businessId);

    const [
      owners,
      staffList,
      outboxBreakdown,
      plansBreakdown,
      deliveriesBreakdown,
      recentAuditLogs,
      recentOutboxFailures,
      recentDeliveryFailures,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          active: businessMembers.active,
        })
        .from(businessMembers)
        .innerJoin(users, eq(businessMembers.userId, users.id))
        .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "OWNER")))
        .orderBy(businessMembers.createdAt),

      db.execute<{
        id: string;
        first_name: string;
        last_name: string;
        active: boolean;
        public_booking_enabled: boolean;
        service_count: string;
      }>(sql`
        SELECT
          sp.id,
          sp.first_name,
          sp.last_name,
          sp.active,
          sp.public_booking_enabled,
          count(ss.service_id)::text AS service_count
        FROM staff_profiles sp
        LEFT JOIN staff_services ss ON sp.id = ss.staff_id AND sp.business_id = ss.business_id
        WHERE sp.business_id = ${businessId}
        GROUP BY sp.id, sp.first_name, sp.last_name, sp.active, sp.public_booking_enabled
        ORDER BY sp.first_name ASC;
      `),

      db.execute<{
        pending: string;
        processing: string;
        processed: string;
        retryable_failed: string;
        terminal_failed: string;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending,
          count(*) FILTER (WHERE status = 'PROCESSING')::text AS processing,
          count(*) FILTER (WHERE status = 'PROCESSED')::text AS processed,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count < ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS})::text AS retryable_failed,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count >= ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS})::text AS terminal_failed
        FROM notification_outbox
        WHERE business_id = ${businessId};
      `),

      db.execute<{
        pending: string;
        cancelled: string;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending,
          count(*) FILTER (WHERE status = 'CANCELLED')::text AS cancelled
        FROM notification_plans
        WHERE business_id = ${businessId};
      `),

      db.execute<{
        pending: string;
        processing: string;
        sent: string;
        retryable_failed: string;
        terminal_failed: string;
        cancelled: string;
        last_successful_delivery_at: string | null;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending,
          count(*) FILTER (WHERE status = 'PROCESSING')::text AS processing,
          count(*) FILTER (WHERE status = 'SENT')::text AS sent,
          count(*) FILTER (WHERE status = 'FAILED' AND attempt_count < ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} AND (last_error_code IS NULL OR last_error_code NOT IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))::text AS retryable_failed,
          count(*) FILTER (WHERE status = 'FAILED' AND (attempt_count >= ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} OR last_error_code IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)})))::text AS terminal_failed,
          count(*) FILTER (WHERE status = 'CANCELLED')::text AS cancelled,
          max(sent_at)::text AS last_successful_delivery_at
        FROM notification_deliveries
        WHERE business_id = ${businessId};
      `),

      db
        .select({
          id: platformAdminAuditLogs.id,
          action: platformAdminAuditLogs.action,
          targetType: platformAdminAuditLogs.targetType,
          targetId: platformAdminAuditLogs.targetId,
          metadata: platformAdminAuditLogs.metadata,
          createdAt: platformAdminAuditLogs.createdAt,
          adminName: users.name,
          adminEmail: users.email,
        })
        .from(platformAdminAuditLogs)
        .leftJoin(platformAdmins, eq(platformAdminAuditLogs.platformAdminId, platformAdmins.id))
        .leftJoin(users, eq(platformAdmins.userId, users.id))
        .where(eq(platformAdminAuditLogs.targetId, businessId))
        .orderBy(desc(platformAdminAuditLogs.createdAt))
        .limit(20),

      db
        .select({
          id: notificationOutbox.id,
          businessId: notificationOutbox.businessId,
          appointmentId: notificationOutbox.appointmentId,
          eventType: notificationOutbox.eventType,
          attemptCount: notificationOutbox.attemptCount,
          lastErrorCode: notificationOutbox.lastErrorCode,
          createdAt: notificationOutbox.createdAt,
        })
        .from(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.businessId, businessId),
            eq(notificationOutbox.status, "FAILED"),
            sql`${notificationOutbox.attemptCount} >= ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS}`
          )
        )
        .orderBy(desc(notificationOutbox.createdAt))
        .limit(10),

      db
        .select({
          id: notificationDeliveries.id,
          businessId: notificationDeliveries.businessId,
          channel: notificationDeliveries.channel,
          provider: notificationDeliveries.provider,
          attemptCount: notificationDeliveries.attemptCount,
          lastErrorCode: notificationDeliveries.lastErrorCode,
          createdAt: notificationDeliveries.createdAt,
          failedAt: notificationDeliveries.failedAt,
        })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.businessId, businessId),
            eq(notificationDeliveries.status, "FAILED"),
            sql`(${notificationDeliveries.attemptCount} >= ${NOTIFICATION_DELIVERY_MAX_ATTEMPTS} OR ${notificationDeliveries.lastErrorCode} IN (${sql.join(PERMANENT_DELIVERY_ERROR_CODES.map((c) => sql`${c}`), sql`, `)}))`
          )
        )
        .orderBy(desc(notificationDeliveries.createdAt))
        .limit(10),
    ]);


    const ob = outboxBreakdown.rows[0] || {
      pending: "0",
      processing: "0",
      processed: "0",
      retryable_failed: "0",
      terminal_failed: "0",
    };
    const pb = plansBreakdown.rows[0] || { pending: "0", cancelled: "0" };
    const dbRow = deliveriesBreakdown.rows[0] || {
      pending: "0",
      processing: "0",
      sent: "0",
      retryable_failed: "0",
      terminal_failed: "0",
      cancelled: "0",
      last_successful_delivery_at: null,
    };

    const recentFailures: PlatformTerminalFailureDetail[] = [
      ...recentOutboxFailures.map((o) => ({
        id: o.id,
        type: "OUTBOX" as const,
        businessId: o.businessId,
        appointmentId: o.appointmentId,
        eventType: o.eventType,
        attemptCount: o.attemptCount,
        lastErrorCode: o.lastErrorCode,
        createdAt: o.createdAt.toISOString(),
        failedAt: null,
      })),
      ...recentDeliveryFailures.map((d) => ({
        id: d.id,
        type: "DELIVERY" as const,
        businessId: d.businessId,
        appointmentId: null,
        channel: d.channel,
        provider: d.provider,
        attemptCount: d.attemptCount,
        lastErrorCode: d.lastErrorCode,
        createdAt: d.createdAt.toISOString(),
        failedAt: d.failedAt ? d.failedAt.toISOString() : null,
      })),
    ];

    return {
      summary: summaryItem,
      owners,
      staff: staffList.rows.map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        title: null,
        active: r.active,
        bookable: r.public_booking_enabled,
        serviceCount: Number(r.service_count),
      })),
      notificationBreakdown: {
        outbox: {
          pending: Number(ob.pending),
          processing: Number(ob.processing),
          processed: Number(ob.processed),
          retryableFailed: Number(ob.retryable_failed),
          terminalFailed: Number(ob.terminal_failed),
        },
        plans: {
          pending: Number(pb.pending),
          cancelled: Number(pb.cancelled),
        },
        deliveries: {
          pending: Number(dbRow.pending),
          processing: Number(dbRow.processing),
          sent: Number(dbRow.sent),
          retryableFailed: Number(dbRow.retryable_failed),
          terminalFailed: Number(dbRow.terminal_failed),
          cancelled: Number(dbRow.cancelled),
        },
        lastSuccessfulDeliveryAt: dbRow.last_successful_delivery_at
          ? new Date(dbRow.last_successful_delivery_at).toISOString()
          : null,
      },
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metadata: (log.metadata as Record<string, unknown> | null) ?? null,
        createdAt: log.createdAt.toISOString(),
        adminName: log.adminName,
        adminEmail: log.adminEmail,
      })),
      recentFailures,
    };
  }

  /**
   * Safe transaction to suspend or reactivate a business.
   * Generates append-only audit evidence.
   */
  static async setBusinessActiveState(
    businessId: string,
    active: boolean,
    reason: string,
    admin: PlatformAdminContext
  ) {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: businesses.id, active: businesses.active })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .for("update");

      if (!existing) {
        throw new PlatformNotFoundError("İşletme bulunamadı");
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
        platformAdminId: admin.platformAdminId,
        actorUserId: admin.userId,
        action: active ? "BUSINESS_REACTIVATED" : "BUSINESS_SUSPENDED",
        targetType: "business",
        targetId: businessId,
        metadata: {
          reason,
          previousState: existing.active,
          newState: active,
        },
      });

      return updated;
    });
  }

  /**
   * Requeues a terminal failed notification outbox event for retry.
   * Transactionally locked and safe; zero appointment mutation.
   */
  static async requeueTerminalOutboxEvent(
    eventId: string,
    admin: PlatformAdminContext
  ) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, eventId))
        .for("update");

      if (!row) {
        throw new PlatformNotFoundError("Outbox kaydı bulunamadı");
      }

      if (!isOutboxTerminalFailed(row.status, row.attemptCount)) {
        throw new NotEligibleForRequeueError("Bu bildirim kaydı yeniden sıraya alınmaya uygun değil; yalnızca kalıcı başarısız olmuş kayıtlar yeniden sıraya alınabilir");
      }

      const now = new Date();
      const [updated] = await tx
        .update(notificationOutbox)
        .set({
          status: "PENDING",
          attemptCount: 0,
          availableAt: now,
          lockedAt: null,
          lockedBy: null,
          processedAt: null,
          lastErrorCode: null,
          updatedAt: now,
        })
        .where(eq(notificationOutbox.id, eventId))
        .returning();

      await tx.insert(platformAdminAuditLogs).values({
        platformAdminId: admin.platformAdminId,
        actorUserId: admin.userId,
        action: "NOTIFICATION_OUTBOX_REQUEUED",
        targetType: "notification_outbox",
        targetId: eventId,
        metadata: {
          businessId: row.businessId,
          appointmentId: row.appointmentId,
          previousAttempts: row.attemptCount,
          previousErrorCode: row.lastErrorCode,
        },
      });

      return updated;
    });
  }

  /**
   * Requeues a terminal failed delivery for retry.
   * Refuses to requeue SENT deliveries.
   */
  static async requeueTerminalDelivery(
    deliveryId: string,
    admin: PlatformAdminContext
  ) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.id, deliveryId))
        .for("update");

      if (!row) {
        throw new PlatformNotFoundError("Teslimat kaydı bulunamadı");
      }

      if (row.status === "SENT") {
        throw new CannotRequeueSentDeliveryError();
      }

      if (!isDeliveryTerminalFailed(row.status, row.attemptCount, row.lastErrorCode)) {
        throw new NotEligibleForRequeueError("Bu bildirim teslimatı yeniden sıraya alınmaya uygun değil; yalnızca kalıcı başarısız olmuş teslimatlar yeniden sıraya alınabilir");
      }

      const now = new Date();
      const [updated] = await tx
        .update(notificationDeliveries)
        .set({
          status: "PENDING",
          attemptCount: 0,
          availableAt: now,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
          failedAt: null,
          updatedAt: now,
        })

        .where(eq(notificationDeliveries.id, deliveryId))
        .returning();

      await tx.insert(platformAdminAuditLogs).values({
        platformAdminId: admin.platformAdminId,
        actorUserId: admin.userId,
        action: "NOTIFICATION_DELIVERY_REQUEUED",
        targetType: "notification_delivery",
        targetId: deliveryId,
        metadata: {
          businessId: row.businessId,
          planId: row.planId,
          previousAttempts: row.attemptCount,
          previousErrorCode: row.lastErrorCode,
        },
      });

      return updated;
    });
  }
}
