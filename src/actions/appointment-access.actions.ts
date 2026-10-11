"use server";

import type { AppointmentManagementView } from "@/services/appointment-access.service";
import { AppointmentAccessService } from "@/services/appointment-access.service";

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

export async function resolveAppointmentAccessAction(
  rawToken: unknown
): Promise<ResolveAppointmentAccessResult> {
  try {
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
