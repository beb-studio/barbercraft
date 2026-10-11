# TASK 014A — Secure Public Appointment Management Access Foundation

## 1. Pre-implementation audit

- Read `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `DATABASE.md`, `DESIGN.md`, `UX_RULES.md`, `DEVELOPMENT_RULES.md`, and the TASK 013C.2A/2B/2C reports.
- Read the installed Next.js 16.3.8 guidance for dynamic routes, metadata/robots, caching, request headers, logging, and route runtime behavior before implementing the public surface.
- Starting branch: `task-014-public-appointment-management`; starting commit: `3069d21 merge: complete TASK 013 customer CRM foundation`. The repository contains only four commits, so `git log --oneline -8` returned four entries.
- Starting tracked tree was clean. Pre-existing untracked legacy root reports/scripts were left untouched.
- Public booking returned a minimal confirmation DTO. Specific-staff and `Fark Etmez` booking already converged on `AppointmentService` transaction boundaries, including staff locks, conflict checks, canonical customer resolution, and appointment insertion.
- Appointments use UUID primary keys and tenant-scoped foreign keys. No product appointment-delete flow exists. Statuses are `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, and `NO_SHOW`; the current public booking path creates `CONFIRMED` appointments.
- Internal cancel/status mutation and rescheduling remain authenticated service operations. Rescheduling updates only permitted appointment columns under the existing immutability trigger.
- Business-local presentation already uses `formatInstantInBusinessTimezone`; the management DTO reuses it.
- Historical invitation migrations demonstrated random-secret/hash concepts, but no active reusable capability-token service existed.
- Sensitive-route caching/logging required new protection. The original public action logged full `Error` objects and two legacy tests logged full booking results; both patterns were sanitized because booking results now contain one-time capability context.

## 2. Token schema

New table `appointment_access_tokens` contains:

- `id` UUID primary key;
- `business_id`;
- `appointment_id`;
- `token_hash`;
- `expires_at`;
- nullable `revoked_at`;
- `created_at`.

`token_hash` is globally unique and constrained to 64 characters. Expiration must be later than creation. There is no plaintext-token column and no one-token-per-appointment constraint.

## 3. Cryptographic design

- Issuance uses Node `crypto.randomBytes(32)`: 256 bits of cryptographic entropy.
- The URL-safe raw secret is Base64URL encoded to exactly 43 characters.
- PostgreSQL receives only `SHA-256(rawToken)` as lowercase hexadecimal.
- Lookup validates exact syntax, hashes server-side, and queries only by the hash.
- Hash collisions use `ON CONFLICT DO NOTHING` plus at most three fresh-secret attempts, then fail the enclosing operation safely.
- A full auth-log scan after the final suite found no `managementPath`, `/randevu#`, or token-shaped raw secret.

## 4. Tenant integrity

- Migration `0014_appointment_access_tokens.sql` adds the required `appointments(business_id, id)` unique key.
- `(business_id, appointment_id)` has a composite foreign key to the same appointment tenant. Cross-tenant rows fail at PostgreSQL.
- Appointment deletion cascades its now-useless access rows; the application exposes no appointment deletion workflow.
- The globally unique token hash is itself the lookup index. A separate `(business_id, appointment_id)` index supports lifecycle issuance/expiration work without duplicating the hash index.

## 5. Expiry policy

`calculateAppointmentAccessExpiry` is the single policy helper. Validity ends 24 hours after the appointment's end time. This keeps the link operational through the appointment and a short post-appointment review window. Completed, cancelled, and no-show appointments remain readable until that same timestamp; status is not treated as an oracle or early expiry condition.

Internal rescheduling atomically refreshes every token for that appointment to `new appointment end + 24 hours`. Dedicated coverage verifies the recalculated timestamp.

## 6. Revocation semantics

- `AppointmentAccessService.revoke` validates and hashes the supplied secret, then sets `revoked_at` once.
- Revoked, expired, malformed, and unknown capabilities all resolve to the same null domain result.
- Issuing a fresh token does not silently revoke older active tokens. Multiple active links are intentional for future reminder/notification issuance; each may expire or be revoked independently.
- No customer-facing revocation UI was added.

## 7. Token issuance

`AppointmentAccessService.issue` accepts trusted business and appointment IDs, reloads the tenant-scoped appointment, derives expiry from its actual end time, generates/hash-stores the secret, and returns the raw value exactly once to the trusted caller.

Historical/manual appointments receive no migration token. The same service can explicitly issue a recoverable fresh link for an existing operational appointment later.

## 8. Token resolution

`AppointmentAccessService.resolve` performs syntax validation, SHA-256 lookup, revocation/expiry checks, tenant-safe appointment joins, and business-timezone formatting. Its minimal DTO contains only:

- business name;
- service-name/duration/price appointment snapshots;
- current public staff display name;
- localized date/start/end time;
- currency;
- appointment status.

It excludes appointment/customer/business/staff IDs, phones, internal appointment notes, CRM notes/history, and customer merge lineage.

## 9. Public booking integration

Both specific-staff and `Fark Etmez` public flows request management access from the shared appointment service. The confirmation DTO receives a single `managementPath`. Canonical customer resolution remains unchanged, so a booking against merged identity still writes the canonical customer ID. Manual booking keeps its prior behavior and does not auto-issue a link.

## 10. Transaction behavior

Appointment insertion and token issuance occur in the same existing PostgreSQL transaction. The `Fark Etmez` staff-lock ordering, candidate selection, conflict detection, and canonical customer work are unchanged. A forced token-insert failure test proves appointment, newly resolved/created customer, and token all roll back together; no partial success or orphan row remains.

The new composite appointment key and token integration do not modify historical appointments, customer records, or appointment immutability rules.

## 11. Management route

The final route is `/randevu`. The capability is placed in the URL fragment (`/randevu#<secret>`), not a request path/query. This deliberately improves the conceptual bearer URL because fragments are not sent in HTTP requests, access logs, `Referer` headers, or indexing requests.

On hydration, the client reads the fragment once, immediately removes it from browser address/history with `history.replaceState`, and submits it to a server action for hash-only resolution. Missing or invalid fragments use the same public state. The route is dynamic and read-only; no cancellation/rescheduling controls or fake disabled actions exist.

## 12. Privacy and security headers

- Production verification returned `Cache-Control: private, no-store, max-age=0, must-revalidate`.
- `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow, noarchive` are applied by config/middleware.
- Route metadata also sets noindex/nofollow/nocache directives.
- Next incoming-request logging ignores `/randevu`; server-function argument logging is disabled, preventing the action secret from appearing in development diagnostics.
- The page uses no third-party analytics/resources. Next fonts are self-hosted build assets.
- Public action error logging now records only an error name and sanitized category; it never prints the returned capability or full error object.

## 13. Invalid-token behavior

Missing, malformed, unknown, expired, revoked, and unexpected resolution failures render one non-oracular Turkish message: `Bu randevu bağlantısı geçersiz veya artık kullanılamıyor.` The page never distinguishes appointment existence, prior validity, expiry, or revocation.

## 14. Confirmation UX

After successful public booking, the existing confirmation view now presents `Randevuyu Yönet` as the primary clear action and keeps the return-to-booking action secondary. The raw cryptographic value is never rendered as text or code. No unrelated booking redesign was made.

## 15. Management-page UX

The responsive light-first summary presents `Randevunuz`, the canonical Turkish status badge, and a single scannable definition list for İşletme, Hizmet, Personel, Tarih, Saat ve Süre, and Tutar. It ends with concise bearer-link privacy guidance. Loading uses a Turkish live status; invalid state has one clear recovery link.

## 16. Historical/manual appointment strategy

Migration creates no tokens for historical or manual appointments because an unrecoverable raw secret would be useless. Internal callers may later issue a fresh token for an existing appointment through the centralized service. No customer account, notification delivery, cancellation, or rescheduling UI was introduced.

## 17. Migration

- Forward migration: `drizzle/migrations/0014_appointment_access_tokens.sql`.
- Existing database upgrade: success; appointment rows before/after `16/16`, access-token rows after migration `0`.
- Fresh full migration history: success in the database suite.
- Upgrade fixture from migration 0013: appointments before/after `2/2`, access-token rows `0`.
- No appointment/customer data was altered and no plaintext/unrecoverable token was manufactured.
- Generated Drizzle snapshot/journal and database TypeScript types were updated.

## 18. Dedicated tests

`tests/auth/appointment-access.test.ts` passed 11/11 and covers:

- atomic specific-staff and `Fark Etmez` issuance;
- 256-bit token syntax and hash-only storage;
- canonical-customer preservation;
- minimal DTO/privacy and Turkish status labels;
- malformed/unknown/expired/revoked behavior;
- parallel-valid replacement issuance;
- manual appointment opt-in issuance;
- reschedule expiry refresh;
- forced token failure rollback;
- route/header/logging/one-time confirmation contracts.

`tests/database/appointment-access-token-schema.test.mjs` passed 6/6 and covers hash storage/expiry, uniqueness, valid/cross-tenant relationships, revocation storage, and upgrade-with-zero-token behavior. The complete DB suite also proves a fresh migration history.

## 19. Responsive QA

Playwright exercised a real public confirmation, newly issued management link, valid management resolution, response headers, and invalid-link state. It inspected 390, 768, 1366, and 1920 widths. Required captures physically exist under `docs/task-reports/artifacts/TASK_014A/`, including:

- 390: confirmation, management, invalid link;
- 1366: confirmation, management, invalid link;
- 768 and 1920: confirmation, management, invalid link.

No screenshot or runner log contains a raw token. The reusable runner is `scripts/qa-appointment-access-visual.ts`.

## 20. Design audit

Impeccable is not available in this Codex environment; no tool use was fabricated. Manual focused review found:

- the management CTA has correct prominence without disrupting confirmation;
- summary hierarchy and status are immediately scannable;
- 390px rows wrap without truncating operational values;
- no contact PII, IDs, CRM history, notes, or lineage is exposed;
- invalid-link copy is calm and non-oracular;
- no speculative cancellation/rescheduling controls compete with the read-only purpose.

The fragment-based capability transport was the key security improvement discovered during the audit: the secret never enters the initial request URL or ordinary request logs.

## 21. Exact auth result

Final `pnpm auth:test` (single final run):

- exit code: 0
- tests: 680
- suites: 116
- passed: 680
- failed/cancelled/skipped/todo: 0/0/0/0
- duration: 15625.437523 ms

## 22. Exact DB result

Final `pnpm db:test` (single final run):

- exit code: 0
- tests: 34
- suites: 7
- passed: 34
- failed/cancelled/skipped/todo: 0/0/0/0
- duration: 7765.495356 ms

The dynamic-port type-generation fixture removed the remaining fixed-port use in `tests/database/generate-types.mjs`; final verification required no retry.

## 23. Lint, typecheck, build, and bootstrap

- `pnpm lint`: exit 0, 0 errors, 20 pre-existing warnings.
- `pnpm typecheck`: exit 0.
- `pnpm build`: exit 0; Next.js 16.3.8 production build succeeded and `/randevu` is dynamic.
- `pnpm qa:bootstrap`: exit 0; QA fixtures/accounts were created successfully without printing passwords.
- Production `curl /randevu`: HTTP 200 with the expected private/no-store, no-referrer, and noindex headers.

## 24. Git diff check

`git diff --check`: exit 0.

## 25. Files changed

Authoritative documentation:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`
- this report and responsive artifacts

Schema/migration/types:

- `drizzle/migrations/0014_appointment_access_tokens.sql`
- `drizzle/migrations/meta/0014_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema/appointment_access_tokens.ts`
- `src/db/schema/appointments.ts`
- `src/db/schema/index.ts`
- `src/types/database.types.ts`

Domain/integration/security:

- `src/repositories/appointment-access.repository.ts`
- `src/services/appointment-access.service.ts`
- `src/services/appointment.service.ts`
- `src/services/public-booking.service.ts`
- `src/actions/appointment-access.actions.ts`
- `src/actions/public-booking.actions.ts`
- `next.config.ts`
- `src/middleware.ts`

Public UI:

- `src/app/(public)/randevu/page.tsx`
- `src/app/(public)/randevu/layout.tsx`
- `src/app/(public)/randevu/appointment-management-client.tsx`
- `src/components/public/invalid-appointment-link.tsx`
- `src/app/book/[slug]/confirm/booking-form.tsx`

Tests/QA:

- `tests/auth/appointment-access.test.ts`
- `tests/auth/any-staff-public-flow.test.ts`
- `tests/auth/any-staff-concurrency.test.ts`
- `tests/database/appointment-access-token-schema.test.mjs`
- `tests/database/schema.test.mjs`
- `tests/database/generate-types.mjs`
- `scripts/qa-appointment-access-visual.ts`

No unrelated legacy untracked root files were edited or staged.

## 26. Remaining limitations

- TASK 014A is intentionally read-only: there is no public cancellation or rescheduling.
- There is no notification transport, customer account, or automatic historical-token issuance.
- Active parallel links remain valid independently until expiry or explicit revocation.
- Raw secrets are unrecoverable by design; a lost link requires issuing a fresh token.
- Fragment capture requires JavaScript, consistent with the existing interactive Next.js booking flow.
- The 24-hour grace policy is centralized and can be revisited with TASK 014B product rules without schema duplication.

## 27. Recommendation for TASK 014B

Build public cancellation on the same resolver and capability boundary. Add an explicit confirmation UX, revalidate eligibility and business policy server-side at mutation time, preserve generic invalid-link behavior, keep cancellation inside the appointment transaction/service layer, and decide whether successful cancellation retains the read-only link through its normal expiry or revokes selected tokens. Do not expose internal cancellation reasons or weaken authenticated staff controls.

READY FOR TASK 014B — PUBLIC APPOINTMENT CANCELLATION
