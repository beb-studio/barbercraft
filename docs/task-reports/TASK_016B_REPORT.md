# TASK 016B — Reminder Scheduling & Business Notification Settings

## 1. Pre-implementation audit

TASK 016A outbox events use `PENDING`, `PROCESSING`, `PROCESSED`, and `FAILED` states, PostgreSQL `FOR UPDATE SKIP LOCKED` claims, five-minute ownership leases, bounded attempts, and ownership-checked completion/failure. Its payload version is `1`; creation retains event-time schedule/status facts, rescheduling retains old/new schedule facts, and cancellation retains the prior status and scheduled interval. Appointment events are emitted in the existing creation, internal/public reschedule, and internal/public cancellation transactions.

Customers remain accountless and tenant-scoped. Current recipient/contact identity is therefore deliberately deferred to a later delivery layer. TASK 015B established the dashboard-settings action/service/repository pattern, trusted first active membership, and `updated_at::text` optimistic version token. The existing settings navigation is desktop/sidebar-only for administrative settings and stays out of mobile bottom navigation.

## 2. Notification-settings schema

Added `business_notification_settings`, keyed one-to-one by `business_id`, with a tenant business FK, master customer-notification switch, independent created/rescheduled/cancelled event preferences, and timestamps. It is a separate domain from `businesses` because later channel/provider policy can grow without widening the core tenant table.

## 3. Reminder-rule schema

Added `business_notification_reminder_rules` with canonical `minutes_before`, enabled state, timestamps, `UNIQUE (business_id, minutes_before)`, and PostgreSQL bounds of 5 through 43,200 minutes. The service enforces the V1 maximum of three rules. Minutes are the only stored unit.

## 4. Compatibility defaults

Migration `0017_notification_planning.sql` backfills one settings record for every existing business: master OFF; immediate event preferences ON; no reminder rules; no plans. An `AFTER INSERT` business trigger provisions every future business, including non-UI/platform paths. QA bootstrap explicitly resets its tenant to those deterministic defaults.

## 5. Notification-plan schema

Added `notification_plans` with tenant-bound appointment/source-event references, plan type, scheduled instant, optional reminder offset, globally unique deterministic idempotency key, `PENDING`/`CANCELLED` state, cancellation time, and timestamps. This remains an intent ledger—not a provider attempt/delivery table.

## 6. Tenant integrity

Composite foreign keys bind `(business_id, appointment_id)` and, where present, `(business_id, source_outbox_id)` to same-tenant source rows. Cross-tenant plans are rejected. Settings and rules cascade only with their owning business; this preserves the pre-existing intended business-deletion behavior while retaining all appointment/outbox restrictions.

## 7. Plan idempotency

Immediate plans derive a SHA-256 key from the trusted outbox identity and event type. Reminder plans derive one from business, appointment, current start instant, and offset. `ON CONFLICT DO NOTHING` makes recovered claims/reconciliation repeats safe, while an actual reschedule obtains a new schedule identity and new reminder keys.

## 8. Recipient strategy

Neither outbox payloads nor plans store phone, email, WhatsApp identity, a customer snapshot, CRM data, notes, or provider credentials. TASK 016C delivery will resolve the then-authoritative recipient/channel instead.

## 9. Capability-secret safety

The planner never creates a management capability. Raw tokens and capability URLs are absent from outbox/plan rows, logs, fixtures, test snapshots, and the UI. A future delivery worker must issue any fresh link transiently immediately before provider delivery.

## 10. Planner architecture

`NotificationPlannerService.processClaimedEvent` runs server-only and, in one transaction, locks/validates the owned source event, settings, and appointment; checks payload version/current schedule truth; reconciles plans; and calls the existing ownership-checked `markProcessed`. `processPendingBatch` composes bounded outbox claiming with per-event planning and sanitized outbox retry failure handling. It starts no worker, timer, daemon, or provider request.

## 11. Crash/retry behavior

Plan writes and source-event completion are one transaction. A crash before completion rolls both back; a replay after a lease recovery is additionally protected by deterministic plan keys. Invalid payload/current-state errors become sanitized planner error codes; persistence failures remain retryable through TASK 016A’s lease/backoff model.

## 12. Created-event planning

For a current operational creation event, master ON plus the creation toggle produces one immediate `APPOINTMENT_CREATED` plan and only future reminder plans. Master OFF, a disabled creation preference, a non-operational appointment, stale payload schedule, or an already-passed reminder offset produces no such pending intent while consuming the valid outbox event.

## 13. Reschedule planning

A current operational reschedule first cancels pending old reminders and obsolete pending creation/reschedule intent. It then makes one latest `APPOINTMENT_RESCHEDULED` plan only when enabled and builds future reminders for current start time/rules. Old-schedule reminders cannot remain active.

## 14. Cancellation planning

Cancellation cancels all pending reminder, creation, and reschedule plans for the appointment. If master/cancellation preference permit it, it creates exactly one immediate cancellation intent. No reminder survives a cancelled appointment.

## 15. Supersession semantics

Only pending, not-yet-delivered plan intent is superseded. TASK 016B has no delivery state, so it never claims that a previously delivered message can be retracted. Event-toggle changes cancel matching pending immediate plans when disabled; toggling on never manufactures historical immediate events.

## 16. Settings reconciliation

Settings writes reconcile only future `PENDING`/`CONFIRMED` appointments. Rule changes cancel/rebuild pending reminders. Turning master OFF cancels future pending plans; turning it ON rebuilds future reminders only. Appointments, historical outbox events, access tokens, customers, and CRM history are never changed.

## 17. Master/event-toggle semantics

The master controls whether new active planning occurs, while subsettings retain their selected values when inactive. Created/rescheduled/cancelled toggles control corresponding future event planning independently. The master does not retroactively send old transactional messages.

## 18. Authorization

`/dashboard/settings/notifications` and its action allow only active tenant OWNER/ADMIN membership. The action accepts no business ID and derives its tenant server-side. STAFF, unauthenticated requests, platform-only administrators, forged tenant input, and cross-tenant updates are denied with sanitized Turkish results.

## 19. Settings route/navigation

Added `/dashboard/settings/notifications` under the existing settings architecture. Desktop OWNER/ADMIN navigation now presents `Randevu Kuralları` and `Bildirimler`; STAFF sees neither settings item. Mobile bottom navigation remains unchanged.

## 20. Settings UX

The Turkish `Bildirimler` page presents a master switch, three transactional toggles, reminder rows, an explanatory current-state panel, inline validation/success/stale feedback, and a single save action. Provider brands and implementation-roadmap text do not appear in product UI.

## 21. Reminder unit conversion

Reminder input uses lossless whole-number `Dakika`/`Saat`/`Gün` controls. Exact existing values display in the largest exact useful unit; e.g. 120 becomes 2 hours, 1440 becomes 1 day, and 1500 remains minutes. Checked integer conversion rejects decimals, negatives, overflow, out-of-range offsets, and canonical duplicates such as 24 hours/1 day.

## 22. Optimistic concurrency

The settings row is locked and compared to the opaque `updated_at::text` version. A stale OWNER/ADMIN request writes nothing, returns current committed data, and receives: “Bildirim ayarları başka bir kullanıcı tarafından güncellendi. Güncel değerleri kontrol edip tekrar deneyin.”

## 23. Atomic settings/reconciliation transaction

Master/event switches, full reminder-rule replacement, and future-plan reconciliation commit in one transaction. Invalid input changes nothing. No partial settings/rule combination can commit.

## 24. Planner batch foundation

`processPendingBatch` claims a bounded TASK 016A batch, invokes the planner per claim, and marks a success/failure via existing ownership/lease/retry rules. It is a callable foundation for later scheduling, not a cron or background loop.

## 25. Migration

- `0017_notification_planning.sql`: tables, indexes, outbox tenant reference uniqueness, settings backfill/provisioning trigger, timestamps; no historical plans.
- `0018_notification_settings_delete_cascade.sql`: upgrades already-applied 0017 installations from restrictive configuration FKs to the correct business-owned cascading lifecycle.

Existing-database upgrade was applied and verified: 2 existing businesses received settings, with 0 plans; existing appointments/outbox rows remained unchanged. Fresh full history passed through 0018 in database tests.

## 26. Index audit

Added only planner-access indexes: due pending plans by schedule, appointment plan reconciliation, and per-business future pending reminder reconciliation. Existing unique idempotency indexes serve replay safety. No provider/channel indexes were added.

## 27. Security/privacy

No external SDK, provider credential, API call, cron, customer preference, marketing feature, phone/email/WhatsApp recipient, or capability secret was introduced. Action/service errors are typed/sanitized; raw PostgreSQL details do not reach callers.

## 28. Dedicated tests

Added schema/migration tests for defaults, new-business provisioning, canonical rule uniqueness/bounds, cross-tenant plans, no historical plans, and controlled upgrade preservation. Added planner/settings tests for RBAC, forged tenant input, conversion/atomic rejection, created/rescheduled/cancelled planning, replay idempotency, master reconciliation, concurrent writers, and two-worker claims. Focused new suites: 14/14 passed.

## 29. Stress results

The test suite exercised 20 replay/planning passes, concurrent worker claims, and 10 settings-writer rounds. Result: 0 duplicate logical plans, 0 duplicate claims, 0 partial settings combinations, 0 appointment mutations, 0 tenant leaks, and 0 caller-visible database errors.

## 30. Responsive QA

Playwright QA review used the OWNER account at 390px and 1366px. Captured local-only screenshots outside the repository for default OFF, enabled/reminder configuration, duplicate validation, successful save, and stale concurrent-save states. The mobile layout stacks cards cleanly above existing bottom navigation; desktop uses the settings card plus restrained summary column. QA bootstrap was rerun afterward to restore master OFF/no rules.

## 31. Accessibility

Switches have associated labels/state; disabled master subsettings remain understandable; amount/unit controls are labeled and keyboard reachable; add/remove/save are explicit controls; feedback uses `status`/`alert`; and controls use 44px-or-larger heights. No color-only required state was introduced.

## 32. Design audit

Impeccable was not available. Manual review found the master/subsetting hierarchy, no-more-than-three reminder editor, Turkish unit pairing, compact mobile density, sidebar settings placement, and stale recovery clear. The destructive-looking red remove icon is paired with explicit accessible Turkish labeling and applies only to unsaved rule configuration.

## 33. Exact auth result

`pnpm auth:test` — PASS: 748 tests, 127 suites, 0 failures (17.7s).

## 34. Exact DB result

`pnpm db:test` — PASS: 47 tests, 10 suites, 0 failures (6.0s).

## 35. Lint/typecheck/build/bootstrap

- `pnpm lint` — PASS with 20 pre-existing repository warnings; no errors and no TASK 016B warnings.
- `pnpm typecheck` — PASS.
- `pnpm build` — PASS; the new `/dashboard/settings/notifications` dynamic route is included.
- `pnpm qa:bootstrap` — PASS; QA notification settings reset to master OFF, event toggles ON, no rules.

## 36. `git diff --check`

PASS.

## 37. Files changed

Authoritative docs: `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DATABASE.md`, `DESIGN.md`, `UX_RULES.md`.

Database: `drizzle/migrations/0017_notification_planning.sql`, `drizzle/migrations/0018_notification_settings_delete_cascade.sql`, migration metadata, notification planning schema/barrel, outbox composite uniqueness, generated database types.

Application: notification settings action/route/form, planner library/service/repository, notification settings library, dashboard navigation, outbox repository completion executor support, QA bootstrap.

Tests: notification planning auth and database suites.

## 38. Remaining limitations

Plans are not delivered yet: no provider, channel selection, template, delivery worker/cron, delivery attempt state, recipient preference, or retention cleanup exists. Those deliberately remain TASK 016C/later scope.

## 39. Recommendation for TASK 016C

Build a bounded delivery worker atop `notification_plans`, choose one real transactional channel, resolve recipient/current appointment state immediately before delivery, issue capability links only transiently when needed, and add channel-specific attempt/audit semantics without weakening the outbox/planner boundary.

READY FOR TASK 016C — NOTIFICATION DELIVERY WORKER & FIRST REAL CHANNEL
