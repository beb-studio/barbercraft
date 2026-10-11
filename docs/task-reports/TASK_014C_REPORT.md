# TASK 014C — Secure Public Appointment Rescheduling

## 1. Pre-implementation audit

- Read `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DATABASE.md`, `DESIGN.md`, `UX_RULES.md`, `DEVELOPMENT_RULES.md`, and the TASK 013C.2C/TASK 014A/TASK 014B reports.
- Read the installed Next.js 16.3.8 mutation, Server Action, data-security, and form guidance before changing route/action code.
- Starting branch: `task-014-public-appointment-management`; starting commit: `5f3851f feat: add secure public appointment cancellation`; tracked worktree was clean. Pre-existing untracked legacy root reports/scripts were left untouched.
- Public management already captured the fragment capability once, removed it from address/history, held it only in an in-memory ref, and used hash-only server resolution. The route was private/no-store, noindex, and no-referrer.
- Internal `AppointmentService.rescheduleAppointment` already used one transaction with staff-profile then appointment row locking, stale `updatedAt` validation, operational-status validation, self-excluding availability, conflict checks, and access-token expiry refresh.
- Internal rescheduling changed `start_time`/`end_time`; the existing trigger manages `updated_at`. The appointment trigger forbids tenant/customer/staff/service identity mutation.
- The shared availability engine already enforced business/custom working hours, staff blocks, blocking appointments, business timezone conversion, booking intervals, and past-slot exclusion. `CANCELLED` remained the sole non-blocking status.
- Audit found one duration consistency gap: internal reschedule generated slots with the current catalog duration but calculated the new end with the appointment snapshot duration. The shared engine now accepts a trusted server-only duration override, and both internal and public rescheduling use `service_duration_snapshot` consistently.
- Public booking has no arbitrary upper booking horizon in the current authoritative implementation. The established UI convention is a 14-day quick ribbon plus an explicit future date input, while server validation accepts future dates allowed by the shared engine.

## 2. Public reschedule policy

`canPubliclyRescheduleAppointment` is the centralized V1 policy. It permits only `PENDING` or `CONFIRMED`, requires authoritative server time to be strictly before the current appointment start, and requires current public scheduling eligibility. `CANCELLED`, `COMPLETED`, `NO_SHOW`, exact-start, and past-start appointments fail closed. No configurable notice window was introduced.

## 3. Fixed staff/service decision

The service derives the concrete `staff_id` and `service_id` from the capability-bound appointment. The browser cannot submit either value. A booking originally created through `Fark Etmez` keeps the concrete staff chosen at booking time; Any Staff assignment is never rerun. Service identity and all service snapshots remain fixed.

## 4. Management DTO

`AppointmentManagementView` adds only presentation state required by the flow: `canReschedule`, appointment local date, and business-local today. It still exposes no appointment, business, customer, staff, or service ID; token metadata; CRM data; notes; or merge lineage. `canCancel` and `canReschedule` are display guidance only and are recomputed from fresh server truth.

## 5. Capability-authorized availability

`getAppointmentRescheduleAvailabilityAction(rawCapability, localDate)` accepts only the raw capability and a local date. The server validates syntax, hashes the capability, derives tenant/appointment/staff/service, checks expiry/revocation and policy, and returns minimal local start/end slot presentation. Malformed, unknown, expired, and revoked capabilities collapse to `INVALID_CAPABILITY`.

## 6. Availability-engine reuse

Availability delegates to the existing `getStaffAvailability` engine. It uses current business timezone and booking interval, effective business/custom staff hours, time blocks, other blocking appointments, present time, fixed assigned staff/service, and the appointment's booked duration snapshot. No second scheduling engine or slot table was created.

## 7. Current-appointment exclusion

Every lookup and mutation-time revalidation supplies `excludeAppointmentId`, so the appointment being moved cannot block itself. Other blocking appointments remain authoritative. The exact unchanged start is filtered from public slot results.

## 8. Transaction/locking

Public mutation runs in one PostgreSQL transaction. It resolves the hash-bound target, locks the staff profile, locks/re-reads the appointment, then locks/revalidates the capability. It rechecks capability activity, lifecycle, current public eligibility, exact server-derived slot availability, and snapshot duration before updating. This preserves the established staff → appointment → token lock hierarchy used by booking, cancellation, and internal rescheduling.

## 9. Mutable/immutable fields

A successful public reschedule writes only `start_time` and `end_time`; the existing database trigger updates `updated_at`. Tests prove unchanged business, customer, staff, service, status, source, name/duration/price snapshots, notes, and cancellation reason. New end time is always `new start + service_duration_snapshot`.

## 10. Token-expiry refresh

The existing centralized policy remains appointment end plus 24 hours. A successful mutation refreshes every token row for the appointment in the same transaction. Moving later extends expiry and moving earlier shortens it. No token is generated or revoked, and a pre-revoked token retains `revoked_at` and remains unusable.

## 11. Reschedule UX

Eligible `/randevu` views show `Randevu Saatini Değiştir` as the normal management action. Destructive cancellation remains separate. The flow stays within the appointment-management surface and retains the summary as its visual anchor.

## 12. Slot/date UX

The UI provides a 14-day horizontally scrollable Turkish date ribbon, an extended native date input, server-derived slot buttons, explicit selection state, and distinct loading/closed/no-slot states. It shows no staff or service selector and no raw UTC or database identifiers.

## 13. Confirmation UX

Selecting a slot reveals `Mevcut Randevu` versus `Yeni Randevu` with localized date/start/end. `Değişikliği Gözden Geçir` opens the Base UI alert dialog. Copy states that staff and service remain unchanged; explicit actions are `Randevuyu Değiştir` and `Vazgeç`, with `Randevu Değiştiriliyor...` pending state.

## 14. Success UX

Success remains on `/randevu`, replaces the summary with transaction truth, closes the picker/dialog, announces `Randevunuz güncellendi.`, and recomputes both action booleans. The same capability remains active.

## 15. Stale-slot handling

A selected slot taken before confirmation returns `Seçtiğiniz saat artık uygun değil. Lütfen başka bir saat seçin.` The old appointment schedule remains intact, no replacement is chosen automatically, and the current management truth and slot list are refreshed.

## 16. Lifecycle stale handling

If the appointment is cancelled, completed, no-show, or reaches its start while the UI is open, mutation returns `Bu randevu artık değiştirilemiyor.` and refreshes management truth. No mutation or resurrection occurs.

## 17. Business/staff/service eligibility

Current business active/onboarded state, active business membership, active/public-enabled staff profile, active assigned service, and a complete effective seven-day schedule are checked for both presentation and mutation. A change fails closed with `Bu randevu çevrim içi olarak değiştirilemiyor. Lütfen işletmeyle iletişime geçin.` Read access and otherwise-eligible cancellation remain available.

## 18. Cancel/reschedule interaction

Five repeated public-reschedule/cancel races ended in five coherent `CANCELLED` rows. When reschedule serialized first, cancellation used the moved start; when cancellation serialized first, reschedule observed terminal state. Results: 0 resurrection, 0 mixed intervals, 0 lost appointments, 0 caller-visible database details.

## 19. Reschedule/reschedule concurrency

- Ten identical double submissions produced exactly one `RESCHEDULED` plus one safe `UNCHANGED` per iteration.
- A separate two-token/different-target race serialized both valid writes; final state was exactly one complete target interval, and both tokens resolved the same final schedule.
- Results: 0 mixed start/end pairs, 0 token inconsistency, 0 lost appointment, 0 raw database leakage.

## 20. Booking/reschedule concurrency

Ten public-reschedule versus normal-booking races for the same target produced exactly one target-slot winner in every iteration. Results: 10 coherent winners, 0 double bookings, 0 lost appointments, 0 cross-tenant effects, 0 caller-visible database details.

## 21. Internal/public reschedule concurrency

Five public versus authenticated internal reschedule races finished at one complete public or internal target. Compatible staff/appointment locking prevented split intervals and double booking. Results: 5 coherent states, 0 mixed intervals, 0 lost appointments, 0 database-detail leakage.

## 22. Multiple-token behavior

Tests issued multiple active capabilities plus a revoked capability. Rescheduling through one active token refreshed all expiries and made every active token resolve the same new schedule; the revoked token stayed revoked. Both later and earlier moves were covered.

## 23. Availability before/after move

The shared engine reports the old slot available and the new slot blocked after a successful move. A subsequent cancellation through the same capability uses the new start, leaves the moved schedule as history, and releases capacity through the existing `CANCELLED` non-blocking rule.

## 24. Security/privacy

- Capability transport remains fragment-only; it is captured once, removed from browser history, and retained only in memory.
- Raw capability is never stored, logged, included in a path/query, analytics, referrer, screenshot name, report, or test snapshot.
- Server actions accept no authority-bearing entity IDs or duration and return sanitized Turkish outcomes.
- Management response and slots expose no CRM/customer notes, internal appointment notes, lineage, membership/private staff data, token metadata, or database IDs.
- Existing private/no-store, noindex, no-referrer route protections remain unchanged.

## 25. Accessibility

Date and slot buttons are keyboard-native and expose `aria-pressed`; selected state is visible; focus rings are explicit; slot/date/action targets meet at least 44px; dialogs receive focus and close on Escape/`Vazgeç`; pending actions use disabled plus `aria-busy`; success uses a polite live region and errors use assertive alert semantics. No ambiguous icon-only action was added.

## 26. Stress results

Executed 30 required repeated race iterations plus the distinct-target public/public case:

- 10/10 identical public double-submit coherent;
- 10/10 public reschedule versus normal booking had exactly one slot winner;
- 5/5 public reschedule versus cancellation coherent and non-resurrecting;
- 5/5 public versus internal reschedule coherent;
- 0 double bookings;
- 0 mixed schedules;
- 0 resurrected or lost appointments;
- 0 token inconsistencies;
- 0 tenant leakage;
- 0 caller-visible SQL/constraint/Drizzle/PostgreSQL internals.

## 27. Responsive QA

Playwright exercised a real public booking and capability, clean entry, slot loading/selection, keyboard dialog focus/Escape, stale-slot rejection and refresh, pending disabled state, successful mutation, and refreshed capability truth at 390, 768, 1366, and 1920 widths.

Fourteen physical captures exist under `docs/task-reports/artifacts/TASK_014C/`, including all mandatory 390 and 1366 entry/selection/review/success states, plus stale, pending, tablet, and wide states. Visual inspection found no clipping, horizontal page overflow, obscured actions, or unreadable localized content.

## 28. Design audit

Impeccable is not available in this Codex environment; no tool usage was fabricated. A focused manual audit verified management-action hierarchy, scannable date/slot choices, explicit old/new comparison, normal reschedule versus destructive cancellation distinction, compact mobile ergonomics, stale-slot recovery, and privacy. The 14-day ribbon plus native extended-date input follows the existing product convention without inventing an unlimited custom calendar.

## 29. Dedicated tests

`tests/auth/public-appointment-reschedule.test.ts` adds policy, capability, availability, immutable-field, token, stale-state, action-message, before/after availability, follow-up cancellation, privacy/accessibility source-contract, and concurrency coverage. Focused 014C plus access regression command passed 26/26 tests. Full auth regression also covers public cancellation, specific staff, `Fark Etmez`, manual booking, internal reschedule/status, canonical customer resolution, logical customer merge, appointment access security, provisioning, Turkish presentation, and tenant isolation.

## 30. Exact auth result

`pnpm auth:test`: PASS on the final run — 707 tests, 123 suites, 707 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; 14641.213896 ms. No retry was needed.

## 31. Exact DB result

`pnpm db:test`: PASS on the final run — 34 tests, 7 suites, 34 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; 2430.425991 ms. No migration was required for TASK 014C and appointment immutability/tenant integrity remained green.

## 32. Lint/typecheck/build/bootstrap

- `pnpm lint`: PASS, 0 errors and 20 existing unrelated warnings.
- `pnpm typecheck`: PASS (`tsc --noEmit`).
- `pnpm build`: PASS with Next.js 16.3.8/Turbopack; compilation, TypeScript, page data, and 23 static pages completed. Existing middleware deprecation notice remains.
- `pnpm qa:bootstrap`: PASS; deterministic QA roles/business were refreshed without exposing credentials.

## 33. Git diff check

`git diff --check`: PASS with no whitespace errors.

## 34. Files changed

Authoritative documentation:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `DESIGN.md`
- `UX_RULES.md`

Implementation:

- `src/lib/appointment-lifecycle.ts`
- `src/repositories/availability.repository.ts`
- `src/services/availability.service.ts`
- `src/services/appointment.service.ts`
- `src/repositories/appointment-access.repository.ts`
- `src/services/appointment-access.service.ts`
- `src/actions/appointment-access.actions.ts`
- `src/app/(public)/randevu/appointment-management-client.tsx`

Tests/QA/report:

- `tests/auth/public-appointment-reschedule.test.ts`
- `tests/auth/appointment-access.test.ts`
- `tests/auth/public-appointment-cancellation.test.ts`
- `scripts/qa-public-reschedule-visual.ts`
- `docs/task-reports/artifacts/TASK_014C/*` (14 PNG captures)
- `docs/task-reports/TASK_014C_REPORT.md`

No migration/schema file was added. Pre-existing untracked legacy root files were not modified, staged, or included.

## 35. Remaining limitations

- V1 has no staff/service switching, Any Staff reassignment, configurable notice window, cancellation reason, customer account, notification delivery, billing, loyalty, or marketing.
- Reschedule availability follows the current product rule of no arbitrary server-side upper booking horizon; the UI provides 14 quick dates plus an explicit future-date control.
- Capability possession remains bearer authority until expiry or explicit server revocation; customers must keep links private.
- Existing repository-wide lint warnings and the Next.js middleware deprecation notice are unrelated and remain.

## 36. Final TASK 014 status

TASK 014A secure capability access, TASK 014B public cancellation, and TASK 014C date/time-only rescheduling are implemented and verified as one accountless self-service phase. Historical/identity data remains immutable, capability security remains intact, and all competing scheduling paths use compatible locking and current server truth.

## 37. Recommendation for next product phase

Treat TASK 014 as a stable boundary. The next product phase should be selected explicitly from the roadmap; a sensible follow-up is trusted link delivery/reminder infrastructure and configurable business notice policies built on the existing issue/revoke/expiry primitives, with separate consent, privacy, retry, and audit requirements. Do not broaden rescheduling to staff/service changes without a new product and concurrency design.

TASK 014 COMPLETE — PUBLIC APPOINTMENT SELF-SERVICE FINALIZED
