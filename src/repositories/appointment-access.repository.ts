import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
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

  async findManagementViewByHash(tokenHash: string) {
    const [row] = await db
      .select({
        tokenExpiresAt: appointmentAccessTokens.expiresAt,
        tokenRevokedAt: appointmentAccessTokens.revokedAt,
        businessName: businesses.name,
        businessTimezone: businesses.timezone,
        businessCurrency: businesses.currency,
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
