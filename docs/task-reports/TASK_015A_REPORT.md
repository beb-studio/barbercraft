# TASK 015A — Booking Policy Foundation

## 1. Pre-implementation audit

- Read the authoritative product, architecture, business-rule, database, design, UX, and development documents plus TASK 014A/014B/014C reports.
- Starting branch was the expected `task-015-booking-policies` at `fa7a449 merge: complete TASK 014 public appointment self-service`. The tracked worktree was clean; pre-existing untracked legacy root files were not modified or staged.
- Read the installed Next.js 16.3.8 Server Component and server data-fetching guidance before touching the internal reschedule Server Component.
- Public specific-staff and `Fark Etmez` finalization already converged on `AppointmentService`, staff row locks, transactional availability revalidation, canonical customer resolution, appointment insertion, and capability issuance.
- The shared availability engine already accepted an explicit `PUBLIC | INTERNAL` context. Manual booking used `INTERNAL`; two internal reschedule reads/writes still relied on the default and were made explicit to prevent policy bleed.
- Public cancellation/rescheduling lived in `AppointmentAccessService`, using capability hash resolution plus staff → appointment → token locking. Their presentation booleans and mutation decisions were centralized in `appointment-lifecycle.ts` but previously used only the start instant.
- Business-local date conversion was already centralized in `timezone.ts`. Public booking previously had no server-side maximum horizon; the 14-day UI ribbon was only a convenience and an extended date remained available.
- Business suspension/onboarding remained a separate public-entry eligibility gate. Management read and cancellation behavior were preserved; rescheduling still requires current public scheduling eligibility.

## 2. Schema architecture decision

The policy belongs directly on `businesses`. These four values are tenant-owned scalar configuration, have the same lifecycle as the business, and are needed whenever public scheduling state is loaded. A dedicated one-row child table would add joins, missing-row states, and onboarding complexity without improving tenant integrity or ownership.

No new index was added: every policy read already resolves one business by its primary key or joins an already-selected business row, so indexing policy values would not support an actual query pattern.

## 3. Policy fields and defaults

- `minimum_booking_lead_minutes integer NOT NULL DEFAULT 0`
- `maximum_advance_booking_days integer NULL DEFAULT NULL`
- `cancellation_notice_minutes integer NOT NULL DEFAULT 0`
- `reschedule_notice_minutes integer NOT NULL DEFAULT 0`

Defaults preserve production behavior: no added lead, unlimited future calendar dates, and TASK 014's pre-start cancellation/reschedule behavior.

## 4. Validation bounds

`validateBusinessBookingPolicy` rejects non-integers, NaN, infinities, negative values, and unsafe/excessive ranges. Database checks mirror the domain:

- minute fields: `0..525600` (up to one year);
- maximum advance: `NULL` or `1..730` days.

Application policy consumers also parse persisted rows through the centralized validator and fail closed on corrupt state.

## 5. Centralized domain policy

`src/lib/business-booking-policy.ts` owns:

- the `BusinessBookingPolicy` representation;
- compatibility defaults and bounds;
- validation;
- `canPubliclyBookAt`;
- shared notice-window arithmetic.

`appointment-lifecycle.ts` remains the status authority and now consumes the appropriate tenant notice value rather than duplicating arithmetic.

## 6. Minimum booking lead semantics

New public targets must satisfy `requestedStart >= referenceNow + minimumBookingLeadMinutes`. The comparison uses exact instants and server time. The exact boundary is allowed. Public availability filters slots and final specific-staff/Any Staff booking transactions re-run the same shared engine, so a manipulated direct request cannot bypass the rule.

## 7. Maximum advance semantics

`NULL` means unlimited and preserves the previous server behavior. When populated, the service derives the business-local current date, adds the configured number of calendar days, and includes that final day. It compares the requested instant's business-local date, not the server/browser/UTC calendar date.

Example: a value of `30` permits appointments throughout the business-local date thirty days after the current business-local date and rejects the next local date.

## 8. Cancellation notice semantics

Public cancellation remains limited to `PENDING`/`CONFIRMED`. A positive policy permits cancellation when `now + notice <= start`; the exact configured cutoff is accepted. A zero value deliberately keeps TASK 014's strict `now < start` behavior, so the start instant itself is never cancellable.

The management DTO and locked mutation both use current persisted policy. A policy change after page render is therefore authoritative without modifying the appointment.

## 9. Reschedule notice semantics

Public rescheduling uses the independent `rescheduleNoticeMinutes` value with the same positive-window inclusive cutoff and zero-window strict pre-start behavior. Current public business/staff/service eligibility remains a separate mandatory gate.

Candidate target slots additionally pass current minimum-lead and maximum-advance rules through the shared public availability engine.

## 10. Timezone behavior

Lead and notice windows are absolute-instant arithmetic. Maximum advance is business-local calendar arithmetic. Dedicated tests cover Europe/Istanbul, a UTC/business-local midnight split, the inclusive final local day, and the first instant of the following local day. Browser-local timezone is never authoritative.

## 11. Public booking integration

`AvailabilityInputs` now carries trusted policy columns from `businesses`. `getStaffAvailability(context: "PUBLIC")` and Any Staff union availability filter generated slots through `canPubliclyBookAt`. Specific-staff and Any Staff appointment transactions call those same functions after deterministic staff locking, preserving conflict checks, canonical customer resolution, and capability issuance.

The public repository also carries policy fields with the trusted business row; no policy value is accepted from the browser.

## 12. Public cancellation integration

The capability management query joins current business policy. `AppointmentAccessService.cancel` reloads that row after staff/appointment/token locks and evaluates cancellation notice against mutation-time server truth. `toManagementView` uses the same row for `canCancel`. Token validity, non-oracular errors, status-only mutation, and post-cancellation readability are unchanged.

## 13. Public reschedule integration

Both capability availability and mutation use current policy. Notice applies to the current appointment; lead/horizon apply to candidate new slots. Mutation still locks staff → appointment → token, excludes the current appointment from conflicts, preserves snapshot duration, updates only schedule fields, and refreshes token expiry after a successful move.

## 14. Internal/manual scheduling distinction

Manual availability/creation remains `INTERNAL`. Internal reschedule action, Server Component, and transactional service calls now explicitly use `INTERNAL`, preventing public lead/horizon policy from restricting staff operations. Dedicated tests create and reschedule internal appointments outside configured public windows successfully.

## 15. Policy-change semantics

Policy is current configuration, not an appointment snapshot. Changing it writes only the business row. Existing appointments, service snapshots, access tokens, customers, and CRM history remain untouched; subsequent public management views and mutations use the newest committed values.

## 16. Migration

- Forward migration: `drizzle/migrations/0015_business_booking_policies.sql`.
- Existing upgrade from migration 0014: passed. Business rows before/after `1/1`; appointments `0/0`; access tokens `0/0`; existing business received `0 / NULL / 0 / 0`.
- Fresh full migration history: passed through the complete database suite and dedicated fresh-schema assertions.
- No appointment, token, customer, or history rows are manufactured or rewritten.
- Drizzle snapshot/journal and generated database types were updated.

The local QA database did not use the Drizzle journal and initially lacked 0015. The migration was applied directly from the checked-in SQL inside one transaction using the same `.env.qa.local` precedence as bootstrap; the final bootstrap then passed.

## 17. QA fixture changes

QA bootstrap now explicitly restores the compatibility policy values on both create and idempotent update. It prints no policy secrets (none exist) and preserves all established QA scheduling behavior.

## 18. Dedicated tests

`tests/auth/business-booking-policy.test.ts` passed 10/10 and covers validation, exact lead/cutoff boundaries, Istanbul midnight/local horizon behavior, public specific/Any Staff filtering, manipulated final booking rejection, unlimited mode, current-policy cancellation/reschedule revalidation, history preservation, and internal booking/reschedule exemption.

`tests/database/business-booking-policy-schema.test.mjs` passed 4/4 and covers compatibility defaults, valid bounds, negative/extreme rejection, fresh migration, and the 0014→0015 existing-database upgrade.

Existing TASK 014B/014C focused regression passed 26/26 alongside the new domain suite, and the full regressions cover specific staff, `Fark Etmez`, manual booking, capability security, logical customer merge/canonicalization, internal reschedule, provisioning, and tenant integrity.

## 19. Exact auth result

Final `pnpm auth:test`: PASS, exit 0 — 717 tests, 124 suites, 717 passed, 0 failed/cancelled/skipped/todo; duration 15435.570581 ms. No retry was needed for the final run.

## 20. Exact DB result

Final `pnpm db:test`: PASS, exit 0 — 38 tests, 8 suites, 38 passed, 0 failed/cancelled/skipped/todo; duration 3056.969625 ms. Fresh history and upgrade coverage both passed.

## 21. Lint, typecheck, build, and bootstrap

- `pnpm lint`: PASS, exit 0; 0 errors and 20 pre-existing warnings.
- `pnpm typecheck`: PASS, exit 0.
- `pnpm build`: PASS, exit 0; Next.js 16.3.8 production build completed, including dynamic `/randevu`. The existing middleware-to-proxy notice remains.
- Final `pnpm qa:bootstrap`: PASS, exit 0; deterministic QA business/accounts/policy defaults were refreshed without printing credentials.

## 22. Git diff check

Final `git diff --check`: PASS, exit 0.

## 23. Files changed

Authoritative documentation and report:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `docs/task-reports/TASK_015A_REPORT.md`

Schema, migration, and generated types:

- `src/db/schema/businesses.ts`
- `drizzle/migrations/0015_business_booking_policies.sql`
- `drizzle/migrations/meta/0015_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/types/database.types.ts`

Domain/repositories/services:

- `src/lib/business-booking-policy.ts`
- `src/lib/appointment-lifecycle.ts`
- `src/repositories/availability.repository.ts`
- `src/repositories/public-booking.repository.ts`
- `src/repositories/appointment-access.repository.ts`
- `src/services/availability.service.ts`
- `src/services/appointment-access.service.ts`
- `src/services/appointment.service.ts`
- `src/services/public-booking.service.ts`
- `src/services/qa-bootstrap.service.ts`
- `src/actions/appointment-reschedule.actions.ts`
- `src/app/(dashboard)/dashboard/appointments/[id]/reschedule/page.tsx`

Tests:

- `tests/auth/business-booking-policy.test.ts`
- `tests/auth/public-appointment-cancellation.test.ts`
- `tests/auth/public-appointment-reschedule.test.ts`
- `tests/database/business-booking-policy-schema.test.mjs`

Pre-existing untracked legacy root files were not edited or staged.

## 24. Remaining limitations

- TASK 015A intentionally provides no settings page or browser mutation action; fixtures/repositories can configure policy until TASK 015B.
- Policies are current state, not historical snapshots; this is the explicit V1 product decision.
- Maximum advance is nullable/unlimited by default. A tenant only gains a horizon after an authorized future settings mutation.
- The minute/day bounds are V1 product limits and should be presented consistently by TASK 015B.
- No notifications, reminders, SMS/email/WhatsApp delivery, customer accounts, billing, loyalty, or marketing were added.

## 25. Recommendation for TASK 015B

Add an OWNER/ADMIN-only tenant settings surface backed by `validateBusinessBookingPolicy`. Use explicit Turkish labels, unit-aware help text, a clear unlimited maximum-advance option, optimistic-form protection with server reload, and current-policy confirmation. Do not send tenant authority or trusted current values from the browser, and keep internal scheduling outside these public policy controls.

READY FOR TASK 015B — BUSINESS BOOKING POLICY SETTINGS & UX
