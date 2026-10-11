"use server";

import {
  PublicBookingService,
  PublicStaff,
  PublicAvailabilitySlot,
} from "@/services/public-booking.service";

export async function getEligibleStaffAction(
  slug: string,
  serviceId: string
): Promise<{ success: boolean; staff?: PublicStaff[]; error?: string }> {
  try {
    if (!slug || !serviceId) {
      return { success: false, error: "Geçersiz istek parametreleri." };
    }

    const staff = await PublicBookingService.getEligibleStaffForService(
      slug,
      serviceId
    );
    return { success: true, staff };
  } catch (error) {
    console.error("getEligibleStaffAction error:", error);
    return {
      success: false,
      error: "Personel listesi alınırken bir hata oluştu.",
    };
  }
}

export async function getPublicAvailabilityAction(params: {
  slug: string;
  serviceId: string;
  staffId: string;
  localDate: string;
}): Promise<{
  success: boolean;
  slots?: PublicAvailabilitySlot[];
  reason?: string;
  error?: string;
}> {
  try {
    const { slug, serviceId, staffId, localDate } = params;
    if (!slug || !serviceId || !staffId || !localDate) {
      return { success: false, error: "Geçersiz istek parametreleri." };
    }

    const result = await PublicBookingService.getPublicAvailability({
      slug,
      serviceId,
      staffId,
      localDate,
      // Production public flow strictly uses authoritative server time (referenceNow omitted)
    });

    if (!result.success) {
      return { success: false, error: result.error || "Müsaitlik sorgulanamadı." };
    }

    return { success: true, slots: result.slots, reason: result.reason };
  } catch (error) {
    console.error("getPublicAvailabilityAction error:", error);
    return {
      success: false,
      error: "Müsait randevu saatleri alınırken bir hata oluştu.",
    };
  }
}

export async function getPublicAnyStaffAvailabilityAction(params: {
  slug: string;
  serviceId: string;
  localDate: string;
}): Promise<{
  success: boolean;
  slots?: PublicAvailabilitySlot[];
  error?: string;
}> {
  try {
    const { slug, serviceId, localDate } = params;
    if (!slug || !serviceId || !localDate) {
      return { success: false, error: "Geçersiz istek parametreleri." };
    }

    const result = await PublicBookingService.getPublicAnyStaffAvailability({
      slug,
      serviceId,
      localDate,
    });

    if (!result.success) {
      return { success: false, error: result.error || "Müsaitlik sorgulanamadı." };
    }

    return { success: true, slots: result.slots };
  } catch (error) {
    console.error("getPublicAnyStaffAvailabilityAction error:", error);
    return {
      success: false,
      error: "Müsait randevu saatleri alınırken bir hata oluştu.",
    };
  }
}

export interface PublicBookingConfirmation {
  businessName: string;
  serviceName: string;
  staffDisplayName: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  durationMinutes: number;
  formattedPrice: string;
  managementPath: string;
}

export type CreatePublicAppointmentResult =
  | { success: true; data: PublicBookingConfirmation }
  | { success: false; type: "VALIDATION_ERROR" | "SLOT_UNAVAILABLE" | "NOT_FOUND" | "INTERNAL"; error: string };

export async function createPublicAppointmentAction(params: {
  slug: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  customerName: string;
  customerPhone: string;
}): Promise<CreatePublicAppointmentResult> {
  try {
    const confirmation = await PublicBookingService.createPublicAppointment(params);
    return { success: true, data: confirmation };
  } catch (error) {
    const e = error as Error;
    console.error("createPublicAppointmentAction failed", {
      name: e.name,
      category: e.message?.split(":", 1)[0] || "UNKNOWN",
    });
    
    if (e.message?.startsWith("VALIDATION_ERROR:")) {
      return { success: false, type: "VALIDATION_ERROR", error: e.message.replace("VALIDATION_ERROR:", "").trim() };
    }
    if (e.message?.startsWith("SLOT_UNAVAILABLE:")) {
      return { success: false, type: "SLOT_UNAVAILABLE", error: e.message.replace("SLOT_UNAVAILABLE:", "").trim() };
    }
    if (e.message?.startsWith("NOT_FOUND:")) {
      return { success: false, type: "NOT_FOUND", error: e.message.replace("NOT_FOUND:", "").trim() };
    }

    return {
      success: false,
      type: "INTERNAL",
      error: "Randevu oluşturulurken beklenmeyen bir hata oluştu.",
    };
  }
}
