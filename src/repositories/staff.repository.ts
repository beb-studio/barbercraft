import { db } from "@/db";
import {
  businesses,
  businessMembers,
  staffProfiles,
  staffServices,
  services,
  businessWorkingHours,
  staffWorkingHours,
  users,
} from "@/db/schema";
import { eq, and, inArray, sql, asc } from "drizzle-orm";

export interface OwnerStaffProfileInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  usesBusinessHours?: boolean;
  publicBookingEnabled?: boolean;
  active?: boolean;
}

export async function completeOnboardingWithStaff(
  businessId: string,
  businessMemberId: string,
  profileInput: OwnerStaffProfileInput,
  serviceIds: string[]
) {
  return await db.transaction(async (tx) => {
    // 1. Insert staff_profile linked to OWNER's business_member
    const [staffProfile] = await tx
      .insert(staffProfiles)
      .values({
        businessId,
        businessMemberId,
        firstName: profileInput.firstName,
        lastName: profileInput.lastName,
        phone: profileInput.phone ?? null,
        profileImageUrl: profileInput.profileImageUrl ?? null,
        usesBusinessHours: profileInput.usesBusinessHours ?? true,
        publicBookingEnabled: profileInput.publicBookingEnabled ?? true,
        active: profileInput.active ?? true,
      })
      .returning();

    // 2. Insert selected staff_services
    if (serviceIds.length > 0) {
      await tx.insert(staffServices).values(
        serviceIds.map((serviceId) => ({
          businessId,
          staffId: staffProfile.id,
          serviceId,
        }))
      );
    }

    // 3. Mark onboarding completed
    await tx
      .update(businesses)
      .set({
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));

    return staffProfile;
  });
}

export async function completeOnboardingWithoutStaff(businessId: string) {
  return await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));

    return true;
  });
}

export async function getStaffProfileByMemberId(businessMemberId: string) {
  const [profile] = await db
    .select()
    .from(staffProfiles)
    .where(eq(staffProfiles.businessMemberId, businessMemberId));
  return profile || null;
}

export async function getStaffServicesByStaffId(staffId: string) {
  return await db
    .select()
    .from(staffServices)
    .where(eq(staffServices.staffId, staffId));
}

export interface BusinessMemberWithProfile {
  id: string;
  businessId: string;
  userId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  active: boolean;
  createdAt: Date;
  userName: string;
  userEmail: string;
  staffProfileId: string | null;
  hasStaffProfile: boolean;
  staffFirstName: string | null;
  staffLastName: string | null;
  staffActive: boolean | null;
  publicBookingEnabled: boolean | null;
}

export async function getStaffMembersWithProfilesByBusiness(
  businessId: string
): Promise<BusinessMemberWithProfile[]> {
  const rows = await db
    .select({
      id: businessMembers.id,
      businessId: businessMembers.businessId,
      userId: businessMembers.userId,
      role: businessMembers.role,
      active: businessMembers.active,
      createdAt: businessMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
      staffProfileId: staffProfiles.id,
      staffFirstName: staffProfiles.firstName,
      staffLastName: staffProfiles.lastName,
      staffActive: staffProfiles.active,
      publicBookingEnabled: staffProfiles.publicBookingEnabled,
    })
    .from(businessMembers)
    .innerJoin(users, eq(businessMembers.userId, users.id))
    .leftJoin(
      staffProfiles,
      and(
        eq(businessMembers.id, staffProfiles.businessMemberId),
        eq(businessMembers.businessId, staffProfiles.businessId)
      )
    )
    .where(eq(businessMembers.businessId, businessId))
    .orderBy(businessMembers.createdAt);

  return rows.map((r) => ({
    ...r,
    hasStaffProfile: r.staffProfileId !== null,
  }));
}

export async function getBusinessMemberById(
  businessId: string,
  memberId: string
) {
  const [member] = await db
    .select()
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.id, memberId)
      )
    );

  return member || null;
}

export async function toggleStaffMemberActive(
  businessId: string,
  memberId: string,
  active: boolean
) {
  return await db.transaction(async (tx) => {
    // Only update if role is STAFF (enforces DB safety against modifying OWNER/MANAGER)
    const [updatedMember] = await tx
      .update(businessMembers)
      .set({
        active,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.id, memberId),
          eq(businessMembers.role, "STAFF")
        )
      )
      .returning();

    if (!updatedMember) {
      return null;
    }

    // Cascade active flag to staff_profile if one exists
    await tx
      .update(staffProfiles)
      .set({
        active,
        publicBookingEnabled: active,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.businessMemberId, memberId)
        )
      );

    return updatedMember;
  });
}

export interface StaffProfileDetail {
  id: string;
  businessId: string;
  businessMemberId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  profileImageUrl: string | null;
  publicBookingEnabled: boolean;
  usesBusinessHours: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  member: {
    id: string;
    userId: string;
    role: "OWNER" | "MANAGER" | "STAFF";
    active: boolean;
    createdAt: Date;
    userName: string;
    userEmail: string;
  };
  assignedServices: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    price: string;
    active: boolean;
    assignedAt: Date;
  }>;
  customWorkingHours: StaffWorkingHourRecord[];
}

export interface StaffWorkingHourRecord {
  id: string;
  businessId: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  isWorking: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffWorkingHourInput {
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  isWorking: boolean;
}

export interface EffectiveStaffScheduleSummary {
  mode: "BUSINESS" | "CUSTOM";
  rowCount: number;
  openDaysCount: number;
  isValid: boolean;
  hours: Array<{
    dayOfWeek: number;
    startTime: string | null;
    endTime: string | null;
    isWorking: boolean;
  }>;
}

export async function getStaffProfileDetailById(
  businessId: string,
  staffId: string
): Promise<StaffProfileDetail | null> {
  const [row] = await db
    .select({
      id: staffProfiles.id,
      businessId: staffProfiles.businessId,
      businessMemberId: staffProfiles.businessMemberId,
      firstName: staffProfiles.firstName,
      lastName: staffProfiles.lastName,
      phone: staffProfiles.phone,
      profileImageUrl: staffProfiles.profileImageUrl,
      publicBookingEnabled: staffProfiles.publicBookingEnabled,
      usesBusinessHours: staffProfiles.usesBusinessHours,
      active: staffProfiles.active,
      createdAt: staffProfiles.createdAt,
      updatedAt: staffProfiles.updatedAt,
      memberId: businessMembers.id,
      memberUserId: businessMembers.userId,
      memberRole: businessMembers.role,
      memberActive: businessMembers.active,
      memberCreatedAt: businessMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(staffProfiles)
    .innerJoin(businessMembers, eq(staffProfiles.businessMemberId, businessMembers.id))
    .innerJoin(users, eq(businessMembers.userId, users.id))
    .where(
      and(
        eq(staffProfiles.businessId, businessId),
        eq(staffProfiles.id, staffId)
      )
    );

  if (!row) {
    return null;
  }

  // Fetch assigned services joined with services
  const assignedServices = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      durationMinutes: services.durationMinutes,
      price: services.price,
      active: services.active,
      assignedAt: staffServices.createdAt,
    })
    .from(staffServices)
    .innerJoin(services, eq(staffServices.serviceId, services.id))
    .where(
      and(
        eq(staffServices.businessId, businessId),
        eq(staffServices.staffId, staffId)
      )
    );

  // Fetch custom working hours if any
  const customWorkingHours = await db
    .select({
      id: staffWorkingHours.id,
      businessId: staffWorkingHours.businessId,
      staffId: staffWorkingHours.staffId,
      dayOfWeek: staffWorkingHours.dayOfWeek,
      startTime: staffWorkingHours.startTime,
      endTime: staffWorkingHours.endTime,
      isWorking: staffWorkingHours.isWorking,
      createdAt: staffWorkingHours.createdAt,
      updatedAt: staffWorkingHours.updatedAt,
    })
    .from(staffWorkingHours)
    .where(
      and(
        eq(staffWorkingHours.businessId, businessId),
        eq(staffWorkingHours.staffId, staffId)
      )
    )
    .orderBy(asc(staffWorkingHours.dayOfWeek));

  return {
    id: row.id,
    businessId: row.businessId,
    businessMemberId: row.businessMemberId,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    profileImageUrl: row.profileImageUrl,
    publicBookingEnabled: row.publicBookingEnabled,
    usesBusinessHours: row.usesBusinessHours,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    member: {
      id: row.memberId,
      userId: row.memberUserId,
      role: row.memberRole,
      active: row.memberActive,
      createdAt: row.memberCreatedAt,
      userName: row.userName,
      userEmail: row.userEmail,
    },
    assignedServices,
    customWorkingHours,
  };
}

export async function getStaffWorkingHours(
  businessId: string,
  staffId: string
): Promise<StaffWorkingHourRecord[]> {
  return await db
    .select({
      id: staffWorkingHours.id,
      businessId: staffWorkingHours.businessId,
      staffId: staffWorkingHours.staffId,
      dayOfWeek: staffWorkingHours.dayOfWeek,
      startTime: staffWorkingHours.startTime,
      endTime: staffWorkingHours.endTime,
      isWorking: staffWorkingHours.isWorking,
      createdAt: staffWorkingHours.createdAt,
      updatedAt: staffWorkingHours.updatedAt,
    })
    .from(staffWorkingHours)
    .where(
      and(
        eq(staffWorkingHours.businessId, businessId),
        eq(staffWorkingHours.staffId, staffId)
      )
    )
    .orderBy(asc(staffWorkingHours.dayOfWeek));
}

export async function replaceStaffWorkingHours(
  businessId: string,
  staffId: string,
  hours: StaffWorkingHourInput[]
): Promise<{
  hours: StaffWorkingHourRecord[];
  publicBookingAutoDisabled: boolean;
}> {
  return await db.transaction(async (tx) => {
    // 1. Verify staff profile exists and belongs to this business
    const [profile] = await tx
      .select({
        id: staffProfiles.id,
        publicBookingEnabled: staffProfiles.publicBookingEnabled,
      })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      );

    if (!profile) {
      throw new Error("Personel profili bulunamadı.");
    }

    // 2. Delete existing staff_working_hours for this staff member
    await tx
      .delete(staffWorkingHours)
      .where(
        and(
          eq(staffWorkingHours.businessId, businessId),
          eq(staffWorkingHours.staffId, staffId)
        )
      );

    // 3. Insert all 7 rows
    const inserted = await tx
      .insert(staffWorkingHours)
      .values(
        hours.map((h) => ({
          businessId,
          staffId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.isWorking ? h.startTime : null,
          endTime: h.isWorking ? h.endTime : null,
          isWorking: h.isWorking,
        }))
      )
      .returning();

    // 4. Update staff profile to use custom hours
    await tx
      .update(staffProfiles)
      .set({
        usesBusinessHours: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      );

    // 5. Evaluate if the schedule has at least one working day
    const openDaysCount = inserted.filter((h) => h.isWorking).length;
    let publicBookingAutoDisabled = false;

    // If 0 open days, schedule is not booking-ready; auto-disable public booking if previously enabled
    if (openDaysCount === 0 && profile.publicBookingEnabled) {
      await tx
        .update(staffProfiles)
        .set({
          publicBookingEnabled: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffProfiles.businessId, businessId),
            eq(staffProfiles.id, staffId)
          )
        );
      publicBookingAutoDisabled = true;
    }

    return {
      hours: inserted,
      publicBookingAutoDisabled,
    };
  });
}

export async function updateStaffScheduleMode(
  businessId: string,
  staffId: string,
  usesBusinessHours: boolean
): Promise<{
  usesBusinessHours: boolean;
  publicBookingAutoDisabled: boolean;
}> {
  return await db.transaction(async (tx) => {
    // 1. Verify staff profile exists
    const [profile] = await tx
      .select({
        id: staffProfiles.id,
        publicBookingEnabled: staffProfiles.publicBookingEnabled,
      })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      );

    if (!profile) {
      throw new Error("Personel profili bulunamadı.");
    }

    // 2. Update usesBusinessHours without deleting any staff_working_hours rows
    await tx
      .update(staffProfiles)
      .set({
        usesBusinessHours,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      );

    // 3. Check effective schedule validity of the new mode
    let isScheduleBookingReady = false;

    if (usesBusinessHours) {
      // Check business_working_hours
      const bwh = await tx
        .select({
          dayOfWeek: businessWorkingHours.dayOfWeek,
          isClosed: businessWorkingHours.isClosed,
        })
        .from(businessWorkingHours)
        .where(eq(businessWorkingHours.businessId, businessId));

      const has7Days = bwh.length === 7;
      const hasOpenDay = bwh.some((day) => !day.isClosed);
      isScheduleBookingReady = has7Days && hasOpenDay;
    } else {
      // Check staff_working_hours
      const swh = await tx
        .select({
          dayOfWeek: staffWorkingHours.dayOfWeek,
          isWorking: staffWorkingHours.isWorking,
        })
        .from(staffWorkingHours)
        .where(
          and(
            eq(staffWorkingHours.businessId, businessId),
            eq(staffWorkingHours.staffId, staffId)
          )
        );

      const has7Days = swh.length === 7;
      const hasWorkingDay = swh.some((day) => day.isWorking);
      isScheduleBookingReady = has7Days && hasWorkingDay;
    }

    let publicBookingAutoDisabled = false;
    // Rule 5: If switching mode results in an invalid/incomplete effective schedule, auto-disable public booking
    if (!isScheduleBookingReady && profile.publicBookingEnabled) {
      await tx
        .update(staffProfiles)
        .set({
          publicBookingEnabled: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffProfiles.businessId, businessId),
            eq(staffProfiles.id, staffId)
          )
        );
      publicBookingAutoDisabled = true;
    }

    return {
      usesBusinessHours,
      publicBookingAutoDisabled,
    };
  });
}

export async function getEffectiveStaffScheduleSummary(
  businessId: string,
  staffId: string,
  usesBusinessHours: boolean
): Promise<EffectiveStaffScheduleSummary> {
  if (usesBusinessHours) {
    const bwh = await db
      .select({
        dayOfWeek: businessWorkingHours.dayOfWeek,
        startTime: businessWorkingHours.startTime,
        endTime: businessWorkingHours.endTime,
        isClosed: businessWorkingHours.isClosed,
      })
      .from(businessWorkingHours)
      .where(eq(businessWorkingHours.businessId, businessId))
      .orderBy(asc(businessWorkingHours.dayOfWeek));

    const rowCount = bwh.length;
    const openDaysCount = bwh.filter(
      (h) => !h.isClosed && h.startTime !== null && h.endTime !== null
    ).length;
    const isValid = rowCount === 7 && openDaysCount >= 1;

    return {
      mode: "BUSINESS",
      rowCount,
      openDaysCount,
      isValid,
      hours: bwh.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isWorking: !h.isClosed,
      })),
    };
  } else {
    const swh = await db
      .select({
        dayOfWeek: staffWorkingHours.dayOfWeek,
        startTime: staffWorkingHours.startTime,
        endTime: staffWorkingHours.endTime,
        isWorking: staffWorkingHours.isWorking,
      })
      .from(staffWorkingHours)
      .where(
        and(
          eq(staffWorkingHours.businessId, businessId),
          eq(staffWorkingHours.staffId, staffId)
        )
      )
      .orderBy(asc(staffWorkingHours.dayOfWeek));

    const rowCount = swh.length;
    const openDaysCount = swh.filter(
      (h) => h.isWorking && h.startTime !== null && h.endTime !== null
    ).length;
    const isValid = rowCount === 7 && openDaysCount >= 1;

    return {
      mode: "CUSTOM",
      rowCount,
      openDaysCount,
      isValid,
      hours: swh.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isWorking: h.isWorking,
      })),
    };
  }
}

export async function countCompleteBusinessWorkingHours(businessId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(businessWorkingHours)
    .where(eq(businessWorkingHours.businessId, businessId));

  return result?.count ?? 0;
}

export async function syncStaffServices(
  businessId: string,
  staffId: string,
  submittedServiceIds: string[],
  removeInactiveServiceIds?: string[]
): Promise<{
  assignedServiceIds: string[];
  publicBookingAutoDisabled: boolean;
}> {
  return await db.transaction(async (tx) => {
    // 1. Verify staff profile exists and belongs to this business
    const [profile] = await tx
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.id, staffId)
        )
      );

    if (!profile) {
      throw new Error("Personel profili bulunamadı.");
    }

    // 2. Normalize submitted IDs
    const uniqueSubmittedIds = Array.from(
      new Set(
        submittedServiceIds.filter(
          (id) => typeof id === "string" && id.trim().length > 0
        )
      )
    );

    // 3. Fetch existing mappings for this staff profile with active status
    const existingMappings = await tx
      .select({
        serviceId: staffServices.serviceId,
        active: services.active,
      })
      .from(staffServices)
      .innerJoin(services, eq(staffServices.serviceId, services.id))
      .where(
        and(
          eq(staffServices.businessId, businessId),
          eq(staffServices.staffId, staffId)
        )
      );
    const existingServiceIdSet = new Set(existingMappings.map((m) => m.serviceId));
    const activeExistingSet = new Set(
      existingMappings.filter((m) => m.active).map((m) => m.serviceId)
    );
    const inactiveExistingSet = new Set(
      existingMappings.filter((m) => !m.active).map((m) => m.serviceId)
    );

    // 4. Validate submitted services
    if (uniqueSubmittedIds.length > 0) {
      const dbServices = await tx
        .select({
          id: services.id,
          businessId: services.businessId,
          active: services.active,
        })
        .from(services)
        .where(
          and(
            eq(services.businessId, businessId),
            inArray(services.id, uniqueSubmittedIds)
          )
        );

      if (dbServices.length !== uniqueSubmittedIds.length) {
        throw new Error("Seçilen hizmetlerden biri veya birkaçı bu işletmeye ait değil.");
      }

      for (const svc of dbServices) {
        // If this service was NOT previously mapped to this staff member, it MUST be active
        if (!existingServiceIdSet.has(svc.id) && !svc.active) {
          throw new Error("Pasif durumdaki hizmetler yeni atanamaz.");
        }
      }
    }

    // 5. Compute additions and removals
    const submittedSet = new Set(uniqueSubmittedIds);
    const explicitRemoveInactiveSet = new Set(
      (removeInactiveServiceIds || []).filter(
        (id) => typeof id === "string" && id.trim().length > 0
      )
    );

    // Active mappings removed because they are not in submittedSet
    const activeToRemove = Array.from(activeExistingSet).filter(
      (id) => !submittedSet.has(id)
    );
    // Inactive mappings removed ONLY if explicitly requested in removeInactiveServiceIds
    const inactiveToRemove = Array.from(inactiveExistingSet).filter(
      (id) => explicitRemoveInactiveSet.has(id)
    );

    const toRemove = [...activeToRemove, ...inactiveToRemove];
    const toAdd = uniqueSubmittedIds.filter((id) => !existingServiceIdSet.has(id));

    // 6. Delete removed mappings
    if (toRemove.length > 0) {
      await tx
        .delete(staffServices)
        .where(
          and(
            eq(staffServices.businessId, businessId),
            eq(staffServices.staffId, staffId),
            inArray(staffServices.serviceId, toRemove)
          )
        );
    }

    // 7. Insert added mappings
    if (toAdd.length > 0) {
      await tx.insert(staffServices).values(
        toAdd.map((serviceId) => ({
          businessId,
          staffId,
          serviceId,
        }))
      );
    }

    // 8. Count remaining ACTIVE assigned services
    const [activeCountResult] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(staffServices)
      .innerJoin(services, eq(staffServices.serviceId, services.id))
      .where(
        and(
          eq(staffServices.businessId, businessId),
          eq(staffServices.staffId, staffId),
          eq(services.active, true)
        )
      );

    const activeCount = activeCountResult?.count ?? 0;
    let publicBookingAutoDisabled = false;

    // If 0 active services remain, public_booking_enabled must become false
    if (activeCount === 0) {
      await tx
        .update(staffProfiles)
        .set({
          publicBookingEnabled: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffProfiles.businessId, businessId),
            eq(staffProfiles.id, staffId)
          )
        );
      publicBookingAutoDisabled = true;
    }

    return {
      assignedServiceIds: uniqueSubmittedIds,
      publicBookingAutoDisabled,
    };
  });
}

export async function updateStaffPublicBooking(
  businessId: string,
  staffId: string,
  publicBookingEnabled: boolean
): Promise<{ id: string; publicBookingEnabled: boolean } | null> {
  const [updated] = await db
    .update(staffProfiles)
    .set({
      publicBookingEnabled,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(staffProfiles.businessId, businessId),
        eq(staffProfiles.id, staffId)
      )
    )
    .returning({
      id: staffProfiles.id,
      publicBookingEnabled: staffProfiles.publicBookingEnabled,
    });

  return updated || null;
}

export async function autoDisablePublicBookingForStaffWithNoActiveServices(
  businessId: string,
  serviceId: string
): Promise<string[]> {
  const mappings = await db
    .select({ staffId: staffServices.staffId })
    .from(staffServices)
    .where(
      and(
        eq(staffServices.businessId, businessId),
        eq(staffServices.serviceId, serviceId)
      )
    );

  const disabledStaffIds: string[] = [];

  for (const { staffId } of mappings) {
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(staffServices)
      .innerJoin(services, eq(staffServices.serviceId, services.id))
      .where(
        and(
          eq(staffServices.businessId, businessId),
          eq(staffServices.staffId, staffId),
          eq(services.active, true)
        )
      );

    if ((activeCount?.count ?? 0) === 0) {
      await db
        .update(staffProfiles)
        .set({
          publicBookingEnabled: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(staffProfiles.businessId, businessId),
            eq(staffProfiles.id, staffId)
          )
        );
      disabledStaffIds.push(staffId);
    }
  }

  return disabledStaffIds;
}



