"use server";

import { revalidatePath } from "next/cache";
import { requireManagerOrOwner, requireSession } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import {
  isNotificationReminderTimeUnit,
  minutesToReminderDuration,
  validateBusinessNotificationSettings,
  type ReminderDurationInput,
} from "@/lib/notification-settings";
import {
  NotificationPlannerError,
  NotificationPlannerService,
} from "@/services/notification-planner.service";

export interface NotificationSettingsValues {
  customerNotificationsEnabled: boolean;
  appointmentCreatedEnabled: boolean;
  appointmentRescheduledEnabled: boolean;
  appointmentCancelledEnabled: boolean;
  reminderRules: ReminderDurationInput[];
}

export interface NotificationSettingsDto {
  version: string;
  values: NotificationSettingsValues;
}

export interface UpdateNotificationSettingsPayload {
  expectedVersion: string;
  customerNotificationsEnabled: boolean;
  appointmentCreatedEnabled: boolean;
  appointmentRescheduledEnabled: boolean;
  appointmentCancelledEnabled: boolean;
  reminderRules: Array<{ amount: string; unit: string }>;
}

export type UpdateNotificationSettingsActionResult =
  | { success: true; message: string; data: NotificationSettingsDto }
  | {
      success: false;
      type: "INVALID" | "STALE" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";
      error: string;
      data?: NotificationSettingsDto;
    };

function toDto(record: Awaited<ReturnType<typeof NotificationPlannerService.getSettingsForBusiness>>): NotificationSettingsDto {
  return {
    version: record.version,
    values: {
      customerNotificationsEnabled: record.customerNotificationsEnabled,
      appointmentCreatedEnabled: record.appointmentCreatedEnabled,
      appointmentRescheduledEnabled: record.appointmentRescheduledEnabled,
      appointmentCancelledEnabled: record.appointmentCancelledEnabled,
      reminderRules: record.reminderMinutes.map(minutesToReminderDuration),
    },
  };
}

function parsePayload(
  payload: UpdateNotificationSettingsPayload
): ReturnType<typeof validateBusinessNotificationSettings> {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.customerNotificationsEnabled !== "boolean" ||
    typeof payload.appointmentCreatedEnabled !== "boolean" ||
    typeof payload.appointmentRescheduledEnabled !== "boolean" ||
    typeof payload.appointmentCancelledEnabled !== "boolean" ||
    !Array.isArray(payload.reminderRules)
  ) {
    return { valid: false };
  }
  const rules: ReminderDurationInput[] = [];
  for (const rule of payload.reminderRules) {
    if (
      !rule ||
      typeof rule.amount !== "string" ||
      !isNotificationReminderTimeUnit(rule.unit)
    ) {
      return { valid: false };
    }
    rules.push({ amount: rule.amount, unit: rule.unit });
  }
  return validateBusinessNotificationSettings({
    customerNotificationsEnabled: payload.customerNotificationsEnabled,
    appointmentCreatedEnabled: payload.appointmentCreatedEnabled,
    appointmentRescheduledEnabled: payload.appointmentRescheduledEnabled,
    appointmentCancelledEnabled: payload.appointmentCancelledEnabled,
    reminderRules: rules,
  });
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Isolated service tests do not have a Next cache store.
  }
}

export async function updateBusinessNotificationSettingsAction(
  payload: UpdateNotificationSettingsPayload
): Promise<UpdateNotificationSettingsActionResult> {
  try {
    await requireSession();
    const membership = (await getMemberships())[0];
    if (!membership) {
      return {
        success: false,
        type: "FORBIDDEN",
        error: "Bu ayarları değiştirme yetkiniz yok.",
      };
    }
    await requireManagerOrOwner(membership.business_id);
    if (typeof payload.expectedVersion !== "string" || !payload.expectedVersion) {
      return {
        success: false,
        type: "INVALID",
        error: "Girdiğiniz bildirim ayarları geçerli değil.",
      };
    }
    const parsed = parsePayload(payload);
    if (!parsed.valid) {
      return {
        success: false,
        type: "INVALID",
        error: "Girdiğiniz bildirim ayarları geçerli değil.",
      };
    }
    const result = await NotificationPlannerService.updateSettings({
      businessId: membership.business_id,
      expectedVersion: payload.expectedVersion,
      settings: parsed.settings,
    });
    if (result.outcome === "STALE") {
      return {
        success: false,
        type: "STALE",
        error:
          "Bildirim ayarları başka bir kullanıcı tarafından güncellendi. Güncel değerleri kontrol edip tekrar deneyin.",
        data: toDto(result.record),
      };
    }
    safeRevalidate("/dashboard/settings/notifications");
    safeRevalidate("/dashboard/settings/booking");
    return {
      success: true,
      message: "Bildirim ayarları güncellendi.",
      data: toDto(result.record),
    };
  } catch (error) {
    const named = error as { name?: string };
    if (named.name === "UnauthorizedError" || named.name === "ForbiddenError") {
      return {
        success: false,
        type: "FORBIDDEN",
        error: "Bu ayarları değiştirme yetkiniz yok.",
      };
    }
    if (
      error instanceof NotificationPlannerError &&
      error.code === "PLANNER_SETTINGS_NOT_FOUND"
    ) {
      return {
        success: false,
        type: "NOT_FOUND",
        error: "Bildirim ayarları bulunamadı.",
      };
    }
    if (error instanceof NotificationPlannerError) {
      return {
        success: false,
        type: "CONFLICT",
        error: "Bildirim ayarları güncellenemedi. Lütfen tekrar deneyin.",
      };
    }
    return {
      success: false,
      type: "CONFLICT",
      error: "Bildirim ayarları güncellenemedi. Lütfen tekrar deneyin.",
    };
  }
}
