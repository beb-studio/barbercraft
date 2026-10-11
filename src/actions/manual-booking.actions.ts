"use server";

import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { AppointmentService } from "@/services/appointment.service";
import { getStaffAvailability, AvailabilityResult } from "@/services/availability.service";
import { isCustomerDomainError } from "@/lib/customer-domain-errors";

interface InternalAvailabilityResponse {
  success: boolean;
  data?: AvailabilityResult;
  error?: string;
}

export async function getInternalAvailabilityAction(
  staffId: string,
  serviceId: string,
  localDate: string
): Promise<InternalAvailabilityResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };

    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership?.business_id) return { success: false, error: "İşletme bulunamadı." };

    // RBAC: If staff, can they only query for themselves?
    // Usually availability querying is harmless, but for strictness:
    if (membership.role === "STAFF") {
      const { db } = await import("@/db");
      const { staffProfiles } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const sp = await db.select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(and(
          eq(staffProfiles.businessMemberId, membership.id),
          eq(staffProfiles.businessId, membership.business_id)
        ))
        .limit(1)
        .then(r => r[0]);
      
      if (!sp || sp.id !== staffId) {
        return { success: false, error: "Yetkisiz işlem." };
      }
    }

    const availability = await getStaffAvailability({
      businessId: membership.business_id,
      staffId,
      serviceId,
      localDate,
      context: "INTERNAL"
    });

    return { success: true, data: availability };
  } catch {
    return { success: false, error: "Müsaitlik kontrolü sırasında bir hata oluştu." };
  }
}

export interface CreateInternalAppointmentInput {
  staffId: string;
  serviceId: string;
  startAt: string; // ISO string
  notes?: string;
  mode?: "EXISTING" | "NEW";
  existingCustomerId?: string;
  customer?: {
    firstName: string;
    lastName?: string;
    phone: string;
    notes?: string;
  };
}

export async function createInternalAppointmentAction(input: CreateInternalAppointmentInput) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Oturum süresi dolmuş." };

    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership?.business_id) return { success: false, error: "İşletme bulunamadı." };

    // Strict RBAC
    const targetStaffId = input.staffId;
    if (membership.role === "STAFF") {
      const { db } = await import("@/db");
      const { staffProfiles } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const sp = await db.select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(and(
          eq(staffProfiles.businessMemberId, membership.id),
          eq(staffProfiles.businessId, membership.business_id)
        ))
        .limit(1)
        .then(r => r[0]);

      if (!sp || sp.id !== targetStaffId) {
        return { success: false, error: "Başka bir personelin adına randevu oluşturamazsınız." };
      }
    }

    let customerId: string | undefined;
    let customerData: { firstName: string; lastName?: string; phone: string; notes?: string } | undefined;

    if (input.mode === "EXISTING" || (input.existingCustomerId && !input.customer)) {
      if (!input.existingCustomerId || typeof input.existingCustomerId !== "string" || !input.existingCustomerId.trim()) {
        return { success: false, error: "Geçersiz müşteri seçimi." };
      }
      customerId = input.existingCustomerId.trim();
    } else if (input.mode === "NEW" || input.customer) {
      if (!input.customer || !input.customer.firstName?.trim() || !input.customer.phone?.trim()) {
        return { success: false, error: "Lütfen müşteri adı ve telefon numarasını girin." };
      }
      customerData = {
        firstName: input.customer.firstName.trim(),
        lastName: input.customer.lastName?.trim() || undefined,
        phone: input.customer.phone.trim(),
        notes: input.customer.notes?.trim() || undefined,
      };
    } else {
      return { success: false, error: "Müşteri bilgisi belirtilmedi." };
    }

    const source = membership.role === "STAFF" ? "MANUAL_STAFF" : "MANUAL_ADMIN";

    await AppointmentService.createAppointment({
      businessId: membership.business_id,
      staffId: targetStaffId,
      serviceId: input.serviceId,
      startAt: input.startAt,
      customerId,
      customer: customerData,
      notes: input.notes || input.customer?.notes,
      context: "INTERNAL",
      source,
    });

    return { success: true };
  } catch (err: unknown) {
    if (isCustomerDomainError(err)) {
      if (err.code === "CUSTOMER_IDENTITY_AMBIGUOUS") {
        return {
          success: false,
          error: "Bu telefon numarası birden fazla bağımsız müşteri kaydıyla eşleşiyor. Lütfen mevcut müşterilerden birini seçin.",
        };
      }
      if (err.code === "CUSTOMER_PHONE_INVALID") {
        return { success: false, error: "Lütfen geçerli bir telefon numarası girin." };
      }
      return { success: false, error: "Müşteri kaydı güvenli biçimde çözümlenemedi. Lütfen tekrar deneyin." };
    }
    const msg = err instanceof Error ? err.message : String(err);
    
    if (msg.includes("Customer not found or does not belong to the business")) {
      return { success: false, error: "Seçilen müşteri bulunamadı veya işletmenize ait değil." };
    }
    if (msg.includes("overlaps with another booking")) {
      return { success: false, error: "Seçilen saatte başka bir randevu veya engel var." };
    }
    if (msg.includes("not available")) {
      return { success: false, error: "Seçilen saat uygun değil." };
    }
    if (msg.includes("Invalid request")) {
      return { success: false, error: "Geçersiz işlem parametreleri." };
    }
    
    return { success: false, error: "İşlem başarısız oldu. Lütfen tekrar deneyin." };
  }
}
