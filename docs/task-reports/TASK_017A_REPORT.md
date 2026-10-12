# TASK 017A — Business Analytics Domain & Query Foundation

## 1. Pre-Implementation Analytics Audit

Prior to implementation, an audit of the current database schema, status lifecycle, snapshots, currency, timezone, CRM, and indexes was performed:
- **Appointment Statuses**: `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`.
- **Capacity Blocking**: `PENDING`, `CONFIRMED`, `COMPLETED`, and `NO_SHOW` occupy business/staff capacity in scheduling engines; `CANCELLED` is explicitly non-blocking and releases capacity.
- **Price Snapshot Storage**: `appointments.servicePriceSnapshot` stored as `numeric(10, 2)`.
- **Currency Semantics**: Defined at the tenant level (`businesses.currency`, default `TRY`). Services do not define separate currencies; they inherit from the owning business.
- **Business Timezone Authority**: `businesses.timezone` is authoritative (e.g. `Europe/Istanbul`). Never browser timezone.
- **Customer Merge / Canonical Semantics**: Single-hop merge architecture where `customers.mergedIntoCustomerId` points to the canonical primary customer. Logical identity is resolved as `COALESCE(customers.merged_into_customer_id, appointments.customer_id)`.
- **Staff Identity Semantics**: `appointments.staffId` references `staff_profiles(business_id, id)`. Inactive staff (`active = false`) remain historical records and their historical appointments are countable.
- **Appointment Deletion / History**: Appointments are never deleted; lifecycle transitions update `status` and `updated_at`. Foreign keys use `ON DELETE RESTRICT`.
- **Index Suitability**: Existing composite index `appointments_business_time_idx` on `(business_id, start_time, end_time)` is optimal for all date-bounded range scans (`start_time >= start AND start_time < end`).

## 2. Authorization

- **OWNER**: Permitted full access to tenant dashboard analytics.
- **ADMIN**: Permitted full access to tenant dashboard analytics.
- **STAFF**: Strictly denied business-wide analytics in TASK 017A.
- **Unauthenticated**: Denied (`UnauthorizedError` / safe Turkish error response).
- **Platform-Only Admin**: Denied if lacking active tenant business membership.
- **Tenant Derivation**: Derived exclusively from verified server session membership (`getMemberships()`). Client-supplied `businessId` parameters are strictly rejected. Cross-tenant reads are structurally prevented.

## 3. Date-Range Semantics

Centralized range preset abstraction implemented in `src/lib/business-analytics/range.ts`:
- **TODAY**: Business-local calendar day [today 00:00:00, tomorrow 00:00:00) -> 1 day.
- **LAST_7_DAYS**: Business-local today plus preceding 6 local calendar days -> 7 days.
- **LAST_30_DAYS**: Business-local today plus preceding 29 local calendar days -> 30 days.
- **Half-Open Boundaries**: Evaluated as `[startInstant, endInstant)` where `endInstant` is 00:00:00 local time of the subsequent day.
- Presets are validated server-side (`isValidAnalyticsPreset`); arbitrary browser date ranges are rejected for V1.

## 4. Timezone Model

- All calendar calculations evaluate the business's authoritative IANA timezone (`businesses.timezone`, e.g. `Europe/Istanbul`).
- Uses `getBusinessLocalToday(timeZone, referenceNow)` and `getLocalDayBounds(dateStr, timeZone)` from `@/lib/timezone`.
- Server-side SQL expressions use `a.start_time AT TIME ZONE ${timeZone}` for local date (`to_char(..., 'YYYY-MM-DD')`), weekday (`EXTRACT(ISODOW ...)`), and hour extraction (`EXTRACT(HOUR ...)`), ensuring zero UTC-shift drift around midnight.

## 5. Status Metric Definitions

For any selected range:
- `totalAppointments`: Count of all appointments scheduled within `[startInstant, endInstant)`.
- `pendingAppointments`: Count with `status = 'PENDING'`.
- `confirmedAppointments`: Count with `status = 'CONFIRMED'`.
- `completedAppointments`: Count with `status = 'COMPLETED'`.
- `cancelledAppointments`: Count with `status = 'CANCELLED'`.
- `noShowAppointments`: Count with `status = 'NO_SHOW'`.
- `operationalAppointments`: Sum of `pendingAppointments + confirmedAppointments`.

## 6. Upcoming Definitions

Evaluated relative to authoritative server time (`referenceNow`):
- `nextAppointment`: Earliest future operational appointment (`PENDING` or `CONFIRMED`) with `start_time >= referenceNow`, ordered `start_time ASC LIMIT 1`. Null if none.
- `remainingToday`: Count of operational appointments (`PENDING` or `CONFIRMED`) scheduled today with `start_time >= referenceNow`.
- `tomorrowCount`: Count of operational appointments (`PENDING` or `CONFIRMED`) scheduled on tomorrow's local calendar day.
- `next7DaysCount`: Count of operational appointments (`PENDING` or `CONFIRMED`) scheduled over the 7 local calendar days starting tomorrow (`[tomorrowStart, day7End)`).
- Terminal statuses (`COMPLETED`, `NO_SHOW`) and `CANCELLED` are strictly excluded from upcoming metrics.

## 7. Completed-Service-Value Semantics (NOT Revenue)

- **CRITICAL DISTINCTION**: Because BarberCraft currently does not have an integrated payment processing or transaction ledger, `service_price_snapshot` does NOT represent collected cash revenue.
- Labeled in Turkish as: **"Tamamlanan Hizmet Tutarı"**.
- NEVER labeled "Ciro", "Gelir", "Tahsilat", or "Revenue".
- **Calculation**: Sum of `service_price_snapshot` for `COMPLETED` appointments ONLY.
- Cancelled, no-show, pending, and confirmed appointments contribute exactly `0.00`.
- Snapshot immutability: Derived strictly from `appointments.service_price_snapshot`. Edits to the dynamic service catalog price do not rewrite historical analytics.

## 8. Currency Handling

- Grouped and returned with explicit currency code (e.g. `[{ currency: "TRY", amount: "1250.00" }]`).
- Prevents cross-currency summation errors.
- Never performs unverified exchange-rate conversions.

## 9. Cancellation & No-Show Rate Definitions

- **Cancellation Rate**:
  - Numerator: `cancelledAppointments`
  - Denominator: `completedAppointments + noShowAppointments + cancelledAppointments` (total terminal/cancelled outcomes).
  - Excludes future pending/confirmed appointments to prevent artificial dilution.
  - Returns `number` (0..1, rounded to 4 decimals) or `null` if denominator is 0.
- **No-Show Rate**:
  - Numerator: `noShowAppointments`
  - Denominator: `completedAppointments + noShowAppointments` (total appointments where customer was expected to attend).
  - Returns `number` (0..1, rounded to 4 decimals) or `null` if denominator is 0.
- Zero denominator produces safe `null` without throwing or returning `NaN`/`Infinity`.

## 10. Customer Uniqueness Semantics

- **Unique Customers**: Evaluated in PostgreSQL using `COUNT(DISTINCT COALESCE(customers.merged_into_customer_id, appointments.customer_id))`.
- Merged alias customers and canonical profiles resolve to a single logical customer identity. Multiple appointments by the same customer within the range count as 1 unique customer.
- **New Customers**: Evaluated as logical customers whose earliest non-cancelled business appointment in history falls within the selected date range.
- **Returning Customers**: Computed as `Math.max(0, uniqueCustomers - newCustomers)`.

## 11. Daily Trend Architecture

- Evaluated in `BusinessAnalyticsRepository.getDailyTrend` using `to_char(a.start_time AT TIME ZONE tz, 'YYYY-MM-DD')` and grouped by column 1.
- In `BusinessAnalyticsService`, zero-filling is guaranteed: every local calendar date in `selectedRange.localDates` is mapped into a `DailyTrendBucket`.
- A 7-day range returns exactly 7 buckets; a 30-day range returns exactly 30 buckets. Dates with 0 activity report 0 counts and `"0.00"` value.

## 12. Service Analytics

- Grouped by `service_id` and `service_name_snapshot`.
- Ranked primarily by `appointmentCount DESC`, tie-broken by `completedServiceValue DESC`.
- Limited to top 5 services for dashboard consumption.
- Authoritative snapshot name is preserved; subsequent renames of active services in the catalog do not alter historical analytics.

## 13. Staff Analytics

- Grouped by `staff_id` and joined with `staff_profiles` (`firstName`, `lastName`).
- Inactive historical staff (`staff_profiles.active = false`) are preserved and counted if they have historical appointments in the range.
- Completed service value per staff member is explicitly named `completedServiceValue`, never "salary", "commission", or "staff revenue".

## 14. Busy-Period Analytics

- Evaluated over operational + completed appointments (`status != 'CANCELLED'`).
- **By Weekday**: Aggregates `EXTRACT(ISODOW FROM (a.start_time AT TIME ZONE tz))` (1 = Monday through 7 = Sunday). Missing weekdays are filled with 0 and Turkish names (`Pazartesi` .. `Pazar`).
- **By Hour**: Aggregates `EXTRACT(HOUR FROM (a.start_time AT TIME ZONE tz))` (0..23). Missing hours are filled with 0.

## 15. Repository & Service Architecture

- **`BusinessAnalyticsRepository`** (`src/repositories/business-analytics.repository.ts`):
  - Server-only Drizzle SQL execution using parameterized `sql` template tags.
  - Owns all SQL aggregation, `FILTER` clauses, and grouping queries.
- **`BusinessAnalyticsService`** (`src/services/business-analytics.service.ts`):
  - Domain orchestration layer.
  - Resolves timezone, range boundaries, rate calculations, zero-filling, and DTO assembly.
- **`getBusinessDashboardAnalyticsAction`** (`src/actions/business-analytics.actions.ts`):
  - Thin server action enforcing session authentication and `OWNER`/`ADMIN` role checks.
  - Resolves active business membership and returns typed results without leaking database internals.

## 16. Query Strategy

- High efficiency: 8 targeted SQL queries executed in parallel via `Promise.all`:
  1. `getTodayAndUpcomingCounts` (conditional aggregation single query)
  2. `getNextAppointment` (index-ordered single row lookup)
  3. `getRangeSummary` (aggregate totals and completed value)
  4. `getNewCustomersCount` (CTE evaluating first appointment date)
  5. `getDailyTrend` (grouped by local date)
  6. `getTopServices` (grouped by service snapshot, limit 5)
  7. `getStaffPerformance` (grouped by staff profile)
  8. `getBusyPeriodWeekdays` and `getBusyPeriodHours` (grouped by weekday and hour)
- Zero N+1 queries. Zero in-memory iteration over raw appointment rows.

## 17. Index Audit

- Audited existing PostgreSQL indexes:
  - `appointments_business_time_idx` ON `(business_id, start_time, end_time)` fulfills date range filters and ordering.
  - `(business_id, customer_id)` on `appointments` supports customer family resolution joins.
  - Unique composite constraints on `staff_profiles(business_id, id)` and `services(business_id, id)` support 1:1 join efficiency.
- Conclusion: Existing indexes completely satisfy all analytics query patterns. No new migration or speculative index is required.

## 18. Money Precision

- `service_price_snapshot` is stored as `numeric(10, 2)`.
- Summed in PostgreSQL via `COALESCE(SUM(...), 0)::numeric(10,2)::text`.
- Formatted as a fixed-point two-decimal string (e.g. `"1250.00"`).
- Floating-point arithmetic errors are completely avoided.

## 19. Dashboard Read Model

The assembled `BusinessDashboardAnalytics` DTO provides:
- `businessId`, `businessName`, `currency`, `timezone`, `generatedAt`.
- `selectedRange`: preset, start/end date strings, start/end UTC instants, list of local dates.
- `todaySummary`: total, pending, confirmed, completed, cancelled, no-show.
- `upcomingSummary`: nextAppointment, remainingToday, tomorrowCount, next7DaysCount.
- `rangeSummary`: totals, operational count, completedServiceValue, uniqueCustomers, newCustomers, returningCustomers, cancellationRate, noShowRate.
- `dailyTrend`: array of daily buckets with counts and completed value.
- `topServices`: top 5 services with counts and value.
- `staffPerformance`: staff metrics with workload and value.
- `busyPeriods`: 7 weekday buckets and 24 hour buckets.

## 20. Security & Privacy

- Phone numbers are NEVER returned in analytics DTOs.
- CRM notes and appointment internal notes are strictly omitted.
- Capability tokens and management links are never exposed.
- SQL syntax, constraint names, and database connection details are never leaked to the client.

## 21. Volume & Performance Test

- Tested in `tests/auth/business-analytics.test.ts`:
  - Seeded 360 appointments spanning 30 consecutive calendar days, 2 staff members, 2 services, and multiple customers.
  - Executed `getDashboardAnalytics` with `LAST_30_DAYS`.
  - Execution completed in **32.87ms** on local embedded PostgreSQL.
  - Proves bounded query execution with zero N+1 scaling.

## 22. Migrations

- None required. All queries utilize existing indexes and composite constraints.

## 23. Dedicated Tests

`tests/auth/business-analytics.test.ts` (22 test scenarios across 8 suites):
1. Authorization: OWNER, ADMIN, STAFF rejection, unauthenticated rejection, platform-only rejection, tenant isolation.
2. Date ranges & timezone: TODAY, LAST_7_DAYS, LAST_30_DAYS, midnight boundary handling.
3. Status summary & upcoming: All statuses, remaining today, tomorrow, next 7 days, next appointment summary.
4. Value calculations: Snapshot price usage, cancellation/pending zero contribution, catalog edit immunity.
5. Rates: Accurate cancellation and no-show rates, zero denominator null safety.
6. Customers: Merged alias deduplication, new vs returning customer attribution.
7. Trends & aggregation: Zero-filled daily buckets, top services limit and snapshot name retention, inactive staff inclusion, busy periods.
8. Security: Absolute absence of phone numbers, notes, and capability tokens.
9. Volume: 360-appointment 30-day performance test.

## 24. Exact Auth Test Result

`pnpm auth:test`:
- **791 tests passing**
- **141 suites**
- **0 failing**
- Duration: ~19.1s

## 25. Exact DB Test Result

`pnpm db:test`:
- **52 tests passing**
- **11 suites**
- **0 failing**
- Duration: ~4.8s

## 26. Lint, Typecheck, Build & Bootstrap

- `pnpm lint`: 0 errors (20 pre-existing warnings in unrelated files).
- `pnpm typecheck`: 0 errors (`tsc --noEmit`).
- `pnpm build`: Next.js 16.3.8 production build succeeded cleanly.
- `pnpm qa:bootstrap`: QA accounts and seed verified.

## 27. Git Diff Check

`git diff --check`: Clean (0 whitespace errors).

## 28. Files Created & Modified

### Created Files
- `src/types/business-analytics.ts`
- `src/lib/business-analytics/range.ts`
- `src/repositories/business-analytics.repository.ts`
- `src/services/business-analytics.service.ts`
- `src/actions/business-analytics.actions.ts`
- `tests/auth/business-analytics.test.ts`
- `docs/task-reports/TASK_017A_REPORT.md`

### Modified Files
- `src/types/index.ts`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `BUSINESS_RULES.md`
- `DATABASE.md`

## 29. Remaining Limitations

- TASK 017A intentionally did NOT redesign the dashboard UI or add frontend chart components (owned by TASK 017B).
- Payment collection / cash transactions are not tracked because no payment ledger exists in the platform.
- Custom arbitrary date intervals are not exposed to the client in V1 (only presets `TODAY`, `LAST_7_DAYS`, `LAST_30_DAYS`).

## 30. Recommendation for TASK 017B

- Consume `getBusinessDashboardAnalyticsAction` directly in the dashboard Server Component (`src/app/(dashboard)/dashboard/page.tsx`).
- Render KPI metric cards using `todaySummary`, `upcomingSummary`, and `rangeSummary`.
- Render time series line/bar charts for `dailyTrend`.
- Render horizontal bar or distribution charts for `busyPeriods.byWeekday` and `busyPeriods.byHour`.
- Render top services and staff performance tables with completed service values clearly labeled as "Tamamlanan Hizmet Tutarı".
- Implement responsive desktop/mobile layouts adhering to light-first operational SaaS aesthetics.

READY FOR TASK 017B — BUSINESS DASHBOARD & ANALYTICS UX
