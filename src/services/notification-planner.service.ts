import "server-only";

import { db } from "@/db";
import type {
  AppointmentNotificationEventType,
  NotificationPlanType,
} from "@/db/schema";
import {
  NOTIFICATION_PLANNER_MAX_BATCH_SIZE,
  NOTIFICATION_PLANNER_PAYLOAD_VERSION,
  hasMatchingEventStart,
  immediateNotificationPlanKey,
  reminderNotificationPlanKey,
} from "@/lib/notification-planning";
import type { ValidBusinessNotificationSettings } from "@/lib/notification-settings";
import { NotificationOutboxRepository } from "@/repositories/notification-outbox.repository";
import {
  NotificationPlanningRepository,
  type NotificationSettingsRecord,
} from "@/repositories/notification-planning.repository";
import {
  NotificationOutboxError,
  NotificationOutboxService,
} from "@/services/notification-outbox.service";
import type { ClaimedNotificationEvent } from "@/lib/notification-outbox";

export class NotificationPlannerError extends Error {
  constructor(
    public readonly code:
      | "PLANNER_INVALID_EVENT"
      | "PLANNER_CLAIM_NOT_OWNED"
      | "PLANNER_SETTINGS_NOT_FOUND"
      | "PLANNER_APPOINTMENT_NOT_FOUND"
      | "PLANNER_PERSISTENCE_FAILED"
  ) {
    super(code);
    this.name = "NotificationPlannerError";
  }
}

function isOperational(status: string): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

function eventIsEnabled(
  settings: NotificationSettingsRecord,
  eventType: AppointmentNotificationEventType
): boolean {
  if (!settings.customerNotificationsEnabled) return false;
  if (eventType === "APPOINTMENT_CREATED") {
    return settings.appointmentCreatedEnabled;
  }
  if (eventType === "APPOINTMENT_RESCHEDULED") {
    return settings.appointmentRescheduledEnabled;
  }
  return settings.appointmentCancelledEnabled;
}

async function createReminderPlans(
  executor: Parameters<typeof NotificationPlanningRepository.insertPlan>[0],
  input: {
    businessId: string;
    appointmentId: string;
    appointmentStartAt: Date;
    settings: NotificationSettingsRecord;
    referenceNow: Date;
  }
) {
  if (!input.settings.customerNotificationsEnabled) return;
  for (const minutesBefore of input.settings.reminderMinutes) {
    const scheduledFor = new Date(
      input.appointmentStartAt.getTime() - minutesBefore * 60_000
    );
    if (scheduledFor <= input.referenceNow) continue;
    await NotificationPlanningRepository.insertPlan(executor, {
      businessId: input.businessId,
      appointmentId: input.appointmentId,
      type: "APPOINTMENT_REMINDER",
      scheduledFor,
      reminderOffsetMinutes: minutesBefore,
      idempotencyKey: reminderNotificationPlanKey({
        businessId: input.businessId,
        appointmentId: input.appointmentId,
        appointmentStartAt: input.appointmentStartAt,
        minutesBefore,
      }),
    });
  }
}

async function reconcileFutureReminders(
  executor: Parameters<typeof NotificationPlanningRepository.insertPlan>[0],
  input: {
    businessId: string;
    settings: NotificationSettingsRecord;
    referenceNow: Date;
  }
) {
  await NotificationPlanningRepository.cancelPendingPlansForBusinessTypes(
    executor,
    {
      businessId: input.businessId,
      types: ["APPOINTMENT_REMINDER"],
      referenceNow: input.referenceNow,
    }
  );
  if (!input.settings.customerNotificationsEnabled) return;
  const appointments = await NotificationPlanningRepository.lockFutureOperationalAppointments(
    executor,
    input.businessId,
    input.referenceNow
  );
  for (const appointment of appointments) {
    await createReminderPlans(executor, {
      businessId: input.businessId,
      appointmentId: appointment.id,
      appointmentStartAt: appointment.startTime,
      settings: input.settings,
      referenceNow: input.referenceNow,
    });
  }
}

function plannerErrorCode(error: unknown): string {
  if (error instanceof NotificationPlannerError) return error.code;
  if (error instanceof NotificationOutboxError) return "PLANNER_OUTBOX_FAILURE";
  return "PLANNER_PERSISTENCE_FAILED";
}

export const NotificationPlannerService = {
  async getSettingsForBusiness(businessId: string) {
    const settings = await NotificationPlanningRepository.findSettings(db, businessId);
    if (!settings) throw new NotificationPlannerError("PLANNER_SETTINGS_NOT_FOUND");
    return settings;
  },

  async updateSettings(input: {
    businessId: string;
    expectedVersion: string;
    settings: ValidBusinessNotificationSettings;
    referenceNow?: Date;
  }) {
    const referenceNow = input.referenceNow ?? new Date();
    try {
      return await db.transaction(async (tx) => {
        const current = await NotificationPlanningRepository.lockSettings(
          tx,
          input.businessId
        );
        if (!current) throw new NotificationPlannerError("PLANNER_SETTINGS_NOT_FOUND");
        if (current.version !== input.expectedVersion) {
          return { outcome: "STALE" as const, record: current };
        }

        await NotificationPlanningRepository.updateSettings(
          tx,
          input.businessId,
          input.settings
        );
        await NotificationPlanningRepository.replaceReminderRules(
          tx,
          input.businessId,
          input.settings.reminderMinutes
        );
        const updated = await NotificationPlanningRepository.lockSettings(
          tx,
          input.businessId
        );
        if (!updated) throw new NotificationPlannerError("PLANNER_SETTINGS_NOT_FOUND");

        if (!updated.customerNotificationsEnabled) {
          await NotificationPlanningRepository.cancelPendingPlansForBusinessTypes(
            tx,
            {
              businessId: input.businessId,
              types: [
                "APPOINTMENT_CREATED",
                "APPOINTMENT_RESCHEDULED",
                "APPOINTMENT_CANCELLED",
                "APPOINTMENT_REMINDER",
              ],
              referenceNow,
              futureOnly: true,
            }
          );
        } else {
          const disabledTypes: NotificationPlanType[] = [];
          if (!updated.appointmentCreatedEnabled) {
            disabledTypes.push("APPOINTMENT_CREATED");
          }
          if (!updated.appointmentRescheduledEnabled) {
            disabledTypes.push("APPOINTMENT_RESCHEDULED");
          }
          if (!updated.appointmentCancelledEnabled) {
            disabledTypes.push("APPOINTMENT_CANCELLED");
          }
          if (disabledTypes.length > 0) {
            await NotificationPlanningRepository.cancelPendingPlansForBusinessTypes(
              tx,
              {
                businessId: input.businessId,
                types: disabledTypes,
                referenceNow,
              }
            );
          }
          await reconcileFutureReminders(tx, {
            businessId: input.businessId,
            settings: updated,
            referenceNow,
          });
        }
        return { outcome: "UPDATED" as const, record: updated };
      });
    } catch (error) {
      if (error instanceof NotificationPlannerError) throw error;
      throw new NotificationPlannerError("PLANNER_PERSISTENCE_FAILED");
    }
  },

  async processClaimedEvent(
    event: ClaimedNotificationEvent,
    referenceNow: Date = new Date()
  ): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        const claimed = await NotificationPlanningRepository.lockClaimedOutboxEvent(
          tx,
          event.id
        );
        if (
          !claimed ||
          claimed.status !== "PROCESSING" ||
          claimed.locked_by !== event.lockedBy ||
          claimed.business_id !== event.businessId ||
          claimed.appointment_id !== event.appointmentId ||
          claimed.payload_version !== NOTIFICATION_PLANNER_PAYLOAD_VERSION ||
          ![
            "APPOINTMENT_CREATED",
            "APPOINTMENT_RESCHEDULED",
            "APPOINTMENT_CANCELLED",
          ].includes(claimed.event_type)
        ) {
          throw new NotificationPlannerError("PLANNER_INVALID_EVENT");
        }

        const settings = await NotificationPlanningRepository.lockSettings(
          tx,
          claimed.business_id
        );
        if (!settings) {
          throw new NotificationPlannerError("PLANNER_SETTINGS_NOT_FOUND");
        }
        const appointment = await NotificationPlanningRepository.lockAppointment(
          tx,
          claimed.business_id,
          claimed.appointment_id
        );
        if (!appointment) {
          throw new NotificationPlannerError("PLANNER_APPOINTMENT_NOT_FOUND");
        }
        const eventType = claimed.event_type as AppointmentNotificationEventType;
        const payload = claimed.payload;

        if (eventType === "APPOINTMENT_CREATED") {
          if (
            isOperational(appointment.status) &&
            hasMatchingEventStart(payload, appointment.startTime, "startAt") &&
            eventIsEnabled(settings, eventType)
          ) {
            await NotificationPlanningRepository.insertPlan(tx, {
              businessId: appointment.businessId,
              appointmentId: appointment.id,
              sourceOutboxId: claimed.id,
              type: eventType,
              scheduledFor: referenceNow,
              idempotencyKey: immediateNotificationPlanKey({
                sourceOutboxId: claimed.id,
                type: eventType,
              }),
            });
            await createReminderPlans(tx, {
              businessId: appointment.businessId,
              appointmentId: appointment.id,
              appointmentStartAt: appointment.startTime,
              settings,
              referenceNow,
            });
          }
        }

        if (eventType === "APPOINTMENT_RESCHEDULED") {
          const isCurrentSchedule =
            isOperational(appointment.status) &&
            hasMatchingEventStart(payload, appointment.startTime, "newStartAt");
          if (isCurrentSchedule) {
            await NotificationPlanningRepository.cancelPendingPlansForAppointment(
              tx,
              {
                businessId: appointment.businessId,
                appointmentId: appointment.id,
                types: [
                  "APPOINTMENT_REMINDER",
                  "APPOINTMENT_CREATED",
                  "APPOINTMENT_RESCHEDULED",
                ],
                referenceNow,
              }
            );
            if (eventIsEnabled(settings, eventType)) {
              await NotificationPlanningRepository.insertPlan(tx, {
                businessId: appointment.businessId,
                appointmentId: appointment.id,
                sourceOutboxId: claimed.id,
                type: eventType,
                scheduledFor: referenceNow,
                idempotencyKey: immediateNotificationPlanKey({
                  sourceOutboxId: claimed.id,
                  type: eventType,
                }),
              });
            }
            await createReminderPlans(tx, {
              businessId: appointment.businessId,
              appointmentId: appointment.id,
              appointmentStartAt: appointment.startTime,
              settings,
              referenceNow,
            });
          }
        }

        if (eventType === "APPOINTMENT_CANCELLED") {
          await NotificationPlanningRepository.cancelPendingPlansForAppointment(
            tx,
            {
              businessId: appointment.businessId,
              appointmentId: appointment.id,
              types: [
                "APPOINTMENT_REMINDER",
                "APPOINTMENT_CREATED",
                "APPOINTMENT_RESCHEDULED",
              ],
              referenceNow,
            }
          );
          if (
            appointment.status === "CANCELLED" &&
            eventIsEnabled(settings, eventType)
          ) {
            await NotificationPlanningRepository.insertPlan(tx, {
              businessId: appointment.businessId,
              appointmentId: appointment.id,
              sourceOutboxId: claimed.id,
              type: eventType,
              scheduledFor: referenceNow,
              idempotencyKey: immediateNotificationPlanKey({
                sourceOutboxId: claimed.id,
                type: eventType,
              }),
            });
          }
        }

        const processed = await NotificationOutboxRepository.markProcessed(
          {
            eventId: event.id,
            workerId: event.lockedBy,
            referenceNow,
          },
          tx
        );
        if (!processed) {
          throw new NotificationPlannerError("PLANNER_CLAIM_NOT_OWNED");
        }
      });
    } catch (error) {
      if (error instanceof NotificationPlannerError) throw error;
      throw new NotificationPlannerError("PLANNER_PERSISTENCE_FAILED");
    }
  },

  async processPendingBatch(input: {
    workerId: unknown;
    batchSize?: number;
    referenceNow?: Date;
  }): Promise<{ claimed: number; processed: number; failed: number }> {
    const batchSize = input.batchSize ?? 25;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > NOTIFICATION_PLANNER_MAX_BATCH_SIZE) {
      throw new NotificationPlannerError("PLANNER_INVALID_EVENT");
    }
    const referenceNow = input.referenceNow ?? new Date();
    const events = await NotificationOutboxService.claimPendingBatch({
      workerId: input.workerId,
      batchSize,
      referenceNow,
    });
    let processed = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await NotificationPlannerService.processClaimedEvent(event, referenceNow);
        processed += 1;
      } catch (error) {
        try {
          await NotificationOutboxService.markFailed({
            eventId: event.id,
            workerId: event.lockedBy,
            errorCode: plannerErrorCode(error),
            referenceNow,
          });
          failed += 1;
        } catch {
          throw new NotificationPlannerError("PLANNER_PERSISTENCE_FAILED");
        }
      }
    }
    return { claimed: events.length, processed, failed };
  },
};
