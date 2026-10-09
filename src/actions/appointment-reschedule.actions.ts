"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { AppointmentService } from "@/services/appointment.service";

interface RescheduleResponse {
  success: boolean;
  error?: string;
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  newStartAt: string,
  expectedUpdatedAt: string
): Promise<RescheduleResponse> {
  try {
    if (!appointmentId || typeof appointmentId !== "string") {
      return { success: false, error: "Geçersiz randevu." };
    }

    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Oturum süresi dolmuş." };

    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership?.business_id) return { success: false, error: "İşletme bulunamadı." };

    await AppointmentService.rescheduleAppointment({
      businessId: membership.business_id,
      appointmentId,
      newStartAt,
      expectedUpdatedAt,
      userId: user.id,
      userRole: membership.role
    });

    revalidatePath("/dashboard/appointments");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NOT_FOUND")) {
      return { success: false, error: "Randevu bulunamadı veya daha önce silinmiş." };
    }
    if (msg.includes("FORBIDDEN")) {
      return { success: false, error: "Yetkisiz işlem." };
    }
    if (msg.includes("STALE_APPOINTMENT")) {
      return { success: false, error: "Bu randevu başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyin." };
    }
    if (msg.includes("NOT_RESCHEDULABLE")) {
      return { success: false, error: "Sadece beklemede olan veya onaylanmış randevular yeniden planlanabilir." };
    }
    if (msg.includes("TOO_LATE")) {
      return { success: false, error: "Geçmişteki bir randevu yeniden planlanamaz." };
    }
    if (msg.includes("Time slot not available (staff closed or not bookable)")) {
      return { success: false, error: "Seçilen tarihte personel müsait değil." };
    }
    if (msg.includes("Time slot not available or overlaps with another booking")) {
      return { success: false, error: "Seçilen saatte başka bir randevu veya engel var." };
    }
    if (msg.includes("Invalid start time")) {
      return { success: false, error: "Geçersiz saat." };
    }
    return { success: false, error: "İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin." };
  }
}

import { getStaffAvailability, AvailabilityResult } from "@/services/availability.service";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function getRescheduleAvailabilityAction(
  appointmentId: string,
  localDate: string
): Promise<{ success: boolean; data?: AvailabilityResult; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };

    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership?.business_id) return { success: false, error: "İşletme bulunamadı." };

    // Fetch appointment to get staff and service
    const appt = await db.select({
      staffId: appointments.staffId,
      serviceId: appointments.serviceId,
    })
    .from(appointments)
    .where(and(
      eq(appointments.id, appointmentId),
      eq(appointments.businessId, membership.business_id)
    ))
    .limit(1)
    .then(r => r[0]);

    if (!appt) return { success: false, error: "Randevu bulunamadı." };

    const availability = await getStaffAvailability({
      businessId: membership.business_id,
      staffId: appt.staffId,
      serviceId: appt.serviceId,
      localDate,
      excludeAppointmentId: appointmentId
    });

    return { success: true, data: availability };
  } catch {
    return { success: false, error: "Müsaitlik bilgisi alınamadı." };
  }
}
