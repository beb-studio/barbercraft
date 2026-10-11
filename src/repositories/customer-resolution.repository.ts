import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";
import { type DbExecutor } from "@/db";
import { customers } from "@/db/schema";

export interface CustomerResolutionRow {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  normalizedPhone: string;
  phoneComparisonKey: string;
  mergedIntoCustomerId: string | null;
}

const selection = {
  id: customers.id,
  businessId: customers.businessId,
  firstName: customers.firstName,
  lastName: customers.lastName,
  phone: customers.phone,
  normalizedPhone: customers.normalizedPhone,
  phoneComparisonKey: customers.phoneComparisonKey,
  mergedIntoCustomerId: customers.mergedIntoCustomerId,
};

export const CustomerResolutionRepository = {
  async findById(
    executor: DbExecutor,
    businessId: string,
    customerId: string
  ): Promise<CustomerResolutionRow | null> {
    const [row] = await executor
      .select(selection)
      .from(customers)
      .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
      .limit(1);

    return row ?? null;
  },

  async findByIds(
    executor: DbExecutor,
    businessId: string,
    customerIds: string[]
  ): Promise<CustomerResolutionRow[]> {
    if (customerIds.length === 0) return [];
    return executor
      .select(selection)
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          inArray(customers.id, [...new Set(customerIds)])
        )
      );
  },

  async findByComparisonKey(
    executor: DbExecutor,
    businessId: string,
    phoneComparisonKey: string
  ): Promise<CustomerResolutionRow[]> {
    return executor
      .select(selection)
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          eq(customers.phoneComparisonKey, phoneComparisonKey)
        )
      );
  },

  async findExactNormalizedPhone(
    executor: DbExecutor,
    businessId: string,
    normalizedPhone: string
  ): Promise<CustomerResolutionRow | null> {
    const [row] = await executor
      .select(selection)
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          eq(customers.normalizedPhone, normalizedPhone)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async getFamilyRows(
    executor: DbExecutor,
    businessId: string,
    canonicalCustomerId: string
  ): Promise<CustomerResolutionRow[]> {
    return executor
      .select(selection)
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          or(
            eq(customers.id, canonicalCustomerId),
            eq(customers.mergedIntoCustomerId, canonicalCustomerId)
          )
        )
      );
  },
};
