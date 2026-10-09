"use server";

import { requireSession, requireAdminOrOwner } from "@/lib/auth/guards";
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
import { TimeBlockOverlapError } from "@/repositories/time-blocks.repository";

async function resolveAuthorizedBusiness() {
  const user = await requireSession();
  const memberships = await getMemberships();

  if (memberships.length === 0) {
    throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
  }

  const targetBusinessId = memberships[0].business_id;
  const { membership } = await requireAdminOrOwner(targetBusinessId);
  return { businessId: targetBusinessId, user, role: membership.role };
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

    const { businessId, role } = await resolveAuthorizedBusiness();
    const result = await getStaffTimeBlocksService(businessId, payload.staffId, role);

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

    const { businessId, role } = await resolveAuthorizedBusiness();
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
      role
    );

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

    const { businessId, role } = await resolveAuthorizedBusiness();
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
      role
    );

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

    const { businessId, role } = await resolveAuthorizedBusiness();
    const result = await deleteStaffTimeBlockService(
      businessId,
      payload.staffId,
      payload.blockId,
      role
    );

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
