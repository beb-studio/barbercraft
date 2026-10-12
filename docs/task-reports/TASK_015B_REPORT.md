# TASK 015B — Business Booking Policy Settings & UX

Date: 2026-10-12

Branch: `task-015-booking-policies`

Starting commit: `97d945c feat: add business booking policy foundation`

## 1. Pre-implementation audit

- There was no existing dashboard settings route. The dashboard used a single role-aware navigation model shared by the desktop sidebar, mobile drawer, breadcrumbs, and compact mobile bottom navigation.
- Existing business management mutations use server actions, authenticated membership guards, typed service outcomes, Turkish sanitized errors, and path revalidation.
- `businesses.updated_at` already existed and is maintained by the database update trigger. Its exact PostgreSQL text value was suitable as the smallest optimistic-concurrency token without adding schema.
- TASK 015A already owned the four columns, compatibility defaults, bounds, validation, public booking checks, cancellation/reschedule decisions, tenant policy loading, and business-timezone horizon calculations. No second policy model or migration was needed.
- Public availability was already authoritative and filtered by TASK 015A; public scheduling used business-local dates. Manual booking and internal rescheduling used separate internal paths.
- Public management already returned server-computed `canCancel` and `canReschedule`; it did not expose policy configuration or database identifiers.
- Onboarding did not need booking-policy input because compatibility defaults preserve the established behavior.
- The installed Next.js 16.3.8 mutation, revalidation, and data-security guidance under `node_modules/next/dist/docs/` was reviewed before adding the route and server action.

## 2. Settings route and navigation

- Added `/dashboard/settings/booking` with the Turkish title **Randevu Kuralları** and an explanation scoped to customers' online operations.
- Added **Ayarlar** to the shared OWNER/ADMIN navigation and breadcrumb model.
- STAFF does not receive the link. To avoid crowding the compact mobile bottom bar, the link is available in the mobile drawer and desktop sidebar but intentionally excluded from the bottom shortcuts.

## 3. Authorization

- Page reads require an authenticated active tenant membership with OWNER or ADMIN role.
- The mutation calls `requireSession`, derives the active business from the trusted server membership, and applies `requireAdminOrOwner`.
- The action accepts no `businessId`; forged tenant identifiers therefore cannot select a mutation target.
- STAFF, unauthenticated callers, and platform-only administrators without tenant membership are denied. Cross-tenant mutation is prevented by trusted membership derivation.

## 4. Settings form architecture

- The server page loads committed policy plus its concurrency version and passes a minimal settings DTO to a client form.
- The client form owns only presentation state, pending state, accessible feedback, reset behavior, and a current-policy preview.
- Parsing, checked conversion, policy validation, authorization, concurrency, and persistence remain server-side.
- A successful response replaces the form with values read back from the committed database row; the UI does not depend on optimistic local truth.

## 5. Unit conversion model

- Added one shared presentation helper for `MINUTE`, `HOUR`, and `DAY` inputs.
- Inputs must be base-10, whole, non-negative integers. Decimal, signed, non-numeric, unsafe, overflowing, and out-of-bound values are rejected.
- Checked conversion uses multipliers 1, 60, and 1,440 before calling TASK 015A's authoritative `validateBusinessBookingPolicy`.
- Stored minutes render in the largest exact, lossless practical unit: exact days first; exact hours below one day; otherwise raw minutes. Thus 120 → 2 hours, 1,440 → 1 day, and 1,500 → 1,500 minutes with no rounding.

## 6. Compatibility/default display

- Zero lead is explained as customers being able to choose the first available time.
- Zero cancellation/reschedule notice is explicitly presented as **Randevu başlayana kadar**.
- Defaults remain 0 minutes / unlimited and therefore preserve the pre-TASK 015 public behavior.
- Existing non-divisible minute values round-trip exactly.

## 7. Unlimited horizon UX

- **Sınırsız** is an explicit accessible checkbox state.
- Selecting it persists `maximumAdvanceBookingDays = null`; no sentinel value such as 0, -1, or 9,999 is used.
- A finite selection uses an integer day field bounded by the TASK 015A maximum of 730 days.

## 8. Validation and error handling

- Invalid presentation payload or domain policy: **Girdiğiniz randevu kuralları geçerli değil.**
- Stale version: **Ayarlar başka bir kullanıcı tarafından güncellendi. Güncel değerleri kontrol edip tekrar deneyin.**
- Forbidden: **Bu ayarları değiştirme yetkiniz yok.**
- Unknown persistence failures use a generic Turkish conflict message. No SQLSTATE, constraint name, stack trace, Drizzle error, or raw tenant identifier is returned.
- Field groups expose associated labels/help text and invalid styling without relying on color alone.

## 9. Optimistic concurrency

- The exact `businesses.updated_at::text` value is the form version.
- The repository starts a transaction, locks the trusted business row with `FOR UPDATE`, compares the submitted version, and rejects stale writes before mutation.
- A stale result reloads and returns current server truth so the form can recover without silently overwriting another administrator's settings.
- Concurrency tests prove both OWNER and ADMIN stale writes are rejected and one of two concurrent updates wins coherently.

## 10. Atomic mutation

- All four policy columns are validated before persistence and updated in one database statement inside one transaction.
- The update set contains only the four policy fields. Unrelated business columns, appointments, tokens, customer/CRM data, and historical snapshots are untouched.
- Invalid input causes zero policy mutation.

## 11. Success UX

- Successful saves announce **Randevu kuralları güncellendi.** through a live status region.
- Controls are disabled while pending and the button communicates **Kaydediliyor...**.
- Committed values, summary, and concurrency version are refreshed from the server response.

## 12. Public booking policy UX

- Public scheduling now shows concise trusted guidance for configured lead time and finite business-local horizon.
- The date input receives the server-derived inclusive maximum local date. The date ribbon is clamped to that horizon instead of encouraging disallowed dates.
- Minimum-lead-disallowed slots remain absent because the availability service is authoritative; direct manipulated submissions remain blocked by TASK 015A.
- Unlimited horizon retains the existing extended-future behavior. Specific-staff and **Fark Etmez** flows continue to use the same server policy and scheduling engine.

## 13. Public cancellation policy UX

- The secure `/randevu` DTO now provides only a safe presentation boolean indicating that an otherwise-operational appointment's positive cancellation notice window has closed.
- When appropriate, the page explains: **Çevrim içi iptal süresi doldu. İşletmeyle iletişime geçebilirsiniz.**
- Read access remains available, and the server remains authoritative at mutation time.

## 14. Public reschedule policy UX

- The same minimal presentation approach explains an elapsed reschedule window without exposing minute configuration or internal policy codes.
- The DTO includes the server-derived maximum reschedule local date so the public date control and date ribbon respect the current business-local horizon.
- Existing capability authorization, fixed staff/service behavior, target-slot lead/horizon validation, and transactional revalidation are unchanged.

## 15. Internal scheduling exemption

- Manual/internal booking and internal staff rescheduling were not wired to customer-facing lead, horizon, or notice fields.
- Settings copy consistently describes **müşterilerin çevrim içi işlemleri**, avoiding any implication that staff operations are restricted.

## 16. Onboarding impact

- Onboarding was not changed. New businesses continue to receive TASK 015A compatibility defaults and can customize policy later from dashboard settings.

## 17. Accessibility

- Every amount and unit control has a visible associated label; help and semantic zero-state text are adjacent to the relevant group.
- Unit selects are keyboard-native. The unlimited checkbox exposes programmatic checked/disabled state.
- Date and slot choices expose `aria-pressed`, clear focus rings, and adequate touch targets.
- Save pending/disabled state prevents duplicate interaction. Success and error messages use live regions.
- Navigation and controls use explicit Turkish text; there are no ambiguous icon-only policy actions or color-only meanings.

## 18. Responsive QA

- Automated Playwright visual QA covered 390, 768, 1,366, and 1,920 pixel widths.
- Covered default compatibility values, configured finite values, unlimited horizon, validation error, save pending/success, stale update, public booking guidance, and management cutoff guidance.
- Artifacts are stored under `docs/task-reports/artifacts/TASK_015B/` (12 screenshots), including all mandatory 390 and 1,366 states plus tablet and wide-screen coverage.
- Manual inspection found no horizontal overflow, clipped controls, unreadable summary text, or mobile navigation crowding.

## 19. Design audit

- Impeccable was not available in this Codex environment, so a focused manual audit was performed.
- Amount/unit controls are grouped by business concept rather than exposed as raw storage fields.
- The policy summary is restrained and confirms operational meaning without duplicating the form.
- Unlimited horizon is explicit; zero-notice semantics are visible; ordinary settings actions are not styled as destructive.
- Public guidance is concise and does not leak scheduling internals. Stale recovery replaces the screen with current server truth before another save.

## 20. Dedicated tests

- Added `tests/auth/business-booking-policy-settings.test.ts` with 11 top-level tests covering authorization, trusted tenant selection, conversion/round-trip behavior, null/finite horizon persistence, validation atomicity, unrelated-data preservation, stale updates, concurrent writers, navigation/accessibility source contracts, and public management/booking policy presentation.
- Focused settings plus appointment-access run: 22 tests across 3 suites, 22 passed, 0 failed (3,207.4548 ms).
- The full auth suite additionally covers specific staff, **Fark Etmez**, public cancellation/rescheduling, internal operations, capability security, CRM canonicalization, onboarding, and Turkish presentation regressions.

## 21. Concurrency tests

- Stale OWNER update: rejected and refreshed with the winning committed policy.
- Stale ADMIN update: rejected and refreshed with the winning committed policy.
- Two simultaneous writes using one version: exactly one update succeeds and one returns `STALE`; no partial field combination and no raw database conflict is exposed.

## 22. Exact auth result

Command: `pnpm auth:test`

- Suites: 125
- Tests: 728
- Passed: 728
- Failed: 0
- Cancelled/skipped/todo: 0/0/0
- Duration: 15,217.085125 ms
- Exit: 0

## 23. Exact DB result

Command: `pnpm db:test`

- Suites: 8
- Tests: 38
- Passed: 38
- Failed: 0
- Cancelled/skipped/todo: 0/0/0
- Duration: 4,224.73345 ms
- Exit: 0

Expected PostgreSQL constraint errors printed by negative integrity cases were asserted by the tests and did not represent failures.

## 24. Lint, typecheck, build, and bootstrap

- `pnpm lint`: exit 0; 0 errors and 20 pre-existing warnings.
- `pnpm typecheck`: exit 0; `tsc --noEmit` passed.
- `pnpm build`: exit 0; Next.js 16.3.8 production build compiled, typechecked, generated 24/24 static pages, and included dynamic route `/dashboard/settings/booking`. The existing middleware-convention deprecation warning remains unrelated.
- `pnpm qa:bootstrap`: exit 0; deterministic QA data/accounts recreated without printing secrets.
- Visual command: `pnpm exec tsx scripts/qa-booking-policy-settings-visual.ts`; passed and restored the QA policy/cleaned the temporary appointment.

## 25. Git diff check

`git diff --check` passed with no whitespace errors. No commit was created and no unrelated legacy root file was staged or modified.

## 26. Files changed

Application/domain:

- `src/actions/business-booking-policy.actions.ts`
- `src/app/(dashboard)/dashboard/settings/booking/page.tsx`
- `src/app/(dashboard)/dashboard/settings/booking/booking-policy-settings-form.tsx`
- `src/app/(public)/randevu/appointment-management-client.tsx`
- `src/app/book/[slug]/schedule/page.tsx`
- `src/app/book/[slug]/schedule/schedule-flow.tsx`
- `src/components/layout/dashboard-shell.tsx`
- `src/lib/business-booking-policy-presentation.ts`
- `src/lib/business-booking-policy.ts`
- `src/repositories/business-booking-policy.repository.ts`
- `src/services/business-booking-policy.service.ts`
- `src/services/appointment-access.service.ts`

Tests/QA:

- `tests/auth/business-booking-policy-settings.test.ts`
- `tests/auth/appointment-access.test.ts`
- `scripts/qa-booking-policy-settings-visual.ts`
- `docs/task-reports/artifacts/TASK_015B/*` (12 screenshots)

Documentation/report:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `DESIGN.md`
- `UX_RULES.md`
- `docs/task-reports/TASK_015B_REPORT.md`

## 27. Remaining limitations

- V1 stores a single current tenant policy rather than historical policy snapshots; current policy intentionally governs future public actions on existing appointments.
- The active membership convention remains the repository's existing first-active-membership model; this task did not add a tenant switcher.
- There is no notification/reminder delivery, customer account, per-service policy, per-staff policy, or onboarding policy wizard.
- No schema migration was required because TASK 015A already delivered the authoritative fields and constraints.

## 28. Final TASK 015 status

The database/domain foundation from TASK 015A and the authorized, concurrent-safe settings/public UX from TASK 015B now form one complete booking-policy capability. Public booking, cancellation, and rescheduling reflect current tenant rules while internal scheduling remains exempt.

## 29. Recommendation for TASK 016

Build notification/reminder infrastructure as a separate consent-aware delivery domain. Consume the centralized current booking policy and capability issuance services; do not duplicate cutoff arithmetic in channel workers. Begin with durable notification jobs, idempotency, tenant-local scheduling, secret-safe templates, and explicit SMS/email/WhatsApp provider boundaries before adding user-facing preferences.

TASK 015 COMPLETE — BUSINESS BOOKING POLICY CONTROLS FINALIZED
