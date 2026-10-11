# TASK 014B — Secure Public Appointment Cancellation

## 1. Pre-implementation audit

- Read `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DATABASE.md`, `DESIGN.md`, `UX_RULES.md`, `DEVELOPMENT_RULES.md`, and the TASK 013C.2C/TASK 014A reports.
- Read the installed Next.js 16.3.8 data-mutation, Server Action, and data-security guidance before modifying the public management client or action boundary.
- Starting branch: `task-014-public-appointment-management`; starting commit: `3959aaa feat: add secure public appointment management access`.
- Starting tracked tree was clean. Pre-existing untracked legacy root reports/scripts were left untouched.
- Authenticated status mutation lives in `AppointmentService.updateAppointmentStatus`. It opens a transaction and locks the staff profile before the appointment row. Existing transitions were `PENDING -> CANCELLED` and `CONFIRMED -> COMPLETED | NO_SHOW | CANCELLED`.
- Authenticated rescheduling uses the same staff-then-appointment lock order, revalidates status/staleness/conflicts after locking, changes only mutable scheduling fields, and refreshes capability expiry.
- `PENDING` and `CONFIRMED` are the only availability-blocking statuses. `CANCELLED` was already excluded consistently from slot conflicts, workloads, and availability reads.
- Appointments already have `updated_at` and a nullable `cancellation_reason`; there is no dedicated cancellation timestamp/provenance. Internal cancellation has no external side effects. TASK 014B therefore does not add schema fields or a migration.
- The TASK 014A fragment transport, hash-only token lookup, private/no-store route, noindex/no-referrer headers, and non-oracular invalid state remain authoritative.

## 2. Public cancellation policy

`canPubliclyCancelAppointment` is the single V1 domain policy. It permits cancellation only when:

- status is `PENDING` or `CONFIRMED`; and
- server time is strictly before `start_time`.

At exactly the start instant or later, cancellation is denied. `CANCELLED`, `COMPLETED`, and `NO_SHOW` are denied with typed internal decisions. The browser receives only `canCancel`; it does not implement the policy.

The shared lifecycle module also centralizes existing internal status-transition and operational-status checks, replacing duplicated service predicates without expanding any transition.

## 3. Capability authorization

- `cancelAppointmentAccessAction` accepts only the raw capability value. It accepts no appointment, business, customer, staff, or tenant identifier from the browser.
- The service validates the exact TASK 014A token syntax, hashes it with SHA-256, and looks up only the hash.
- Missing, malformed, unknown, revoked, expired, cross-tenant, and unexpectedly inconsistent capability states collapse to `INVALID_CAPABILITY`.
- The public response never distinguishes those causes and never returns database identifiers or token metadata.

## 4. Cancellation service architecture

`AppointmentAccessService.cancel` owns the mutation. The repository provides tenant-scoped target lookup, staff/appointment/token row locks, and the status-only update. React contains no status mutation logic.

The service returns one of three typed results:

- `CANCELLED`, with the refreshed management DTO and whether this call changed the row;
- `NOT_CANCELLABLE`, with current safe management truth;
- `INVALID_CAPABILITY`, with no appointment data.

The action maps these outcomes to constrained Turkish result DTOs and catches unexpected failures without exposing SQLSTATE, constraints, stacks, UUIDs, or raw database messages.

## 5. Transaction and locking behavior

Cancellation runs in one PostgreSQL transaction:

1. hash and resolve the capability/appointment target;
2. validate initial capability activity;
3. lock the staff profile;
4. lock and re-read the appointment `FOR UPDATE`;
5. lock and revalidate the token `FOR UPDATE` after any wait;
6. take a fresh server timestamp and re-evaluate status/start-time eligibility;
7. set only `status = CANCELLED`;
8. read the resulting safe management view and commit.

Staff-before-appointment preserves the established booking/status/reschedule lock order. Token locking happens after the appointment so reschedule and cancellation cannot form an inverted appointment/token dependency. Capability revocation or expiry while waiting is revalidated before mutation.

## 6. Status-transition rules

Publicly allowed transitions are exactly:

- `PENDING -> CANCELLED`
- `CONFIRMED -> CANCELLED`

There is no generic public status endpoint. Public cancellation cannot change a completed, no-show, or already-cancelled row. It does not delete the appointment or change customer, staff, service, start/end, snapshot, note, or CRM data.

## 7. Idempotency

An active capability resolving an already-`CANCELLED` appointment returns the safe cancelled state with `changed: false`. The action reports the same successful Turkish outcome. It performs no second update and exposes no conflict internals.

This is deliberately limited idempotency: another ineligible final state such as `COMPLETED` or `NO_SHOW` returns `NOT_CANCELLABLE`, not success.

## 8. Internal status race behavior

Public cancellation and internal staff status mutation share staff/appointment row ordering. Dedicated races cover:

- cancellation versus `COMPLETED`;
- cancellation versus `NO_SHOW`;
- cancellation versus staff cancellation.

For COMPLETE/NO_SHOW, both operations begin eligible on a future appointment. The lock winner establishes the valid final status; the loser either observes `NOT_CANCELLABLE` or receives the existing typed transition rejection. Staff/public cancellation converges on one retained `CANCELLED` row. No impossible transition, partial write, duplicate effect, or caller-visible database error was observed.

## 9. Reschedule race behavior

Five cancellation-versus-reschedule iterations passed:

- if reschedule serialized first, public cancellation re-read the new future start and cancelled it;
- if cancellation serialized first, reschedule observed the non-operational status and did not resurrect it;
- every final row was `CANCELLED`;
- each start/end pair was internally coherent and represented either the original schedule or the fully committed new schedule.

Results: 5 coherent final states, 0 resurrected appointments, 0 partial reschedules, 0 lost appointments, and 0 caller-visible database internals.

## 10. Slot-release behavior

No slot or availability record is mutated manually. Changing the appointment to the already non-blocking `CANCELLED` status naturally releases capacity through existing queries. A dedicated test proves the slot is absent before cancellation, present afterward, and can then accept a normal replacement appointment.

## 11. Management DTO

`AppointmentManagementView` now adds only `canCancel: boolean`. It remains free of IDs, policy reason codes, token metadata, merge metadata, internal notes, CRM notes/history, and contact PII. `canCancel` is computed from trusted server appointment state and server time on every resolve/refresh; the mutation independently revalidates it under lock.

## 12. Cancellation UX

Eligible appointments show a restrained, destructive secondary action: `Randevuyu İptal Et`. It sits below the appointment summary and does not visually dominate status or appointment facts. Ineligible appointments render their normal localized status and no active cancellation control. No public reschedule or cancellation-reason UI exists.

## 13. Confirmation UX

The existing Base UI `AlertDialog` provides a deliberate second step:

- title: `Randevu iptal edilsin mi?`
- consequence copy: `Bu randevuyu iptal etmek istediğinizden emin misiniz?`
- destructive submit: `Randevuyu İptal Et`
- close action: `Vazgeç`
- pending state: `İptal Ediliyor...`

Pending disables both controls and prevents duplicate client interaction. No `window.confirm()` is used.

## 14. Success and ineligible UX

- Success stays on `/randevu`, replaces the management DTO with transaction truth, displays `Randevunuz iptal edildi.`, changes the status badge to `İptal Edildi`, and removes the cancel control.
- A mutation-time eligibility loss refreshes the page state and displays `Bu randevu artık iptal edilemiyor.`
- An invalid capability returns to the same non-oracular TASK 014A invalid-link surface.
- No internal race/state-machine detail is shown.

## 15. Token lifecycle after cancellation

Cancellation does not revoke or rewrite access tokens. The original token and a parallel active token both continue to resolve the same retained appointment as `CANCELLED` with `canCancel: false` until their normal end-time-plus-24-hour expiry. Explicit TASK 014A revocation remains a separate security primitive.

## 16. Security and privacy

- The fragment capability is captured once, immediately removed from address/history, and retained only in an in-memory React ref for the session.
- It is never placed in rendered text, local storage, analytics, logs, or a referrer-bearing URL.
- Server Function argument logging remains disabled, `/randevu` incoming request logging remains ignored, and the action never logs the raw token.
- Existing private/no-store, noindex, nofollow, noarchive, and no-referrer protections remain in force.
- The action accepts no authoritative IDs and returns only safe management fields.
- Cancellation changes no customer/profile/merge data, internal appointment note, historical customer note, or cancellation reason.

## 17. Accessibility

- The trigger and destructive confirmation controls have explicit Turkish text labels; no icon-only ambiguity exists.
- Base UI AlertDialog supplies alert-dialog semantics, focus containment/restoration, keyboard activation, and Escape handling.
- Playwright verified keyboard Enter opening, focus inside the dialog, and Escape dismissal.
- Visible focus styling was captured on mobile and desktop.
- Pending controls are disabled and the destructive button exposes `aria-busy`.
- Success uses `role=status` with polite live announcement; operational failure uses `role=alert` with assertive announcement.

## 18. Dedicated tests

`tests/auth/public-appointment-cancellation.test.ts` adds 12 integration/contract tests covering:

- centralized status/time policy, including exact-start denial;
- PENDING and CONFIRMED cancellation;
- malformed/unknown/expired/revoked generic behavior;
- tenant/capability binding;
- preservation of appointment row, customer/staff IDs, schedule, service snapshots, notes, CRM records, and active tokens;
- safe action DTOs and absence of raw database details;
- slot release and ordinary rebooking;
- 10-iteration idempotent double submission;
- staff COMPLETE, NO_SHOW, and cancellation races;
- 5-iteration reschedule race;
- accessible UX/no-reason/no-reschedule source contract.

Together with TASK 014A coverage, the focused command passed 23/23 tests across 5 suites in 2417.765756 ms.

## 19. Concurrency and stress results

- Double submit: 10/10 iterations ended with exactly one retained `CANCELLED` appointment; exactly one request performed the update and the other returned idempotent success.
- Cancel versus reschedule: 5/5 coherent `CANCELLED` final states.
- Cancel versus COMPLETE/NO_SHOW: 2/2 coherent serialized outcomes.
- Cancel versus staff cancel: 1/1 coherent `CANCELLED` row.
- Invalid lifecycle states: 0.
- Resurrected appointments: 0.
- Lost appointments: 0.
- Duplicate side effects: 0.
- Cross-tenant effects: 0.
- Caller-visible SQL/constraint/stack details: 0.

## 20. Responsive QA

Playwright exercised a real public booking, issued fragment capability, cancellable management view, keyboard dialog flow, pending state, successful cancellation, retained-token revisit, and invalid capability at 390, 768, 1366, and 1920 widths.

Required captures physically exist under `docs/task-reports/artifacts/TASK_014B/`:

- 390: cancellable, confirmation, pending, cancelled;
- 768: cancellable, cancelled;
- 1366: cancellable, confirmation, cancelled;
- 1920: cancellable, cancelled, invalid capability.

The reusable runner is `scripts/qa-public-cancellation-visual.ts`. It never prints the management path or token.

## 21. Design audit

Impeccable is not available in this Codex environment; no tool usage was fabricated. The manual focused audit found:

- the destructive action is visually secondary to appointment truth;
- the confirmation requires a separate deliberate action and clearly names its consequence;
- mobile controls meet full-width/touch ergonomics while desktop actions remain compact;
- pending and success states are visually and programmatically distinct;
- cancellation disappears after success and for ineligible statuses;
- no additional PII or bearer value is displayed;
- the existing summary hierarchy remains unchanged and readable.

## 22. Exact auth result

Final `pnpm auth:test`:

- exit code: 0
- tests: 692
- suites: 119
- passed: 692
- failed/cancelled/skipped/todo: 0/0/0/0
- duration: 15541.477165 ms

The final run required no retry and used dynamically allocated embedded PostgreSQL ports.

## 23. Exact DB result

Final `pnpm db:test`:

- exit code: 0
- tests: 34
- suites: 7
- passed: 34
- failed/cancelled/skipped/todo: 0/0/0/0
- duration: 2469.219204 ms

Appointment immutability, access-token integrity, logical merge constraints, and tenant constraints remain green.

## 24. Lint, typecheck, build, and bootstrap

- `pnpm lint`: exit 0; 0 errors and 20 existing warnings.
- `pnpm typecheck`: exit 0.
- `pnpm build`: exit 0; Next.js 16.3.8 production build succeeded, including dynamic `/randevu`. The existing middleware-to-proxy deprecation notice remains.
- `pnpm qa:bootstrap`: exit 0; QA data/accounts were created successfully without printing passwords.

## 25. Git diff check

`git diff --check`: exit 0.

## 26. Files changed

Authoritative documentation:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `docs/task-reports/TASK_014B_REPORT.md`
- `docs/task-reports/artifacts/TASK_014B/*`

Domain, repository, action, and UI:

- `src/lib/appointment-lifecycle.ts`
- `src/services/appointment.service.ts`
- `src/services/appointment-access.service.ts`
- `src/repositories/appointment-access.repository.ts`
- `src/actions/appointment-access.actions.ts`
- `src/app/(public)/randevu/appointment-management-client.tsx`

Tests and QA:

- `tests/auth/appointment-access.test.ts`
- `tests/auth/public-appointment-cancellation.test.ts`
- `scripts/qa-public-cancellation-visual.ts`

No schema/migration file was necessary. No unrelated legacy untracked root file was edited or staged.

## 27. Remaining limitations

- V1 has no public rescheduling; that remains TASK 014C.
- There is no cancellation-reason capture, dedicated cancellation timestamp/provenance, notification delivery, or customer account.
- There is no configurable business notice window; policy is deliberately centralized for a future extension.
- Idempotent success applies to a still-valid capability observing `CANCELLED`; expired/revoked links remain generically invalid.
- Multiple active appointment tokens intentionally remain valid independently until expiry or explicit revocation.

## 28. Recommendation for TASK 014C

Build public rescheduling on the same capability resolver and staff-then-appointment lock order. Reuse centralized operational-status policy, recompute availability from server truth, require explicit old-slot/new-slot confirmation, refresh all token expirations only inside the successful reschedule transaction, and preserve the guarantee that a cancelled appointment cannot be resurrected.

READY FOR TASK 014C — PUBLIC APPOINTMENT RESCHEDULING
