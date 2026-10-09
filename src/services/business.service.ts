import { createBusinessWithOwner, findBusinessBySlug } from "@/repositories/business.repository";

export async function createFirstBusiness(
  userId: string,
  data: { name: string; slug: string; phone: string; address?: string }
) {
  const existing = await findBusinessBySlug(data.slug);
  if (existing) {
    throw new Error("Bu işletme bağlantısı zaten kullanımda.");
  }

  // Set safe defaults for onboarding
  const businessData = {
    ...data,
    timezone: "Europe/Istanbul",
    currency: "TRY",
  };

  return await createBusinessWithOwner(businessData, userId);
}
