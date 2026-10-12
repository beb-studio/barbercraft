# TASK 016A — Durable Notification Outbox & Appointment Event Foundation

## 1. Pre-implementation audit

- Authoritative appointment creation paths are `AppointmentService.createAppointment` for public specific-staff and manual/internal booking, plus `AppointmentService.createAnyStaffAppointment` for public **Fark Etmez** booking.
- Authoritative reschedule paths are `AppointmentService.rescheduleAppointment` for authenticated internal operations and `AppointmentAccessService.reschedule` for capability-authorized public self-service.
- Authoritative cancellation paths are `AppointmentService.updateAppointmentStatus(..., "CANCELLED", ...)` and `AppointmentAccessService.cancel`. `COMPLETED` and `NO_SHOW` remain status-only transitions.
- Creation already ran in staff-locked PostgreSQL transactions. Internal and public rescheduling use the established staff-profile → appointment → capability ordering. Public cancellation locks and re-reads the appointment before mutation.
- Public cancellation is idempotent: observing an already-cancelled appointment is a successful no-change result. Internal reschedule uses `expectedUpdatedAt`; public reschedule serializes on the row lock.
- Appointment `updated_at` is maintained by PostgreSQL `set_updated_at()` using `NOW()` and has timestamp-with-time-zone precision. The outbox captures its exact PostgreSQL text form before a reschedule as mutation-version material.
- No background-job, durable outbox, provider, cron, or notification delivery infrastructure existed before this task.
- Existing service/action boundaries sanitize product-facing failures; database constraint details remain test/diagnostic concerns and are not returned as UI DTOs.

## 2. Event vocabulary

The V1 vocabulary is deliberately limited to:

- `APPOINTMENT_CREATED`
- `APPOINTMENT_RESCHEDULED`
- `APPOINTMENT_CANCELLED`

`COMPLETED` and `NO_SHOW` continue without customer-notification events. They are not delivery intents in this foundation.

## 3. Schema

`notification_outbox` contains:

- UUID identity and tenant-safe appointment identity
- typed `eventType`
- integer `payloadVersion`
- JSONB `payload`
- globally unique 64-character deterministic `idempotencyKey`
- `PENDING | PROCESSING | PROCESSED | FAILED` status
- `availableAt`, `attemptCount`, `lockedAt`, `lockedBy`, `processedAt`, and sanitized `lastErrorCode`
- `createdAt` and trigger-maintained `updatedAt`

Database checks enforce payload-object shape, positive payload versions, idempotency-key length, bounded attempts, coherent lock metadata, coherent processed metadata, and bounded error-code length.

## 4. Tenant integrity

The composite foreign key `(business_id, appointment_id) → appointments(business_id, id)` uses `ON DELETE RESTRICT`. An event cannot reference another tenant's appointment, and appointment history supporting durable events cannot silently disappear.

## 5. Status model

The small state machine is:

`PENDING → PROCESSING → PROCESSED`

or

`PENDING/FAILED → PROCESSING → FAILED`

`FAILED + availableAt + attemptCount` represents retryable work while `attemptCount = 8` is terminal. A separate `RETRYABLE` enum would duplicate this state. `PROCESSED` means the provider-independent intent has been handled by a future processor; channel delivery semantics will be modelled separately.

## 6. Payload and versioning

All events use `payloadVersion = 1`:

- Created: event-time start, end, and status.
- Rescheduled: old start/end, new start/end, and retained status.
- Cancelled: scheduled start/end, previous status, and `CANCELLED` status.

Payloads contain immutable event truth only. They do not dump ORM entities or persist internal notes, CRM notes, auth state, or merge lineage. Future payload changes require a new version and version-aware consumer.

## 7. Recipient strategy

Phone, email, WhatsApp identity, and other recipient details are not snapshotted in the provider-neutral event. A later notification planner will resolve the then-authoritative recipient under explicit channel/settings rules. This avoids prematurely freezing mutable customer identity before those rules exist.

## 8. Capability-secret safety

Outbox payloads and rows contain neither a raw appointment-management capability nor a capability URL. Integration coverage issues a real management capability and proves that the raw token, `/randevu#` URL form, internal appointment note, CRM note, phone, and customer object are absent from the serialized event. A future delivery worker must issue any fresh capability transiently through `AppointmentAccessService`.

## 9. Idempotency design

Deterministic SHA-256 keys are generated exclusively from trusted server mutation truth:

- Creation: namespace + event type + business ID + appointment ID.
- Cancellation: namespace + event type + business ID + appointment ID; only the first real transition emits.
- Reschedule: namespace + event type + business ID + appointment ID + exact pre-mutation database version + old/new start/end.

The global unique constraint prevents duplicate logical events. Multiple legitimate reschedules remain distinct, while no-op reschedules emit nothing.

## 10. Transaction integration

Every event insert occurs on the same Drizzle PostgreSQL transaction object as its appointment mutation. Tests install a forced-failure trigger on `notification_outbox` and prove that event failure rolls back creation, reschedule, and cancellation. Therefore:

- committed appointment mutation implies committed event;
- rolled-back mutation produces no event;
- event insertion failure prevents partial business success.

No after-commit best-effort insert was added.

## 11. Creation integration

Created events are emitted inside both authoritative creation transactions:

- public specific-staff booking;
- public Fark Etmez booking;
- manual/internal booking.

Failed/conflicting transactions cannot retain events. Customer canonicalization, staff locking, Any Staff selection, and management-capability issuance remain in their established transaction flow.

## 12. Reschedule integration

Internal and public reschedules emit one event only after a real schedule update, still inside the scheduling transaction. The payload retains old/new schedule truth. Internal exact-same-slot requests now return a typed `NO_CHANGE` result without rewriting the appointment or emitting an event. Existing lock order, conflict validation, immutable service snapshots, fixed customer/staff/service identity, and capability-expiry refresh remain intact.

## 13. Cancellation integration

Public and internal transitions into `CANCELLED` emit one event inside the appointment transaction. Repeated idempotent public cancellation returns the existing cancelled state and emits no duplicate. Rejected cancellation emits nothing. `COMPLETED` and `NO_SHOW` continue unchanged and do not emit V1 notification events.

## 14. Worker claiming

`NotificationOutboxService.claimPendingBatch` validates a bounded batch size and machine-safe worker ID, then uses one transaction with a CTE, `FOR UPDATE SKIP LOCKED`, deterministic ordering, and an atomic update to `PROCESSING`. The claim records `lockedAt`, `lockedBy`, and increments `attemptCount`. Future `availableAt` rows are not selected.

## 15. Multi-worker concurrency

Two concurrent workers cannot claim the same row. A dedicated 20-iteration test inserted two events per iteration and concurrently claimed one per worker: 40 unique claims, 0 duplicates, 0 deadlocks, and 0 ownership violations. Claiming is not tenant-filtered because this is a global internal worker primitive, but every row remains tenant-bound and no claim mutates appointment/customer data.

## 16. Lease recovery

The centralized lease is five minutes. Expired `PROCESSING` work below the attempt limit is eligible for atomic re-claim; an active lease is not stolen. A crashed final-attempt claim is converted to retained terminal `FAILED` with sanitized `LEASE_EXPIRED`, preventing permanent `PROCESSING` state or a ninth delivery attempt.

`markProcessed` and `markFailed` require the active worker ID. A different worker receives typed `OUTBOX_CLAIM_NOT_OWNED` rather than changing the row.

## 17. Retry and backoff

Retries use centralized deterministic exponential backoff: one minute multiplied by powers of two, capped at six hours. There is no process sleep or randomness in the repository. Only machine-safe error codes matching the bounded format are retained; arbitrary text, stack traces, and provider exception dumps normalize to `DELIVERY_ERROR`.

## 18. Terminal failure behavior

The maximum is eight claimed attempts. The eighth failure remains durable as `FAILED`, is not ordinarily claimable again, and is never deleted. Processed events are also retained and never reclaimed. Operational replay tooling and retention are intentionally deferred.

## 19. Migration

New forward migration: `drizzle/migrations/0016_notification_outbox.sql`.

- Existing-database verification: the local upgraded database retained 29 appointments and contained 0 retroactive outbox events.
- Controlled upgrade verification from migration 0015: appointment count was 2 before and 2 after migration 0016; outbox count was 0.
- Fresh-history verification: database suites applied the complete migration history successfully.
- No appointment, customer, capability token, or historical data was modified; no historical event was manufactured.

## 20. Indexes

Only demonstrated access paths are indexed:

- unique idempotency-key lookup/enforcement;
- partial `(available_at, created_at, id)` index for `PENDING/FAILED` claim candidates;
- partial `locked_at` index for `PROCESSING` lease recovery;
- `(business_id, appointment_id, created_at)` for appointment event history.

No channel/provider indexes were added speculatively.

## 21. Security and logging

The outbox is server-only. It stores no raw capability, credentials, sessions, provider secrets, arbitrary exceptions, whole customer objects, recipient snapshot, CRM notes, or internal appointment notes. Worker inputs are validated, failure codes are sanitized, and service errors are typed. Unexpected repository/database failures are converted to `OUTBOX_PERSISTENCE_FAILED`; integration assertions prove the forced database failure never reaches service callers as SQL text or PostgreSQL metadata. No external provider package or secret was introduced.

## 22. Dedicated tests

Added:

- `tests/database/notification-outbox-schema.test.mjs`: 5/5 passing schema, tenant FK, enum, uniqueness/default, and upgrade tests.
- `tests/auth/notification-outbox.test.ts`: 10/10 passing real-PostgreSQL integration groups covering creation, Fark Etmez/manual paths, payload secrecy, public/internal reschedule, no-op and repeated reschedules, public/internal cancellation, other statuses, forced rollback, concurrent claiming, leases/ownership, and bounded retry.

Existing cleanup fixtures delete outbox rows before appointments to honor the intentional restrictive history FK. Existing Any Staff concurrency fixtures were moved from elapsed October 2026 dates to the same weekdays in October 2030, removing a calendar-time failure before the single final full verification run.

## 23. Stress results

- Worker claims: 20 iterations, 40/40 uniquely claimed and processed, 0 duplicate claims, 0 deadlocks.
- Cancellation idempotency: existing 10-iteration public double-submit coverage plus dedicated event assertion; 0 duplicate logical cancellation events.
- Reschedule concurrency: existing TASK 014C repeated public/public, booking/public, cancel/public, and internal/public races remained green with transactional event emission.
- Totals: 0 missing events for committed covered mutations, 0 orphan events for forced rollbacks, 0 appointment loss, 0 tenant leakage, and 0 caller-visible database internals.

## 24. Exact auth result

`pnpm auth:test` passed on the final run:

- tests: 738
- suites: 126
- pass: 738
- fail/cancelled/skipped/todo: 0/0/0/0
- duration: 16,558.68768 ms

## 25. Exact database result

`pnpm db:test` passed:

- tests: 43
- suites: 9
- pass: 43
- fail/cancelled/skipped/todo: 0/0/0/0
- duration: 3,545.165119 ms

Expected constraint-error logs occurred only in negative integrity tests.

## 26. Lint, typecheck, build, and bootstrap

- `pnpm lint`: exit 0; 0 errors, 20 pre-existing warnings.
- `pnpm typecheck`: exit 0.
- `pnpm build`: exit 0; Next.js 16.3.8 production build compiled, typechecked, and generated all 24 static pages successfully. The existing middleware-to-proxy deprecation warning remains.
- `pnpm qa:bootstrap`: exit 0; deterministic QA bootstrap completed without printing credentials or secrets.

## 27. Git diff check

`git diff --check`: exit 0 with no whitespace errors.

## 28. Files changed

Authoritative documentation:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `docs/task-reports/TASK_016A_REPORT.md`

Schema and migration:

- `drizzle/migrations/0016_notification_outbox.sql`
- `drizzle/migrations/meta/0016_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema/notification_outbox.ts`
- `src/db/schema/index.ts`
- `src/types/database.types.ts`

Domain/repository integration:

- `src/lib/notification-outbox.ts`
- `src/repositories/notification-outbox.repository.ts`
- `src/services/notification-outbox.service.ts`
- `src/repositories/appointment-access.repository.ts`
- `src/services/appointment-access.service.ts`
- `src/services/appointment.service.ts`

Tests/fixture maintenance:

- `tests/database/notification-outbox-schema.test.mjs`
- `tests/auth/notification-outbox.test.ts`
- `tests/auth/any-staff-concurrency.test.ts`
- `tests/auth/appointment-reassign.test.ts`
- `tests/auth/appointment-reschedule.test.ts`
- `tests/auth/business-booking-policy.test.ts`
- `tests/auth/manual-appointment.test.ts`
- `tests/auth/public-appointment-cancellation.test.ts`
- `tests/auth/public-appointment-reschedule.test.ts`

Pre-existing unrelated untracked root files were not modified or staged.

## 29. Remaining limitations

- No worker process, cron, channel delivery, provider adapter, notification settings, reminder planner, or UI exists yet.
- Recipient and channel selection remain intentionally deferred.
- There is no processed-event retention/purge policy or operator replay UI.
- Payload semantic typing is enforced in the server service; PostgreSQL enforces JSON object/version shape rather than event-specific JSON schemas.
- `COMPLETED` and `NO_SHOW` do not emit notification intents in V1.
- Appointment mutations performed outside authoritative services would not emit domain events; production paths audited in this task use the integrated services.

## 30. Recommendation for TASK 016B

Build reminder scheduling and tenant notification settings on this outbox without adding provider calls to appointment transactions. Introduce explicit reminder-plan idempotency, resolve recipients at planning/delivery time, issue management capabilities transiently, and keep channel delivery state separate from provider-independent appointment events.

READY FOR TASK 016B — REMINDER SCHEDULING & NOTIFICATION SETTINGS
