"use server";

import { requireSession } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { isValidAnalyticsPreset } from "@/lib/business-analytics/range";
import { BusinessAnalyticsService } from "@/services/business-analytics.service";
import type { AnalyticsRangePreset, BusinessDashboardAnalytics } from "@/types/business-analytics";

export type GetBusinessDashboardAnalyticsActionResult =
  | {
      success: true;
      data: BusinessDashboardAnalytics;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Server Action for fetching business dashboard analytics.
 * Strictly restricted to OWNER and ADMIN of the active business membership.
 */
export async function getBusinessDashboardAnalyticsAction(
  presetInput?: string
): Promise<GetBusinessDashboardAnalyticsActionResult> {
  try {
    await requireSession();
    const memberships = await getMemberships();
    const membership = memberships[0];

    if (!membership?.business_id) {
      return {
        success: false,
        error: "Aktif bir işletme üyeliği bulunamadı.",
      };
    }

    if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
      return {
        success: false,
        error: "Bu işlem için yetkiniz bulunmuyor. Yalnızca işletme sahibi ve yöneticiler erişebilir.",
      };
    }

    const preset: AnalyticsRangePreset =
      presetInput && isValidAnalyticsPreset(presetInput) ? presetInput : "LAST_7_DAYS";

    const data = await BusinessAnalyticsService.getDashboardAnalytics({
      businessId: membership.business_id,
      preset,
    });

    return {
      success: true,
      data,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "UnauthorizedError") {
      return {
        success: false,
        error: "Oturum açmanız gerekiyor.",
      };
    }

    if (err && typeof err === "object" && "name" in err && err.name === "ForbiddenError") {
      return {
        success: false,
        error: "Bu işlem için yetkiniz bulunmuyor.",
      };
    }

    return {
      success: false,
      error: "Analitik verileri yüklenirken bir hata oluştu.",
    };
  }
}
