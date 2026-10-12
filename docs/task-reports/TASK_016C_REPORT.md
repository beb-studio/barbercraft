# TASK 016C — Notification Delivery Worker & First Real SMS Channel

## 1. Provider Research & Selection Rationale

For Turkish transactional SMS delivery, the viable market options were audited:
- **Netgsm**: Turkey's leading B2B SMS operator / BTK-licensed STH operator. Supports official REST v2 JSON API (`https://api.netgsm.com.tr/sms/rest/v2/send`), Turkish alphanumeric originator/header semantics (sender ID registered with BTK/IYS), HTTP Basic Authentication, explicit machine-readable response codes (`00` for success with `jobid`, detailed 2-digit error codes), transactional filtering (`iysfilter: "0"`), and standard Turkish GSM normalization (10-digit format without leading 0 or +90).
- **İleti Merkezi / MutluCell**: Viable alternatives with REST APIs, but Netgsm was selected due to widespread enterprise adoption across Turkish SaaS applications, deterministic machine error codes, and strict REST v2 JSON specifications.
- **Selection Decision**: Netgsm was selected as the concrete V1 SMS provider adapter for Turkish transactional appointment messaging.

## 2. Official Provider Contract Summary

The Netgsm REST v2 JSON endpoint specifications implemented:
- **Endpoint**: `POST https://api.netgsm.com.tr/sms/rest/v2/send`
- **Authentication**: HTTP Basic Authentication header `Authorization: Basic base64(username:password)`.
- **Payload**:
  ```json
  {
    "msgheader": "<NETGSM_HEADER>",
    "messages": [
      {
        "msg": "<Turkish Transactional Message>",
        "no": "5XXXXXXXXX"
      }
    ],
    "iysfilter": "0"
  }
  ```
- **Originator**: Alphanumeric sender title (max 11 characters, approved by Netgsm/BTK).
- **Recipient Number Format**: 10 digits (`5XXXXXXXXX`), stripped of country code (`+90`) and leading trunk `0`.
- **Success Response**: HTTP 200 with JSON:
  ```json
  {
    "code": "00",
    "jobid": "123456789"
  }
  ```
- **Error Response**: HTTP 200 or 4xx with JSON:
  ```json
  {
    "code": "20",
    "description": "Mesaj metni hatalı"
  }
  ```
- **Timeout**: Enforced 10-second client-side timeout using `AbortSignal.timeout(10000)`.

## 3. Provider Abstraction Design

The application domain is strictly decoupled from the SMS provider. External HTTP calls never occur in `AppointmentService`, `NotificationOutboxService`, or `NotificationPlannerService`.
- **Interface**: `SmsProvider` in `src/lib/sms/sms-provider.ts`:
  - `sendSms(input: SendSmsInput): Promise<SendSmsResult>`
  - Inputs: `to` (normalized phone), `message` (rendered template), `businessId`, `deliveryId`.
  - Result: `success: boolean`, `providerMessageId?: string`, `errorCode?: string`, `isPermanent?: boolean`, `rawResponse?: unknown`.
- **Concrete Adapter**: `NetgsmSmsProvider` in `src/lib/sms/netgsm-provider.ts` implementing `SmsProvider`.
- **Test Double**: `TestSmsProvider` in `src/lib/sms/test-sms-provider.ts` providing in-memory recording of sent messages and forced outcomes for isolated, deterministic unit/integration testing without network dependencies.

## 4. Delivery Table Design & Indices

Migration `0019_notification_delivery.sql` introduced `notification_deliveries`:
- **Columns**: `id`, `business_id`, `plan_id`, `channel` (enum: `SMS`), `status` (enum: `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED`), `recipient`, `provider`, `provider_message_id`, `attempt_count` (0..8), `available_at`, `locked_at`, `locked_by`, `sent_at`, `failed_at`, `last_error_code`, `created_at`, `updated_at`.
- **Unique Constraint**: `(plan_id, channel)` enforces that each plan can have at most one delivery row per channel.
- **Foreign Keys**: Composite foreign key `(business_id, plan_id) REFERENCES notification_plans(business_id, id)` ON DELETE CASCADE.
- **Indices**:
  - `notification_deliveries_claim_idx`: Partial index on `(available_at, created_at, id)` WHERE `status IN ('PENDING', 'FAILED')`.
  - `notification_deliveries_stale_lease_idx`: Partial index on `(locked_at)` WHERE `status = 'PROCESSING'`.
  - `notification_deliveries_business_created_idx`: On `(business_id, created_at)`.
- **Trigger**: `set_notification_deliveries_updated_at` maintains `updated_at` automatically.

## 5. Recipient Snapshot Rationale & Privacy Boundary

TASK 016A and 016B intentionally avoided storing recipient snapshots in `notification_outbox` and `notification_plans` to keep intent provider-neutral and resilient to identity changes.
- **Delivery Materialization**: When a due plan is materialized into a concrete delivery, the delivery worker resolves the then-authoritative phone number from the appointment's customer profile.
- **Snapshot Storage**: Only the normalized phone number (E.164, e.g. `+905321234567`) is stored in `notification_deliveries.recipient`.
- **Privacy Boundary**: Full customer profiles, names, merge lineage, CRM notes, and internal appointment notes are NEVER snapshotted in `notification_deliveries`.

## 6. Channel Model

- **Enum**: `notification_delivery_channel` with initial value `'SMS'`.
- **Extensibility**: The database enum and code structures allow adding channels like `'EMAIL'` or `'WHATSAPP'` in future tasks without rewriting appointment, outbox, or planning domains.
- **V1 Constraint**: Only SMS is implemented in TASK 016C.

## 7. Delivery Status Lifecycle

- **PENDING**: Materialized delivery waiting to be claimed by worker (`available_at <= now()`).
- **PROCESSING**: Claimed by a worker with active lease (`locked_at`, `locked_by`).
- **SENT**: Accepted by the external SMS provider (`sent_at`, `provider_message_id`).
- **FAILED**: Permanent failure or retryable failure awaiting backoff (`failed_at`, `last_error_code`).
- **CANCELLED**: Cancelled prior to dispatch because the underlying plan or appointment became stale/superseded.

## 8. Materialization Flow & Transaction Boundary

`NotificationDeliveryService.materializeDuePlan`:
1. Checks plan status (`PENDING`) and due time (`scheduled_for <= referenceNow`).
2. Reloads appointment, settings, and customer in one transaction.
3. Revalidates current operational state against plan type.
4. Normalizes and validates the canonical customer's phone number.
5. Inserts an idempotent delivery row with `ON CONFLICT (plan_id, channel) DO NOTHING`.
6. Provider calls NEVER happen inside the materialization transaction.

## 9. Pre-Send Current-State Revalidation

Immediately prior to provider submission:
- **Reminder**: Appointment must still be in `PENDING` or `CONFIRMED` status and `startTime > referenceNow`. If cancelled or past, the delivery is marked `CANCELLED` and no SMS is sent.
- **Created / Rescheduled**: Appointment must still be in `PENDING` or `CONFIRMED` status.
- **Cancelled**: Appointment must be in `CANCELLED` status.
- **Plan Status Check**: If the underlying plan was marked `CANCELLED` during supersession, the delivery is marked `CANCELLED`.

## 10. Customer Canonical Resolution & Alias Handling

- Customer identity is resolved from the appointment's `customerId`.
- If the customer was merged into another customer (`mergedIntoCustomerId IS NOT NULL`), canonical resolution traces the pointer to the primary customer profile.
- The phone number is extracted strictly from the canonical profile, ensuring merged aliases route messages to the customer's current authoritative phone.

## 11. Phone Normalization & Invalid Phone Handling

- Existing `normalizePhoneNumber` and `validatePhoneNumber` utilities are reused.
- If a customer has no phone number or an invalid phone number:
  - Materialization records a permanent failure on the delivery row with sanitized code `RECIPIENT_UNAVAILABLE`.
  - `attemptCount` is set to 1, `failedAt` is set, and no retry is scheduled.
  - The worker does not crash and the customer's phone is never logged.

## 12. Message Templates

Application-owned Turkish transactional templates in `renderNotificationMessage`:
1. **APPOINTMENT_CREATED**:
   `{businessName}: Randevunuz oluşturuldu. Tarih: {dateTimeDisplay}, Hizmet: {serviceName}. Randevu yönetimi: {managementUrl}`
2. **APPOINTMENT_RESCHEDULED**:
   `{businessName}: Randevunuz {dateTimeDisplay} olarak güncellendi. Hizmet: {serviceName}. Randevu yönetimi: {managementUrl}`
3. **APPOINTMENT_CANCELLED**:
   `{businessName}: {dateTimeDisplay} tarihindeki {serviceName} randevunuz iptal edilmiştir.`
4. **APPOINTMENT_REMINDER**:
   `{businessName}: {serviceName} randevunuz {dateTimeDisplay} tarihindedir. Randevu yönetimi: {managementUrl}`
Strict rules:
- No CRM notes or appointment internal notes.
- No DB IDs or internal lineage.
- Localized date/time formatted in business timezone (e.g. `Europe/Istanbul`).

## 13. Management Link & Capability Issuance Timing

- Capabilities are issued **transiently in memory** immediately before dispatching to the provider via `AppointmentAccessService.issue(appointmentId)`.
- Raw capability token (256-bit entropy, 43 Base64URL characters) exists ONLY transiently in memory to build `{APP_BASE_URL}/randevu#{rawToken}`.
- Raw token and full management URLs are NEVER written to:
  - `notification_outbox`
  - `notification_plans`
  - `notification_deliveries`
  - Logs, error codes, or test reports.
- Database persists only the 64-char SHA-256 hash in `appointment_access_tokens`.

## 14. Behavior When Capability Is Issued but SMS Fails

- If capability issuance succeeds but the SMS provider request fails:
  - The capability row remains safely in PostgreSQL (storing only SHA-256 hash, valid until expiry).
  - The delivery row transitions to `FAILED`.
  - On subsequent retries, a fresh capability is issued transiently.
  - Plaintext tokens are never recovered or reused.

## 15. Public Base URL Configuration

- Configured via environment variable `APP_BASE_URL` (with fallback to `NEXT_PUBLIC_APP_URL` or `BETTER_AUTH_URL`).
- Validated via `getPublicApplicationBaseUrl()` to ensure safe `http://` or `https://` absolute URLs.
- Host headers from untrusted incoming browser requests are strictly rejected as notification authority.

## 16. Lease Semantics & Concurrency Model

- Worker batches claim due deliveries with PostgreSQL `FOR UPDATE SKIP LOCKED`.
- Active lease duration is 5 minutes (`locked_at`, `locked_by`).
- Expired leases are safely recovered by subsequent worker sweeps.
- Two concurrent workers cannot claim the same delivery row.
- Worker identity checks prevent unauthorized workers from completing or failing a claim owned by another worker.

## 17. Retry Strategy & Backoff Schedule

- Exponential backoff schedule based on `attempt_count`:
  - Attempt 1: 1 minute
  - Attempt 2: 2 minutes
  - Attempt 3: 4 minutes
  - Attempt 4: 8 minutes
  - Attempt 5: 16 minutes
  - Attempt 6: 32 minutes
  - Attempt 7: 64 minutes
  - Maximum attempts: 8 (terminal `FAILED`).
- `available_at` is set to `now + delayMs`.

## 18. Permanent vs Retryable Error Taxonomy

- **Permanent Failures** (no retries, marked terminal `FAILED` immediately):
  - `RECIPIENT_UNAVAILABLE`: Missing or unparseable phone number.
  - `NETGSM_20`: Invalid message text.
  - `NETGSM_30`: Invalid credentials / IP unauthorized.
  - `NETGSM_40`: Message header / originator not approved.
  - `NETGSM_70`: Invalid request parameters.
  - HTTP 4xx client errors.
- **Retryable Failures** (scheduled for exponential backoff):
  - `NETGSM_80`: Rate limit exceeded.
  - `NETGSM_85`: Operator or provider system temporary error.
  - `NETGSM_TIMEOUT`: Request timeout (10 seconds).
  - `NETGSM_NETWORK_ERROR`: Connection reset or network drop.
  - HTTP 5xx server errors.

## 19. Test Provider Design

- Implemented `TestSmsProvider` conforming to `SmsProvider`.
- In-memory inspection: `recordedCalls` tracks all sent messages and recipients.
- Configurable outcomes: `forceRetryableError(code)` and `forcePermanentError(code)` for deterministic failure injection.

## 20. Test Matrix Summary

Full test coverage across database, provider, delivery service, and concurrency:
- **Database Schema Tests** (`tests/database/notification-delivery-schema.test.mjs`):
  - Table existence, column types, default values.
  - Foreign key constraints (composite FK on business and plan).
  - Status and lock check constraints.
  - Partial indices for claiming and stale lease recovery.
- **Provider Contract Tests** (`tests/auth/notification-delivery.test.ts`):
  - Turkish phone formatting (10-digit conversion).
  - Missing credential safety.
  - Netgsm success response parsing (`code: "00"`, `jobid`).
  - Error code classification into permanent vs retryable.
  - HTTP 500 retryable and HTTP 400 permanent classification.
  - Network timeout and abort handling.
- **Materialization & Stale State Tests**:
  - CREATED plan materialization into exactly one delivery.
  - Non-due (future or cancelled) plan skipping.
  - Canonical customer phone resolution from merged alias.
  - Invalid phone handling (`RECIPIENT_UNAVAILABLE`).
  - Stale reminder blocking on cancelled/past appointments.
- **Templates, Capability Links & Delivery Execution**:
  - Turkish transactional templates with date/time and business name.
  - Transient capability generation; absence of raw token from all tables.
  - Retryable failure recovery and subsequent successful delivery.
- **Claiming, Leases & Concurrency**:
  - Mutex claiming (`FOR UPDATE SKIP LOCKED`).
  - Active lease protection and expired lease recovery.
  - Worker mismatch protection on completion/failure.

## 21. Stress Test Results (Part 28)

Run over 50 automated concurrent iterations:
- **Concurrent Materialization**: 20 iterations running two parallel materializers against the same plan produced exactly 1 delivery row with 0 constraint errors.
- **Concurrent Worker Claims**: 20 iterations running two parallel worker claimers produced exactly 1 claimed row and 0 duplicate provider dispatches.
- **Plan Cancellation vs Materialization Race**: 10 iterations racing plan cancellation against materialization cleanly cancelled pending deliveries before dispatch.

## 22. Files Created & Modified

### New Files
- `drizzle/migrations/0019_notification_delivery.sql`
- `src/db/schema/notification_deliveries.ts`
- `src/lib/sms/sms-provider.ts`
- `src/lib/sms/netgsm-provider.ts`
- `src/lib/sms/test-sms-provider.ts`
- `src/lib/sms/index.ts`
- `src/lib/notification-delivery.ts`
- `src/repositories/notification-delivery.repository.ts`
- `src/services/notification-delivery.service.ts`
- `tests/database/notification-delivery-schema.test.mjs`
- `tests/auth/notification-delivery.test.ts`
- `docs/task-reports/TASK_016C_REPORT.md`

### Modified Files
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema/index.ts`
- `src/db/schema/notification_planning.ts`
- `src/types/database.types.ts`
- `.env.example`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- `tests/auth/any-staff-availability.test.ts`
- `tests/auth/any-staff-public-flow.test.ts`

## 23. Migrations Created

`drizzle/migrations/0019_notification_delivery.sql`:
- Creates enum types: `notification_delivery_channel` (`SMS`), `notification_delivery_status` (`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED`).
- Adds unique constraint `notification_plans_business_id_id_key` on `notification_plans(business_id, id)` to enable composite tenant foreign keys.
- Creates `notification_deliveries` table with composite foreign keys, status checks, processing lock checks, and partial indexes.
- Adds `set_notification_deliveries_updated_at` trigger calling `set_updated_at()`.

## 24. QA Verification

- `pnpm db:test`: 52 tests passing (100%).
- `pnpm auth:test`: 769 tests passing (100%).
- `pnpm lint`: 0 errors.
- `pnpm typecheck`: 0 errors (`tsc --noEmit`).
- `pnpm build`: Next.js production build succeeded cleanly.
- `pnpm qa:bootstrap`: QA accounts and base seed verified.

TASK 016 COMPLETE — NOTIFICATION & REMINDER FOUNDATION WITH SMS DELIVERY FINALIZED
