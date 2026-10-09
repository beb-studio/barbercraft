import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbTransaction } from "@/db";
import { businessMembers, customers } from "@/db/schema";

export interface MergeCustomerRow {
  id: string;
  businessId: string;
  phoneComparisonKey: string;
  mergedIntoCustomerId: string | null;
}

export const CustomerMergeRepository = {
  transaction<T>(callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return db.transaction(callback, { isolationLevel: "serializable" });
  },

  async findCustomerById(tx: DbTransaction, customerId: string): Promise<MergeCustomerRow | null> {
    const [customer] = await tx
      .select({
        id: customers.id,
        businessId: customers.businessId,
        phoneComparisonKey: customers.phoneComparisonKey,
        mergedIntoCustomerId: customers.mergedIntoCustomerId,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    return customer ?? null;
  },

  async findAuthorizedMember(tx: DbTransaction, businessId: string, userId: string) {
    const [member] = await tx
      .select({ id: businessMembers.id, role: businessMembers.role })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.userId, userId),
          eq(businessMembers.active, true)
        )
      )
      .limit(1);

    return member ?? null;
  },

  async listBusinessMergeState(tx: DbTransaction, businessId: string): Promise<MergeCustomerRow[]> {
    return tx
      .select({
        id: customers.id,
        businessId: customers.businessId,
        phoneComparisonKey: customers.phoneComparisonKey,
        mergedIntoCustomerId: customers.mergedIntoCustomerId,
      })
      .from(customers)
      .where(eq(customers.businessId, businessId));
  },

  async lockCustomersForUpdate(
    tx: DbTransaction,
    businessId: string,
    customerIds: string[]
  ): Promise<void> {
    const sortedIds = [...new Set(customerIds)].sort();

    for (const customerId of sortedIds) {
      const result = await tx.execute(sql`
        SELECT id
        FROM customers
        WHERE business_id = ${businessId} AND id = ${customerId}
        FOR UPDATE
      `);

      if (result.rows.length !== 1) {
        throw new Error("CUSTOMER_LOCK_TARGET_MISSING");
      }
    }
  },

  async setAliases(
    tx: DbTransaction,
    businessId: string,
    aliasIds: string[],
    canonicalCustomerId: string,
    mergedAt: Date,
    mergedByBusinessMemberId: string
  ): Promise<void> {
    if (aliasIds.length === 0) return;

    await tx
      .update(customers)
      .set({
        mergedIntoCustomerId: canonicalCustomerId,
        mergedAt,
        mergedByBusinessMemberId,
      })
      .where(and(eq(customers.businessId, businessId), inArray(customers.id, aliasIds)));
  },
};
