import "server-only";

import { sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import type { AppointmentStatus } from "@/db/schema/appointments";

export interface TodayAndUpcomingRawCounts {
  totalToday: number;
  pendingToday: number;
  confirmedToday: number;
  completedToday: number;
  cancelledToday: number;
  noShowToday: number;
  remainingToday: number;
  tomorrowCount: number;
  next7DaysCount: number;
}

export interface NextAppointmentRaw {
  id: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  customerFirstName: string;
  customerLastName: string | null;
  serviceName: string;
  staffFirstName: string;
  staffLastName: string;
}

export interface RangeSummaryRaw {
  totalAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  completedServiceValue: string;
  uniqueCustomers: number;
}

export interface DailyTrendRawRow {
  localDate: string;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completedServiceValue: string;
}

export interface ServiceAnalyticsRawRow {
  serviceId: string;
  serviceName: string;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completedServiceValue: string;
}

export interface StaffAnalyticsRawRow {
  staffId: string;
  firstName: string;
  lastName: string;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completedServiceValue: string;
}

export interface BusyWeekdayRawRow {
  dayOfWeek: number;
  appointmentCount: number;
}

export interface BusyHourRawRow {
  hour: number;
  appointmentCount: number;
}

export class BusinessAnalyticsRepository {
  /**
   * Aggregates today's lifecycle counts and near-term upcoming counts in a single query.
   */
  static async getTodayAndUpcomingCounts(
    params: {
      businessId: string;
      todayStart: Date;
      todayEnd: Date;
      referenceNow: Date;
      tomorrowStart: Date;
      tomorrowEnd: Date;
      next7Start: Date;
      next7End: Date;
    },
    executor: DbExecutor = db
  ): Promise<TodayAndUpcomingRawCounts> {
    const {
      businessId,
      todayStart,
      todayEnd,
      referenceNow,
      tomorrowStart,
      tomorrowEnd,
      next7Start,
      next7End,
    } = params;

    const result = await executor.execute<{
      total_today: number;
      pending_today: number;
      confirmed_today: number;
      completed_today: number;
      cancelled_today: number;
      no_show_today: number;
      remaining_today: number;
      tomorrow_count: number;
      next_7_days_count: number;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE a.start_time >= ${todayStart} AND a.start_time < ${todayEnd})::int AS total_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${todayStart} AND a.start_time < ${todayEnd} AND a.status = 'PENDING')::int AS pending_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${todayStart} AND a.start_time < ${todayEnd} AND a.status = 'CONFIRMED')::int AS confirmed_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${todayStart} AND a.start_time < ${todayEnd} AND a.status = 'COMPLETED')::int AS completed_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${todayStart} AND a.start_time < ${todayEnd} AND a.status = 'CANCELLED')::int AS cancelled_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${todayStart} AND a.start_time < ${todayEnd} AND a.status = 'NO_SHOW')::int AS no_show_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${referenceNow} AND a.start_time < ${todayEnd} AND a.status IN ('PENDING', 'CONFIRMED'))::int AS remaining_today,
        COUNT(*) FILTER (WHERE a.start_time >= ${tomorrowStart} AND a.start_time < ${tomorrowEnd} AND a.status IN ('PENDING', 'CONFIRMED'))::int AS tomorrow_count,
        COUNT(*) FILTER (WHERE a.start_time >= ${next7Start} AND a.start_time < ${next7End} AND a.status IN ('PENDING', 'CONFIRMED'))::int AS next_7_days_count
      FROM appointments a
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${todayStart}
        AND a.start_time < ${next7End}
    `);

    const row = result.rows[0];
    return {
      totalToday: row?.total_today ?? 0,
      pendingToday: row?.pending_today ?? 0,
      confirmedToday: row?.confirmed_today ?? 0,
      completedToday: row?.completed_today ?? 0,
      cancelledToday: row?.cancelled_today ?? 0,
      noShowToday: row?.no_show_today ?? 0,
      remainingToday: row?.remaining_today ?? 0,
      tomorrowCount: row?.tomorrow_count ?? 0,
      next7DaysCount: row?.next_7_days_count ?? 0,
    };
  }

  /**
   * Retrieves the earliest future operational appointment (PENDING or CONFIRMED).
   */
  static async getNextAppointment(
    params: {
      businessId: string;
      referenceNow: Date;
    },
    executor: DbExecutor = db
  ): Promise<NextAppointmentRaw | null> {
    const { businessId, referenceNow } = params;

    const result = await executor.execute<{
      id: string;
      startTime: Date;
      endTime: Date;
      status: AppointmentStatus;
      customerFirstName: string;
      customerLastName: string | null;
      serviceName: string;
      staffFirstName: string;
      staffLastName: string;
    }>(sql`
      SELECT
        a.id,
        a.start_time AS "startTime",
        a.end_time AS "endTime",
        a.status,
        c.first_name AS "customerFirstName",
        c.last_name AS "customerLastName",
        a.service_name_snapshot AS "serviceName",
        sp.first_name AS "staffFirstName",
        sp.last_name AS "staffLastName"
      FROM appointments a
      JOIN customers c ON c.id = a.customer_id AND c.business_id = a.business_id
      JOIN staff_profiles sp ON sp.id = a.staff_id AND sp.business_id = a.business_id
      WHERE a.business_id = ${businessId}
        AND a.status IN ('PENDING', 'CONFIRMED')
        AND a.start_time >= ${referenceNow}
      ORDER BY a.start_time ASC
      LIMIT 1
    `);

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      startTime: new Date(row.startTime),
      endTime: new Date(row.endTime),
      status: row.status,
      customerFirstName: row.customerFirstName,
      customerLastName: row.customerLastName,
      serviceName: row.serviceName,
      staffFirstName: row.staffFirstName,
      staffLastName: row.staffLastName,
    };
  }

  /**
   * Computes aggregate totals and completed service value for a selected range.
   */
  static async getRangeSummary(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
    },
    executor: DbExecutor = db
  ): Promise<RangeSummaryRaw> {
    const { businessId, rangeStart, rangeEnd } = params;

    const result = await executor.execute<{
      total_appointments: number;
      pending_appointments: number;
      confirmed_appointments: number;
      completed_appointments: number;
      cancelled_appointments: number;
      no_show_appointments: number;
      completed_service_value: string;
      unique_customers: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS total_appointments,
        COUNT(*) FILTER (WHERE a.status = 'PENDING')::int AS pending_appointments,
        COUNT(*) FILTER (WHERE a.status = 'CONFIRMED')::int AS confirmed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled_appointments,
        COUNT(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_show_appointments,
        COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN a.service_price_snapshot ELSE 0 END), 0)::numeric(10,2)::text AS completed_service_value,
        COUNT(DISTINCT COALESCE(c.merged_into_customer_id, a.customer_id))::int AS unique_customers
      FROM appointments a
      JOIN customers c ON c.id = a.customer_id AND c.business_id = a.business_id
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${rangeStart}
        AND a.start_time < ${rangeEnd}
    `);

    const row = result.rows[0];
    return {
      totalAppointments: row?.total_appointments ?? 0,
      pendingAppointments: row?.pending_appointments ?? 0,
      confirmedAppointments: row?.confirmed_appointments ?? 0,
      completedAppointments: row?.completed_appointments ?? 0,
      cancelledAppointments: row?.cancelled_appointments ?? 0,
      noShowAppointments: row?.no_show_appointments ?? 0,
      completedServiceValue: row?.completed_service_value ?? "0.00",
      uniqueCustomers: row?.unique_customers ?? 0,
    };
  }

  /**
   * Counts logical customers whose first non-cancelled appointment occurred within the selected range.
   */
  static async getNewCustomersCount(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
    },
    executor: DbExecutor = db
  ): Promise<number> {
    const { businessId, rangeStart, rangeEnd } = params;

    const result = await executor.execute<{ new_customers_count: number }>(sql`
      WITH customer_first_app AS (
        SELECT
          COALESCE(c.merged_into_customer_id, a.customer_id) AS logical_customer_id,
          MIN(a.start_time) AS first_appointment_time
        FROM appointments a
        JOIN customers c ON c.id = a.customer_id AND c.business_id = a.business_id
        WHERE a.business_id = ${businessId}
          AND a.status != 'CANCELLED'
        GROUP BY COALESCE(c.merged_into_customer_id, a.customer_id)
      )
      SELECT COUNT(*)::int AS new_customers_count
      FROM customer_first_app
      WHERE first_appointment_time >= ${rangeStart}
        AND first_appointment_time < ${rangeEnd}
    `);

    return result.rows[0]?.new_customers_count ?? 0;
  }

  /**
   * Groups appointments by business-local calendar day in the selected range.
   */
  static async getDailyTrend(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
      timeZone: string;
    },
    executor: DbExecutor = db
  ): Promise<DailyTrendRawRow[]> {
    const { businessId, rangeStart, rangeEnd, timeZone } = params;

    const result = await executor.execute<{
      local_date: string;
      appointment_count: number;
      completed_count: number;
      cancelled_count: number;
      no_show_count: number;
      completed_service_value: string;
    }>(sql`
      SELECT
        to_char(a.start_time AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS local_date,
        COUNT(*)::int AS appointment_count,
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed_count,
        COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled_count,
        COUNT(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_show_count,
        COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN a.service_price_snapshot ELSE 0 END), 0)::numeric(10,2)::text AS completed_service_value
      FROM appointments a
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${rangeStart}
        AND a.start_time < ${rangeEnd}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return result.rows.map((row) => ({
      localDate: row.local_date,
      appointmentCount: row.appointment_count,
      completedCount: row.completed_count,
      cancelledCount: row.cancelled_count,
      noShowCount: row.no_show_count,
      completedServiceValue: row.completed_service_value,
    }));
  }

  /**
   * Retrieves the top 5 services ranked by appointment volume in the selected range.
   */
  static async getTopServices(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
      limit?: number;
    },
    executor: DbExecutor = db
  ): Promise<ServiceAnalyticsRawRow[]> {
    const { businessId, rangeStart, rangeEnd, limit = 5 } = params;

    const result = await executor.execute<{
      serviceId: string;
      serviceName: string;
      appointmentCount: number;
      completedCount: number;
      cancelledCount: number;
      noShowCount: number;
      completedServiceValue: string;
    }>(sql`
      SELECT
        a.service_id AS "serviceId",
        a.service_name_snapshot AS "serviceName",
        COUNT(*)::int AS "appointmentCount",
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS "completedCount",
        COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS "cancelledCount",
        COUNT(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS "noShowCount",
        COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN a.service_price_snapshot ELSE 0 END), 0)::numeric(10,2)::text AS "completedServiceValue"
      FROM appointments a
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${rangeStart}
        AND a.start_time < ${rangeEnd}
      GROUP BY a.service_id, a.service_name_snapshot
      ORDER BY COUNT(*) DESC, COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN a.service_price_snapshot ELSE 0 END), 0) DESC
      LIMIT ${limit}
    `);

    return result.rows;
  }

  /**
   * Retrieves staff workload and completed service value for the selected range.
   */
  static async getStaffPerformance(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
    },
    executor: DbExecutor = db
  ): Promise<StaffAnalyticsRawRow[]> {
    const { businessId, rangeStart, rangeEnd } = params;

    const result = await executor.execute<{
      staffId: string;
      firstName: string;
      lastName: string;
      appointmentCount: number;
      completedCount: number;
      cancelledCount: number;
      noShowCount: number;
      completedServiceValue: string;
    }>(sql`
      SELECT
        a.staff_id AS "staffId",
        COALESCE(sp.first_name, '') AS "firstName",
        COALESCE(sp.last_name, '') AS "lastName",
        COUNT(*)::int AS "appointmentCount",
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS "completedCount",
        COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS "cancelledCount",
        COUNT(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS "noShowCount",
        COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN a.service_price_snapshot ELSE 0 END), 0)::numeric(10,2)::text AS "completedServiceValue"
      FROM appointments a
      LEFT JOIN staff_profiles sp ON sp.id = a.staff_id AND sp.business_id = a.business_id
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${rangeStart}
        AND a.start_time < ${rangeEnd}
      GROUP BY a.staff_id, sp.first_name, sp.last_name
      ORDER BY COUNT(*) DESC, COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN a.service_price_snapshot ELSE 0 END), 0) DESC
    `);

    return result.rows;
  }

  /**
   * Aggregates non-cancelled appointments by weekday in the business timezone.
   */
  static async getBusyPeriodWeekdays(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
      timeZone: string;
    },
    executor: DbExecutor = db
  ): Promise<BusyWeekdayRawRow[]> {
    const { businessId, rangeStart, rangeEnd, timeZone } = params;

    const result = await executor.execute<{
      dayOfWeek: number;
      appointmentCount: number;
    }>(sql`
      SELECT
        EXTRACT(ISODOW FROM (a.start_time AT TIME ZONE ${timeZone}))::int AS "dayOfWeek",
        COUNT(*)::int AS "appointmentCount"
      FROM appointments a
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${rangeStart}
        AND a.start_time < ${rangeEnd}
        AND a.status != 'CANCELLED'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return result.rows;
  }

  /**
   * Aggregates non-cancelled appointments by local hour in the business timezone.
   */
  static async getBusyPeriodHours(
    params: {
      businessId: string;
      rangeStart: Date;
      rangeEnd: Date;
      timeZone: string;
    },
    executor: DbExecutor = db
  ): Promise<BusyHourRawRow[]> {
    const { businessId, rangeStart, rangeEnd, timeZone } = params;

    const result = await executor.execute<{
      hour: number;
      appointmentCount: number;
    }>(sql`
      SELECT
        EXTRACT(HOUR FROM (a.start_time AT TIME ZONE ${timeZone}))::int AS "hour",
        COUNT(*)::int AS "appointmentCount"
      FROM appointments a
      WHERE a.business_id = ${businessId}
        AND a.start_time >= ${rangeStart}
        AND a.start_time < ${rangeEnd}
        AND a.status != 'CANCELLED'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return result.rows;
  }
}
