import { db } from "@/db";
import {
  businesses,
  services,
  staffProfiles,
  businessMembers,
  staffServices,
  businessWorkingHours,
  staffWorkingHours,
} from "@/db/schema";
import { eq, and, inArray, sql, asc } from "drizzle-orm";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export interface PublicBusinessRow {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  active: boolean;
  onboardingCompletedAt: Date | null;
  minimumBookingLeadMinutes: number;
  maximumAdvanceBookingDays: number | null;
  cancellationNoticeMinutes: number;
  rescheduleNoticeMinutes: number;
}

export interface PublicServiceRow {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  active: boolean;
}

export interface PublicStaffCandidate {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  usesBusinessHours: boolean;
}

export const PublicBookingRepository = {
  /**
   * Resolves a business by slug for public booking.
   * Returns null if business does not exist, is inactive, or onboarding is incomplete.
   */
  async findPublicBusinessBySlug(slug: string): Promise<PublicBusinessRow | null> {
    const [biz] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        phone: businesses.phone,
        address: businesses.address,
        currency: businesses.currency,
        timezone: businesses.timezone,
        active: businesses.active,
        onboardingCompletedAt: businesses.onboardingCompletedAt,
        minimumBookingLeadMinutes: businesses.minimumBookingLeadMinutes,
        maximumAdvanceBookingDays: businesses.maximumAdvanceBookingDays,
        cancellationNoticeMinutes: businesses.cancellationNoticeMinutes,
        rescheduleNoticeMinutes: businesses.rescheduleNoticeMinutes,
      })
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1);

    if (!biz) {
      return null;
    }

    // Temporary MVP rule: business must be active and have onboardingCompletedAt IS NOT NULL
    if (!biz.active || !biz.onboardingCompletedAt) {
      return null;
    }

    return biz;
  },

  /**
   * Gets active services for a business.
   */
  async getActiveServicesByBusinessId(businessId: string): Promise<PublicServiceRow[]> {
    return db
      .select({
        id: services.id,
        businessId: services.businessId,
        name: services.name,
        description: services.description,
        durationMinutes: services.durationMinutes,
        price: services.price,
        active: services.active,
      })
      .from(services)
      .where(and(eq(services.businessId, businessId), eq(services.active, true)))
      .orderBy(asc(services.name));
  },

  /**
   * Gets a specific active service belonging to the business.
   */
  async getActiveServiceById(
    businessId: string,
    serviceId: string
  ): Promise<PublicServiceRow | null> {
    if (!isValidUuid(businessId) || !isValidUuid(serviceId)) {
      return null;
    }

    const [svc] = await db
      .select({
        id: services.id,
        businessId: services.businessId,
        name: services.name,
        description: services.description,
        durationMinutes: services.durationMinutes,
        price: services.price,
        active: services.active,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, serviceId),
          eq(services.active, true)
        )
      )
      .limit(1);

    return svc ?? null;
  },

  /**
   * Gets eligible staff members for a specific active service in a business.
   * Enforces all 8 eligibility rules efficiently without N+1 queries:
   * 1. business_member.active = true
   * 2. staff_profile.active = true
   * 3. staff_profile.public_booking_enabled = true
   * 4. service is active
   * 5. staff_services mapping exists
   * 6. service belongs to same business
   * 7. staff profile belongs to same business
   * 8. structurally valid effective schedule:
   *    - if uses_business_hours = true: business_working_hours has 7 days AND >= 1 open day (is_closed = false)
   *    - if uses_business_hours = false: staff_working_hours has 7 days AND >= 1 working day (is_working = true)
   */
  async getEligibleStaffForService(
    businessId: string,
    serviceId: string
  ): Promise<PublicStaffCandidate[]> {
    if (!isValidUuid(businessId) || !isValidUuid(serviceId)) {
      return [];
    }

    // 1. Verify service is active and belongs to this business
    const service = await this.getActiveServiceById(businessId, serviceId);
    if (!service) {
      return [];
    }

    // 2. Query candidate staff profiles joined with active member and staff_service
    const candidates = await db
      .select({
        id: staffProfiles.id,
        firstName: staffProfiles.firstName,
        lastName: staffProfiles.lastName,
        profileImageUrl: staffProfiles.profileImageUrl,
        usesBusinessHours: staffProfiles.usesBusinessHours,
      })
      .from(staffProfiles)
      .innerJoin(
        businessMembers,
        and(
          eq(businessMembers.id, staffProfiles.businessMemberId),
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.active, true)
        )
      )
      .innerJoin(
        staffServices,
        and(
          eq(staffServices.staffId, staffProfiles.id),
          eq(staffServices.businessId, businessId),
          eq(staffServices.serviceId, serviceId)
        )
      )
      .where(
        and(
          eq(staffProfiles.businessId, businessId),
          eq(staffProfiles.active, true),
          eq(staffProfiles.publicBookingEnabled, true)
        )
      );

    if (candidates.length === 0) {
      return [];
    }

    // 3. Evaluate effective schedule validity (Rule 8)
    const usesBizHours = candidates.some((c) => c.usesBusinessHours);
    const customStaffIds = candidates
      .filter((c) => !c.usesBusinessHours)
      .map((c) => c.id);

    // 3a. Check business hours validity if any candidate uses business hours
    let isBizHoursValid = false;
    if (usesBizHours) {
      const bwh = await db
        .select({
          dayOfWeek: businessWorkingHours.dayOfWeek,
          isClosed: businessWorkingHours.isClosed,
        })
        .from(businessWorkingHours)
        .where(eq(businessWorkingHours.businessId, businessId));

      const has7Days = bwh.length === 7;
      const hasOpenDay = bwh.some((day) => !day.isClosed);
      isBizHoursValid = has7Days && hasOpenDay;
    }

    // 3b. Check custom staff hours validity if any candidate uses custom hours
    const validCustomStaffIds = new Set<string>();
    if (customStaffIds.length > 0) {
      const swhStats = await db
        .select({
          staffId: staffWorkingHours.staffId,
          totalDays: sql<number>`count(*)::int`,
          workingDays: sql<number>`count(case when ${staffWorkingHours.isWorking} = true then 1 end)::int`,
        })
        .from(staffWorkingHours)
        .where(
          and(
            eq(staffWorkingHours.businessId, businessId),
            inArray(staffWorkingHours.staffId, customStaffIds)
          )
        )
        .groupBy(staffWorkingHours.staffId);

      for (const stat of swhStats) {
        if (stat.totalDays === 7 && stat.workingDays >= 1) {
          validCustomStaffIds.add(stat.staffId);
        }
      }
    }

    // 4. Filter candidates
    return candidates.filter((c) => {
      if (c.usesBusinessHours) {
        return isBizHoursValid;
      }
      return validCustomStaffIds.has(c.id);
    });
  },
};
