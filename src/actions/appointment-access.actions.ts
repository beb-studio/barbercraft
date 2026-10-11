"use server";

import type { AppointmentManagementView } from "@/services/appointment-access.service";
import { AppointmentAccessService } from "@/services/appointment-access.service";

export type ResolveAppointmentAccessResult =
  | { success: true; data: AppointmentManagementView }
  | { success: false };

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
