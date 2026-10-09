import "server-only";

import {
  CustomerDomainError,
  isCustomerDomainError,
  type CustomerDomainErrorCode,
} from "@/lib/customer-domain-errors";
import {
  CustomerMergeRepository,
  type MergeCustomerRow,
} from "@/repositories/customer-merge.repository";

export interface MergeCustomersInput {
  actorUserId: string;
  canonicalCustomerId: string;
  selectedCustomerIds: string[];
}

export interface MergeCustomersResult {
  canonicalCustomerId: string;
  aliasCustomerIds: string[];
  mergedAt: Date;
  mergedByBusinessMemberId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: CustomerDomainErrorCode): never {
  throw new CustomerDomainError(code);
}

function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function sameIds(left: string[], right: string[]): boolean {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function connectedLineageIds(rows: MergeCustomerRow[], seedIds: string[]): string[] {
  const connected = new Set(seedIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        connected.has(row.id) ||
        (row.mergedIntoCustomerId !== null && connected.has(row.mergedIntoCustomerId))
      ) {
        if (!connected.has(row.id)) {
          connected.add(row.id);
          changed = true;
        }
        if (row.mergedIntoCustomerId && !connected.has(row.mergedIntoCustomerId)) {
          connected.add(row.mergedIntoCustomerId);
          changed = true;
        }
      }
    }
  }

  return uniqueSorted([...connected]);
}

function validateLineage(rows: MergeCustomerRow[], relevantIds: string[]): void {
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const customerId of relevantIds) {
    const row = byId.get(customerId);
    if (!row) fail("CUSTOMER_MERGE_STALE");

    const visited = new Set<string>();
    let current: MergeCustomerRow | undefined = row;

    while (current?.mergedIntoCustomerId) {
      if (visited.has(current.id)) fail("CUSTOMER_MERGE_CONFLICT");
      visited.add(current.id);

      const target = byId.get(current.mergedIntoCustomerId);
      if (!target) fail("CUSTOMER_MERGE_CONFLICT");
      if (target.mergedIntoCustomerId !== null) fail("CUSTOMER_MERGE_CONFLICT");
      current = target;
    }
  }
}

function validateAndResolveGroup(
  rows: MergeCustomerRow[],
  canonicalCustomerId: string,
  selectedCustomerIds: string[]
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const canonical = byId.get(canonicalCustomerId);
  if (!canonical) fail("CUSTOMER_NOT_FOUND");

  const comparisonKey = canonical.phoneComparisonKey;
  if (!comparisonKey) fail("CUSTOMER_MERGE_NOT_ELIGIBLE");

  const selectedRows = selectedCustomerIds.map((id) => byId.get(id));
  if (selectedRows.some((row) => !row)) fail("CUSTOMER_NOT_FOUND");
  if (
    selectedRows.some(
      (row) => !row?.phoneComparisonKey || row.phoneComparisonKey !== comparisonKey
    )
  ) {
    fail("CUSTOMER_MERGE_NOT_ELIGIBLE");
  }

  const eligibleRows = rows.filter((row) => row.phoneComparisonKey === comparisonKey);
  if (eligibleRows.length < 2) fail("CUSTOMER_MERGE_NOT_ELIGIBLE");

  const eligibleIds = eligibleRows.map((row) => row.id);
  if (!sameIds(selectedCustomerIds, eligibleIds)) fail("CUSTOMER_MERGE_STALE");

  const lineageIds = connectedLineageIds(rows, eligibleIds);
  const lineageRows = lineageIds.map((id) => byId.get(id));
  if (
    lineageRows.some(
      (row) => !row || row.phoneComparisonKey !== comparisonKey
    )
  ) {
    fail("CUSTOMER_MERGE_CONFLICT");
  }

  validateLineage(rows, lineageIds);

  return { canonical, eligibleRows, lineageIds };
}

function postgresCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.cause?.code ?? value?.code;
}

export const CustomerMergeService = {
  async mergeCustomers(input: MergeCustomersInput): Promise<MergeCustomersResult> {
    const selectedCustomerIds = uniqueSorted(input.selectedCustomerIds);

    if (
      !UUID_PATTERN.test(input.actorUserId) ||
      !UUID_PATTERN.test(input.canonicalCustomerId) ||
      selectedCustomerIds.some((id) => !UUID_PATTERN.test(id))
    ) {
      fail("CUSTOMER_NOT_FOUND");
    }

    if (
      selectedCustomerIds.length < 2 ||
      !selectedCustomerIds.includes(input.canonicalCustomerId)
    ) {
      fail("CUSTOMER_MERGE_NOT_ELIGIBLE");
    }

    try {
      return await CustomerMergeRepository.transaction(async (tx) => {
        const initialCanonical = await CustomerMergeRepository.findCustomerById(
          tx,
          input.canonicalCustomerId
        );
        if (!initialCanonical) fail("CUSTOMER_NOT_FOUND");

        const member = await CustomerMergeRepository.findAuthorizedMember(
          tx,
          initialCanonical.businessId,
          input.actorUserId
        );
        if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
          fail("FORBIDDEN");
        }

        const initialRows = await CustomerMergeRepository.listBusinessMergeState(
          tx,
          initialCanonical.businessId
        );
        const initialGroup = validateAndResolveGroup(
          initialRows,
          input.canonicalCustomerId,
          selectedCustomerIds
        );

        await CustomerMergeRepository.lockCustomersForUpdate(
          tx,
          initialCanonical.businessId,
          initialGroup.lineageIds
        );

        const lockedRows = await CustomerMergeRepository.listBusinessMergeState(
          tx,
          initialCanonical.businessId
        );
        const lockedGroup = validateAndResolveGroup(
          lockedRows,
          input.canonicalCustomerId,
          selectedCustomerIds
        );

        if (!sameIds(initialGroup.lineageIds, lockedGroup.lineageIds)) {
          fail("CUSTOMER_MERGE_STALE");
        }
        if (lockedGroup.canonical.mergedIntoCustomerId !== null) {
          fail("CUSTOMER_MERGE_STALE");
        }

        const aliasCustomerIds = uniqueSorted(
          lockedGroup.eligibleRows
            .map((row) => row.id)
            .filter((id) => id !== input.canonicalCustomerId)
        );
        const isNoOp = lockedGroup.eligibleRows.every(
          (row) =>
            row.id === input.canonicalCustomerId ||
            row.mergedIntoCustomerId === input.canonicalCustomerId
        );
        if (isNoOp) fail("CUSTOMER_MERGE_STALE");

        const mergedAt = new Date();
        await CustomerMergeRepository.setAliases(
          tx,
          initialCanonical.businessId,
          aliasCustomerIds,
          input.canonicalCustomerId,
          mergedAt,
          member.id
        );

        return {
          canonicalCustomerId: input.canonicalCustomerId,
          aliasCustomerIds,
          mergedAt,
          mergedByBusinessMemberId: member.id,
        };
      });
    } catch (error: unknown) {
      if (isCustomerDomainError(error)) throw error;

      const code = postgresCode(error);
      if (["23503", "23514", "40001", "40P01"].includes(code ?? "")) {
        fail("CUSTOMER_MERGE_CONFLICT");
      }

      // Keep database details and unexpected internals behind the domain boundary.
      fail("CUSTOMER_MERGE_CONFLICT");
    }
  },
};
