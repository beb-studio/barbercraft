import { db } from "@/db";
import { services } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface CreateServiceInput {
  businessId: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string;
  active?: boolean;
}

export interface UpdateServiceInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string;
}

export async function createService(input: CreateServiceInput) {
  const [created] = await db
    .insert(services)
    .values({
      businessId: input.businessId,
      name: input.name,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes,
      price: input.price,
      active: input.active ?? true,
    })
    .returning();

  return created;
}

export async function countServicesByBusiness(businessId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(services)
    .where(eq(services.businessId, businessId));

  return result?.count ?? 0;
}

export async function getServicesByBusiness(businessId: string) {
  return await db
    .select()
    .from(services)
    .where(eq(services.businessId, businessId))
    .orderBy(desc(services.createdAt));
}

export async function getServiceById(businessId: string, serviceId: string) {
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.businessId, businessId), eq(services.id, serviceId)));

  return service || null;
}

export async function updateService(
  businessId: string,
  serviceId: string,
  input: UpdateServiceInput
) {
  const [updated] = await db
    .update(services)
    .set({
      name: input.name,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes,
      price: input.price,
      updatedAt: new Date(),
    })
    .where(and(eq(services.businessId, businessId), eq(services.id, serviceId)))
    .returning();

  return updated || null;
}

export async function toggleServiceActive(
  businessId: string,
  serviceId: string,
  active: boolean
) {
  const [updated] = await db
    .update(services)
    .set({
      active,
      updatedAt: new Date(),
    })
    .where(and(eq(services.businessId, businessId), eq(services.id, serviceId)))
    .returning();

  return updated || null;
}
