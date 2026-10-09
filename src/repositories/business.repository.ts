import { db } from "@/db";
import { businesses, businessMembers } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createBusinessWithOwner(
  businessData: { name: string; slug: string; phone: string; address?: string; timezone: string; currency: string },
  userId: string
) {
  return await db.transaction(async (tx) => {
    const [business] = await tx
      .insert(businesses)
      .values({
        name: businessData.name,
        slug: businessData.slug,
        phone: businessData.phone,
        address: businessData.address || null,
        timezone: businessData.timezone,
        currency: businessData.currency,
      })
      .returning();

    await tx.insert(businessMembers).values({
      businessId: business.id,
      userId: userId,
      role: "OWNER",
    });

    return business;
  });
}

export async function findBusinessBySlug(slug: string) {
  const result = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  return result[0] || null;
}

export async function getBusinessById(businessId: string) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return business ?? null;
}

