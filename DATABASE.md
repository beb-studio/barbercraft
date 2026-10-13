# Database Specification: PostgreSQL & Drizzle ORM Schema

## 1. Overview
The database layer is built on self-hosted PostgreSQL managed via **Drizzle ORM** (`drizzle-orm` and `drizzle-kit`).
All table definitions live in `src/db/schema/` and SQL migrations with triggers live in `drizzle/migrations/`.

---

## 2. Entity-Relationship Schema

```mermaid
erDiagram
    users ||--o{ business_members : "belongs to"
    businesses ||--o{ business_members : "has members"
    businesses ||--o{ services : "defines"
    business_members ||--o| staff_profiles : "has profile"
    businesses ||--o{ staff_profiles : "employs"
    staff_profiles ||--o{ staff_services : "provides"
    services ||--o{ staff_services : "provided by"
    businesses ||--o{ customers : "owns"
    businesses ||--o{ business_working_hours : "operates"
    staff_profiles ||--o{ staff_working_hours : "works"
    businesses ||--o{ time_blocks : "schedules"
    staff_profiles ||--o{ time_blocks : "assigned"
    businesses ||--o{ appointments : "books"
    appointments ||--o{ appointment_access_tokens : "authorizes public view"
    customers ||--o{ appointments : "makes"
    staff_profiles ||--o{ appointments : "performs"
    services ||--o{ appointments : "booked for"
```

---

## 3. Core Tables Reference

### 3.1 `users`
System user accounts.
- `id` (uuid, PK, default `gen_random_uuid()`)
- `email` (text, unique, NOT NULL)
- `created_at` (timestamptz, default `now()`)
- `updated_at` (timestamptz, default `now()`)

### 3.2 `businesses` (Tenant Boundary)
- `id` (uuid, PK, default `gen_random_uuid()`)
- `name` (text, NOT NULL)
- `slug` (text, unique, NOT NULL)
- `phone`, `address`, `logo_url` (text, nullable)
- `timezone` (text, NOT NULL, checked via `is_valid_timezone()`)
- `currency` (text, NOT NULL, ISO code e.g. `TRY`, `USD`, `EUR`)
- `booking_interval_minutes` (integer, default 15, checked `IN (5, 10, 15, 20, 30, 60)`)
- `minimum_booking_lead_minutes` (integer, default 0, NOT NULL, checked `0..525600`)
- `maximum_advance_booking_days` (integer, nullable/unlimited, checked `1..730` when populated)
- `cancellation_notice_minutes` (integer, default 0, NOT NULL, checked `0..525600`)
- `reschedule_notice_minutes` (integer, default 0, NOT NULL, checked `0..525600`)
- `active` (boolean, default true, NOT NULL)
- `created_at`, `updated_at` (timestamptz, NOT NULL)
- Policy semantics: lead time is an exact-instant public booking boundary; maximum advance is an inclusive business-local calendar-date boundary. Current policy controls later public actions and is not snapshotted onto appointments. `NULL` maximum advance preserves unlimited historical behavior. Internal/manual scheduling does not consume these public-only limits.
- Settings concurrency: `businesses.updated_at` is read as an exact PostgreSQL text value and used as an opaque optimistic version. Policy update locks the business row, rejects a mismatched version, and writes all four policy columns together; no extra version column or policy table is required.

### 3.3 `business_members`
Connects users to businesses with role assignments.
- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id` (uuid, FK `businesses.id` ON DELETE CASCADE, NOT NULL)
- `user_id` (uuid, FK `users.id` ON DELETE CASCADE, NOT NULL)
- `role` (`business_member_role` enum: `'OWNER'`, `'ADMIN'`, `'STAFF'`, NOT NULL)
- `active` (boolean, default true, NOT NULL)
- `created_at`, `updated_at` (timestamptz, NOT NULL)
- Constraints:
  - UNIQUE `(business_id, user_id)`
  - UNIQUE `(business_id, id)`
  - Partial Unique Index `business_members_one_owner_idx`: `UNIQUE (business_id) WHERE role = 'OWNER'`

### 3.4 `services`
Dynamic service catalog per business.
- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id` (uuid, FK `businesses.id` ON DELETE CASCADE, NOT NULL)
- `name` (text, NOT NULL)
- `description` (text, nullable)
- `duration_minutes` (integer, NOT NULL, check > 0)
- `price` (numeric(10, 2), NOT NULL, check >= 0)
- `active` (boolean, default true, NOT NULL)
- `created_at`, `updated_at` (timestamptz, NOT NULL)
- Constraints:
  - UNIQUE `(business_id, id)`

### 3.5 `staff_profiles`
Barber profiles linked to business memberships.
- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id` (uuid, FK `businesses.id` ON DELETE CASCADE, NOT NULL)
- `business_member_id` (uuid, unique, FK `business_members.id`, NOT NULL)
- `first_name` (text, NOT NULL)
- `last_name` (text, NOT NULL)
- `phone`, `profile_image_url` (text, nullable)
- `public_booking_enabled` (boolean, default true, NOT NULL)
- `uses_business_hours` (boolean, default true, NOT NULL)
- `active` (boolean, default true, NOT NULL)
- `created_at`, `updated_at` (timestamptz, NOT NULL)
- Composite FK: `(business_id, business_member_id) -> business_members(business_id, id)`
- Constraints:
  - UNIQUE `(business_id, id)`

### 3.6 `staff_services`
Junction table mapping staff to services they perform.
- `business_id` (uuid, NOT NULL)
- `staff_id` (uuid, NOT NULL)
- `service_id` (uuid, NOT NULL)
- `created_at` (timestamptz, NOT NULL)
- Primary Key: `(staff_id, service_id)`
- Composite FKs:
  - `(business_id, staff_id) -> staff_profiles(business_id, id)` ON DELETE CASCADE
  - `(business_id, service_id) -> services(business_id, id)` ON DELETE CASCADE

### 3.7 `customers`
Business-scoped customer registry.
- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id` (uuid, FK `businesses.id` ON DELETE CASCADE, NOT NULL)
- `first_name` (text, NOT NULL)
- `last_name` (text, nullable)
- `phone` (text, NOT NULL)
- `normalized_phone` (text, NOT NULL, E.164 format)
- `phone_comparison_key` (text, NOT NULL, server-maintained; non-unique)
- `merged_into_customer_id` (uuid, nullable; NULL for canonical records)
- `merged_at` (timestamptz, nullable)
- `merged_by_business_member_id` (uuid, nullable)
- `notes` (text, nullable)
- `created_at`, `updated_at` (timestamptz, NOT NULL)
- Constraints:
  - UNIQUE `(business_id, normalized_phone)`
  - UNIQUE `(business_id, id)`
  - Composite FK `(business_id, merged_into_customer_id) -> customers(business_id, id)` ON DELETE RESTRICT
  - Composite FK `(business_id, merged_by_business_member_id) -> business_members(business_id, id)` ON DELETE RESTRICT
  - Check `customers_no_self_merge_check`: a customer cannot merge into itself
  - Check `customers_merge_metadata_check`: target, timestamp, and author are either all NULL or all populated
- Indexes:
  - `customers_business_phone_comparison_idx` on `(business_id, phone_comparison_key)`
  - `customers_business_merged_into_idx` on `(business_id, merged_into_customer_id)`
- Logical merge policy: aliases point directly to a canonical root; customer rows, appointment references, and note ownership are never moved or deleted by merge.
- Canonical read policy: family membership is the canonical row plus rows whose `merged_into_customer_id` equals the canonical ID. Directory pagination starts from canonical rows, while appointment and note aggregates join through this one-hop family.
- Booking resolution policy: exact `(business_id, normalized_phone)` remains authoritative and is canonicalized through lineage. Comparison-key fallback is allowed only for one unambiguous root family; comparison keys remain non-unique and never cause automatic merge.
- Historical preservation: resolving a future booking never updates an existing customer profile, `appointments.customer_id`, or historical `customer_notes.customer_id`. New notes submitted through stale alias IDs are inserted against the canonical customer.
- Operational merge write policy: the OWNER/ADMIN confirmation flow delegates to the serializable merge service; only alias merge metadata changes. The selected canonical row remains a root, all other family members point directly to it, and no appointment, service snapshot, note ownership, or customer row is rewritten/deleted.
- Lineage read policy: canonical CRM detail loads direct aliases with one tenant-scoped query for previous name/phone, merge timestamp, and optional merge-author display name. These fields are management-only and are not exposed to STAFF booking search or public flows.
- V1 deliberately has no reverse-lineage mutation or unmerge operation.

### 3.8 `business_working_hours`
Weekly schedule for the business across 7 days.
- `id` (uuid, PK)
- `business_id` (uuid, FK `businesses.id` ON DELETE CASCADE)
- `day_of_week` (smallint, 0..6: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday)
- `start_time` (time, nullable; NOT NULL when `is_closed = false`, NULL when `is_closed = true`)
- `end_time` (time, nullable; NOT NULL when `is_closed = false`, NULL when `is_closed = true`)
- `is_closed` (boolean, default false)
- Constraints:
  - UNIQUE `(business_id, day_of_week)`
  - Check `check_bwh_day_of_week`: `day_of_week BETWEEN 0 AND 6`
  - Check `check_bwh_hours`: `is_closed = true OR start_time < end_time`
- Save Policy: All 7 days are saved atomically within a database transaction; revisiting replaces the 7 weekday rows idempotently.

### 3.9 `staff_working_hours`
- `id` (uuid, PK)
- `business_id`, `staff_id` (uuid, NOT NULL)
- `day_of_week` (smallint, 0..6: 0=Sunday, 1=Monday, ..., 6=Saturday)
- `start_time`, `end_time` (time, nullable: NULL when `is_working = false`, NOT NULL when `is_working = true`)
- `is_working` (boolean, default true)
- Composite FK: `(business_id, staff_id) -> staff_profiles(business_id, id)` ON DELETE CASCADE
- Constraints:
  - UNIQUE `(business_id, staff_id, day_of_week)`
  - Check `check_swh_day_of_week`: `day_of_week BETWEEN 0 AND 6`
  - Check `check_swh_hours`: `((is_working = false AND start_time IS NULL AND end_time IS NULL) OR (is_working = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time))`
- Save Policy: Atomic replacement of all 7 days in a single transaction; updates `staff_profiles.uses_business_hours = false`. Auto-disables `public_booking_enabled` if all 7 days are closed. Switching schedule mode never deletes these rows.

### 3.10 `time_blocks`
- `id` (uuid, PK)
- `business_id` (uuid, NOT NULL)
- `staff_id` (uuid, nullable)
- `block_type` (`time_block_type` enum: `'TIME_OFF'`, `'BREAK'`, `'BLOCKED'`, default: `'BLOCKED'`)
- `start_time`, `end_time` (timestamptz, NOT NULL)
- `reason` (text, nullable, max 500 chars in app layer)
- Composite FK: `(business_id, staff_id) -> staff_profiles(business_id, id)` ON DELETE CASCADE
- Constraints:
  - Check `check_time_blocks_time`: `start_time < end_time`
- Indexes:
  - `time_blocks_business_staff_time_idx` ON `(business_id, staff_id, start_time)`
- Concurrency & Overlap:
  - Overlap condition: `new.start_time < existing.end_time AND new.end_time > existing.start_time`
  - All creations and edits acquire an exclusive row-level lock on `staff_profiles` (`SELECT id FROM staff_profiles ... FOR UPDATE`) inside the transaction to eliminate race conditions.
  - Immutability: Records with `end_time <= NOW()` are read-only (cannot be edited or deleted).

### 3.11 `appointments`
- `id` (uuid, PK)
- `business_id`, `customer_id`, `staff_id`, `service_id` (uuid, NOT NULL)
- `start_time`, `end_time` (timestamptz, NOT NULL)
- `status` (`appointment_status` enum: `'PENDING'`, `'CONFIRMED'`, `'CANCELLED'`, `'COMPLETED'`, `'NO_SHOW'`)
- `source` (`appointment_source` enum: `'PUBLIC_WEB'`, `'MANUAL_ADMIN'`, `'MANUAL_STAFF'`)
- `service_name_snapshot` (text, NOT NULL)
- `service_duration_snapshot` (integer, NOT NULL)
- `service_price_snapshot` (numeric(10,2), NOT NULL)
- `cancellation_reason`, `notes` (text, nullable)
- Composite FKs:
  - `(business_id, customer_id) -> customers(business_id, id)` ON DELETE RESTRICT
  - `(business_id, staff_id) -> staff_profiles(business_id, id)` ON DELETE RESTRICT
  - `(business_id, service_id) -> services(business_id, id)` ON DELETE RESTRICT
- Constraints:
  - UNIQUE `(business_id, id)` (tenant-safe child references)
- Indexes:
  - `appointments_business_time_idx` ON `(business_id, start_time, end_time)`
  - `appointments_business_staff_time_idx` ON `(business_id, staff_id, start_time)`
  - `appointments_business_customer_idx` ON `(business_id, customer_id)`
- Public cancellation policy: no schema extension is required. A capability-authorized cancellation changes only `status` to `CANCELLED`; the existing `set_appointments_updated_at` trigger records the update. `cancellation_reason` remains untouched in V1, and all identity, assignment, timing, snapshot, note, and CRM fields remain unchanged.
- Public rescheduling policy: no schema extension is required. Capability-authorized rescheduling updates only `start_time` and `end_time`; `set_appointments_updated_at` maintains `updated_at`. End time is derived from `service_duration_snapshot`, and status, tenant/customer/staff/service identity, source, every service snapshot, notes, and cancellation reason remain unchanged.
- Scheduling policy: availability/conflict queries already exclude `CANCELLED`, so cancellation releases capacity without deleting or moving the appointment.

### 3.12 `appointment_access_tokens`
Appointment-scoped bearer capabilities for accountless public management access.

- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id`, `appointment_id` (uuid, NOT NULL)
- `token_hash` (text, NOT NULL, UNIQUE; exactly 64 hexadecimal SHA-256 characters by application contract)
- `expires_at` (timestamptz, NOT NULL)
- `revoked_at` (timestamptz, nullable)
- `created_at` (timestamptz, NOT NULL, default `now()`)
- Composite FK: `(business_id, appointment_id) -> appointments(business_id, id)` ON DELETE CASCADE
- Checks:
  - `char_length(token_hash) = 64`
  - `expires_at > created_at`
- Indexes:
  - UNIQUE index supplied by `token_hash` for capability lookup
  - `appointment_access_tokens_business_appointment_idx` on `(business_id, appointment_id)` for issuance/revocation lifecycle operations
- Security policy: raw tokens are generated with 256-bit entropy, returned only to the trusted issuance caller as a `/randevu#<token>` fragment, never persisted server-side, and resolved only after server-side SHA-256 hashing. URL fragments are not part of HTTP request targets and are removed from browser history immediately after capture.
- Lifetime policy: expiry is appointment end plus 24 hours. Internal and public rescheduling refresh all token rows for the appointment atomically to the new end plus the same grace period; this extends or shortens expiry without clearing `revoked_at`. Revocation is explicit, and multiple independently revocable tokens per appointment are allowed.
- Cancellation policy: successful public cancellation does not update or revoke token rows. All otherwise-valid tokens for the appointment resolve the shared `CANCELLED` state until their normal expiry.
- Public rescheduling policy: token lookup remains hash-only and tenant-bound. Successful rescheduling creates no replacement token, revokes no token, and changes no token metadata except the appointment-wide expiry refresh.
- Migration policy: migration `0014_appointment_access_tokens.sql` creates no token rows and does not modify appointments or customers.

### 3.13 `notification_outbox`

Durable, provider-neutral appointment notification intents.

- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id`, `appointment_id` (uuid, NOT NULL)
- `event_type` (`APPOINTMENT_CREATED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`)
- `payload_version` (integer, NOT NULL, default 1) and `payload` (jsonb object, NOT NULL)
- `idempotency_key` (text, globally UNIQUE, 64-character deterministic SHA-256 hex)
- `status` (`PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`; default `PENDING`)
- `available_at`, `locked_at`, `processed_at`, `created_at`, `updated_at` (timestamptz)
- `attempt_count` (integer, default 0, constrained to `0..8`)
- `locked_by` (text, nullable) and `last_error_code` (sanitized text, nullable, at most 64 characters)
- Composite FK `(business_id, appointment_id) -> appointments(business_id, id)` ON DELETE RESTRICT.
- State checks require lock owner/time exactly for `PROCESSING` and `processed_at` exactly for `PROCESSED`. Payload must be a JSON object and payload version must be positive.
- Indexes:
  - unique idempotency lookup supplied by `idempotency_key`
  - partial claim index on `(available_at, created_at, id)` for `PENDING`/`FAILED`
  - partial stale-lease index on `locked_at` for `PROCESSING`
  - appointment event history index on `(business_id, appointment_id, created_at)`
- Claiming uses `FOR UPDATE SKIP LOCKED`; `available_at` and a centralized five-minute lease use server-authoritative instants. Attempt-based retry starts at one minute, doubles to a six-hour cap, and stops after eight claims.
- Events and appointments commit atomically. Migration `0016_notification_outbox.sql` creates no retroactive events and modifies no appointment, token, customer, or CRM history.
- Rows are retained after processing or terminal failure. TASK 016A defines no physical retention cleanup.

### 3.14 Notification planning tables

`business_notification_settings` is a one-to-one extension of `businesses`, keyed by `business_id` with a restrictive foreign key. It stores `customer_notifications_enabled` (default `false`) plus `appointment_created_enabled`, `appointment_rescheduled_enabled`, and `appointment_cancelled_enabled` (each default `true`), with created/updated timestamps. Migration `0017_notification_planning.sql` backfills one safe settings row for every existing business and an `AFTER INSERT` trigger provisions future businesses.

`business_notification_reminder_rules` stores `id`, `business_id`, `minutes_before`, `enabled`, and timestamps. It has `UNIQUE (business_id, minutes_before)` and database checks requiring `minutes_before` from `5` through `43200`; application policy allows no more than three rules per business. Minutes are the sole canonical unit.

`notification_plans` is a provider-neutral intent ledger:

- `id` (uuid, PK), `business_id`, `appointment_id`, nullable `source_outbox_id`
- `type` (`APPOINTMENT_CREATED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_REMINDER`)
- `scheduled_for`, nullable `reminder_offset_minutes`, global unique `idempotency_key`
- `status` (`PENDING`, `CANCELLED`), nullable `cancelled_at`, timestamps
- Composite tenant foreign keys bind both appointment and source outbox row to the same business. The outbox additionally has `UNIQUE (business_id, id)` exclusively to support that tenant-safe reference.
- Checks enforce the immediate/reminder source and offset shape. Worker-facing indexes cover due pending plans, appointment reconciliation, and future per-business reminder reconciliation.

Neither planning table stores recipient/contact data, raw capability tokens or URLs, provider credentials, CRM/internal notes, or delivery outcomes. Migration `0017_notification_planning.sql` creates zero historical plans and does not modify appointments, events, customers, or tokens.

### 3.15 `notification_deliveries`

Execution attempt ledger for channel-specific delivery attempts.

- `id` (uuid, PK, default `gen_random_uuid()`)
- `business_id` (uuid, NOT NULL)
- `plan_id` (uuid, NOT NULL)
- `channel` (`SMS`; enum `notification_delivery_channel`)
- `status` (`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED`; enum `notification_delivery_status`)
- `recipient` (text, NOT NULL; normalized E.164 phone snapshot e.g. `+905XXXXXXXXX`)
- `provider` (text, NOT NULL; e.g. `NETGSM`)
- `provider_message_id` (text, nullable; provider message identifier e.g. `jobid`)
- `attempt_count` (integer, NOT NULL, default 0, check `attempt_count >= 0 AND attempt_count <= 8`)
- `available_at` (timestamptz, NOT NULL, default `now()`)
- `locked_at` (timestamptz, nullable)
- `locked_by` (text, nullable)
- `sent_at` (timestamptz, nullable)
- `failed_at` (timestamptz, nullable)
- `last_error_code` (text, nullable, max 64 chars)
- `created_at` (timestamptz, NOT NULL, default `now()`)
- `updated_at` (timestamptz, NOT NULL, default `now()`)
- Constraints:
  - UNIQUE `(plan_id, channel)`: ensures exactly one delivery row per plan and channel.
  - Composite FK: `(business_id, plan_id) -> notification_plans(business_id, id)` ON DELETE CASCADE.
  - Composite FK: `(business_id) -> businesses(id)` ON DELETE CASCADE.
  - Check `check_nd_processing_lock`: `(status = 'PROCESSING' AND locked_at IS NOT NULL AND locked_by IS NOT NULL) OR (status != 'PROCESSING')`.
  - Check `check_nd_sent_fields`: `(status = 'SENT' AND sent_at IS NOT NULL) OR (status != 'SENT')`.
  - Check `check_nd_failed_fields`: `(status = 'FAILED' AND failed_at IS NOT NULL) OR (status != 'FAILED')`.
- Indexes:
  - Partial claim index: `(available_at, created_at, id)` WHERE `status IN ('PENDING', 'FAILED')`.
  - Partial stale-lease index: `(locked_at)` WHERE `status = 'PROCESSING'`.
  - Business history index: `(business_id, created_at)`.
- Security & Privacy: Stores strictly the normalized recipient phone number needed for dispatch and audit. NEVER stores raw capabilities, full management URLs, customer profile dumps, or internal CRM notes.

### 3.16 Business Analytics Query Foundation (TASK 017A)

The business analytics domain operates as a strictly read-only query layer over existing core PostgreSQL tables without requiring schema modifications or speculative indexes:
- **Primary Access Paths**:
  - `appointments_business_time_idx` on `(business_id, start_time, end_time)` fulfills all date-bounded range filters (`start_time >= rangeStart AND start_time < rangeEnd`) and near-term upcoming lookups.
  - `(business_id, customer_id)` composite foreign key index resolves canonical customer joins for logical customer deduplication: `COALESCE(customers.merged_into_customer_id, appointments.customer_id)`.
  - `(business_id, staff_id)` and `(business_id, service_id)` unique composite keys support efficient staff performance and service analytics joins.
- **Aggregation Strategy**:
  - Server-side conditional aggregation (`COUNT(*) FILTER (...)`) evaluates lifecycle status counts in single-pass queries.
  - Positional grouping (`GROUP BY 1`) aggregates local calendar days, weekdays, and hours in the business's timezone (`to_char(a.start_time AT TIME ZONE tz, 'YYYY-MM-DD')`).
- **Data Integrity & Immutability**:
  - Analytics operations issue only `SELECT` queries. No writes, updates, locks, or side-effects are generated.
  - Zero N+1 queries; execution time remains bounded and sub-50ms even across hundreds of historical appointments.

### 3.17 Multi-Process Rate Limits (TASK 020A)

- Table: `rate_limits`
- Columns:
  - `key`: `varchar(255)` PRIMARY KEY (Anonymized action and IP identifier hash).
  - `points`: `integer` NOT NULL DEFAULT 0 (Accumulated request points within the current time window).
  - `expire_at`: `timestamp with time zone` NOT NULL (Window expiration instant).
- Indexes:
  - `rate_limits_expire_at_idx`: `(expire_at)` for efficient background cleanup of expired rate limit windows.
- Concurrency & Atomicity:
  - Updates occur via atomic PostgreSQL upsert (`INSERT INTO rate_limits (key, points, expire_at) VALUES (...) ON CONFLICT (key) DO UPDATE SET points = ..., expire_at = ... RETURNING ...`).
  - Ensures multi-process safety without race conditions across multiple application server instances.

---

## 4. Database Triggers & Functions
1. `set_updated_at()`: Trigger function that automatically updates `updated_at = NOW()` on row updates for all entities.
2. `enforce_appointment_snapshot()`: Trigger function BEFORE INSERT OR UPDATE on `appointments` that copies `name`, `duration_minutes`, `price` from `services` if snapshots are null.
3. `prevent_appointment_column_change()`: Trigger function BEFORE UPDATE on `appointments` that rejects changing `business_id`, `customer_id`, `staff_id`, or `service_id`.
4. `is_valid_timezone(tz text)`: Helper function that tests whether a timezone string is valid in PostgreSQL.
5. `customer_phone_comparison_key(text)` and `sync_customer_phone_comparison_key()`: Preserve application-equivalent comparison-key semantics during backfill and direct server-side writes.
6. `enforce_customer_merge_one_hop()`: Deferred constraint trigger that rejects aliases targeting aliases and canonical rows that still have inbound aliases when they become aliases.
7. `set_notification_outbox_updated_at`: Applies the shared `set_updated_at()` function to every outbox state/lease mutation.
8. `set_notification_deliveries_updated_at`: Applies the shared `set_updated_at()` function to every delivery state/lease mutation.
