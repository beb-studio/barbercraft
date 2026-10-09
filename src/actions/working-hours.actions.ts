"use server";

import { requireSession } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { saveWorkingHours } from "@/services/working-hours.service";

export interface WorkingHourPayload {
  dayOfWeek: number;
  startTime?: string | null;
  endTime?: string | null;
  isClosed?: boolean;
}

export async function saveBusinessWorkingHoursAction(schedule: WorkingHourPayload[]) {
  try {
    await requireSession();
    const memberships = await getMemberships();

    // Must have at least one membership
    if (memberships.length === 0) {
      return { success: false, error: "İşletme bulunamadı. Lütfen önce işletme kaydını tamamlayın." };
    }

    // Find the OWNER membership
    const ownerMembership = memberships.find((m) => m.role === "OWNER");
    if (!ownerMembership) {
      return { success: false, error: "Çalışma saatlerini yalnızca işletme SAHİBİ belirleyebilir." };
    }

    // Verify business onboarding is not yet completed
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

    await saveWorkingHours(biz.id, schedule);

    return { success: true };
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
