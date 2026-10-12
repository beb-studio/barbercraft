import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import type { AppointmentStatus } from "@/db/schema/appointments";
import {
  appointmentAccessTokens,
  appointments,
  businesses,
  staffProfiles,
} from "@/db/schema";

export const AppointmentAccessRepository = {
  async findAppointmentForIssue(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string
  ) {
    const [row] = await executor
      .select({
        id: appointments.id,
        businessId: appointments.businessId,
        endTime: appointments.endTime,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          eq(appointments.id, appointmentId)
        )
      )
      .limit(1);

    return row ?? null;
  },

  async insertToken(
    executor: DbExecutor,
    values: {
      businessId: string;
      appointmentId: string;
      tokenHash: string;
      expiresAt: Date;
    }
  ) {
    const [row] = await executor
      .insert(appointmentAccessTokens)
      .values(values)
      .onConflictDoNothing({ target: appointmentAccessTokens.tokenHash })
      .returning({
        id: appointmentAccessTokens.id,
        expiresAt: appointmentAccessTokens.expiresAt,
      });

    return row ?? null;
  },

  async findManagementViewByHash(
    tokenHash: string,
    executor: DbExecutor = db
  ) {
    const [row] = await executor
      .select({
        tokenExpiresAt: appointmentAccessTokens.expiresAt,
        tokenRevokedAt: appointmentAccessTokens.revokedAt,
        businessId: appointments.businessId,
        appointmentId: appointments.id,
        staffId: appointments.staffId,
        serviceId: appointments.serviceId,
        businessName: businesses.name,
        businessTimezone: businesses.timezone,
        businessCurrency: businesses.currency,
        minimumBookingLeadMinutes: businesses.minimumBookingLeadMinutes,
        maximumAdvanceBookingDays: businesses.maximumAdvanceBookingDays,
        cancellationNoticeMinutes: businesses.cancellationNoticeMinutes,
        rescheduleNoticeMinutes: businesses.rescheduleNoticeMinutes,
        staffFirstName: staffProfiles.firstName,
        staffLastName: staffProfiles.lastName,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        status: appointments.status,
        serviceName: appointments.serviceNameSnapshot,
        serviceDurationMinutes: appointments.serviceDurationSnapshot,
        servicePrice: appointments.servicePriceSnapshot,
      })
      .from(appointmentAccessTokens)
      .innerJoin(
        appointments,
        and(
          eq(appointments.businessId, appointmentAccessTokens.businessId),
          eq(appointments.id, appointmentAccessTokens.appointmentId)
        )
      )
      .innerJoin(
        businesses,
        eq(businesses.id, appointmentAccessTokens.businessId)
      )
      .innerJoin(
        staffProfiles,
        and(
          eq(staffProfiles.businessId, appointments.businessId),
          eq(staffProfiles.id, appointments.staffId)
        )
      )
      .where(eq(appointmentAccessTokens.tokenHash, tokenHash))
      .limit(1);

    return row ?? null;
  },

  async findMutationTargetByHash(
    executor: DbExecutor,
    tokenHash: string
  ) {
    const [row] = await executor
      .select({
        businessId: appointmentAccessTokens.businessId,
        appointmentId: appointmentAccessTokens.appointmentId,
        tokenExpiresAt: appointmentAccessTokens.expiresAt,
        tokenRevokedAt: appointmentAccessTokens.revokedAt,
        staffId: appointments.staffId,
        serviceId: appointments.serviceId,
      })
      .from(appointmentAccessTokens)
      .innerJoin(
        appointments,
        and(
          eq(appointments.businessId, appointmentAccessTokens.businessId),
          eq(appointments.id, appointmentAccessTokens.appointmentId)
        )
      )
      .where(eq(appointmentAccessTokens.tokenHash, tokenHash))
      .limit(1);

    return row ?? null;
  },

  async lockStaffProfileForUpdate(
    executor: DbExecutor,
    businessId: string,
    staffId: string
  ): Promise<boolean> {
    const result = await executor.execute(sql`
      SELECT id
      FROM staff_profiles
      WHERE business_id = ${businessId} AND id = ${staffId}
      FOR UPDATE
    `);
    return result.rows.length === 1;
  },

  async lockAppointmentForUpdate(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string
  ): Promise<{
    id: string;
    staffId: string;
    serviceId: string;
    status: AppointmentStatus;
    startTime: Date;
    endTime: Date;
    serviceDurationSnapshot: number;
  } | null> {
    const result = await executor.execute(sql`
      SELECT
        id,
        staff_id,
        service_id,
        status,
        start_time,
        end_time,
        service_duration_snapshot
      FROM appointments
      WHERE business_id = ${businessId} AND id = ${appointmentId}
      FOR UPDATE
    `);
    const row = result.rows[0] as
      | {
          id: string;
          staff_id: string;
          service_id: string;
          status: AppointmentStatus;
          start_time: Date;
          end_time: Date;
          service_duration_snapshot: number;
        }
      | undefined;

    return row
      ? {
          id: row.id,
          staffId: row.staff_id,
          serviceId: row.service_id,
          status: row.status,
          startTime:
            row.start_time instanceof Date
              ? row.start_time
              : new Date(row.start_time),
          endTime:
            row.end_time instanceof Date
              ? row.end_time
              : new Date(row.end_time),
          serviceDurationSnapshot: row.service_duration_snapshot,
        }
      : null;
  },

  async lockTokenForUpdate(
    executor: DbExecutor,
    tokenHash: string
  ): Promise<{
    businessId: string;
    appointmentId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null> {
    const result = await executor.execute(sql`
      SELECT business_id, appointment_id, expires_at, revoked_at
      FROM appointment_access_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `);
    const row = result.rows[0] as
      | {
          business_id: string;
          appointment_id: string;
          expires_at: Date;
          revoked_at: Date | null;
        }
      | undefined;

    return row
      ? {
          businessId: row.business_id,
          appointmentId: row.appointment_id,
          expiresAt:
            row.expires_at instanceof Date
              ? row.expires_at
              : new Date(row.expires_at),
          revokedAt:
            row.revoked_at === null
              ? null
              : row.revoked_at instanceof Date
                ? row.revoked_at
                : new Date(row.revoked_at),
        }
      : null;
  },

  async setAppointmentCancelled(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string
  ): Promise<boolean> {
    const rows = await executor
      .update(appointments)
      .set({ status: "CANCELLED" })
      .where(
        and(
          eq(appointments.businessId, businessId),
          eq(appointments.id, appointmentId)
        )
      )
      .returning({ id: appointments.id });

    return rows.length === 1;
  },

  async setAppointmentSchedule(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    const rows = await executor
      .update(appointments)
      .set({ startTime, endTime })
      .where(
        and(
          eq(appointments.businessId, businessId),
          eq(appointments.id, appointmentId)
        )
      )
      .returning({ id: appointments.id });

    return rows.length === 1;
  },

  async revokeByHash(
    executor: DbExecutor,
    tokenHash: string,
    revokedAt: Date
  ): Promise<boolean> {
    const rows = await executor
      .update(appointmentAccessTokens)
      .set({ revokedAt })
      .where(
        and(
          eq(appointmentAccessTokens.tokenHash, tokenHash),
          isNull(appointmentAccessTokens.revokedAt)
        )
      )
      .returning({ id: appointmentAccessTokens.id });

    return rows.length === 1;
  },

  async updateAppointmentTokenExpirations(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string,
    expiresAt: Date
  ): Promise<void> {
    await executor
      .update(appointmentAccessTokens)
      .set({ expiresAt })
      .where(
        and(
          eq(appointmentAccessTokens.businessId, businessId),
          eq(appointmentAccessTokens.appointmentId, appointmentId)
        )
      );
  },
};
