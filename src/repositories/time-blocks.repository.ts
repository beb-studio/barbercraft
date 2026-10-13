import { db } from "@/db";
import { timeBlocks, staffProfiles } from "@/db/schema";
import type { TimeBlock, TimeBlockType } from "@/db/schema";
import { eq, and, lt, gt, ne, asc } from "drizzle-orm";

export interface TimeBlockInput {
  blockType: TimeBlockType;
  startTime: Date;
  endTime: Date;
  reason?: string | null;
}

export interface OverlapErrorDetails {
  existingBlockId: string;
  existingBlockType: TimeBlockType;
  existingStartTime: Date;
  existingEndTime: Date;
}

export class TimeBlockOverlapError extends Error {
  details: OverlapErrorDetails;
  constructor(message: string, details: OverlapErrorDetails) {
    super(message);
    this.name = "TimeBlockOverlapError";
    this.details = details;
  }
}

export class TimeBlockAppointmentOverlapError extends Error {
  constructor(message: string = "Bu zaman aralığında mevcut bir randevunuz bulunuyor.") {
    super(message);
    this.name = "TimeBlockAppointmentOverlapError";
  }
}

/**
 * List all time blocks for a specific staff member in a business, ordered chronologically.
 */
export async function listStaffTimeBlocks(
  businessId: string,
  staffId: string
): Promise<TimeBlock[]> {
  return await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.businessId, businessId),
        eq(timeBlocks.staffId, staffId)
      )
    )
    .orderBy(asc(timeBlocks.startTime));
}

/**
 * Retrieve a specific time block by business and block ID.
 */
export async function getTimeBlockById(
  businessId: string,
  blockId: string
): Promise<TimeBlock | null> {
  const [row] = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.businessId, businessId),
        eq(timeBlocks.id, blockId)
      )
    );
  return row ?? null;
}

/**
 * Concurrency-safe creation of a staff time block.
 *
 * Locks the target staff_profile row via SELECT ... FOR UPDATE within the transaction,
 * verifies tenant ownership, validates that no overlapping block exists for the staff member,
 * and inserts the new block.
 */
export async function createStaffTimeBlockWithLock(
  businessId: string,
  staffId: string,
  input: TimeBlockInput
): Promise<TimeBlock> {
  return await db.transaction(async (tx) => {
    // 1. Lock staff_profile to serialize concurrent block creations for the same staff member
    const [lockedProfile] = await tx
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      )
      .for("update");

    if (!lockedProfile) {
      throw new Error("Personel profili bulunamadı.");
    }

    // 2. Concurrency-safe overlap check: new.start < existing.end AND new.end > existing.start
    const [overlap] = await tx
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          eq(timeBlocks.staffId, staffId),
          lt(timeBlocks.startTime, input.endTime),
          gt(timeBlocks.endTime, input.startTime)
        )
      )
      .limit(1);

    if (overlap) {
      throw new TimeBlockOverlapError(
        "Belirtilen zaman aralığı personelin mevcut bir zaman bloğu ile çakışmaktadır.",
        {
          existingBlockId: overlap.id,
          existingBlockType: overlap.blockType as TimeBlockType,
          existingStartTime: overlap.startTime,
          existingEndTime: overlap.endTime,
        }
      );
    }

    // 2b. Concurrency-safe overlap check with appointments
    const { appointments } = await import("@/db/schema");
    const [apptOverlap] = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          eq(appointments.staffId, staffId),
          ne(appointments.status, "CANCELLED"),
          lt(appointments.startTime, input.endTime),
          gt(appointments.endTime, input.startTime)
        )
      )
      .limit(1);
      
    if (apptOverlap) {
      throw new TimeBlockAppointmentOverlapError("Bu zaman aralığında mevcut bir randevunuz bulunuyor.");
    }

    // 3. Insert new time block
    const [created] = await tx
      .insert(timeBlocks)
      .values({
        businessId,
        staffId,
        blockType: input.blockType,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason ?? null,
      })
      .returning();

    return created;
  });
}

/**
 * Concurrency-safe update of an existing staff time block.
 *
 * Locks the target staff_profile row, verifies the block is not fully past,
 * checks for interval overlaps excluding itself, and applies the update.
 */
export async function updateStaffTimeBlockWithLock(
  businessId: string,
  staffId: string,
  blockId: string,
  input: TimeBlockInput,
  referenceNow: Date = new Date()
): Promise<TimeBlock> {
  return await db.transaction(async (tx) => {
    // 1. Lock staff_profile to serialize concurrent updates
    const [lockedProfile] = await tx
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      )
      .for("update");

    if (!lockedProfile) {
      throw new Error("Personel profili bulunamadı.");
    }

    // 2. Fetch the target time block
    const [existing] = await tx
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          eq(timeBlocks.id, blockId),
          eq(timeBlocks.staffId, staffId)
        )
      );

    if (!existing) {
      throw new Error("Zaman bloğu bulunamadı.");
    }

    // 3. Past block immutability guard: fully past blocks cannot be edited
    if (existing.endTime.getTime() <= referenceNow.getTime()) {
      throw new Error("Geçmiş zaman blokları değiştirilemez.");
    }

    // 4. Concurrency-safe overlap check excluding this block
    const [overlap] = await tx
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          eq(timeBlocks.staffId, staffId),
          ne(timeBlocks.id, blockId),
          lt(timeBlocks.startTime, input.endTime),
          gt(timeBlocks.endTime, input.startTime)
        )
      )
      .limit(1);

    if (overlap) {
      throw new TimeBlockOverlapError(
        "Belirtilen zaman aralığı personelin başka bir zaman bloğu ile çakışmaktadır.",
        {
          existingBlockId: overlap.id,
          existingBlockType: overlap.blockType as TimeBlockType,
          existingStartTime: overlap.startTime,
          existingEndTime: overlap.endTime,
        }
      );
    }

    // 4b. Concurrency-safe overlap check with appointments
    const { appointments } = await import("@/db/schema");
    const [apptOverlap] = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          eq(appointments.staffId, staffId),
          ne(appointments.status, "CANCELLED"),
          lt(appointments.startTime, input.endTime),
          gt(appointments.endTime, input.startTime)
        )
      )
      .limit(1);
      
    if (apptOverlap) {
      throw new TimeBlockAppointmentOverlapError("Bu zaman aralığında mevcut bir randevunuz bulunuyor.");
    }

    // 5. Apply update
    const [updated] = await tx
      .update(timeBlocks)
      .set({
        blockType: input.blockType,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          eq(timeBlocks.id, blockId)
        )
      )
      .returning();

    return updated;
  });
}

/**
 * Delete a future or active staff time block.
 *
 * Fully past blocks (endTime <= now) cannot be deleted.
 */
export async function deleteStaffTimeBlock(
  businessId: string,
  staffId: string,
  blockId: string,
  referenceNow: Date = new Date()
): Promise<TimeBlock> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          eq(timeBlocks.staffId, staffId),
          eq(timeBlocks.id, blockId)
        )
      );

    if (!existing) {
      throw new Error("Zaman bloğu bulunamadı.");
    }

    if (existing.endTime.getTime() <= referenceNow.getTime()) {
      throw new Error("Geçmiş zaman blokları silinemez.");
    }

    await tx
      .delete(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          eq(timeBlocks.staffId, staffId),
          eq(timeBlocks.id, blockId)
        )
      );

    return existing;
  });
}
