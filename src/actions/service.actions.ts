"use server";

import { requireSession, requireManagerOrOwner } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { db } from "@/db";
import { businesses, businessWorkingHours, services } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  createFirstService,
  createDashboardService,
  updateService,
  setServiceActive,
  getServices,
} from "@/services/service.service";

export interface CreateFirstServicePayload {
  name: string;
  description?: string;
  durationMinutes: number;
  price: string | number;
}

export interface CreateDashboardServicePayload {
  name: string;
  description?: string;
  durationMinutes: number;
  price: string | number;
  active?: boolean;
  businessId?: string;
}

export interface UpdateDashboardServicePayload {
  serviceId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: string | number;
  businessId?: string;
}

export interface ToggleDashboardServiceActivePayload {
  serviceId: string;
  active: boolean;
  businessId?: string;
}

export async function createFirstServiceAction(payload: CreateFirstServicePayload) {
  try {
    await requireSession();
    const memberships = await getMemberships();

    if (memberships.length === 0) {
      return { success: false, error: "İşletme bulunamadı. Lütfen önce işletme kaydını tamamlayın." };
    }

    // Role check: Only OWNER is authoritative for the onboarding flow
    const ownerMembership = memberships.find((m) => m.role === "OWNER");
    if (!ownerMembership) {
      return { success: false, error: "İlk hizmeti yalnızca işletme SAHİBİ (OWNER) ekleyebilir." };
    }

    // Business check: must be an incomplete business
    const [biz] = await db
      .select({
        id: businesses.id,
        onboardingCompletedAt: businesses.onboardingCompletedAt,
      })
      .from(businesses)
      .where(eq(businesses.id, ownerMembership.business_id));

    if (!biz) {
      return { success: false, error: "İşletme bulunamadı." };
    }

    if (biz.onboardingCompletedAt !== null) {
      return { success: false, error: "İşletme kurulumu zaten tamamlanmış." };
    }

    // Prerequisite check: Working hours must be complete (7 rows)
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

    // Double submit / re-entry check: Must not already have a service during this step
    const [existingServicesCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(services)
      .where(eq(services.businessId, biz.id));

    if ((existingServicesCount?.count ?? 0) > 0) {
      return {
        success: false,
        error: "İlk hizmet zaten oluşturulmuş. Lütfen sonraki adıma geçin.",
      };
    }

    const created = await createFirstService(biz.id, {
      name: payload.name,
      description: payload.description,
      durationMinutes: payload.durationMinutes,
      price: payload.price,
    });

    return { success: true, serviceId: created.id };
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
 * Resolves the authenticated business ID for service management.
 * Verifies that the user has an active membership and role OWNER or ADMIN.
 */
async function resolveAuthorizedBusiness(businessIdParam?: string): Promise<string> {
  await requireSession();
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

  // Enforces that the caller is an OWNER or MANAGER for the business
  await requireManagerOrOwner(targetBusinessId);
  return targetBusinessId;
}

export async function getDashboardServicesAction(businessIdParam?: string) {
  try {
    const businessId = await resolveAuthorizedBusiness(businessIdParam);
    const serviceList = await getServices(businessId);
    return { success: true, services: serviceList };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: "Bu işlem için yetkiniz yok. Yalnızca işletme sahibi veya yöneticisi hizmetleri yönetebilir." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu." };
  }
}

export async function createDashboardServiceAction(payload: CreateDashboardServicePayload) {
  try {
    const businessId = await resolveAuthorizedBusiness(payload.businessId);

    const created = await createDashboardService(businessId, {
      name: payload.name,
      description: payload.description,
      durationMinutes: payload.durationMinutes,
      price: payload.price,
      active: payload.active,
    });

    return { success: true, service: created };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: "Bu işlem için yetkiniz yok. Yalnızca işletme sahibi veya yöneticisi hizmet oluşturabilir." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu." };
  }
}

export async function updateDashboardServiceAction(payload: UpdateDashboardServicePayload) {
  try {
    if (!payload.serviceId || typeof payload.serviceId !== "string") {
      return { success: false, error: "Geçersiz hizmet ID." };
    }

    const businessId = await resolveAuthorizedBusiness(payload.businessId);

    const updated = await updateService(businessId, payload.serviceId, {
      name: payload.name,
      description: payload.description,
      durationMinutes: payload.durationMinutes,
      price: payload.price,
    });

    return { success: true, service: updated };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: "Bu işlem için yetkiniz yok. Yalnızca işletme sahibi veya yöneticisi hizmet güncelleyebilir." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu." };
  }
}

export async function toggleDashboardServiceActiveAction(payload: ToggleDashboardServiceActivePayload) {
  try {
    if (!payload.serviceId || typeof payload.serviceId !== "string") {
      return { success: false, error: "Geçersiz hizmet ID." };
    }

    const businessId = await resolveAuthorizedBusiness(payload.businessId);

    const updated = await setServiceActive(businessId, payload.serviceId, payload.active);

    return { success: true, service: updated };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: "Bu işlem için yetkiniz yok. Yalnızca işletme sahibi veya yöneticisi hizmet durumunu değiştirebilir." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Beklenmeyen bir hata oluştu." };
  }
}

