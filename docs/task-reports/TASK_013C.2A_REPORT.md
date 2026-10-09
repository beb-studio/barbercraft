# TASK 013C.2A — Customer Merge Schema & Domain Foundation

## 1. Pre-implementation audit

- Original `customers` columns: `id`, `business_id`, `first_name`, `last_name`, `phone`, `normalized_phone`, `notes`, `created_at`, `updated_at`.
- Existing customer tenant keys: unique `(business_id, normalized_phone)` and unique `(business_id, id)`.
- `appointments` uses tenant-composite customer FK `(business_id, customer_id) -> customers(business_id, id) ON DELETE RESTRICT`.
- Actual `prevent_appointment_column_change()` restrictions are `business_id`, `customer_id`, and `service_id`; `customer_id` is immutable and the function/trigger was not changed.
- `normalizePhone` preserves a leading `+` and otherwise removes all non-digits. It intentionally remains the authoritative operational normalization behavior.
- `customerPhoneComparisonKey` maps Turkish `+905...`, `905...`, `05...`, and `5...` variants to `+905...`; generic leading-plus values retain `+digits`, other values return digits, and no digits returns an empty string.
- Duplicate candidates previously scanned every tenant customer, recalculated the key from `normalizedPhone || phone`, grouped in memory in O(N), omitted empty keys, and returned groups with at least two members. It was advisory and non-destructive.
- Tenant FK convention uses composite `(business_id, entity_id)` references against composite unique target keys. Provenance references use `ON DELETE RESTRICT`.
- Transaction convention uses Drizzle `db.transaction`, raw parameterized SQL for `SELECT ... FOR UPDATE`, and deterministic lexical UUID ordering where multiple rows are locked.

## 2. Schema changes

`customers` now adds:

- `phone_comparison_key text NOT NULL`
- `merged_into_customer_id uuid NULL`
- `merged_at timestamptz NULL`
- `merged_by_business_member_id uuid NULL`

Canonical rows have all merge metadata NULL. Alias rows have all three merge metadata fields populated.

## 3. `phoneComparisonKey` persistence

- `AppointmentRepository.upsertCustomer` derives both `normalizedPhone` and `phoneComparisonKey` server-side for public and manual new-customer flows.
- Conflict-update behavior also refreshes `phoneComparisonKey`.
- `CustomerRepository.updateProfile` derives the comparison key server-side from the normalized phone.
- QA bootstrap supplies the key explicitly for its controlled fixture.
- A database trigger recomputes the value from `normalized_phone` on INSERT or normalized-phone UPDATE, protecting controlled SQL/bootstrap/test paths without trusting browser input.
- Duplicate review now groups by the persisted value. `normalized_phone` remains unchanged and authoritative for operational identity.

## 4. Migration and backfill

- Forward migration: `drizzle/migrations/0013_customer_logical_merge_foundation.sql`.
- No historical migration was edited.
- The migration adds the comparison column as nullable, defines `customer_phone_comparison_key(text)` with application-equivalent semantics, backfills every existing row from `normalized_phone`, then sets the column NOT NULL.
- Merge metadata is added nullable and is never populated by backfill. No customer is automatically merged.
- Drizzle journal and `0013_snapshot.json` were generated from the updated schema.

## 5. Indexes

Two non-redundant tenant-prefix indexes were added:

- `customers_business_phone_comparison_idx (business_id, phone_comparison_key)` for duplicate-group lookup and future alias resolution.
- `customers_business_merged_into_idx (business_id, merged_into_customer_id)` for lineage/inbound-alias lookup.

`phone_comparison_key` is deliberately non-unique.

## 6. Tenant-safe foreign keys

- `customers_merged_into_customer_fkey`: `(business_id, merged_into_customer_id) -> customers(business_id, id) ON DELETE RESTRICT`.
- `customers_merged_by_business_member_fkey`: `(business_id, merged_by_business_member_id) -> business_members(business_id, id) ON DELETE RESTRICT`.

These prevent cross-tenant targets and authors while preserving lineage and provenance.

## 7. Self-merge and metadata protection

- `customers_no_self_merge_check` rejects `merged_into_customer_id = id`.
- `customers_merge_metadata_check` requires target, timestamp, and author to be either all NULL or all populated.

## 8. One-hop lineage model

`enforce_customer_merge_one_hop()` is installed as a deferred constraint trigger. At commit it rejects:

- an alias whose target is itself an alias;
- a customer becoming an alias while another customer still points to it;
- multi-hop chains and cycles resulting from direct database mutation.

This permits transactional flattening because the constraint evaluates final transaction state.

## 9. Merge service architecture

- `CustomerMergeService` owns validation, authorization, conflict handling, lineage validation, and transaction orchestration.
- `CustomerMergeRepository` owns database reads, trusted membership lookup, serializable transactions, deterministic row locks, and alias updates.
- `mergeCustomersAction` is a server-only foundation with no UI. It accepts only canonical and selected customer IDs, never a browser-supplied business ID.
- Typed internal failures use `CustomerDomainError` with `CUSTOMER_MERGE_NOT_ELIGIBLE`, `CUSTOMER_MERGE_STALE`, `CUSTOMER_MERGE_CONFLICT`, `CUSTOMER_NOT_FOUND`, `CUSTOMER_ALIAS_MUTATION_FORBIDDEN`, and `FORBIDDEN`.

## 10. Authorization

The action obtains the authenticated user. Inside the transaction the service derives `business_id` from the canonical customer and reloads the actor's active membership for that tenant.

- OWNER: allowed.
- ADMIN: allowed.
- STAFF: denied.
- Unauthenticated: denied.
- Platform-only admin without tenant membership: denied.
- Cross-tenant actor: denied.

## 11. Merge eligibility and complete-group validation

- Every selected customer must exist in the derived business.
- Every selected customer must share the canonical customer's same non-empty persisted comparison key.
- The selected IDs must exactly match the complete current tenant group for that key; incomplete browser selections return `CUSTOMER_MERGE_STALE`.
- The selected canonical must be included, belong to the group, and still be a root after locks are acquired.
- Name equality is never considered sufficient.

## 12. Transaction strategy

The operation uses one PostgreSQL serializable transaction:

1. derive the canonical tenant;
2. authorize the active tenant membership;
3. load and validate the current complete group and connected lineage;
4. lock relevant customer rows;
5. reload and revalidate the group;
6. reject stale, corrupt, chained, cyclic, ineligible, or no-op state;
7. update aliases with target, timestamp, and author;
8. commit after deferred one-hop validation.

Serializable isolation also converts predicate/phantom races into safe `CUSTOMER_MERGE_CONFLICT` outcomes.

## 13. Locking strategy

All relevant customer UUIDs are de-duplicated, sorted lexically, and locked one-by-one using tenant-scoped `SELECT ... FOR UPDATE`. Overlapping operations therefore use the same lock order and avoid lock-order deadlocks.

## 14. Lineage flattening

For an existing valid family `B -> A`, `C -> A`, merging the full family into root `D` updates `A`, `B`, and `C` directly to `D`. Existing alias metadata is refreshed to the current merge timestamp and actor. `D` remains fully canonical with NULL merge metadata.

## 15. Appointment preservation

The merge service contains no appointment UPDATE or DELETE. Dedicated tests snapshot appointment IDs and customer IDs before merge and prove they remain unchanged. `prevent_appointment_column_change()` was not modified.

## 16. Note preservation

The merge service contains no customer-note UPDATE or DELETE. Dedicated tests prove alias note rows remain present and retain their original `customer_id`.

## 17. Profile-mutation safeguard

`CustomerRepository.updateProfile` now locks the target customer row before mutation. If it is an alias, it rejects with typed `CUSTOMER_ALIAS_MUTATION_FORBIDDEN`; the action returns the Turkish message `Birleştirilmiş müşteri kaydı doğrudan düzenlenemez.` No edit UI redesign was introduced.

## 18. Concurrency result

Two concurrent overlapping requests selecting different canonicals for the same three-customer group produce exactly one committed root family. The loser receives only `CUSTOMER_MERGE_STALE` or `CUSTOMER_MERGE_CONFLICT`; no SQLSTATE, constraint name, SQL, or stack trace is returned. Final state contains one root and direct one-hop aliases.

The expanded parallel auth suite also exposed an existing Drizzle wrapped-error edge case in staff provisioning. The existing `23505 -> STAFF_ALREADY_EXISTS` mapping now checks both the outer error and `cause`, preserving intended staff-provisioning concurrency behavior without changing its domain rules.

## 19. Database integrity tests

Dedicated `tests/database/customer-merge-schema.test.mjs` covers:

1. cross-business merge target rejection;
2. cross-business merge author rejection;
3. self-merge rejection;
4. valid same-business alias acceptance;
5. canonical deletion restriction;
6. merge-author deletion restriction;
7. upgrade backfill without automatic merge;
8. duplicate comparison keys allowed;
9. merge target defaults NULL;
10. merge timestamp defaults NULL;
11. merge author defaults NULL;
12. direct multi-hop and cycle rejection.

Final database suite: 28/28 tests passed across 6 suites.

## 20. Domain tests

Dedicated `tests/auth/customer-merge.test.ts` has 24 passing tests covering all requested authorization, eligibility, complete-group, root/alias, timestamp/author, appointment, customer-row, note, flattening, one-hop, cycle, concurrency, safe-error, and alias-edit cases.

Final full auth suite: 627/627 tests passed across 106 suites.

## 21. Migration upgrade and fresh verification

### Existing database upgrade

- Pre-upgrade customer count: 5.
- Migration applied transactionally to the active existing database: success (17 statements).
- Post-upgrade customer count: 5.
- Rows with NULL comparison key: 0.
- Rows with non-NULL merge target: 0.
- Result: no customer deletion and no automatic merge.

### Empty database / full history

- Migrations `0000` through `0013` applied in filename order to fresh embedded PostgreSQL instances.
- Fresh result: success.
- The dedicated upgrade test separately applies through `0012`, seeds four pre-existing customer rows, applies `0013`, confirms the count remains four, all keys are backfilled, and every merge target remains NULL.

## 22. Regression results

Customer directory, detail, notes, profile editing, duplicate review, manual booking, public specific-staff booking, public `Fark Etmez` booking, staff provisioning, and platform provisioning remain covered by the passing full auth/build suites. No merge UI, canonical aggregation, alias-aware search, booking canonical resolution, route redirect, appointment reassignment, note reassignment, or customer deletion was added.

## 23. Exact verification results

- `pnpm auth:test`: exit 0; 627 tests, 106 suites, 627 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; 13267.311046 ms.
- `pnpm db:test`: exit 0; 28 tests, 6 suites, 28 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; 2425.832497 ms.
- `pnpm lint`: exit 0; 0 errors, 20 pre-existing warnings, no warnings in task-added files.
- `pnpm typecheck`: exit 0; `tsc --noEmit` completed with 0 errors.
- `pnpm build`: exit 0; Next.js 16.3.8 Turbopack compiled successfully in 737 ms, TypeScript completed in 4.0 s, and 23/23 static pages generated. Existing middleware deprecation warning remains.
- `pnpm qa:bootstrap`: exit 0; QA bootstrap completed and configured SUPER_ADMIN, OWNER, ADMIN, and STAFF accounts.

## 24. Files changed

- Documentation: `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DATABASE.md`.
- Migration: `drizzle/migrations/0013_customer_logical_merge_foundation.sql`, `drizzle/migrations/meta/0013_snapshot.json`, `drizzle/migrations/meta/_journal.json`.
- Schema/domain: `src/db/schema/customers.ts`, `src/lib/customer-domain-errors.ts`, `src/repositories/customer-merge.repository.ts`, `src/services/customer-merge.service.ts`.
- Customer paths: `src/actions/customer.actions.ts`, `src/repositories/customer.repository.ts`, `src/repositories/appointment.repository.ts`, `src/services/qa-bootstrap.service.ts`.
- Regression hardening: `src/services/staff-provisioning.service.ts`.
- Tests/tooling: `tests/auth/customer-merge.test.ts`, `tests/database/customer-merge-schema.test.mjs`, `tests/database/db.mjs`, `package.json`.
- Report: `docs/task-reports/TASK_013C.2A_REPORT.md`.

Existing unrelated untracked root reports and helper scripts were not modified.

## 25. Remaining limitations

- No merge UI or duplicate-review merge control exists.
- Directory, detail, notes, and appointment history are not yet aggregated across aliases.
- Public/manual booking and customer search do not yet resolve aliases to canonical customers.
- Alias routes do not redirect to canonical routes.
- Existing valid lineage is retained, but no standalone merge audit-log table exists beyond current target/timestamp/author metadata.
- Complete-group discovery currently scans tenant customer merge state inside the transaction; the new indexes support the future targeted canonical-resolution queries.

## 26. Recommendation for TASK 013C.2B

Implement a single reusable canonical-resolution primitive first, then make CRM directory/detail/history/note reads family-aware using the canonical root plus direct aliases. Keep public/manual booking mutation behavior and merge UI out of that first read-aggregation step unless TASK 013C.2B explicitly includes them. Preserve the one-hop invariant and never rewrite historical appointment or note foreign keys.

READY FOR TASK 013C.2B — CANONICAL RESOLUTION & CRM AGGREGATION
