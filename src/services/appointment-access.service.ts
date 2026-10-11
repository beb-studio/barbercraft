import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { db, type DbExecutor } from "@/db";
import type { AppointmentStatus } from "@/db/schema/appointments";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";
import { AppointmentAccessRepository } from "@/repositories/appointment-access.repository";

export const APPOINTMENT_ACCESS_POST_APPOINTMENT_GRACE_MS =
  24 * 60 * 60 * 1000;

const RAW_TOKEN_BYTES = 32;
const RAW_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_INSERT_ATTEMPTS = 3;

export interface AppointmentManagementView {
  businessName: string;
  serviceName: string;
  staffDisplayName: string;
  dateLabel: string;
  localStartTime: string;
  localEndTime: string;
  durationMinutes: number;
  price: string;
  currency: string;
  status: AppointmentStatus;
}

export function calculateAppointmentAccessExpiry(appointmentEndTime: Date): Date {
  return new Date(
    appointmentEndTime.getTime() + APPOINTMENT_ACCESS_POST_APPOINTMENT_GRACE_MS
  );
}

function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

function hashRawToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function hasValidTokenSyntax(rawToken: unknown): rawToken is string {
  return typeof rawToken === "string" && RAW_TOKEN_REGEX.test(rawToken);
}

export const AppointmentAccessService = {
  async issue(
    input: { businessId: string; appointmentId: string },
    executor: DbExecutor = db
  ): Promise<{ rawToken: string; expiresAt: Date }> {
    const appointment = await AppointmentAccessRepository.findAppointmentForIssue(
      executor,
      input.businessId,
      input.appointmentId
    );
    if (!appointment) {
      throw new Error("APPOINTMENT_ACCESS_APPOINTMENT_NOT_FOUND");
    }

    const expiresAt = calculateAppointmentAccessExpiry(appointment.endTime);
    if (expiresAt.getTime() <= Date.now()) {
      throw new Error("APPOINTMENT_ACCESS_NOT_OPERATIONAL");
    }

    for (let attempt = 0; attempt < TOKEN_INSERT_ATTEMPTS; attempt += 1) {
      const rawToken = generateRawToken();
      const tokenHash = hashRawToken(rawToken);
      const inserted = await AppointmentAccessRepository.insertToken(executor, {
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        tokenHash,
        expiresAt,
      });

      if (inserted) {
        return { rawToken, expiresAt: inserted.expiresAt };
      }
    }

    throw new Error("APPOINTMENT_ACCESS_TOKEN_COLLISION");
  },

  async resolve(
    rawToken: unknown,
    referenceNow: Date = new Date()
  ): Promise<AppointmentManagementView | null> {
    if (!hasValidTokenSyntax(rawToken)) return null;

    const row = await AppointmentAccessRepository.findManagementViewByHash(
      hashRawToken(rawToken)
    );
    if (
      !row ||
      row.tokenRevokedAt !== null ||
      row.tokenExpiresAt.getTime() <= referenceNow.getTime()
    ) {
      return null;
    }

    const localStart = formatInstantInBusinessTimezone(
      row.startTime,
      row.businessTimezone
    );
    const localEnd = formatInstantInBusinessTimezone(
      row.endTime,
      row.businessTimezone
    );

    return {
      businessName: row.businessName,
      serviceName: row.serviceName,
      staffDisplayName: `${row.staffFirstName} ${row.staffLastName}`.trim(),
      dateLabel: localStart.displayStr.split(",")[0],
      localStartTime: localStart.timeStr,
      localEndTime: localEnd.timeStr,
      durationMinutes: row.serviceDurationMinutes,
      price: row.servicePrice,
      currency: row.businessCurrency,
      status: row.status,
    };
  },

  async revoke(
    rawToken: unknown,
    executor: DbExecutor = db,
    revokedAt: Date = new Date()
  ): Promise<boolean> {
    if (!hasValidTokenSyntax(rawToken)) return false;
    return AppointmentAccessRepository.revokeByHash(
      executor,
      hashRawToken(rawToken),
      revokedAt
    );
  },

  async refreshExpirationAfterReschedule(
    executor: DbExecutor,
    input: { businessId: string; appointmentId: string; appointmentEndTime: Date }
  ): Promise<void> {
    await AppointmentAccessRepository.updateAppointmentTokenExpirations(
      executor,
      input.businessId,
      input.appointmentId,
      calculateAppointmentAccessExpiry(input.appointmentEndTime)
    );
  },
};
