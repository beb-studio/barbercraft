import { db } from "@/db";
import { businessWorkingHours } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export interface WorkingHourInput {
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  isClosed: boolean;
}

export async function getBusinessWorkingHours(businessId: string) {
  return await db
    .select({
      id: businessWorkingHours.id,
      dayOfWeek: businessWorkingHours.dayOfWeek,
      startTime: businessWorkingHours.startTime,
      endTime: businessWorkingHours.endTime,
      isClosed: businessWorkingHours.isClosed,
    })
    .from(businessWorkingHours)
    .where(eq(businessWorkingHours.businessId, businessId))
    .orderBy(asc(businessWorkingHours.dayOfWeek));
}

export async function replaceBusinessWorkingHours(
  businessId: string,
  hours: WorkingHourInput[]
) {
  return await db.transaction(async (tx) => {
    // Delete existing hours for this business
    await tx
      .delete(businessWorkingHours)
      .where(eq(businessWorkingHours.businessId, businessId));

    // Insert all 7 rows atomically
    const inserted = await tx
      .insert(businessWorkingHours)
      .values(
        hours.map((h) => ({
          businessId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.isClosed ? null : h.startTime,
          endTime: h.isClosed ? null : h.endTime,
          isClosed: h.isClosed,
        }))
      )
      .returning();

    return inserted;
  });
}
