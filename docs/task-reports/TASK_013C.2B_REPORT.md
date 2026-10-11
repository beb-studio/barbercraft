# TASK 013C.2B — Canonical Customer Resolution & CRM Family Aggregation

## 1. Pre-implementation audit

- `customers` already contained persisted `phone_comparison_key` and one-hop logical lineage from TASK 013C.2A. Canonical rows have NULL merge metadata; aliases retain their rows and point directly to a root.
- PostgreSQL already enforced same-tenant merge target/author foreign keys, self-merge protection, complete merge metadata, and deferred one-hop lineage.
- `appointments.customer_id` remained immutable through `prevent_appointment_column_change()` and `ON DELETE RESTRICT`.
- CRM directory, detail, appointment history, and notes were still scoped to one physical customer ID.
- Booking exact-phone resolution used `(business_id, normalized_phone)`, but its conflict update overwrote existing customer names/phones. Existing-ID manual booking trusted a tenant-scoped physical row without canonicalizing an alias.
- Purpose-limited booking search returned physical customer rows. Duplicate review grouped all physical rows, including merged aliases.
- Profile updates already rejected aliases but did not prevent a changed comparison key from overlapping another independent canonical family.
- Relevant Next.js 16.3.8 documentation was read before route work. The alias redirect uses `redirect()` during Server Component rendering, outside a catch block, as required by the installed version.

## 2. Phone-key parity result

TypeScript `customerPhoneComparisonKey(...)` and PostgreSQL `customer_phone_comparison_key(...)` returned identical values for all representative cases:

- `+905xxxxxxxxx`, `905xxxxxxxxx`, `05xxxxxxxxx`, and `5xxxxxxxxx`;
- `+1...` and generic international digits without `+`;
- spaces, parentheses, and hyphens;
- empty, whitespace-only, alphabetic, and no-digit input.

Automated parity coverage executes the application helper and live PostgreSQL function against the same matrix. No mismatch was found, so migration `0013` was not edited and no corrective migration was required.

## 3. Canonical resolution primitive

`resolveCanonicalCustomer(executor, businessId, customerId, options)` is the centralized server-only primitive:

- canonical ID resolves to itself;
- alias ID resolves to its direct canonical root;
- cross-tenant or missing ID returns no result;
- self-target, missing target, or target-that-is-an-alias fails with typed `CUSTOMER_LINEAGE_CONFLICT`;
- optional deterministic row locking supports booking/write transactions.

Callers no longer scatter `mergedIntoCustomerId ?? id` logic.

## 4. Customer family primitive

`getCustomerFamily(...)` first resolves the canonical customer, then loads only:

- the canonical row; and
- direct aliases where `(business_id, merged_into_customer_id) = (businessId, canonical.id)`.

It returns the canonical DTO and sorted family customer IDs. It neither loads every tenant customer nor recurses through lineage.

## 5. Exact-phone resolution

Booking resolution preserves the authoritative first rule: exact `(business_id, normalized_phone)` match.

- Exact canonical match returns the canonical row.
- Exact alias match resolves its root.
- Existing profiles are never overwritten by contact data entered during booking.
- Future appointment insert uses the resolved canonical ID.

## 6. Comparison-key fallback

Only when no exact normalized-phone row exists, booking evaluates the non-empty persisted comparison key.

- All matching rows resolving to one root return that root.
- A lone canonical row is an accepted one-family fallback.
- Multiple rows already belonging to one explicit merged family return that family root.
- Multiple independent roots throw typed `CUSTOMER_IDENTITY_AMBIGUOUS`.
- No fallback performs a merge or profile mutation.

The resolve/create decision is serialized with a transaction-scoped advisory lock keyed by business and comparison key. Existing matching customer rows and roots are then locked in lexical UUID order.

## 7. Ambiguity behavior

Ambiguous independent families are never selected arbitrarily and do not create another customer.

- Public booking returns: `Bu telefon numarasıyla birden fazla müşteri kaydı bulundu. Lütfen işletmeyle iletişime geçin.`
- Manual new-customer booking returns: `Bu telefon numarası birden fazla bağımsız müşteri kaydıyla eşleşiyor. Lütfen mevcut müşterilerden birini seçin.`

Both are deterministic, Turkish, and suppress SQL/constraint internals.

## 8. Public booking integration

Both public paths use the shared transactional resolver:

- specific staff;
- `Fark Etmez` / Any Staff.

Exact alias phones and unambiguous equivalent representations create new appointments against the canonical customer. Existing staff-profile locking, availability revalidation, workload selection, and rollback behavior remain intact. Historical appointments and alias profiles are not changed.

## 9. Manual booking integration

- `Yeni Müşteri` uses the same exact-phone then unambiguous-comparison fallback as public booking.
- A stale `Mevcut Müşteri` alias ID is reloaded and resolved inside the appointment transaction.
- The server does not trust the selected client identity as canonical.
- Appointment notes remain appointment notes and never overwrite CRM profile/note data.

## 10. STAFF purpose-limited search

Booking search now starts from canonical rows and matches identities through the canonical row or direct aliases. Alias name/phone matches return the canonical customer once.

The DTO remains limited to `id`, name, phone, appointment count, and last appointment date. STAFF receives no customer notes, merge target, comparison key, merge author/timestamp, or arbitrary appointment rows. CRM directory/detail authorization was not broadened.

## 11. Directory canonicalization

`/dashboard/customers` is authoritatively queried with `merged_into_customer_id IS NULL`. Aliases cannot appear as independent rows, and total counts/pagination count canonical roots rather than physical rows.

## 12. Directory family aggregates

Existing metrics are aggregated over canonical ID plus direct alias IDs:

- total appointment count;
- last past appointment;
- next non-cancelled/non-no-show appointment.

The data page and count query remain server-paginated. Each metric is computed in set-based SQL with no per-customer repository calls and no double counting.

## 13. Directory alias search

Directory search uses a tenant-scoped `EXISTS` family predicate. It matches canonical or alias:

- first name;
- last name;
- combined full name;
- displayed phone;
- normalized phone.

The canonical root appears once. Cross-tenant aliases cannot participate.

## 14. Detail/history aggregation

Detail lookup resolves an alias to the canonical profile. The Server Component redirects `/dashboard/customers/[aliasId]` to the canonical URL before rendering editable controls.

Stats and history use all family IDs. Appointment history remains newest-first and preserves every physical appointment row, original `customer_id`, status, source, and service name/duration/price snapshot. No appointment update was added.

## 15. Note aggregation

Canonical detail loads canonical and alias-origin notes in one family-scoped query ordered by `created_at DESC`. Each DTO preserves its original `customerId`, content, author, created time, and updated time. Historical note ownership is never moved.

## 16. Note mutations

- New notes resolve a stale alias ID under lock and insert against the canonical customer.
- Update/delete accepts the canonical detail context but constrains the target note to the canonical family IDs and business.
- OWNER/ADMIN can therefore manage alias-origin notes without navigating to an alias route.
- Cross-tenant note authority and STAFF denial remain unchanged.

## 17. Alias-route behavior

Authorized OWNER/ADMIN requests for an alias detail ID resolve and temporarily redirect to `/dashboard/customers/[canonicalId]`. Canonical requests do not redirect, so no loop is possible. Cross-tenant/missing IDs remain not-found; STAFF is redirected away before CRM data access.

## 18. Profile-edit behavior

- Direct alias mutation still returns `Birleştirilmiş müşteri kaydı doğrudan düzenlenemez.`
- Alias detail navigation redirects to canonical, so stale UI routes do not present alias fields as editable canonical data.
- Canonical name/phone editing remains supported.
- A changed normalized phone whose comparison key overlaps another independent family returns a typed safe ambiguity and does not auto-merge.
- An unchanged canonical phone remains editable even if legacy independent duplicates already exist.
- Comparison-key synchronization remains server/trigger maintained.

## 19. Duplicate-review behavior

Duplicate review remains read-only. Its query loads only canonical rows whose non-empty comparison key is shared by another independent canonical row.

- A fully merged family disappears.
- Merged aliases do not appear as members.
- Another independent canonical family sharing the evidence remains visible.
- Review performs no customer, appointment, or note mutation.

No merge controls, canonical selector, confirmation dialog, unmerge, delete, or physical reassignment UI was added.

## 20. Query/N+1 audit

- Directory: one paginated data query plus one canonical count query; family metrics are SQL subqueries, not repository loops.
- Booking search: one canonical query with alias `EXISTS` and family aggregates.
- Detail: targeted family lookup, one aggregate query, and one family history query; query count is constant regardless of alias count.
- Notes: one family note query, not one query per alias.
- Duplicate review: only eligible independent canonical candidate rows are loaded; it no longer scans every tenant customer into memory.

No path fetches every tenant customer for canonical resolution, runs an appointment query per directory row in application code, or runs a note query per alias.

## 21. Index audit

Existing TASK 013C.2A indexes match the new access paths:

- `(business_id, phone_comparison_key)` for booking fallback, ambiguity checks, profile conflicts, and duplicate candidates;
- `(business_id, merged_into_customer_id)` for family lookup and alias-aware `EXISTS` predicates;
- existing `(business_id, customer_id)` appointment and note indexes for family aggregates/history.

No new index was added because no uncovered query pattern justified one.

## 22. Concurrency results

The dedicated race test runs booking against one duplicate while an explicit merge of the same comparison group runs concurrently.

- Comparison rows are locked in deterministic UUID order.
- Booking and merge both commit coherently.
- Exactly one appointment persists.
- If booking serializes first, its original physical customer ID remains; if merge serializes first, the appointment uses the canonical ID.
- After merge, canonical family history contains the appointment in either serialization order.
- The appointment is not rewritten after creation and no raw database error reaches a caller.

## 23. Privacy audit

- Public booking performs identity resolution without exposing customer search or CRM data.
- STAFF search returns only the pre-existing minimal operational DTO, canonicalized once.
- STAFF remains denied directory, detail, notes, duplicate review, merge metadata, and arbitrary history.
- OWNER/ADMIN reads and note mutations remain tenant scoped.
- Platform-only administrators gain no tenant CRM authority.

## 24. Dedicated tests

`tests/auth/customer-canonicalization.test.ts` contains 35 passing tests across 7 suites. Grouped assertions cover the requested canonical resolver, parity, booking, directory, detail, notes, privacy, duplicate-review, profile, and concurrency matrix (#1–#57).

Regression expectations in `appointment-creation.test.ts` and `public-finalization.test.ts` were updated to the new authoritative rule that booking reuses identity without overwriting an existing CRM profile.

The pre-existing customer-note composite FK suite, TASK 013C.2A merge schema/domain suites, manual scheduling locks, Any Staff concurrency, staff provisioning, and platform provisioning all pass in the full runs.

## 25. Exact auth result

Final `pnpm auth:test`:

- exit code: 0;
- tests: 662;
- suites: 113;
- passed: 662;
- failed: 0;
- cancelled: 0;
- skipped: 0;
- todo: 0;
- duration: 13236.298427 ms.

One earlier verification attempt encountered a fixed-port bind collision in the pre-existing public-booking fixture. The affected suite then passed 35/35 in isolation, and the final full run above passed cleanly.

## 26. Exact DB result

Final `pnpm db:test`:

- exit code: 0;
- tests: 28;
- suites: 6;
- passed: 28;
- failed/cancelled/skipped/todo: 0;
- duration: 2279.919255 ms.

This applies the entire migration history to fresh embedded PostgreSQL and retains all TASK 013C.2A merge constraints. TASK 013C.2B required no migration.

## 27. Lint, typecheck, and build

- `pnpm lint`: exit 0; 0 errors and 20 pre-existing warnings; no warning in the new resolver/repository/test files.
- `pnpm typecheck`: exit 0; `tsc --noEmit` completed with 0 errors.
- `pnpm build`: exit 0; Next.js 16.3.8 Turbopack compiled successfully in 482 ms, TypeScript completed in 2.5 s, and 23/23 static pages generated in 247 ms. The existing middleware-to-proxy deprecation warning remains.

## 28. `qa:bootstrap`

`pnpm qa:bootstrap`: exit 0. QA bootstrap completed and configured SUPER_ADMIN, OWNER, ADMIN, and STAFF accounts without logging secrets.

## 29. Files changed

Documentation/report:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `docs/task-reports/TASK_013C.2B_REPORT.md`

Canonical resolution and repositories:

- `src/lib/customer-domain-errors.ts`
- `src/repositories/customer-resolution.repository.ts`
- `src/services/customer-resolution.service.ts`
- `src/repositories/customer.repository.ts`
- `src/repositories/appointment.repository.ts`

Booking/actions/routes:

- `src/services/appointment.service.ts`
- `src/services/public-booking.service.ts`
- `src/actions/manual-booking.actions.ts`
- `src/actions/customer.actions.ts`
- `src/app/(dashboard)/dashboard/customers/[customerId]/page.tsx`
- `src/app/(dashboard)/dashboard/customers/duplicates/page.tsx`

Tests:

- `tests/auth/customer-canonicalization.test.ts`
- `tests/auth/appointment-creation.test.ts`
- `tests/auth/public-finalization.test.ts`

Existing unrelated untracked root reports and helper scripts were not modified.

## 30. Remaining limitations

- No merge button, canonical selector, confirmation UI, merge-review controls, or unmerge exists.
- Duplicate review is intentionally advisory/read-only.
- Alias profiles remain retained historical identities and cannot be edited directly.
- Family semantics intentionally remain one-hop; corrupt external writes fail safely rather than being repaired by reads.
- Alias/name search uses tenant-scoped `ILIKE`; no speculative trigram index was added.
- Several legacy test fixtures use fixed embedded-PostgreSQL ports and can require a retry after a port collision; this did not affect the clean final full result.

## 31. Recommendation for TASK 013C.2C

Build merge UX only on the proven `CustomerMergeService` and the canonicalized reads/writes completed here. The duplicate page should reload the complete group immediately before confirmation, let OWNER/ADMIN explicitly select the canonical record, present non-destructive lineage/history implications in Turkish, handle stale/conflict outcomes, and redirect to the canonical detail after success. Keep unmerge, physical deletion, appointment rewriting, and historical note reassignment out of scope.

READY FOR TASK 013C.2C — MERGE UX & END-TO-END HARDENING
