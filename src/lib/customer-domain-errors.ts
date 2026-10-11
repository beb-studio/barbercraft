export type CustomerDomainErrorCode =
  | "CUSTOMER_MERGE_NOT_ELIGIBLE"
  | "CUSTOMER_MERGE_STALE"
  | "CUSTOMER_MERGE_CONFLICT"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_ALIAS_MUTATION_FORBIDDEN"
  | "CUSTOMER_IDENTITY_AMBIGUOUS"
  | "CUSTOMER_PHONE_AMBIGUOUS"
  | "CUSTOMER_PHONE_INVALID"
  | "CUSTOMER_LINEAGE_CONFLICT"
  | "FORBIDDEN";

export class CustomerDomainError extends Error {
  constructor(public readonly code: CustomerDomainErrorCode) {
    super(code);
    this.name = "CustomerDomainError";
  }
}

export function isCustomerDomainError(error: unknown): error is CustomerDomainError {
  return error instanceof CustomerDomainError;
}
