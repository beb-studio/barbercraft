"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { AppointmentService } from "@/services/appointment.service";

interface ActionResponse {
  success: boolean;
  error?: string;
}

async function getContext() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership?.business_id) throw new Error("NO_BUSINESS");

  return { user, membership };
}

async function handleStatusUpdate(
  appointmentId: string,
  targetStatus: "COMPLETED" | "NO_SHOW" | "CANCELLED"
): Promise<ActionResponse> {
  try {
    if (!appointmentId || typeof appointmentId !== "string") {
      return { success: false, error: "Geçersiz randevu." };
    }

    const { user, membership } = await getContext();

    await AppointmentService.updateAppointmentStatus(
      membership.business_id,
      appointmentId,
      targetStatus,
      membership.role,
      user.id
    );

    revalidatePath("/dashboard/appointments");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NOT_FOUND")) {
      return { success: false, error: "Randevu bulunamadı." };
    }
    if (msg.includes("FORBIDDEN")) {
      return { success: false, error: "Yetkisiz işlem." };
    }
    if (msg.includes("INVALID_TRANSITION")) {
      return { success: false, error: "Bu randevunun durumu artık değiştirilemez." };
    }
    if (msg.includes("TOO_EARLY")) {
      return { success: false, error: "Randevu zamanı henüz başlamadı." };
    }
    return { success: false, error: "İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin." };
  }
}

export async function completeAppointmentAction(appointmentId: string) {
  return handleStatusUpdate(appointmentId, "COMPLETED");
}

export async function markAppointmentNoShowAction(appointmentId: string) {
  return handleStatusUpdate(appointmentId, "NO_SHOW");
}

export async function cancelAppointmentAction(appointmentId: string) {
  return handleStatusUpdate(appointmentId, "CANCELLED");
}
