"use server";

import type {
  AppointmentManagementView,
  AppointmentRescheduleSlot,
} from "@/services/appointment-access.service";
import { AppointmentAccessService } from "@/services/appointment-access.service";
import { checkRateLimit, getClientIp, hashIdentifier } from "@/lib/rate-limit";

export type ResolveAppointmentAccessResult =
  | { success: true; data: AppointmentManagementView }
  | { success: false };

export type CancelAppointmentAccessResult =
  | {
      success: true;
      data: AppointmentManagementView;
      message: "Randevunuz iptal edildi.";
      idempotent: boolean;
    }
  | {
      success: false;
      type: "NOT_CANCELLABLE";
      data: AppointmentManagementView;
      message: "Bu randevu artık iptal edilemiyor.";
    }
  | { success: false; type: "INVALID_CAPABILITY" };

export type GetAppointmentRescheduleAvailabilityResult =
  | {
      success: true;
      data: {
        appointment: AppointmentManagementView;
        localDate: string;
        slots: AppointmentRescheduleSlot[];
        reason?: "CLOSED" | "NO_AVAILABLE_SLOTS";
      };
    }
  | {
      success: false;
      type: "NOT_RESCHEDULABLE" | "ONLINE_UNAVAILABLE" | "INVALID_DATE";
      data?: AppointmentManagementView;
      message: string;
    }
  | { success: false; type: "INVALID_CAPABILITY" };

export type RescheduleAppointmentAccessResult =
  | {
      success: true;
      data: AppointmentManagementView;
      message: "Randevunuz güncellendi.";
    }
  | {
      success: false;
      type:
        | "UNCHANGED"
        | "SLOT_UNAVAILABLE"
        | "NOT_RESCHEDULABLE"
        | "ONLINE_UNAVAILABLE";
      data: AppointmentManagementView;
      message: string;
    }
  | { success: false; type: "INVALID_CAPABILITY" };

export async function resolveAppointmentAccessAction(
  rawToken: unknown
): Promise<ResolveAppointmentAccessResult> {
  try {
    const ip = await getClientIp();
    const rateLimit = await checkRateLimit({
      key: `capability:resolve:${hashIdentifier(ip)}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.success) {
      return { success: false };
    }

    const appointment = await AppointmentAccessService.resolve(rawToken);
    return appointment
      ? { success: true, data: appointment }
      : { success: false };
  } catch {
    return { success: false };
  }
}

export async function cancelAppointmentAccessAction(
  rawToken: unknown
): Promise<CancelAppointmentAccessResult> {
  try {
    const ip = await getClientIp();
    const rateLimit = await checkRateLimit({
      key: `capability:mutate:${hashIdentifier(ip)}`,
      limit: 20,
      windowSeconds: 600,
    });
    if (!rateLimit.success) {
      return { success: false, type: "INVALID_CAPABILITY" };
    }

    const result = await AppointmentAccessService.cancel(rawToken);

    if (result.outcome === "CANCELLED") {
      return {
        success: true,
        data: result.appointment,
        message: "Randevunuz iptal edildi.",
        idempotent: !result.changed,
      };
    }

    if (result.outcome === "NOT_CANCELLABLE") {
      return {
        success: false,
        type: "NOT_CANCELLABLE",
        data: result.appointment,
        message: "Bu randevu artık iptal edilemiyor.",
      };
    }

    return { success: false, type: "INVALID_CAPABILITY" };
  } catch {
    return { success: false, type: "INVALID_CAPABILITY" };
  }
}

export async function getAppointmentRescheduleAvailabilityAction(
  rawToken: unknown,
  localDate: unknown
): Promise<GetAppointmentRescheduleAvailabilityResult> {
  try {
    const ip = await getClientIp();
    const rateLimit = await checkRateLimit({
      key: `capability:resolve:${hashIdentifier(ip)}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.success) {
      return { success: false, type: "INVALID_CAPABILITY" };
    }

    const result = await AppointmentAccessService.getRescheduleAvailability(
      rawToken,
      localDate
    );

    if (result.outcome === "AVAILABLE") {
      return {
        success: true,
        data: {
          appointment: result.appointment,
          localDate: result.localDate,
          slots: result.slots,
          ...(result.reason ? { reason: result.reason } : {}),
        },
      };
    }

    if (result.outcome === "NOT_RESCHEDULABLE") {
      return {
        success: false,
        type: result.outcome,
        data: result.appointment,
        message: "Bu randevu artık değiştirilemiyor.",
      };
    }

    if (result.outcome === "ONLINE_UNAVAILABLE") {
      return {
        success: false,
        type: result.outcome,
        data: result.appointment,
        message:
          "Bu randevu çevrim içi olarak değiştirilemiyor. Lütfen işletmeyle iletişime geçin.",
      };
    }

    if (result.outcome === "INVALID_DATE") {
      return {
        success: false,
        type: result.outcome,
        message: "Geçerli bir tarih seçin.",
      };
    }

    return { success: false, type: "INVALID_CAPABILITY" };
  } catch {
    return { success: false, type: "INVALID_CAPABILITY" };
  }
}

export async function rescheduleAppointmentAccessAction(
  rawToken: unknown,
  requestedStartAt: unknown
): Promise<RescheduleAppointmentAccessResult> {
  try {
    const ip = await getClientIp();
    const rateLimit = await checkRateLimit({
      key: `capability:mutate:${hashIdentifier(ip)}`,
      limit: 20,
      windowSeconds: 600,
    });
    if (!rateLimit.success) {
      return { success: false, type: "INVALID_CAPABILITY" };
    }

    const result = await AppointmentAccessService.reschedule(
      rawToken,
      requestedStartAt
    );

    if (result.outcome === "RESCHEDULED") {
      return {
        success: true,
        data: result.appointment,
        message: "Randevunuz güncellendi.",
      };
    }

    if (result.outcome === "INVALID_CAPABILITY") {
      return { success: false, type: "INVALID_CAPABILITY" };
    }

    const messages = {
      UNCHANGED: "Mevcut randevu saati zaten seçili.",
      SLOT_UNAVAILABLE:
        "Seçtiğiniz saat artık uygun değil. Lütfen başka bir saat seçin.",
      NOT_RESCHEDULABLE: "Bu randevu artık değiştirilemiyor.",
      ONLINE_UNAVAILABLE:
        "Bu randevu çevrim içi olarak değiştirilemiyor. Lütfen işletmeyle iletişime geçin.",
    } as const;

    return {
      success: false,
      type: result.outcome,
      data: result.appointment,
      message: messages[result.outcome],
    };
  } catch {
    return { success: false, type: "INVALID_CAPABILITY" };
  }
}
