import {
  completeOnboardingWithStaff,
  completeOnboardingWithoutStaff,
  getStaffProfileByMemberId,
  getStaffServicesByStaffId,
  getStaffMembersWithProfilesByBusiness,
  getBusinessMemberById,
  toggleStaffMemberActive,
  getStaffProfileDetailById,
  syncStaffServices,
  updateStaffPublicBooking,
  replaceStaffWorkingHours,
  updateStaffScheduleMode,
  getEffectiveStaffScheduleSummary,
  type StaffWorkingHourInput,
} from "@/repositories/staff.repository";
import { getServicesByBusiness } from "@/repositories/service.repository";
import { getBusinessWorkingHours } from "@/repositories/working-hours.repository";
import { ForbiddenError } from "@/lib/auth/guards";
import { db } from "@/db";
import { services } from "@/db/schema";
import { inArray } from "drizzle-orm";

export interface CompleteOwnerStaffDecisionInput {
  businessId: string;
  businessMemberId: string;
  userName: string;
  userPhone?: string | null;
  decision: "YES" | "NO";
  serviceIds?: string[];
  firstName?: string;
  lastName?: string;
}

export function parseUserName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const lastSpaceIdx = trimmed.lastIndexOf(" ");
  if (lastSpaceIdx === -1) {
    return {
      firstName: trimmed || "İşletme",
      lastName: "",
    };
  }
  return {
    firstName: trimmed.slice(0, lastSpaceIdx).trim(),
    lastName: trimmed.slice(lastSpaceIdx + 1).trim(),
  };
}

export async function processOwnerStaffDecision(input: CompleteOwnerStaffDecisionInput) {
  if (input.decision !== "YES" && input.decision !== "NO") {
    throw new Error("Lütfen geçerli bir seçim yapın (YES veya NO).");
  }

  if (input.decision === "NO") {
    // Owner chose not to provide services
    await completeOnboardingWithoutStaff(input.businessId);
    return { createdStaff: false };
  }

  // YES flow: Owner is a bookable staff member
  const rawServiceIds = input.serviceIds ?? [];
  const uniqueServiceIds = Array.from(new Set(rawServiceIds.filter((id) => typeof id === "string" && id.trim().length > 0)));

  if (uniqueServiceIds.length === 0) {
    throw new Error("Lütfen verdiğiniz en az bir hizmeti seçin.");
  }

  // Verify all selected services exist for THIS business and are active
  const matchingServices = await db
    .select({
      id: services.id,
      businessId: services.businessId,
      active: services.active,
    })
    .from(services)
    .where(inArray(services.id, uniqueServiceIds));

  // Check that every submitted ID was found and belongs to this business
  if (matchingServices.length !== uniqueServiceIds.length) {
    throw new Error("Seçilen hizmetlerden biri veya birkaçı bu işletmeye ait değil.");
  }

  for (const svc of matchingServices) {
    if (svc.businessId !== input.businessId) {
      throw new Error("Seçilen hizmet bu işletmeye ait değil.");
    }
    if (!svc.active) {
      throw new Error("Pasif durumdaki hizmetler personele atanamaz.");
    }
  }

  // Parse or use provided names
  let firstName = input.firstName?.trim();
  let lastName = input.lastName?.trim();

  if (!firstName) {
    const parsed = parseUserName(input.userName);
    firstName = parsed.firstName;
    lastName = lastName ?? parsed.lastName;
  }
  if (lastName === undefined) {
    lastName = "";
  }

  const staffProfile = await completeOnboardingWithStaff(
    input.businessId,
    input.businessMemberId,
    {
      firstName,
      lastName,
      phone: input.userPhone ?? null,
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    uniqueServiceIds
  );

  return { createdStaff: true, staffProfile };
}

export { getStaffProfileByMemberId, getStaffServicesByStaffId };

export async function getBusinessStaffMembersService(businessId: string) {
  return await getStaffMembersWithProfilesByBusiness(businessId);
}

export async function toggleStaffMemberActiveService(
  businessId: string,
  memberId: string,
  active: boolean
) {
  const targetMember = await getBusinessMemberById(businessId, memberId);
  if (!targetMember) {
    throw new Error("Personel bulunamadı.");
  }

  // Safety boundaries: Owner and Admin cannot be deactivated through staff management
  if (targetMember.role === "OWNER") {
    throw new Error("İşletme sahibi (OWNER) pasife alınamaz.");
  }

  if (targetMember.role === "MANAGER") {
    throw new Error("İşletme yöneticisi (MANAGER) personel yönetimi üzerinden pasife alınamaz.");
  }

  const updated = await toggleStaffMemberActive(businessId, memberId, active);
  if (!updated) {
    throw new Error("Personel durumu güncellenemedi.");
  }

  return updated;
}

export interface BookingReadinessDetails {
  isMemberActive: boolean;
  isProfileActive: boolean;
  isPublicBookingEnabled: boolean;
  hasActiveAssignedService: boolean;
  activeAssignedServicesCount: number;
  hasCompleteBusinessHours: boolean;
  hasValidSchedule: boolean;
  hasOpenDays: boolean;
  usesBusinessHours: boolean;
  workingHoursCount: number;
  openDaysCount: number;
}

export interface BookingReadinessResult {
  isReady: boolean;
  reasons: string[];
  details: BookingReadinessDetails;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function isValidTime(timeStr: string | null | undefined): boolean {
  if (!timeStr || typeof timeStr !== "string") return false;
  return TIME_REGEX.test(timeStr);
}

function normalizeTime(timeStr: string): string {
  const match = timeStr.match(TIME_REGEX);
  if (!match) return timeStr;
  const hours = match[1];
  const minutes = match[2];
  return `${hours}:${minutes}:00`;
}

export function validateStaffWeeklySchedule(schedule: unknown): StaffWorkingHourInput[] {
  if (!Array.isArray(schedule) || schedule.length !== 7) {
    throw new Error("Haftalık çalışma saatleri tam olarak 7 gün içermelidir.");
  }

  const seenDays = new Set<number>();
  const normalized: StaffWorkingHourInput[] = [];

  for (const entry of schedule) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Geçersiz gün verisi.");
    }

    const { dayOfWeek, isWorking, startTime, endTime } = entry as {
      dayOfWeek: unknown;
      isWorking: unknown;
      startTime?: unknown;
      endTime?: unknown;
    };

    if (
      typeof dayOfWeek !== "number" ||
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek > 6
    ) {
      throw new Error(`Geçersiz gün indeksi: ${dayOfWeek}. 0 ile 6 arasında olmalıdır.`);
    }

    if (seenDays.has(dayOfWeek)) {
      throw new Error(`Mükerrer gün verisi: ${dayOfWeek}.`);
    }
    seenDays.add(dayOfWeek);

    const working = Boolean(isWorking);

    if (!working) {
      // Closed day: normalize times to null
      normalized.push({
        dayOfWeek,
        isWorking: false,
        startTime: null,
        endTime: null,
      });
    } else {
      // Open day: validate start and end times
      if (!isValidTime(startTime as string) || !isValidTime(endTime as string)) {
        throw new Error(
          `Gün ${dayOfWeek} açık ancak başlangıç veya bitiş saati formatı geçersiz.`
        );
      }

      const normStart = normalizeTime(startTime as string);
      const normEnd = normalizeTime(endTime as string);

      if (normStart >= normEnd) {
        throw new Error(
          `Gün ${dayOfWeek} başlangıç saati (${startTime}), bitiş saatinden (${endTime}) önce olmalıdır.`
        );
      }

      normalized.push({
        dayOfWeek,
        isWorking: true,
        startTime: normStart,
        endTime: normEnd,
      });
    }
  }

  if (seenDays.size !== 7) {
    throw new Error("Haftalık çalışma saatleri haftanın tüm 7 gününü (0-6) içermelidir.");
  }

  return normalized;
}

export function evaluateBookingReadiness(params: {
  isMemberActive: boolean;
  isProfileActive: boolean;
  isPublicBookingEnabled: boolean;
  activeAssignedServicesCount: number;
  usesBusinessHours: boolean;
  workingHoursCount: number;
  openDaysCount?: number;
}): BookingReadinessResult {
  const isMemberActive = params.isMemberActive;
  const isProfileActive = params.isProfileActive;
  const isPublicBookingEnabled = params.isPublicBookingEnabled;
  const hasActiveAssignedService = params.activeAssignedServicesCount > 0;
  const usesBusinessHours = params.usesBusinessHours;
  const workingHoursCount = params.workingHoursCount;
  const openDaysCount = params.openDaysCount ?? (workingHoursCount === 7 ? 1 : 0);
  const hasCompleteSchedule = workingHoursCount === 7;
  const hasOpenDays = openDaysCount >= 1;
  const hasValidSchedule = hasCompleteSchedule && hasOpenDays;
  const hasCompleteBusinessHours = usesBusinessHours ? hasValidSchedule : true;

  const reasons: string[] = [];
  if (!isMemberActive) {
    reasons.push("İşletme üyeliği pasif durumda.");
  }
  if (!isProfileActive) {
    reasons.push("Personel profili pasif durumda.");
  }
  if (!isPublicBookingEnabled) {
    reasons.push("Herkese açık randevu alma (public booking) devre dışı.");
  }
  if (!hasActiveAssignedService) {
    reasons.push("Personele atanmış en az bir aktif hizmet bulunmuyor.");
  }

  if (usesBusinessHours) {
    if (!hasCompleteSchedule) {
      reasons.push("İşletmenin haftalık çalışma saatleri eksik (7 gün tanımlanmalı).");
    } else if (!hasOpenDays) {
      reasons.push("İşletmenin çalışma saatlerinde en az bir gün açık olmalıdır.");
    }
  } else {
    if (!hasCompleteSchedule) {
      reasons.push("Personele ait özel çalışma saatleri eksik (7 gün tanımlanmalı).");
    } else if (!hasOpenDays) {
      reasons.push("Personelin özel çalışma saatlerinde en az bir gün açık olmalıdır.");
    }
  }

  const isReady =
    isMemberActive &&
    isProfileActive &&
    isPublicBookingEnabled &&
    hasActiveAssignedService &&
    hasValidSchedule;

  return {
    isReady,
    reasons,
    details: {
      isMemberActive,
      isProfileActive,
      isPublicBookingEnabled,
      hasActiveAssignedService,
      activeAssignedServicesCount: params.activeAssignedServicesCount,
      hasCompleteBusinessHours,
      hasValidSchedule,
      hasOpenDays,
      usesBusinessHours,
      workingHoursCount,
      openDaysCount,
    },
  };
}

export function assertCanManageStaffProfile(callerRole: string, targetMemberRole: string) {
  if (callerRole === "OWNER") {
    return;
  }
  if (callerRole === "MANAGER") {
    if (targetMemberRole === "OWNER") {
      throw new ForbiddenError(
        "İşletme yöneticileri (MANAGER), işletme sahibinin (OWNER) personel profilini veya ayarlarını yönetemez."
      );
    }
    if (targetMemberRole === "STAFF") {
      return;
    }
  }
  throw new ForbiddenError("Bu personeli yönetmek için yetkiniz bulunmuyor.");
}

export async function getStaffDetailService(
  businessId: string,
  staffId: string,
  callerRole: string
) {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageStaffProfile(callerRole, staff.member.role);

  const allServices = await getServicesByBusiness(businessId);
  const activeServices = allServices.filter((s) => s.active);
  const businessWorkingHours = await getBusinessWorkingHours(businessId);
  const scheduleSummary = await getEffectiveStaffScheduleSummary(
    businessId,
    staffId,
    staff.usesBusinessHours
  );

  const activeAssignedServicesCount = staff.assignedServices.filter((s) => s.active).length;

  const bookingReadiness = evaluateBookingReadiness({
    isMemberActive: staff.member.active,
    isProfileActive: staff.active,
    isPublicBookingEnabled: staff.publicBookingEnabled,
    activeAssignedServicesCount,
    usesBusinessHours: staff.usesBusinessHours,
    workingHoursCount: scheduleSummary.rowCount,
    openDaysCount: scheduleSummary.openDaysCount,
  });

  return {
    staff,
    availableActiveServices: activeServices,
    businessWorkingHours,
    bookingReadiness,
    effectiveSchedule: scheduleSummary,
  };
}

export async function assignStaffServicesService(
  businessId: string,
  staffId: string,
  serviceIds: string[],
  callerRole: string,
  removeInactiveServiceIds?: string[]
) {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageStaffProfile(callerRole, staff.member.role);

  const result = await syncStaffServices(
    businessId,
    staffId,
    serviceIds,
    removeInactiveServiceIds
  );

  const updatedStaff = await getStaffProfileDetailById(businessId, staffId);
  const scheduleSummary = await getEffectiveStaffScheduleSummary(
    businessId,
    staffId,
    updatedStaff?.usesBusinessHours ?? false
  );
  const activeAssignedServicesCount =
    updatedStaff?.assignedServices.filter((s) => s.active).length ?? 0;

  const bookingReadiness = evaluateBookingReadiness({
    isMemberActive: updatedStaff?.member.active ?? false,
    isProfileActive: updatedStaff?.active ?? false,
    isPublicBookingEnabled: updatedStaff?.publicBookingEnabled ?? false,
    activeAssignedServicesCount,
    usesBusinessHours: updatedStaff?.usesBusinessHours ?? false,
    workingHoursCount: scheduleSummary.rowCount,
    openDaysCount: scheduleSummary.openDaysCount,
  });

  return {
    success: true,
    staff: updatedStaff,
    assignedServiceIds: result.assignedServiceIds,
    publicBookingAutoDisabled: result.publicBookingAutoDisabled,
    bookingReadiness,
  };
}

export async function toggleStaffPublicBookingService(
  businessId: string,
  staffId: string,
  enabled: boolean,
  callerRole: string
) {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageStaffProfile(callerRole, staff.member.role);

  const scheduleSummary = await getEffectiveStaffScheduleSummary(
    businessId,
    staffId,
    staff.usesBusinessHours
  );
  const activeAssignedServicesCount = staff.assignedServices.filter((s) => s.active).length;

  if (enabled) {
    // Validate prerequisites for enabling public booking
    const errors: string[] = [];
    if (!staff.member.active) {
      errors.push("Personel üyeliği aktif değil.");
    }
    if (!staff.active) {
      errors.push("Personel profili aktif değil.");
    }
    if (activeAssignedServicesCount === 0) {
      errors.push("Personele atanmış en az bir aktif hizmet bulunmalıdır.");
    }
    if (staff.usesBusinessHours) {
      if (scheduleSummary.rowCount < 7) {
        errors.push("İşletmenin 7 günlük çalışma saatleri eksiksiz tanımlanmalıdır.");
      } else if (scheduleSummary.openDaysCount === 0) {
        errors.push("İşletmenin çalışma saatlerinde en az bir gün açık olmalıdır.");
      }
    } else {
      if (scheduleSummary.rowCount < 7) {
        errors.push("Personelin 7 günlük özel çalışma saatleri eksiksiz tanımlanmalıdır.");
      } else if (scheduleSummary.openDaysCount === 0) {
        errors.push("Personelin özel çalışma saatlerinde en az bir gün açık olmalıdır.");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Herkese açık randevu alınamaz: ${errors.join(" ")}`);
    }
  }

  await updateStaffPublicBooking(businessId, staffId, enabled);

  const updatedStaff = await getStaffProfileDetailById(businessId, staffId);
  const updatedActiveServicesCount =
    updatedStaff?.assignedServices.filter((s) => s.active).length ?? 0;

  const bookingReadiness = evaluateBookingReadiness({
    isMemberActive: updatedStaff?.member.active ?? false,
    isProfileActive: updatedStaff?.active ?? false,
    isPublicBookingEnabled: updatedStaff?.publicBookingEnabled ?? false,
    activeAssignedServicesCount: updatedActiveServicesCount,
    usesBusinessHours: updatedStaff?.usesBusinessHours ?? false,
    workingHoursCount: scheduleSummary.rowCount,
    openDaysCount: scheduleSummary.openDaysCount,
  });

  return {
    success: true,
    staff: updatedStaff,
    bookingReadiness,
  };
}

export async function saveCustomStaffWorkingHoursService(
  businessId: string,
  staffId: string,
  schedule: unknown,
  callerRole: string
) {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageStaffProfile(callerRole, staff.member.role);

  const validatedSchedule = validateStaffWeeklySchedule(schedule);

  const saveResult = await replaceStaffWorkingHours(
    businessId,
    staffId,
    validatedSchedule
  );

  const updatedStaff = await getStaffProfileDetailById(businessId, staffId);
  const scheduleSummary = await getEffectiveStaffScheduleSummary(
    businessId,
    staffId,
    false
  );

  const activeAssignedServicesCount =
    updatedStaff?.assignedServices.filter((s) => s.active).length ?? 0;

  const bookingReadiness = evaluateBookingReadiness({
    isMemberActive: updatedStaff?.member.active ?? false,
    isProfileActive: updatedStaff?.active ?? false,
    isPublicBookingEnabled: updatedStaff?.publicBookingEnabled ?? false,
    activeAssignedServicesCount,
    usesBusinessHours: false,
    workingHoursCount: scheduleSummary.rowCount,
    openDaysCount: scheduleSummary.openDaysCount,
  });

  return {
    success: true,
    staff: updatedStaff,
    hours: saveResult.hours,
    publicBookingAutoDisabled: saveResult.publicBookingAutoDisabled,
    bookingReadiness,
  };
}

export async function setStaffScheduleModeService(
  businessId: string,
  staffId: string,
  usesBusinessHours: boolean,
  callerRole: string
) {
  const staff = await getStaffProfileDetailById(businessId, staffId);
  if (!staff) {
    throw new Error("Personel bulunamadı.");
  }

  assertCanManageStaffProfile(callerRole, staff.member.role);

  const updateResult = await updateStaffScheduleMode(
    businessId,
    staffId,
    usesBusinessHours
  );

  const updatedStaff = await getStaffProfileDetailById(businessId, staffId);
  const scheduleSummary = await getEffectiveStaffScheduleSummary(
    businessId,
    staffId,
    usesBusinessHours
  );

  const activeAssignedServicesCount =
    updatedStaff?.assignedServices.filter((s) => s.active).length ?? 0;

  const bookingReadiness = evaluateBookingReadiness({
    isMemberActive: updatedStaff?.member.active ?? false,
    isProfileActive: updatedStaff?.active ?? false,
    isPublicBookingEnabled: updatedStaff?.publicBookingEnabled ?? false,
    activeAssignedServicesCount,
    usesBusinessHours,
    workingHoursCount: scheduleSummary.rowCount,
    openDaysCount: scheduleSummary.openDaysCount,
  });

  return {
    success: true,
    staff: updatedStaff,
    usesBusinessHours,
    publicBookingAutoDisabled: updateResult.publicBookingAutoDisabled,
    bookingReadiness,
  };
}



