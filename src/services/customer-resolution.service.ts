import "server-only";

import { sql } from "drizzle-orm";
import { type DbExecutor } from "@/db";
import { CustomerDomainError } from "@/lib/customer-domain-errors";
import {
  CustomerResolutionRepository,
  type CustomerResolutionRow,
} from "@/repositories/customer-resolution.repository";

export interface CustomerFamily {
  canonical: CustomerResolutionRow;
  customerIds: string[];
}

function lineageConflict(): never {
  throw new CustomerDomainError("CUSTOMER_LINEAGE_CONFLICT");
}

async function lockCustomers(
  executor: DbExecutor,
  businessId: string,
  customerIds: string[]
): Promise<void> {
  for (const customerId of [...new Set(customerIds)].sort()) {
    const result = await executor.execute(sql`
      SELECT id
      FROM customers
      WHERE business_id = ${businessId} AND id = ${customerId}
      FOR UPDATE
    `);
    if (result.rows.length !== 1) lineageConflict();
  }
}

async function validateCanonical(
  executor: DbExecutor,
  businessId: string,
  row: CustomerResolutionRow
): Promise<CustomerResolutionRow> {
  if (row.mergedIntoCustomerId === null) return row;
  if (row.mergedIntoCustomerId === row.id) lineageConflict();

  const canonical = await CustomerResolutionRepository.findById(
    executor,
    businessId,
    row.mergedIntoCustomerId
  );
  if (!canonical || canonical.mergedIntoCustomerId !== null) lineageConflict();
  return canonical;
}

export async function resolveCanonicalCustomer(
  executor: DbExecutor,
  businessId: string,
  customerId: string,
  options: { lock?: boolean } = {}
): Promise<CustomerResolutionRow | null> {
  let requested = await CustomerResolutionRepository.findById(
    executor,
    businessId,
    customerId
  );
  if (!requested) return null;

  if (options.lock) {
    const initialIds = [requested.id];
    if (requested.mergedIntoCustomerId) initialIds.push(requested.mergedIntoCustomerId);
    await lockCustomers(executor, businessId, initialIds);
    requested = await CustomerResolutionRepository.findById(
      executor,
      businessId,
      customerId
    );
    if (!requested) lineageConflict();

    // If a merge completed while the initial row was being loaded, lock and
    // re-read the newly established root as well.
    if (
      requested.mergedIntoCustomerId &&
      !initialIds.includes(requested.mergedIntoCustomerId)
    ) {
      await lockCustomers(executor, businessId, [requested.mergedIntoCustomerId]);
      requested = await CustomerResolutionRepository.findById(
        executor,
        businessId,
        customerId
      );
      if (!requested) lineageConflict();
    }
  }

  return validateCanonical(executor, businessId, requested);
}

export async function getCustomerFamily(
  executor: DbExecutor,
  businessId: string,
  customerId: string
): Promise<CustomerFamily | null> {
  const canonical = await resolveCanonicalCustomer(executor, businessId, customerId);
  if (!canonical) return null;

  const rows = await CustomerResolutionRepository.getFamilyRows(
    executor,
    businessId,
    canonical.id
  );
  if (!rows.some((row) => row.id === canonical.id)) lineageConflict();
  if (
    rows.some(
      (row) =>
        row.id !== canonical.id && row.mergedIntoCustomerId !== canonical.id
    )
  ) {
    lineageConflict();
  }

  return {
    canonical,
    customerIds: rows.map((row) => row.id).sort(),
  };
}

export async function lockCustomerComparisonGroup(
  executor: DbExecutor,
  businessId: string,
  phoneComparisonKey: string
): Promise<CustomerResolutionRow[]> {
  const initial = await CustomerResolutionRepository.findByComparisonKey(
    executor,
    businessId,
    phoneComparisonKey
  );
  await lockCustomers(
    executor,
    businessId,
    initial.flatMap((row) =>
      row.mergedIntoCustomerId ? [row.id, row.mergedIntoCustomerId] : [row.id]
    )
  );
  return CustomerResolutionRepository.findByComparisonKey(
    executor,
    businessId,
    phoneComparisonKey
  );
}

export async function uniqueCanonicalForRows(
  executor: DbExecutor,
  businessId: string,
  rows: CustomerResolutionRow[]
): Promise<CustomerResolutionRow | null> {
  if (rows.length === 0) return null;
  const rootIds = [...new Set(rows.map((row) => row.mergedIntoCustomerId ?? row.id))];
  if (rootIds.length !== 1) {
    throw new CustomerDomainError("CUSTOMER_IDENTITY_AMBIGUOUS");
  }
  const canonical = await CustomerResolutionRepository.findById(
    executor,
    businessId,
    rootIds[0]
  );
  if (!canonical || canonical.mergedIntoCustomerId !== null) lineageConflict();
  return canonical;
}
