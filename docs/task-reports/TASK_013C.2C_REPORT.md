# TASK 013C.2C — Customer Merge UX & End-to-End Hardening

## 1. Pre-implementation audit

- Read `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DATABASE.md`, `DESIGN.md`, `UX_RULES.md`, `DEVELOPMENT_RULES.md`, and the TASK 013C.1/013C.2A/013C.2B reports.
- Read the installed Next.js 16.3.8 Server Actions, Forms, and Redirecting guides before changing route/action behavior.
- Audited the duplicate page, merge action/service/repository, canonical resolver/family repository, directory/detail/notes queries, domain errors, responsive CRM layout, Base UI alert-dialog implementation, Playwright availability, and embedded PostgreSQL lifecycle.
- Starting branch: `task-013c2-safe-customer-merge`.
- Starting log: `7b62020 feat: add logical customer merge domain foundation`, followed by `0ee4dc0 baseline: BarberCraft through TASK 013B.1`.
- The user stated TASK 013C.2B was committed, but the starting `git status --short` showed its implementation and report as uncommitted changes/untracked files. Those authoritative 013C.2B changes were preserved and extended; unrelated legacy root-level untracked reports/scripts were not modified.
- No schema change, migration, or new index was required for 013C.2C.

## 2. Merge action contract audit

`mergeCustomersAction` remains a thin, server-only boundary:

- `requireSession()` authenticates on the server.
- `CustomerMergeService` derives the business from the selected canonical customer and reloads the actor's active tenant membership.
- Only active `OWNER`/`ADMIN` membership is accepted; `STAFF`, unauthenticated, cross-tenant, and platform-only administrators are denied.
- No browser-supplied `businessId` is accepted.
- Canonical and selected IDs are treated as references only. The complete comparison-key group is reloaded before and after deterministic row locks inside the serializable transaction.
- Stale/ineligible/corrupt/concurrent state produces typed domain results.
- The action now returns only the canonical customer ID to the browser, revalidates duplicate review, directory, and canonical detail, and never returns alias IDs, merge author IDs, SQLSTATE, constraint names, stack traces, or raw database errors.

## 3. Duplicate review UX

- `/dashboard/customers/duplicates` now exposes a deliberate management workflow while preserving the existing candidate grouping and tenant authorization.
- Each record shows name, displayed phone, total appointments, last appointment, creation date, confidence, reason, and a profile-inspection link.
- Raw UUIDs, normalized-phone internals, comparison keys, and merge lineage are not rendered.
- The original read-only/deferred copy was replaced with concise safety copy explaining that no automatic merge occurs and historical data is retained.
- Visual QA uncovered and fixed a pre-existing duplicate-card aggregate correlation defect. Candidate metrics now aggregate each candidate's own logical family instead of the entire duplicate group. Dedicated coverage proves three independent candidates with one appointment each display `[1, 1, 1]`.
- Note counts were intentionally not added; avoiding another aggregate kept the review focused and avoided unnecessary query cost.

## 4. Canonical selection UX

- `Kayıtları Birleştir` is an outlined, secondary/high-impact entry action; it never performs a merge directly.
- Review mode requires an explicit native radio selection labeled `Birincil Müşteri`.
- No candidate is preselected and no age/activity heuristic overrides the operator.
- Every selectable card repeats the decision context: name, phone, appointment count, last appointment, and creation date.
- The integration scenario deliberately selects the newest candidate, proving explicit operator choice wins.

## 5. Confirmation UX

- `Birleştirmeyi Gözden Geçir` opens a Base UI `AlertDialog`, not `window.confirm()`.
- The dialog repeats the selected primary customer and concise consequences.
- Primary action: `Müşterileri Birleştir`; cancel: `Vazgeç`.
- The pending state shows `Birleştiriliyor...`, sets `aria-busy`, disables cancel/confirmation/conflicting selection controls, and blocks double interaction.
- Consequence copy states that the canonical profile remains authoritative, aliases are retained, appointments are not rewritten, notes are not moved, family history is aggregated, future matching bookings resolve canonical, aliases leave normal directory results, and V1 has no unmerge.

## 6. Stale/conflict handling

The client maps all required typed results to safe Turkish feedback:

- `CUSTOMER_MERGE_NOT_ELIGIBLE`
- `CUSTOMER_MERGE_STALE`
- `CUSTOMER_MERGE_CONFLICT`
- `CUSTOMER_NOT_FOUND`
- `FORBIDDEN`

Stale/concurrent outcomes close confirmation, clear the old canonical selection, display inline `role="alert"` feedback, and refresh current server truth. The client never retries automatically. Unexpected failures receive the same sanitized operational treatment.

## 7. Success flow

- Success revalidates `/dashboard/customers`, `/dashboard/customers/duplicates`, and the selected canonical detail route.
- The client navigates to `/dashboard/customers/[canonicalCustomerId]?merged=1`.
- Canonical detail renders the restrained status message `Müşteri kayıtları birleştirildi.`.
- The completed family is therefore not left visible as a stale candidate group.

## 8. Merged lineage UI

- Canonical detail now renders `Birleştirilen Kayıtlar` only when direct aliases exist.
- A single tenant-scoped query returns previous name, previous phone, merge timestamp, and optional merge-author display name for all aliases; no query runs per alias.
- Raw customer IDs and comparison keys are absent from the UI DTO and presentation.
- Canonical profile fields remain the only editable identity fields.

## 9. Authorization and privacy

- OWNER: duplicate review, merge, and lineage allowed.
- ADMIN: same tenant-scoped authority.
- STAFF: duplicate route/action/detail/lineage denied; purpose-limited canonical booking search remains unchanged and contains no lineage/notes.
- Platform-only admin: no tenant merge authority.
- Public: no CRM search, duplicate, merge, or lineage data.
- The action UI gate is convenience only; the service remains the authoritative authorization boundary.

## 10. Accessibility

- Canonical options are native radio inputs with associated full-card labels and visible focus-ring styling.
- Playwright selected the canonical radio using keyboard focus + Space and asserted its checked state.
- Base UI AlertDialog supplies dialog semantics, focus trapping/restoration, scroll locking, and modal pointer isolation.
- Playwright asserted focus moved inside confirmation and that Escape closed it.
- Buttons have explicit Turkish text; there are no ambiguous icon-only merge controls.
- Pending state is communicated through text, disabled state, spinner, and `aria-busy`.
- Touch controls use 40–44px-class sizing consistent with the current responsive shell.

## 11. Appointment preservation

The end-to-end scenario snapshots appointment ID, original `customer_id`, and service-name snapshot for appointments on A/B/C before merge, then proves byte-for-value equality after merge. The appointment immutability trigger was not changed. Future appointments resolve canonical, but no historical appointment is rewritten.

## 12. Note preservation

Historical notes on A/B/C retain their original note IDs and `customer_id` values. They appear together through the family read. A new note submitted with stale alias A resolves and attaches to canonical B. No historical note is moved or deleted.

## 13. End-to-end merge test

`tests/auth/customer-merge-e2e.test.ts` exercises the real action/service/repository boundaries:

- A/B/C have eligible phone evidence, physical appointments, and physical notes.
- OWNER explicitly chooses B.
- B stays root; A and C point directly to B with timestamp and author.
- Directory returns B once with family metrics.
- Duplicate review removes the family.
- Detail and notes include A/B/C history.
- New note and future exact/equivalent booking behavior resolve B.
- Stale A/C detail and booking identities resolve B.
- Old appointment/note ownership and service snapshots remain unchanged.
- All three customer rows remain.

The dedicated file passed 7/7 tests. Full auth coverage passed with it included.

## 14. Explicit canonical-choice test

B is intentionally the newest candidate. Choosing B through the action results in B as the only root even though A is older. This proves the operator's explicit choice, not record age or activity, determines the canonical record.

## 15. Stale UI test

Admin completes a merge after another operator's candidate snapshot. Submission of the stale selection returns `CUSTOMER_MERGE_STALE` or the permitted typed conflict, exposes no database internals, leaves one coherent root, and performs no partial rewrite.

## 16. Double-submit test

Two rapid identical action submissions produce exactly one success and one typed stale/conflict result. Final state has one root, two direct aliases, no chain, no cycle, and no raw error leakage.

## 17. Overlapping merge stress result

Twenty-five iterations raced OWNER and ADMIN against the same three-customer group with different canonical choices. Exact result:

- iterations: 25
- coherent complete families: 25
- successful winners: 25
- typed safe losers: 25
- cycles: 0
- multi-hop chains: 0
- partial groups: 0
- lost appointments: 0
- lost notes: 0
- cross-tenant mutations/leaks: 0
- raw database errors returned to callers: 0

PostgreSQL may log expected serialization failures internally; the service maps them to safe typed conflicts.

## 18. Booking-vs-merge result

Five repeated booking/merge races passed:

- appointments persisted exactly once: 5/5;
- logical final family contained every appointment: 5/5;
- customer rows created beyond the original group: 0;
- post-creation `appointment.customer_id` rewrites: 0;
- raw caller-visible database errors: 0.

Serialization may place the new appointment on the pre-merge physical row or canonical row; family reads are correct in both permitted outcomes.

## 19. Note-vs-merge result

Five repeated note/merge races passed:

- notes persisted: 5/5;
- canonical family view contained every note: 5/5;
- lost notes: 0;
- cross-tenant writes: 0;
- raw caller-visible database errors: 0.

Depending on serialization, the note retains the pre-merge alias ID or attaches to the canonical ID; neither path physically reassigns an existing note.

## 20. Duplicate-review post-merge behavior

- A completed family disappears because the authoritative candidate query considers independent canonical roots only.
- Unrelated independent candidate groups remain.
- Candidate detection performs no mutation.
- The duplicate metric query now uses explicit SQL aliases for correct per-family counts/latest appointment and remains one set-based query.

## 21. Responsive QA

Playwright ran the real Owner login, candidate review, keyboard selection, confirmation, real merge action, redirect, success state, and lineage display.

Inspected widths: 390, 768, 1366, and 1920.

Mandatory artifacts:

1. `artifacts/TASK_013C.2C/01-mobile-390-duplicate-group.png`
2. `artifacts/TASK_013C.2C/02-mobile-390-canonical-selection.png`
3. `artifacts/TASK_013C.2C/03-mobile-390-confirmation-dialog.png`
4. `artifacts/TASK_013C.2C/04-mobile-390-canonical-detail.png`
5. `artifacts/TASK_013C.2C/05-desktop-1366-duplicate-group.png`
6. `artifacts/TASK_013C.2C/06-desktop-1366-canonical-selection.png`
7. `artifacts/TASK_013C.2C/07-desktop-1366-confirmation-dialog.png`
8. `artifacts/TASK_013C.2C/08-desktop-1366-canonical-detail.png`

Additional 768 and 1920 candidate screenshots are `09-tablet-768-duplicate-group.png` and `10-wide-1920-duplicate-group.png`. The reusable runner is `scripts/qa-customer-merge-visual.ts`; it never logs credentials.

## 22. Impeccable/manual design audit

Impeccable is not available in this Codex environment; no tool use was fabricated. A focused manual critique was completed against all ten screenshots:

- group rows are scan-friendly and retain consistent metrics;
- merge entry is visually secondary but clearly high-impact;
- canonical selected/unselected states are unambiguous without preselection;
- consequence copy is concise, grouped, and repeated at final confirmation;
- destructive/high-impact hierarchy is reserved for the final action;
- modal ergonomics and mobile width remain readable;
- lineage is restrained, absent when empty, and does not compete with canonical profile controls.

The audit directly led to removal of internal comparison/normalized-phone UI, explicit context labels, compact consequence copy, mobile full-width actions, and the duplicate metric correlation fix.

## 23. Test-port flakiness audit and fix

- `tests/database/db.mjs` previously chose a random port and 20 legacy suites overrode it with fixed 544xx ports, creating stale-process/bind collisions.
- `startDatabase()` now asks the operating system for an available loopback port using `net.createServer().listen(0)`.
- All fixed numeric port overrides in auth fixtures were removed; special migration options remain supported.
- The final full auth and DB commands passed on the first final run with dynamically allocated ports; no manual retry was needed for a bind collision.
- This is localized to test infrastructure; production database configuration is untouched.

## 24. Regression matrix

Full auth/database suites cover and passed:

1. public specific-staff booking;
2. public `Fark Etmez` booking and concurrency;
3. manual existing-customer booking;
4. manual new-customer booking;
5. reschedule;
6. reassignment;
7. canonical customer directory;
8. family customer detail;
9. profile editing/alias rejection;
10. family notes CRUD;
11. purpose-limited STAFF search;
12. duplicate detection and corrected candidate metrics;
13. merge domain tests;
14. canonicalization/parity tests;
15. staff provisioning;
16. platform provisioning;
17. business suspension semantics;
18. onboarding;
19. Turkish presentation;
20. DB tenant/merge integrity.

## 25. Exact auth test result

Final `pnpm auth:test`:

- exit code: 0
- tests: 669
- suites: 114
- passed: 669
- failed: 0
- cancelled: 0
- skipped: 0
- todo: 0
- duration: 14468.542821 ms

## 26. Exact DB test result

Final `pnpm db:test`:

- exit code: 0
- tests: 28
- suites: 6
- passed: 28
- failed/cancelled/skipped/todo: 0
- duration: 1392.419061 ms

## 27. Lint, typecheck, and build result

- `pnpm lint`: exit 0; 0 errors, 20 pre-existing warnings. No warning originates in the new merge workflow, visual QA runner, or end-to-end test.
- `pnpm typecheck`: exit 0; `tsc --noEmit` completed with 0 errors.
- `pnpm build`: exit 0; Next.js 16.3.8 Turbopack compiled in 383 ms, TypeScript completed in 1773 ms, and 23/23 static pages generated in 256 ms.
- The existing Next.js `middleware` to `proxy` deprecation warning remains outside this task.

## 28. `qa:bootstrap` result

Final `pnpm qa:bootstrap`: exit 0. SUPER_ADMIN, OWNER, ADMIN, and STAFF QA identities were configured idempotently; passwords/secrets were not printed.

## 29. `git diff --check`

`git diff --check`: exit 0; no whitespace errors.

## 30. Files changed

Direct TASK 013C.2C implementation/report/artifacts:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `src/actions/customer.actions.ts`
- `src/repositories/customer.repository.ts`
- `src/app/(dashboard)/dashboard/customers/duplicates/page.tsx`
- `src/app/(dashboard)/dashboard/customers/duplicates/duplicate-merge-workflow.tsx`
- `src/app/(dashboard)/dashboard/customers/[customerId]/page.tsx`
- `tests/auth/customer-merge.test.ts`
- `tests/auth/customer-merge-e2e.test.ts`
- `scripts/qa-customer-merge-visual.ts`
- `docs/task-reports/TASK_013C.2C_REPORT.md`
- `docs/task-reports/artifacts/TASK_013C.2C/*.png` (10 screenshots)

Localized test-port hardening:

- `tests/database/db.mjs`
- `tests/auth/any-staff-availability.test.ts`
- `tests/auth/any-staff-public-flow.test.ts`
- `tests/auth/appointment-creation.test.ts`
- `tests/auth/availability-engine-hardening.test.ts`
- `tests/auth/availability-engine.test.ts`
- `tests/auth/better-auth-http-routing.test.ts`
- `tests/auth/business-hours.test.ts`
- `tests/auth/customer-crm-ops.test.ts`
- `tests/auth/customer-crm.test.ts`
- `tests/auth/first-service.test.ts`
- `tests/auth/onboarding-state.test.ts`
- `tests/auth/owner-staff.test.ts`
- `tests/auth/platform-admin.test.ts`
- `tests/auth/platform-business-management.test.ts`
- `tests/auth/public-booking.test.ts`
- `tests/auth/public-schedule.test.ts`
- `tests/auth/service-management.test.ts`
- `tests/auth/staff-services.test.ts`
- `tests/auth/staff-time-blocks.test.ts`
- `tests/auth/staff-working-hours.test.ts`

The working tree also still contains the pre-existing uncommitted TASK 013C.2B files and unrelated root-level untracked legacy files present before this task. They were preserved and not attributed to 013C.2C.

## 31. Remaining limitations

- V1 has no unmerge/reverse-lineage operation by design.
- Visual QA creates retained QA customer families; it never deletes test customer rows. A failed visual run can therefore leave an advisory QA candidate, but it cannot affect production and is visible for manual cleanup through the same explicit workflow.
- Existing lint warnings and the Next.js middleware deprecation are legacy issues outside TASK 013.
- The repository should reconcile/commit the pre-existing TASK 013C.2B working-tree changes together with the intended task history before starting another large phase.

## 32. Final TASK 013 status

The CRM now has tenant-safe customer identity, manual/public canonical booking, family-aware directory/detail/notes, explicit logical merge UX, retained management lineage, safe stale/concurrency behavior, responsive evidence, and end-to-end preservation tests. No customer, historical appointment relationship, service snapshot, or historical note relationship is physically rewritten by merge.

## 33. Recommendation for the next product phase

Close TASK 013 as a stable CRM foundation. The next product phase should be selected independently from notifications, loyalty, billing, marketing, or customer accounts; no such feature was started here. Before new scope, commit the accumulated 013C.2B/013C.2C changes and preserve the merge stress/race suites as release gates.

TASK 013 COMPLETE — CUSTOMER CRM FOUNDATION FINALIZED
