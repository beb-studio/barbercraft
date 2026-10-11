import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { db, type DbExecutor } from "@/db";
import type { AppointmentStatus } from "@/db/schema/appointments";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";
import { canPubliclyCancelAppointment } from "@/lib/appointment-lifecycle";
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
  canCancel: boolean;
}

export type AppointmentCancellationResult =
  | {
      outcome: "CANCELLED";
      changed: boolean;
      appointment: AppointmentManagementView;
    }
  | {
      outcome: "NOT_CANCELLABLE";
      appointment: AppointmentManagementView;
    }
  | { outcome: "INVALID_CAPABILITY" };

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

function isCapabilityActive(
  capability: { tokenRevokedAt: Date | null; tokenExpiresAt: Date },
  referenceNow: Date
): boolean {
  return (
    capability.tokenRevokedAt === null &&
    capability.tokenExpiresAt.getTime() > referenceNow.getTime()
  );
}

type ManagementViewRow = NonNullable<
  Awaited<
    ReturnType<typeof AppointmentAccessRepository.findManagementViewByHash>
  >
>;

function toManagementView(
  row: ManagementViewRow,
  referenceNow: Date
): AppointmentManagementView {
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
    canCancel: canPubliclyCancelAppointment({
      status: row.status,
      startsAt: row.startTime,
      referenceNow,
    }).allowed,
  };
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
    if (!row || !isCapabilityActive(row, referenceNow)) {
      return null;
    }

    return toManagementView(row, referenceNow);
  },

  async cancel(
    rawToken: unknown,
    referenceNow?: Date
  ): Promise<AppointmentCancellationResult> {
    if (!hasValidTokenSyntax(rawToken)) {
      return { outcome: "INVALID_CAPABILITY" };
    }

    const tokenHash = hashRawToken(rawToken);
    const initialNow = referenceNow ?? new Date();

    return db.transaction(async (tx) => {
      const target =
        await AppointmentAccessRepository.findCancellationTargetByHash(
          tx,
          tokenHash
        );
      if (!target || !isCapabilityActive(target, initialNow)) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      // Preserve the existing mutation lock order used by booking, internal
      // status changes, and rescheduling: staff profile, then appointment.
      const staffLocked =
        await AppointmentAccessRepository.lockStaffProfileForUpdate(
          tx,
          target.businessId,
          target.staffId
        );
      if (!staffLocked) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const appointment =
        await AppointmentAccessRepository.lockAppointmentForUpdate(
          tx,
          target.businessId,
          target.appointmentId
        );
      if (!appointment || appointment.staffId !== target.staffId) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      // Re-lock and revalidate the capability after waiting on appointment
      // locks so concurrent revocation/expiry cannot authorize a stale write.
      const capability = await AppointmentAccessRepository.lockTokenForUpdate(
        tx,
        tokenHash
      );
      const mutationNow = referenceNow ?? new Date();
      if (
        !capability ||
        capability.businessId !== target.businessId ||
        capability.appointmentId !== target.appointmentId ||
        !isCapabilityActive(
          {
            tokenRevokedAt: capability.revokedAt,
            tokenExpiresAt: capability.expiresAt,
          },
          mutationNow
        )
      ) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      const decision = canPubliclyCancelAppointment({
        status: appointment.status,
        startsAt: appointment.startTime,
        referenceNow: mutationNow,
      });

      let changed = false;
      if (decision.allowed) {
        changed = await AppointmentAccessRepository.setAppointmentCancelled(
          tx,
          target.businessId,
          target.appointmentId
        );
        if (!changed) return { outcome: "INVALID_CAPABILITY" } as const;
      } else if (decision.reason !== "ALREADY_CANCELLED") {
        const currentView =
          await AppointmentAccessRepository.findManagementViewByHash(
            tokenHash,
            tx
          );
        if (!currentView) return { outcome: "INVALID_CAPABILITY" } as const;
        return {
          outcome: "NOT_CANCELLABLE",
          appointment: toManagementView(currentView, mutationNow),
        } as const;
      }

      const cancelledView =
        await AppointmentAccessRepository.findManagementViewByHash(
          tokenHash,
          tx
        );
      if (!cancelledView) {
        return { outcome: "INVALID_CAPABILITY" } as const;
      }

      return {
        outcome: "CANCELLED",
        changed,
        appointment: toManagementView(cancelledView, mutationNow),
      } as const;
    });
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
