import {
  listStaffTimeBlocks,
  createStaffTimeBlockWithLock,
  updateStaffTimeBlockWithLock,
  deleteStaffTimeBlock,
} from "@/repositories/time-blocks.repository";
import { getStaffProfileDetailById } from "@/repositories/staff.repository";
import { getBusinessById } from "@/repositories/business.repository";
import { assertCanManageStaffProfile } from "./staff.service";
import { ForbiddenError } from "@/lib/auth/guards";
import {
  parseDateTimeInBusinessTimezone,
  formatInstantInBusinessTimezone,
  getTimeBlockStatus,
  type TimeBlockStatus,
} from "@/lib/timezone";
import type { TimeBlock, TimeBlockType } from "@/db/schema";

export function assertCanManageTimeBlocks(
  callerRole: string,
  targetStaff: { id: string; active?: boolean; member: { role: string; userId?: string; active?: boolean } },
  callerUserId?: string
) {
  if (callerRole === "STAFF") {
    if (!callerUserId || targetStaff.member.userId !== callerUserId) {
      throw new ForbiddenError("Kendi personel profiliniz dışındaki zaman bloklarını yönetemezsiniz.");
    }
    if (targetStaff.active === false || targetStaff.member.active === false) {
      throw new ForbiddenError("Personel profili veya üyeliği aktif değil.");
    }
    return;
  }
  assertCanManageStaffProfile(callerRole, targetStaff.member.role);
}

export const VALID_BLOCK_TYPES: readonly TimeBlockType[] = [
  "TIME_OFF",
  "BREAK",
  "BLOCKED",
] as const;

export function isValidBlockType(val: unknown): val is TimeBlockType {
  return typeof val === "string" && (VALID_BLOCK_TYPES as readonly string[]).includes(val);
}

export interface CreateTimeBlockDTO {
  blockType: unknown;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason?: string | null;
}

export interface UpdateTimeBlockDTO {
  blockType: unknown;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason?: string | null;
}

export interface FormattedTimeBlock {
  id: string;
  businessId: string;
  staffId: string | null;
  blockType: TimeBlockType;
  startTime: Date;
  endTime: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: TimeBlockStatus;
  startFormatted: {
    dateStr: string;
    timeStr: string;
    displayStr: string;
  };
  endFormatted: {
    dateStr: string;
    timeStr: string;
    displayStr: string;
  };
  isEditable: boolean;
  isDeletable: boolean;
}

function formatBlock(
  block: TimeBlock,
  businessTimezone: string,
  referenceNow: Date = new Date()
): FormattedTimeBlock {
  const status = getTimeBlockStatus(block.startTime, block.endTime, referenceNow);
  const startFormatted = formatInstantInBusinessTimezone(block.startTime, businessTimezone);
  const endFormatted = formatInstantInBusinessTimezone(block.endTime, businessTimezone);

  return {
    id: block.id,
    businessId: block.businessId,
    staffId: block.staffId,
    blockType: block.blockType as TimeBlockType,
    startTime: block.startTime,
    endTime: block.endTime,
    reason: block.reason,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    status,
    startFormatted,
    endFormatted,
    isEditable: status !== "PAST",
    isDeletable: status !== "PAST",
  };
}

/**
 * Validates input and parses wall-clock dates and times into UTC instants in business timezone.
 */
function validateAndParseInterval(
  input: CreateTimeBlockDTO | UpdateTimeBlockDTO,
  businessTimezone: string
): {
  blockType: TimeBlockType;
  startInstant: Date;
  endInstant: Date;
  reason: string | null;
} {
  if (!isValidBlockType(input.blockType)) {
    throw new Error(
      `Geçersiz zaman bloğu türü: ${String(input.blockType)}. Geçerli türler: TIME_OFF, BREAK, BLOCKED.`
    );
  }

  if (typeof input.startDate !== "string" || !input.startDate.trim()) {
    throw new Error("Başlangıç tarihi zorunludur.");
  }
  if (typeof input.startTime !== "string" || !input.startTime.trim()) {
    throw new Error("Başlangıç saati zorunludur.");
  }
  if (typeof input.endDate !== "string" || !input.endDate.trim()) {
    throw new Error("Bitiş tarihi zorunludur.");
  }
  if (typeof input.endTime !== "string" || !input.endTime.trim()) {
    throw new Error("Bitiş saati zorunludur.");
  }

  const reason =
    typeof input.reason === "string" ? input.reason.trim() || null : null;
  if (reason && reason.length > 500) {
    throw new Error("Açıklama / not en fazla 500 karakter olabilir.");
  }

  const startInstant = parseDateTimeInBusinessTimezone(
    input.startDate,
    input.startTime,
    businessTimezone
  );
  const endInstant = parseDateTimeInBusinessTimezone(
    input.endDate,
    input.endTime,
    businessTimezone
  );

  if (startInstant.getTime() >= endInstant.getTime()) {
    throw new Error("Başlangıç zamanı bitiş zamanından önce olmalıdır.");
  }

  return {
    blockType: input.blockType,
    startInstant,
    endInstant,
    reason,
  };
}

/**
 * Lists staff time blocks, formatted in business timezone, with authoritative server status.
 */
export async function getStaffTimeBlocksService(
  businessId: string,
  staffId: string,
  callerRole: string,
  callerUserId?: string
): Promise<{ blocks: FormattedTimeBlock[]; businessTimezone: string }> {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageTimeBlocks(callerRole, staff, callerUserId);

  const business = await getBusinessById(businessId);
  const businessTimezone = business?.timezone || "Europe/Istanbul";

  const rawBlocks = await listStaffTimeBlocks(businessId, staffId);
  const now = new Date();

  const blocks = rawBlocks.map((b) => formatBlock(b, businessTimezone, now));
  return { blocks, businessTimezone };
}

/**
 * Creates a staff time block with row locking and concurrency-safe overlap checking.
 */
export async function createStaffTimeBlockService(
  businessId: string,
  staffId: string,
  input: CreateTimeBlockDTO,
  callerRole: string,
  callerUserId?: string
): Promise<FormattedTimeBlock> {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageTimeBlocks(callerRole, staff, callerUserId);

  const business = await getBusinessById(businessId);
  const businessTimezone = business?.timezone || "Europe/Istanbul";

  const validated = validateAndParseInterval(input, businessTimezone);

  const created = await createStaffTimeBlockWithLock(businessId, staffId, {
    blockType: validated.blockType,
    startTime: validated.startInstant,
    endTime: validated.endInstant,
    reason: validated.reason,
  });

  return formatBlock(created, businessTimezone, new Date());
}

/**
 * Updates a staff time block with concurrency-safe overlap checking and past block immutability.
 */
export async function updateStaffTimeBlockService(
  businessId: string,
  staffId: string,
  blockId: string,
  input: UpdateTimeBlockDTO,
  callerRole: string,
  callerUserId?: string
): Promise<FormattedTimeBlock> {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageTimeBlocks(callerRole, staff, callerUserId);

  const business = await getBusinessById(businessId);
  const businessTimezone = business?.timezone || "Europe/Istanbul";

  const validated = validateAndParseInterval(input, businessTimezone);
  const now = new Date();

  const updated = await updateStaffTimeBlockWithLock(
    businessId,
    staffId,
    blockId,
    {
      blockType: validated.blockType,
      startTime: validated.startInstant,
      endTime: validated.endInstant,
      reason: validated.reason,
    },
    now
  );

  return formatBlock(updated, businessTimezone, now);
}

/**
 * Deletes a future or active staff time block. Fully past blocks cannot be deleted.
 */
export async function deleteStaffTimeBlockService(
  businessId: string,
  staffId: string,
  blockId: string,
  callerRole: string,
  callerUserId?: string
): Promise<{ success: true; deletedId: string }> {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageTimeBlocks(callerRole, staff, callerUserId);

  const now = new Date();
  const deleted = await deleteStaffTimeBlock(businessId, staffId, blockId, now);

  return { success: true, deletedId: deleted.id };
}
