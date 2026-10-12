"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrOwner, requireSession } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import {
  bookingPolicyToFormValues,
  getBusinessBookingPolicySummary,
  isBookingPolicyTimeUnit,
  parseBookingPolicyFormValues,
  type BusinessBookingPolicyFormValues,
} from "@/lib/business-booking-policy-presentation";
import {
  BusinessBookingPolicyError,
  BusinessBookingPolicyService,
} from "@/services/business-booking-policy.service";

export interface UpdateBusinessBookingPolicyPayload {
  expectedVersion: string;
  minimumBookingLeadAmount: string;
  minimumBookingLeadUnit: string;
  maximumAdvanceUnlimited: boolean;
  maximumAdvanceBookingDays: string;
  cancellationNoticeAmount: string;
  cancellationNoticeUnit: string;
  rescheduleNoticeAmount: string;
  rescheduleNoticeUnit: string;
}

export interface BusinessBookingPolicySettingsDto {
  version: string;
  timezone: string;
  values: BusinessBookingPolicyFormValues;
  summary: string[];
}

export type UpdateBusinessBookingPolicyActionResult =
  | {
      success: true;
      message: string;
      data: BusinessBookingPolicySettingsDto;
    }
  | {
      success: false;
      type: "INVALID" | "STALE" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";
      error: string;
      data?: BusinessBookingPolicySettingsDto;
    };

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Next's static generation store is unavailable in isolated unit tests.
  }
}

function toSettingsDto(
  record: Awaited<ReturnType<typeof BusinessBookingPolicyService.getForBusiness>>
): BusinessBookingPolicySettingsDto {
  return {
    version: record.version,
    timezone: record.businessTimezone,
    values: bookingPolicyToFormValues(record),
    summary: getBusinessBookingPolicySummary(record),
  };
}

function parsePresentationPayload(
  payload: UpdateBusinessBookingPolicyPayload
): ReturnType<typeof parseBookingPolicyFormValues> | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.minimumBookingLeadAmount !== "string" ||
    !isBookingPolicyTimeUnit(payload.minimumBookingLeadUnit) ||
    typeof payload.maximumAdvanceUnlimited !== "boolean" ||
    typeof payload.maximumAdvanceBookingDays !== "string" ||
    typeof payload.cancellationNoticeAmount !== "string" ||
    !isBookingPolicyTimeUnit(payload.cancellationNoticeUnit) ||
    typeof payload.rescheduleNoticeAmount !== "string" ||
    !isBookingPolicyTimeUnit(payload.rescheduleNoticeUnit)
  ) {
    return null;
  }

  return parseBookingPolicyFormValues({
    minimumBookingLead: {
      amount: payload.minimumBookingLeadAmount,
      unit: payload.minimumBookingLeadUnit,
    },
    maximumAdvanceUnlimited: payload.maximumAdvanceUnlimited,
    maximumAdvanceBookingDays: payload.maximumAdvanceBookingDays,
    cancellationNotice: {
      amount: payload.cancellationNoticeAmount,
      unit: payload.cancellationNoticeUnit,
    },
    rescheduleNotice: {
      amount: payload.rescheduleNoticeAmount,
      unit: payload.rescheduleNoticeUnit,
    },
  });
}

/**
 * Updates all four customer-facing policy values atomically. Tenant authority
 * is derived from the authenticated active membership; no business ID is
 * accepted from the browser.
 */
export async function updateBusinessBookingPolicyAction(
  payload: UpdateBusinessBookingPolicyPayload
): Promise<UpdateBusinessBookingPolicyActionResult> {
  try {
    await requireSession();
    const memberships = await getMemberships();
    const membership = memberships[0];
    if (!membership) {
      return {
        success: false,
        type: "FORBIDDEN",
        error: "Bu ayarları değiştirme yetkiniz yok.",
      };
    }
    await requireAdminOrOwner(membership.business_id);

    const parsed = parsePresentationPayload(payload);
    if (!parsed?.valid || typeof payload.expectedVersion !== "string") {
      return {
        success: false,
        type: "INVALID",
        error: "Girdiğiniz randevu kuralları geçerli değil.",
      };
    }

    const updated = await BusinessBookingPolicyService.update({
      businessId: membership.business_id,
      expectedVersion: payload.expectedVersion,
      policy: parsed.policy,
    });

    safeRevalidatePath("/dashboard/settings/booking");
    safeRevalidatePath(`/book/${updated.businessSlug}`);
    safeRevalidatePath(`/book/${updated.businessSlug}/schedule`);
    safeRevalidatePath("/randevu");

    return {
      success: true,
      message: "Randevu kuralları güncellendi.",
      data: toSettingsDto(updated),
    };
  } catch (error: unknown) {
    const named = error as { name?: string };
    if (
      named?.name === "UnauthorizedError" ||
      named?.name === "ForbiddenError"
    ) {
      return {
        success: false,
        type: "FORBIDDEN",
        error: "Bu ayarları değiştirme yetkiniz yok.",
      };
    }

    if (
      error instanceof BusinessBookingPolicyError &&
      error.code === "BOOKING_POLICY_STALE"
    ) {
      try {
        const memberships = await getMemberships();
        const membership = memberships[0];
        const current = membership
          ? await BusinessBookingPolicyService.getForBusiness(
              membership.business_id
            )
          : null;
        return {
          success: false,
          type: "STALE",
          error:
            "Ayarlar başka bir kullanıcı tarafından güncellendi. Güncel değerleri kontrol edip tekrar deneyin.",
          ...(current ? { data: toSettingsDto(current) } : {}),
        };
      } catch {
        return {
          success: false,
          type: "STALE",
          error:
            "Ayarlar başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.",
        };
      }
    }

    if (
      error instanceof BusinessBookingPolicyError &&
      error.code === "BOOKING_POLICY_INVALID"
    ) {
      return {
        success: false,
        type: "INVALID",
        error: "Girdiğiniz randevu kuralları geçerli değil.",
      };
    }

    if (
      error instanceof BusinessBookingPolicyError &&
      error.code === "BOOKING_POLICY_NOT_FOUND"
    ) {
      return {
        success: false,
        type: "NOT_FOUND",
        error: "İşletme ayarları bulunamadı.",
      };
    }

    return {
      success: false,
      type: "CONFLICT",
      error: "Randevu kuralları güncellenemedi. Lütfen tekrar deneyin.",
    };
  }
}
