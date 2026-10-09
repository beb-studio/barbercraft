"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformAdminService } from "@/services/platform-admin.service";

export async function toggleBusinessActiveAction(
  businessId: string,
  active: boolean,
  reason: string
) {
  try {
    const admin = await requirePlatformAdmin();

    await PlatformAdminService.toggleBusinessActive(
      businessId,
      active,
      admin.platformAdminId,
      admin.userId,
      reason
    );

    revalidatePath("/platform/businesses");
    revalidatePath(`/platform/businesses/${businessId}`);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu";
    return { success: false, error: message };
  }
}

import { PlatformProvisioningService } from "@/services/platform-provisioning.service";

export async function provisionBusinessAction(formData: FormData) {
  try {
    const admin = await requirePlatformAdmin();
    
    const name = formData.get("name")?.toString().trim();
    const slug = formData.get("slug")?.toString().trim();
    const timezone = formData.get("timezone")?.toString().trim() || "Europe/Istanbul";
    const currency = formData.get("currency")?.toString().trim() || "TRY";
    const ownerEmail = formData.get("ownerEmail")?.toString().trim();
    const ownerName = formData.get("ownerName")?.toString().trim();

    if (!name || !slug || !ownerEmail || !ownerName) {
      return { success: false, error: "Lütfen tüm zorunlu alanları doldurun." };
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { success: false, error: "İşletme bağlantısı yalnızca küçük harf, rakam ve tire içerebilir." };
    }

    const result = await PlatformProvisioningService.provisionBusiness({
      name,
      slug,
      timezone,
      currency,
      ownerEmail,
      ownerName,
      platformAdminId: admin.platformAdminId,
      actorUserId: admin.userId,
    });

    revalidatePath("/platform/businesses");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "İşletme oluşturulurken hata oluştu.";
    return { success: false, error: message };
  }
}
