import "server-only";

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import {
  businessNotificationReminderRules,
  businessNotificationSettings,
  notificationPlans,
  type NotificationPlanType,
} from "@/db/schema";
import type { ValidBusinessNotificationSettings } from "@/lib/notification-settings";

export interface NotificationSettingsRecord {
  businessId: string;
  customerNotificationsEnabled: boolean;
  appointmentCreatedEnabled: boolean;
  appointmentRescheduledEnabled: boolean;
  appointmentCancelledEnabled: boolean;
  version: string;
  reminderMinutes: number[];
}

const settingsSelection = {
  businessId: businessNotificationSettings.businessId,
  customerNotificationsEnabled:
    businessNotificationSettings.customerNotificationsEnabled,
  appointmentCreatedEnabled: businessNotificationSettings.appointmentCreatedEnabled,
  appointmentRescheduledEnabled:
    businessNotificationSettings.appointmentRescheduledEnabled,
  appointmentCancelledEnabled:
    businessNotificationSettings.appointmentCancelledEnabled,
  version: sql<string>`${businessNotificationSettings.updatedAt}::text`,
};

function toSettingsRecord(
  settings: Omit<NotificationSettingsRecord, "reminderMinutes">,
  rules: Array<{ minutesBefore: number; enabled: boolean }>
): NotificationSettingsRecord {
  return {
    ...settings,
    reminderMinutes: rules
      .filter((rule) => rule.enabled)
      .map((rule) => rule.minutesBefore)
      .sort((a, b) => b - a),
  };
}

export const NotificationPlanningRepository = {
  async findSettings(
    executor: DbExecutor,
    businessId: string
  ): Promise<NotificationSettingsRecord | null> {
    const [settings] = await executor
      .select(settingsSelection)
      .from(businessNotificationSettings)
      .where(eq(businessNotificationSettings.businessId, businessId))
      .limit(1);
    if (!settings) return null;
    const rules = await executor
      .select({
        minutesBefore: businessNotificationReminderRules.minutesBefore,
        enabled: businessNotificationReminderRules.enabled,
      })
      .from(businessNotificationReminderRules)
      .where(eq(businessNotificationReminderRules.businessId, businessId));
    return toSettingsRecord(settings, rules);
  },

  async lockSettings(
    executor: DbExecutor,
    businessId: string
  ): Promise<NotificationSettingsRecord | null> {
    const settingsResult = await executor.execute(sql`
      SELECT business_id, customer_notifications_enabled,
        appointment_created_enabled, appointment_rescheduled_enabled,
        appointment_cancelled_enabled, updated_at::text AS version
      FROM business_notification_settings
      WHERE business_id = ${businessId}
      FOR UPDATE
    `);
    const row = settingsResult.rows[0] as
      | {
          business_id: string;
          customer_notifications_enabled: boolean;
          appointment_created_enabled: boolean;
          appointment_rescheduled_enabled: boolean;
          appointment_cancelled_enabled: boolean;
          version: string;
        }
      | undefined;
    if (!row) return null;
    const rules = await executor
      .select({
        minutesBefore: businessNotificationReminderRules.minutesBefore,
        enabled: businessNotificationReminderRules.enabled,
      })
      .from(businessNotificationReminderRules)
      .where(eq(businessNotificationReminderRules.businessId, businessId));
    return toSettingsRecord(
      {
        businessId: row.business_id,
        customerNotificationsEnabled: row.customer_notifications_enabled,
        appointmentCreatedEnabled: row.appointment_created_enabled,
        appointmentRescheduledEnabled: row.appointment_rescheduled_enabled,
        appointmentCancelledEnabled: row.appointment_cancelled_enabled,
        version: row.version,
      },
      rules
    );
  },

  async updateSettings(
    executor: DbExecutor,
    businessId: string,
    settings: ValidBusinessNotificationSettings
  ): Promise<void> {
    await executor
      .update(businessNotificationSettings)
      .set({
        customerNotificationsEnabled: settings.customerNotificationsEnabled,
        appointmentCreatedEnabled: settings.appointmentCreatedEnabled,
        appointmentRescheduledEnabled: settings.appointmentRescheduledEnabled,
        appointmentCancelledEnabled: settings.appointmentCancelledEnabled,
      })
      .where(eq(businessNotificationSettings.businessId, businessId));
  },

  async replaceReminderRules(
    executor: DbExecutor,
    businessId: string,
    reminderMinutes: number[]
  ): Promise<void> {
    await executor
      .delete(businessNotificationReminderRules)
      .where(eq(businessNotificationReminderRules.businessId, businessId));
    if (reminderMinutes.length > 0) {
      await executor.insert(businessNotificationReminderRules).values(
        reminderMinutes.map((minutesBefore) => ({
          businessId,
          minutesBefore,
          enabled: true,
        }))
      );
    }
  },

  async lockClaimedOutboxEvent(
    executor: DbExecutor,
    eventId: string
  ) {
    const result = await executor.execute(sql`
      SELECT id, business_id, appointment_id, event_type, payload_version,
        payload, status, locked_by
      FROM notification_outbox
      WHERE id = ${eventId}
      FOR UPDATE
    `);
    return (result.rows[0] ?? null) as {
      id: string;
      business_id: string;
      appointment_id: string;
      event_type: string;
      payload_version: number;
      payload: Record<string, unknown>;
      status: string;
      locked_by: string | null;
    } | null;
  },

  async lockAppointment(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string
  ) {
    const result = await executor.execute(sql`
      SELECT id, business_id, start_time, end_time, status
      FROM appointments
      WHERE business_id = ${businessId} AND id = ${appointmentId}
      FOR UPDATE
    `);
    const row = result.rows[0] as
      | {
          id: string;
          business_id: string;
          start_time: Date | string;
          end_time: Date | string;
          status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      businessId: row.business_id,
      startTime:
        row.start_time instanceof Date ? row.start_time : new Date(row.start_time),
      endTime: row.end_time instanceof Date ? row.end_time : new Date(row.end_time),
      status: row.status,
    };
  },

  async insertPlan(
    executor: DbExecutor,
    input: {
      businessId: string;
      appointmentId: string;
      sourceOutboxId?: string;
      type: NotificationPlanType;
      scheduledFor: Date;
      reminderOffsetMinutes?: number;
      idempotencyKey: string;
    }
  ): Promise<void> {
    await executor
      .insert(notificationPlans)
      .values({
        ...input,
        sourceOutboxId: input.sourceOutboxId ?? null,
        reminderOffsetMinutes: input.reminderOffsetMinutes ?? null,
      })
      .onConflictDoNothing({ target: notificationPlans.idempotencyKey });
  },

  async cancelPendingPlansForAppointment(
    executor: DbExecutor,
    input: {
      businessId: string;
      appointmentId: string;
      types?: NotificationPlanType[];
      referenceNow: Date;
      futureOnly?: boolean;
    }
  ): Promise<void> {
    const clauses = [
      eq(notificationPlans.businessId, input.businessId),
      eq(notificationPlans.appointmentId, input.appointmentId),
      eq(notificationPlans.status, "PENDING"),
    ];
    if (input.types && input.types.length > 0) {
      clauses.push(inArray(notificationPlans.type, input.types));
    }
    if (input.futureOnly) {
      clauses.push(gt(notificationPlans.scheduledFor, input.referenceNow));
    }
    await executor
      .update(notificationPlans)
      .set({ status: "CANCELLED", cancelledAt: input.referenceNow })
      .where(and(...clauses));
  },

  async cancelPendingPlansForBusinessTypes(
    executor: DbExecutor,
    input: {
      businessId: string;
      types: NotificationPlanType[];
      referenceNow: Date;
      futureOnly?: boolean;
    }
  ): Promise<void> {
    const clauses = [
      eq(notificationPlans.businessId, input.businessId),
      eq(notificationPlans.status, "PENDING"),
      inArray(notificationPlans.type, input.types),
    ];
    if (input.futureOnly) {
      clauses.push(gt(notificationPlans.scheduledFor, input.referenceNow));
    }
    await executor
      .update(notificationPlans)
      .set({ status: "CANCELLED", cancelledAt: input.referenceNow })
      .where(and(...clauses));
  },

  async lockFutureOperationalAppointments(
    executor: DbExecutor,
    businessId: string,
    referenceNow: Date
  ) {
    const result = await executor.execute(sql`
      SELECT id, start_time, end_time, status
      FROM appointments
      WHERE business_id = ${businessId}
        AND status IN ('PENDING', 'CONFIRMED')
        AND start_time > ${referenceNow}
      ORDER BY start_time ASC, id ASC
      FOR UPDATE
    `);
    return result.rows.map((row) => {
      const typed = row as {
        id: string;
        start_time: Date | string;
        end_time: Date | string;
        status: "PENDING" | "CONFIRMED";
      };
      return {
        id: typed.id,
        startTime:
          typed.start_time instanceof Date
            ? typed.start_time
            : new Date(typed.start_time),
        endTime:
          typed.end_time instanceof Date ? typed.end_time : new Date(typed.end_time),
        status: typed.status,
      };
    });
  },

  async findPlansForAppointment(
    executor: DbExecutor,
    businessId: string,
    appointmentId: string
  ) {
    return executor
      .select()
      .from(notificationPlans)
      .where(
        and(
          eq(notificationPlans.businessId, businessId),
          eq(notificationPlans.appointmentId, appointmentId)
        )
      );
  },

  async countSettingsForBusiness(executor: DbExecutor, businessId: string) {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(businessNotificationSettings)
      .where(eq(businessNotificationSettings.businessId, businessId));
    return row?.count ?? 0;
  },

  transaction: db.transaction.bind(db),
};
