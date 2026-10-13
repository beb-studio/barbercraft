"use server";

import { requireSession } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { StaffWorkspaceService } from "@/services/staff-workspace.service";
import type {
  StaffWorkspaceData,
  StaffWorkspaceRangePreset,
} from "@/types/staff-workspace";

export interface GetStaffWorkspaceActionPayload {
  rangePreset?: StaffWorkspaceRangePreset;
  selectedDate?: string; // YYYY-MM-DD
  targetStaffId?: string;
  businessIdParam?: string;
}

export async function getStaffWorkspaceAction(
  payload: GetStaffWorkspaceActionPayload = {}
): Promise<{
  success: boolean;
  data?: StaffWorkspaceData;
  error?: string;
}> {
  try {
    const user = await requireSession();
    const memberships = await getMemberships();

    if (memberships.length === 0) {
      return { success: false, error: "İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor." };
    }

    let targetBusinessId = memberships[0].business_id;
    let targetMembership = memberships[0];

    if (payload.businessIdParam) {
      const matched = memberships.find((m) => m.business_id === payload.businessIdParam);
      if (!matched) {
        return { success: false, error: "Belirtilen işletmeye erişim yetkiniz bulunmuyor." };
      }
      targetBusinessId = matched.business_id;
      targetMembership = matched;
    }

    const data = await StaffWorkspaceService.getStaffWorkspace({
      businessId: targetBusinessId,
      userId: user.id,
      role: targetMembership.role,
      rangePreset: payload.rangePreset,
      selectedDate: payload.selectedDate,
      targetStaffId: payload.targetStaffId,
    });

    return { success: true, data };
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
    return { success: false, error: "Personel çalışma alanı yüklenirken bir hata oluştu." };
  }
}
