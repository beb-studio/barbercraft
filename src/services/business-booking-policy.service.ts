import "server-only";

import {
  getBusinessBookingPolicy,
  validateBusinessBookingPolicy,
  type BusinessBookingPolicy,
} from "@/lib/business-booking-policy";
import {
  BusinessBookingPolicyRepository,
  type BusinessBookingPolicyRecord,
} from "@/repositories/business-booking-policy.repository";

export class BusinessBookingPolicyError extends Error {
  constructor(
    public readonly code:
      | "BOOKING_POLICY_NOT_FOUND"
      | "BOOKING_POLICY_INVALID"
      | "BOOKING_POLICY_STALE"
  ) {
    super(code);
    this.name = "BusinessBookingPolicyError";
  }
}

function toSafeRecord(
  record: BusinessBookingPolicyRecord
): BusinessBookingPolicyRecord {
  return {
    ...record,
    ...getBusinessBookingPolicy(record),
  };
}

export const BusinessBookingPolicyService = {
  async getForBusiness(businessId: string): Promise<BusinessBookingPolicyRecord> {
    const record = await BusinessBookingPolicyRepository.findByBusinessId(
      businessId
    );
    if (!record) {
      throw new BusinessBookingPolicyError("BOOKING_POLICY_NOT_FOUND");
    }
    return toSafeRecord(record);
  },

  async update(input: {
    businessId: string;
    expectedVersion: string;
    policy: BusinessBookingPolicy;
  }): Promise<BusinessBookingPolicyRecord> {
    if (typeof input.expectedVersion !== "string" || !input.expectedVersion) {
      throw new BusinessBookingPolicyError("BOOKING_POLICY_STALE");
    }

    const validation = validateBusinessBookingPolicy(input.policy);
    if (!validation.valid) {
      throw new BusinessBookingPolicyError("BOOKING_POLICY_INVALID");
    }

    const result = await BusinessBookingPolicyRepository.updateWithVersion({
      businessId: input.businessId,
      expectedVersion: input.expectedVersion,
      policy: validation.policy,
    });

    if (result.outcome === "NOT_FOUND") {
      throw new BusinessBookingPolicyError("BOOKING_POLICY_NOT_FOUND");
    }
    if (result.outcome === "STALE") {
      throw new BusinessBookingPolicyError("BOOKING_POLICY_STALE");
    }
    return toSafeRecord(result.record);
  },
};
