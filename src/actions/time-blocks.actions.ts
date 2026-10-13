"use server";

import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // In standalone test environments, Next.js static generation store is not initialized
  }
}

import { requireSession, requireAdminOrOwner, ForbiddenError } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import {
  getStaffTimeBlocksService,
  createStaffTimeBlockService,
  updateStaffTimeBlockService,
  deleteStaffTimeBlockService,
  type CreateTimeBlockDTO,
  type UpdateTimeBlockDTO,
  type FormattedTimeBlock,
} from "@/services/time-blocks.service";
import {
  TimeBlockOverlapError,
  TimeBlockAppointmentOverlapError,
} from "@/repositories/time-blocks.repository";

async function resolveAuthorizedBusiness(targetStaffId?: string) {
  const user = await requireSession();
  const memberships = await getMemberships();

  if (memberships.length === 0) {
    throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
  }

  const membership = memberships[0];
  const targetBusinessId = membership.business_id;

  if (membership.role === "STAFF") {
    const { db } = await import("@/db");
    const { staffProfiles } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");

    const [sp] = await db
      .select({ id: staffProfiles.id, active: staffProfiles.active })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.businessMemberId, membership.id),
          eq(staffProfiles.businessId, targetBusinessId)
        )
      )
      .limit(1);

    if (!sp || (targetStaffId && sp.id !== targetStaffId)) {
      throw new ForbiddenError("Kendi personel profiliniz dışındaki zaman bloklarını yönetemezsiniz.");
    }
    if (!sp.active) {
      throw new ForbiddenError("Personel profili aktif değil.");
    }
    return { businessId: targetBusinessId, user, role: membership.role, staffId: sp.id };
  }

  const { membership: checkedMembership } = await requireAdminOrOwner(targetBusinessId);
  return { businessId: targetBusinessId, user, role: checkedMembership.role, staffId: targetStaffId };
}

export interface GetStaffTimeBlocksPayload {
  staffId: string;
}

export async function getStaffTimeBlocksAction(payload: GetStaffTimeBlocksPayload): Promise<{
  success: boolean;
  blocks?: FormattedTimeBlock[];
  businessTimezone?: string;
  error?: string;
}> {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false, error: "Geçersiz personel ID." };
    }

    const { businessId, role, user } = await resolveAuthorizedBusiness(payload.staffId);
    const result = await getStaffTimeBlocksService(businessId, payload.staffId, role, user.id);

    return {
      success: true,
      blocks: result.blocks,
      businessTimezone: result.businessTimezone,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Zaman blokları yüklenirken bir hata oluştu." };
  }
}

export interface CreateStaffTimeBlockPayload extends CreateTimeBlockDTO {
  staffId: string;
}

export async function createStaffTimeBlockAction(payload: CreateStaffTimeBlockPayload): Promise<{
  success: boolean;
  block?: FormattedTimeBlock;
  error?: string;
  isOverlap?: boolean;
}> {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false, error: "Geçersiz personel ID." };
    }

    const { businessId, role, user } = await resolveAuthorizedBusiness(payload.staffId);
    const block = await createStaffTimeBlockService(
      businessId,
      payload.staffId,
      {
        blockType: payload.blockType,
        startDate: payload.startDate,
        startTime: payload.startTime,
        endDate: payload.endDate,
        endTime: payload.endTime,
        reason: payload.reason,
      },
      role,
      user.id
    );

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/appointments");
    return { success: true, block };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      if (error instanceof TimeBlockOverlapError) {
        return { success: false, error: error.message, isOverlap: true };
      }
      if (error instanceof TimeBlockAppointmentOverlapError) {
        return { success: false, error: error.message, isOverlap: true };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Zaman bloğu oluşturulurken bir hata oluştu." };
  }
}

export interface UpdateStaffTimeBlockPayload extends UpdateTimeBlockDTO {
  staffId: string;
  blockId: string;
}

export async function updateStaffTimeBlockAction(payload: UpdateStaffTimeBlockPayload): Promise<{
  success: boolean;
  block?: FormattedTimeBlock;
  error?: string;
  isOverlap?: boolean;
}> {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false, error: "Geçersiz personel ID." };
    }
    if (!payload.blockId || typeof payload.blockId !== "string") {
      return { success: false, error: "Geçersiz blok ID." };
    }

    const { businessId, role, user } = await resolveAuthorizedBusiness(payload.staffId);
    const block = await updateStaffTimeBlockService(
      businessId,
      payload.staffId,
      payload.blockId,
      {
        blockType: payload.blockType,
        startDate: payload.startDate,
        startTime: payload.startTime,
        endDate: payload.endDate,
        endTime: payload.endTime,
        reason: payload.reason,
      },
      role,
      user.id
    );

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/appointments");
    return { success: true, block };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      if (error instanceof TimeBlockOverlapError) {
        return { success: false, error: error.message, isOverlap: true };
      }
      if (error instanceof TimeBlockAppointmentOverlapError) {
        return { success: false, error: error.message, isOverlap: true };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Zaman bloğu güncellenirken bir hata oluştu." };
  }
}

export interface DeleteStaffTimeBlockPayload {
  staffId: string;
  blockId: string;
}

export async function deleteStaffTimeBlockAction(payload: DeleteStaffTimeBlockPayload): Promise<{
  success: boolean;
  deletedId?: string;
  error?: string;
}> {
  try {
    if (!payload.staffId || typeof payload.staffId !== "string") {
      return { success: false, error: "Geçersiz personel ID." };
    }
    if (!payload.blockId || typeof payload.blockId !== "string") {
      return { success: false, error: "Geçersiz blok ID." };
    }

    const { businessId, role, user } = await resolveAuthorizedBusiness(payload.staffId);
    const result = await deleteStaffTimeBlockService(
      businessId,
      payload.staffId,
      payload.blockId,
      role,
      user.id
    );

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/appointments");
    return { success: true, deletedId: result.deletedId };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "UnauthorizedError") {
        return { success: false, error: "Yetkisiz işlem. Lütfen giriş yapın." };
      }
      if (error.name === "ForbiddenError") {
        return { success: false, error: error.message || "Bu işlem için yetkiniz yok." };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Zaman bloğu silinirken bir hata oluştu." };
  }
}
