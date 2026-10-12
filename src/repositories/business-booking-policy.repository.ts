import "server-only";

import { db } from "@/db";
import { businesses } from "@/db/schema";
import type { BusinessBookingPolicy } from "@/lib/business-booking-policy";
import { eq, sql } from "drizzle-orm";

export interface BusinessBookingPolicyRecord extends BusinessBookingPolicy {
  businessId: string;
  businessSlug: string;
  businessTimezone: string;
  version: string;
}

export type BusinessBookingPolicyUpdateResult =
  | { outcome: "UPDATED"; record: BusinessBookingPolicyRecord }
  | { outcome: "STALE"; record: BusinessBookingPolicyRecord }
  | { outcome: "NOT_FOUND" };

const policySelection = {
  businessId: businesses.id,
  businessSlug: businesses.slug,
  businessTimezone: businesses.timezone,
  minimumBookingLeadMinutes: businesses.minimumBookingLeadMinutes,
  maximumAdvanceBookingDays: businesses.maximumAdvanceBookingDays,
  cancellationNoticeMinutes: businesses.cancellationNoticeMinutes,
  rescheduleNoticeMinutes: businesses.rescheduleNoticeMinutes,
  version: sql<string>`${businesses.updatedAt}::text`,
};

export const BusinessBookingPolicyRepository = {
  async findByBusinessId(
    businessId: string
  ): Promise<BusinessBookingPolicyRecord | null> {
    const [record] = await db
      .select(policySelection)
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    return record ?? null;
  },

  async updateWithVersion(input: {
    businessId: string;
    expectedVersion: string;
    policy: BusinessBookingPolicy;
  }): Promise<BusinessBookingPolicyUpdateResult> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select(policySelection)
        .from(businesses)
        .where(eq(businesses.id, input.businessId))
        .limit(1)
        .for("update");

      if (!current) return { outcome: "NOT_FOUND" as const };
      if (current.version !== input.expectedVersion) {
        return { outcome: "STALE" as const, record: current };
      }

      await tx
        .update(businesses)
        .set({
          minimumBookingLeadMinutes: input.policy.minimumBookingLeadMinutes,
          maximumAdvanceBookingDays: input.policy.maximumAdvanceBookingDays,
          cancellationNoticeMinutes: input.policy.cancellationNoticeMinutes,
          rescheduleNoticeMinutes: input.policy.rescheduleNoticeMinutes,
        })
        .where(eq(businesses.id, input.businessId));

      const [updated] = await tx
        .select(policySelection)
        .from(businesses)
        .where(eq(businesses.id, input.businessId))
        .limit(1);

      if (!updated) return { outcome: "NOT_FOUND" as const };
      return { outcome: "UPDATED" as const, record: updated };
    });
  },
};
