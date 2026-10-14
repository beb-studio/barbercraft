"use server";

import { requireSession, requireManagerOrOwner } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { db } from "@/db";
import { businesses, businessWorkingHours, services, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  processOwnerStaffDecision,
  getBusinessStaffMembersService,
  toggleStaffMemberActiveService,
  getStaffDetailService,
  assignStaffServicesService,
  toggleStaffPublicBookingService,
  saveCustomStaffWorkingHoursService,
  setStaffScheduleModeService,
} from "@/services/staff.service";


export interface CompleteOwnerStaffPayload {
  decision: "YES" | "NO";
  serviceIds?: string[];
  firstName?: string;
  lastName?: string;
}

export async function completeOwnerStaffAction(payload: CompleteOwnerStaffPayload) {
  try {
    const sessionUser = await requireSession();
    const memberships = await getMemberships();

    if (memberships.length === 0) {
      return { success: false, error: "İşletme bulunamadı. Lütfen önce işletme kaydını tamamlayın." };
    }

    // Role check: Only OWNER is allowed to complete owner onboarding
    const ownerMembership = memberships.find((m) => m.role === "OWNER");
    if (!ownerMembership) {
      return { success: false, error: "Bu işlemi yalnızca işletme SAHİBİ (OWNER) tamamlayabilir." };
    }

    // Check business state
    const [biz] = await db
      .select({
        id: businesses.id,
        phone: businesses.phone,
        onboardingCompletedAt: businesses.onboardingCompletedAt,
      })
      .from(businesses)
      .where(eq(businesses.id, ownerMembership.business_id));

    if (!biz) {
      return { success: false, error: "İşletme bulunamadı." };
    }

    // Idempotency: if already completed, reject repeated submission
    if (biz.onboardingCompletedAt !== null) {
      return { success: false, error: "İşletme kurulumu zaten tamamlanmış." };
    }

    // Prerequisite 1: Working hours must be complete (7 rows)
    const [hoursCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(businessWorkingHours)
      .where(eq(businessWorkingHours.businessId, biz.id));

    if ((hoursCount?.count ?? 0) < 7) {
      return {
        success: false,
        error: "Lütfen önce çalışma saatlerini eksiksiz belirleyin.",
      };
    }

    // Prerequisite 2: At least 1 service must exist
    const [servicesCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(services)
      .where(eq(services.businessId, biz.id));

    if ((servicesCount?.count ?? 0) === 0) {
      return {
        success: false,
        error: "Lütfen önce en az bir hizmet tanımlayın.",
      };
    }

    // Fetch user details for name
    const [userRow] = await db
      .select({
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, sessionUser.id));

    const userName = userRow?.name || sessionUser.email || "İşletme Sahibi";

    const result = await processOwnerStaffDecision({
      businessId: biz.id,
      businessMemberId: ownerMembership.id,
      userName,
      userPhone: biz.phone,
      decision: payload.decision,
      serviceIds: payload.serviceIds,
      firstName: payload.firstName,
      lastName: payload.lastName,
    });

    return { success: true, createdStaff: result.createdStaff };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
}

/**
 * Resolves the authenticated business ID for staff management.
 * Verifies that the caller has an active membership and role OWNER or MANAGER.
 */
async function resolveAuthorizedBusiness(businessIdParam?: string) {
  const user = await requireSession();
  const memberships = await getMemberships();

  if (memberships.length === 0) {
    throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
  }

  let targetBusinessId = memberships[0].business_id;
  if (businessIdParam) {
    const matched = memberships.find((m) => m.business_id === businessIdParam);
    if (!matched) {
      throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
    }
    targetBusinessId = matched.business_id;
  }

  const { membership } = await requireManagerOrOwner(targetBusinessId);
  return { businessId: targetBusinessId, user, role: membership.role };
}

export async function getStaffManagementDataAction(businessIdParam?: string) {
  try {
    const { businessId } = await resolveAuthorizedBusiness(businessIdParam);
    const staffMembers = await getBusinessStaffMembersService(businessId);
    return { success: true, staffMembers };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: "Bu işlem için yetkiniz yok. Yalnızca işletme sahibi veya yöneticisi personel yönetebilir." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu." };
  }
}

export interface ToggleStaffActivePayload {
  memberId: string;
  active: boolean;
  businessId?: string;
}

export async function toggleStaffActiveAction(payload: ToggleStaffActivePayload) {
  try {
    if (!payload.memberId || typeof payload.memberId !== "string") {
      return { success: false, error: "Geçersiz personel üye ID." };
    }

    const { businessId } = await resolveAuthorizedBusiness(payload.businessId);
    const updated = await toggleStaffMemberActiveService(
      businessId,
      payload.memberId,
      payload.active
    );

    return { success: true, member: updated };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: "Bu işlem için yetkiniz yok." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu." };
  }
}

export async function getStaffDetailAction(staffId: string, businessIdParam?: string) {
  try {
    if (!staffId || typeof staffId !== "string") {
      return { success: false as const, error: "Geçersiz personel ID." };
    }
    const { businessId, role } = await resolveAuthorizedBusiness(businessIdParam);
    const result = await getStaffDetailService(businessId, staffId, role);
    return {
      success: true as const,
      staff: result.staff,
      availableActiveServices: result.availableActiveServices,
      bookingReadiness: result.bookingReadiness,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false as const, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false as const, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: "Beklenmeyen bir hata oluştu." };
  }
}

export interface AssignStaffServicesPayload {
  staffId: string;
  serviceIds: string[];
  removeInactiveServiceIds?: string[];
  businessId?: string;
}

export async function assignStaffServicesAction(payload: AssignStaffServicesPayload) {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false as const, error: "Geçersiz personel ID." };
    }
    if (!Array.isArray(payload.serviceIds)) {
      return { success: false as const, error: "Geçersiz hizmet listesi." };
    }
    const { businessId, role } = await resolveAuthorizedBusiness(payload.businessId);
    const result = await assignStaffServicesService(
      businessId,
      payload.staffId,
      payload.serviceIds,
      role,
      payload.removeInactiveServiceIds
    );
    return {
      success: true as const,
      staff: result.staff,
      assignedServiceIds: result.assignedServiceIds,
      publicBookingAutoDisabled: result.publicBookingAutoDisabled,
      bookingReadiness: result.bookingReadiness,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false as const, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false as const, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: "Hizmetler atanırken bir hata oluştu." };
  }
}

export interface ToggleStaffPublicBookingPayload {
  staffId: string;
  enabled?: boolean;
  publicBookingEnabled?: boolean;
  businessId?: string;
}

export async function toggleStaffPublicBookingAction(payload: ToggleStaffPublicBookingPayload) {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false as const, error: "Geçersiz personel ID." };
    }
    const targetEnabled =
      payload.enabled !== undefined
        ? Boolean(payload.enabled)
        : Boolean(payload.publicBookingEnabled);

    const { businessId, role } = await resolveAuthorizedBusiness(payload.businessId);
    const result = await toggleStaffPublicBookingService(
      businessId,
      payload.staffId,
      targetEnabled,
      role
    );
    return {
      success: true as const,
      staff: result.staff,
      bookingReadiness: result.bookingReadiness,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false as const, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false as const, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: "Randevu durumu güncellenirken bir hata oluştu." };
  }
}

export interface SaveStaffWorkingHoursPayload {
  staffId: string;
  schedule: Array<{
    dayOfWeek: number;
    startTime?: string | null;
    endTime?: string | null;
    isWorking: boolean;
  }>;
}

export async function saveStaffWorkingHoursAction(payload: SaveStaffWorkingHoursPayload) {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false as const, error: "Geçersiz personel ID." };
    }
    if (!Array.isArray(payload.schedule)) {
      return { success: false as const, error: "Geçersiz çalışma saatleri listesi." };
    }

    const { businessId, role } = await resolveAuthorizedBusiness();
    const result = await saveCustomStaffWorkingHoursService(
      businessId,
      payload.staffId,
      payload.schedule,
      role
    );

    return {
      success: true as const,
      staff: result.staff,
      hours: result.hours,
      publicBookingAutoDisabled: result.publicBookingAutoDisabled,
      bookingReadiness: result.bookingReadiness,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false as const, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        const msg =
          error.message === "MANAGER or OWNER role required"
            ? "Bu işlem için yetkiniz yok."
            : error.message || "Bu işlem için yetkiniz yok.";
        return { success: false as const, error: msg };
      }
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: "Çalışma saatleri kaydedilirken bir hata oluştu." };
  }
}

export interface SetStaffScheduleModePayload {
  staffId: string;
  usesBusinessHours: boolean;
}

export async function setStaffScheduleModeAction(payload: SetStaffScheduleModePayload) {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false as const, error: "Geçersiz personel ID." };
    }
    if (typeof payload.usesBusinessHours !== "boolean") {
      return { success: false as const, error: "Geçersiz çalışma saati modu." };
    }

    const { businessId, role } = await resolveAuthorizedBusiness();
    const result = await setStaffScheduleModeService(
      businessId,
      payload.staffId,
      payload.usesBusinessHours,
      role
    );

    return {
      success: true as const,
      staff: result.staff,
      usesBusinessHours: result.usesBusinessHours,
      publicBookingAutoDisabled: result.publicBookingAutoDisabled,
      bookingReadiness: result.bookingReadiness,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false as const, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false as const, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: "Çalışma saati modu güncellenirken bir hata oluştu." };
  }
}

import { StaffProvisioningService } from "@/services/staff-provisioning.service";

export interface ProvisionStaffPayload {
  email: string;
  name: string;
  serviceIds: string[];
}

export async function provisionStaffAction(payload: ProvisionStaffPayload) {
  try {
    if (!payload.email || typeof payload.email !== "string" || !payload.email.includes("@")) {
      return { success: false as const, error: "Geçerli bir e-posta adresi giriniz." };
    }
    if (!payload.name || typeof payload.name !== "string" || payload.name.trim().length === 0) {
      return { success: false as const, error: "Personel adı boş bırakılamaz." };
    }
    const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds : [];

    const { businessId, role, user } = await resolveAuthorizedBusiness();
    
    if (role !== "OWNER") {
      return { success: false as const, error: "Bu işlem için sadece işletme sahibi yetkilidir." };
    }

    const result = await StaffProvisioningService.provisionStaff({
      businessId,
      actorUserId: user.id,
      email: payload.email,
      name: payload.name,
      serviceIds
    });

    return result;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false as const, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.message.startsWith("FORBIDDEN")) {
        return { success: false as const, error: "Bu işlem için yetkiniz yok." };
      }
      if (error.message.startsWith("STAFF_ALREADY_EXISTS")) {
        return { success: false as const, error: "Bu e-posta adresine ait personel zaten mevcut." };
      }
      if (error.message.startsWith("MEMBER_ROLE_CONFLICT")) {
        return { success: false as const, error: "Bu kullanıcı işletmede zaten daha yüksek bir yetkiye sahip." };
      }
      if (error.message.startsWith("INVALID_SERVICE")) {
        return { success: false as const, error: "Seçilen hizmetlerden bazıları geçersiz." };
      }
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: "Personel oluşturulurken beklenmeyen bir hata oluştu." };
  }
}
