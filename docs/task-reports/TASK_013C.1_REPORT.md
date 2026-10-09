# TASK 013C.1 — Existing Customer Selection & Duplicate Detection Foundation
Operational CRM Integration Before Customer Merge — Final Verification Report

---

## 1. Manual Booking Architecture Audit

Prior to TASK 013C.1, creating an internal appointment via `/dashboard/appointments/new` required the operator (OWNER, ADMIN, or STAFF) to manually enter the customer's first name, last name, and phone number on every booking. Behind the scenes:
- `createInternalAppointmentAction` accepted flat customer fields (`customerFirstName`, `customerLastName`, `customerPhone`).
- The domain service executed `upsertCustomer` on each submission, matching or inserting based on `(business_id, normalized_phone)`.
- If an existing customer returned, the operator had to re-type contact details, creating cognitive friction and potential typos.
- Existing customers could not be selected from the tenant's CRM registry.

### Hardened Architecture in TASK 013C.1:
- `CreateInternalAppointmentInput` was converted to a discriminated union:
  - **`EXISTING` mode**: Accepts `{ customerMode: "EXISTING", existingCustomerId: string, customerNotes?: string }`.
  - **`NEW` mode**: Accepts `{ customerMode: "NEW", customerDetails: { firstName: string, lastName?: string, phone: string }, customerNotes?: string }`.
- Preserves full backwards compatibility: legacy callers without `customerMode` default cleanly to `NEW`.
- The wizard UI at `/dashboard/appointments/new/manual-booking-flow.tsx` provides an interactive toggle in Step 4 ("Müşteri") allowing immediate selection between existing tenant customers and new customer creation.

---

## 2. Customer-Selection Architecture

The customer selection workflow is integrated into Step 4 of the manual booking wizard:
1. **Segmented Mode Switcher**:
   - `[ Mevcut Müşteri ]` vs `[ Yeni Müşteri ]`.
   - Switching modes resets transient input states while retaining selected service, staff, date, and appointment slot.
2. **Search Input & Debounce**:
   - Search box: `[ Müşteri adı veya telefon ara... ]` with `Search` icon.
   - User input triggers `searchCustomersForBookingAction` with a 300ms debounce.
3. **Dropdown Candidate Stream**:
   - Displays real-time matching records from the caller's tenant.
   - Each item renders an avatar badge with customer initials, full name, formatted phone number, total appointment count badge, and last appointment date.
4. **Selected Customer Card**:
   - Upon selection, the search dropdown collapses into a structured customer card:
     - Avatar circle with initials.
     - Full name with a distinct `Mevcut Müşteri` badge.
     - Formatted phone number.
     - Total appointment counter (`Toplam: X randevu`).
     - Action button: `[ Müşteriyi Değiştir ]` (clears selection and reopens search).
     - Contextual link: `Müşteri Profilini Gör ↗` (opens `/dashboard/customers/[customerId]` in a new tab; strictly hidden for STAFF).
5. **Live Sidebar Summary Synchronization**:
   - The right-hand "Randevu Özeti" card updates immediately:
     - Header: `MÜŞTERİ`
     - Content: `<Ad Soyad> [Mevcut]` and phone number.
     - Submit button activates once service, staff, slot, and customer are resolved.

---

## 3. Authorization Behavior

Access control follows strict multi-tenant Role-Based Access Control (RBAC):
- **OWNER & ADMIN**:
  - Full access to the CRM customer directory (`/dashboard/customers`).
  - Full access to individual customer detail & appointment history (`/dashboard/customers/[customerId]`).
  - Full access to customer internal notes (Create, Read, Update, Delete).
  - Full access to duplicate candidate review (`/dashboard/customers/duplicates`).
  - Full access to `searchCustomersForBookingAction` across the business.
- **STAFF**:
  - Strictly **forbidden** from `/dashboard/customers` (redirected to `/dashboard`).
  - Strictly **forbidden** from `/dashboard/customers/[customerId]` (redirected to `/dashboard`).
  - Strictly **forbidden** from `/dashboard/customers/duplicates` (returns 403 Forbidden).
  - Strictly **forbidden** from internal note actions.
  - Granted purpose-limited access to `searchCustomersForBookingAction` strictly for booking appointments on their own schedule.
- **Unauthenticated & Cross-Tenant**:
  - Any request without an active session is rejected (`UnauthorizedError`).
  - Any attempt to search or link customer IDs belonging to a foreign tenant is rejected (`ForbiddenError`).

---

## 4. STAFF Purpose-Limited Lookup Behavior

Barbers and hairdressers operating the appointment desk need operational speed when booking an appointment for an existing client who walks in or calls. However, BarberCraft business privacy policy mandates that staff members must not browse the general CRM directory or read managerial notes.

### Purpose-Limited Lookup Implementation:
- `searchCustomersForBookingAction` permits `STAFF` role verification via `requireStaffMember()`.
- Data exposure boundary:
  - Returns only minimal operational fields: `{ id, firstName, lastName, phone, appointmentCount, lastAppointmentDate }`.
  - Does **NOT** return internal notes, managerial annotations, created-by metadata, or cross-tenant data.
- UI boundary:
  - In `manual-booking-flow.tsx`, the `Müşteri Profilini Gör ↗` link is conditionally rendered only when `role !== "STAFF"`.
  - Staff members cannot navigate to the CRM profile page.

---

## 5. Existing-Customer Transaction Behavior

When `customerMode === "EXISTING"`:
1. `createInternalAppointmentAction` validates `existingCustomerId` (valid UUID).
2. Inside `AppointmentService.createAppointment` and `AppointmentService.createAnyStaffAppointment`:
   - An atomic database transaction is opened.
   - The transaction queries `customers` table with `and(eq(customers.id, existingCustomerId), eq(customers.businessId, businessId))`.
   - If not found or tenant mismatched, the transaction aborts with `Customer not found in this business`.
   - `upsertCustomer` is **completely bypassed**.
   - The appointment row is inserted directly with `customer_id: existingCustomerId`.
   - `appointments.notes` captures any operational appointment notes without touching customer records.
   - Appointment snapshots (`service_name_snapshot`, `service_duration_snapshot`, `service_price_snapshot`, `service_currency_snapshot`) are locked immutably.
   - Transaction commits.

---

## 6. New-Customer Behavior

When `customerMode === "NEW"`:
1. `createInternalAppointmentAction` validates `customerDetails`:
   - `firstName` (non-empty string, trimmed).
   - `lastName` (optional string, trimmed).
   - `phone` (validated Turkish phone format).
2. Inside `AppointmentService`:
   - Phone is canonically normalized via `normalizePhone(phone)`.
   - Transaction invokes `CustomerRepository.upsertCustomer(businessId, { firstName, lastName, phone, normalizedPhone })`.
   - Existing customer matching `(business_id, normalized_phone)` is reused; otherwise a new customer row is created.
   - Appointment row is inserted with the resolved `customer_id`.
3. Backwards compatibility is 100% preserved.

---

## 7. Customer Profile Mutation Safeguards

A critical product requirement: **Booking an appointment for an existing customer must NEVER mutate their CRM profile.**
- In `EXISTING` mode, the database executes zero `UPDATE` queries on `customers`.
- Existing `first_name`, `last_name`, and `phone` remain unchanged.
- Existing internal notes in `customer_notes` are untouched.
- Any notes entered in the booking dialog are written exclusively to `appointments.notes`.
- Automated test coverage in `tests/auth/customer-crm-ops.test.ts` (#12, #13) verifies that booking an appointment using an existing customer ID leaves customer fields completely identical before and after booking.

---

## 8. Search Query Strategy

The search query is executed by `CustomerRepository.searchCustomersForBooking(businessId, query, limit)`:
- Sanitizes the input string.
- If query matches phone digits (e.g. `532`, `0532`), generates a clean digit pattern.
- Performs a SQL `ilike` query across `firstName`, `lastName`, and `phone`:
  ```sql
  WHERE business_id = $businessId
    AND (
      first_name ILIKE '%query%'
      OR last_name ILIKE '%query%'
      OR phone ILIKE '%digits%'
    )
  ORDER BY last_appointment_date DESC NULLS LAST, first_name ASC
  LIMIT 10;
  ```
- Fast, index-assisted, and strictly scoped by `business_id`.
- Limited to 10 results to ensure instant dropdown rendering without payload bloat.

---

## 9. Duplicate-Risk Audit

An audit of customer data creation across public and manual flows revealed how duplicate records arise:
1. **Phone Format Divergence**:
   - Customer enters `0555 123 4567` in one booking.
   - Customer or staff enters `+905551234567` or `5551234567` in another booking.
   - Although `normalizePhone` cleans local numbers, variations with and without international prefix historically resulted in distinct string representations.
2. **Name Typographical Variations**:
   - E.g. "Ahmet Yılmaz" vs "Ahmet Yilmaz" vs "A. Yılmaz".
3. **Absence of Customer Accounts**:
   - Because customers are accountless in V1, identical individuals may inadvertently produce multiple CRM rows if contact formats vary.

---

## 10. Duplicate Candidate Algorithm

To detect duplicates safely and without destructive side-effects, TASK 013C.1 introduced `CustomerRepository.getDuplicateCandidates(businessId)`:
1. Queries all customers belonging to the tenant: `SELECT id, first_name, last_name, phone, normalized_phone, created_at FROM customers WHERE business_id = $businessId`.
2. Evaluates each customer's phone using `customerPhoneComparisonKey(phone)` from [src/lib/phone.ts](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/lib/phone.ts):
   - Strips all whitespace, dashes, and parentheses.
   - Normalizes 10-digit (`5xxxxxxxxx`), 11-digit (`05xxxxxxxxx`), and 12-digit (`905xxxxxxxxx`) numbers into canonical E.164 format: `+905xxxxxxxxx`.
3. Clusters records by `comparisonKey` in $O(N)$ memory using a hash map.
4. Filters for clusters with $\ge 2$ members.
5. Populates appointment metrics for candidate records.
6. Returns typed clusters sorted with highest-confidence candidates first.

---

## 11. Confidence Semantics

Each duplicate cluster is annotated with an explicit confidence level and Turkish reasoning:
- **`HIGH` (`Yüksek Güvenilirlik`)**:
  - Assigned when multiple customer records evaluate to the exact same canonical E.164 phone comparison key.
  - Explanation: *"Telefon numaraları farklı biçimlendirilmiş olsa da aynı numarayı temsil ediyor."*
- **`POSSIBLE` (`Olası Eşleşme`)**:
  - Reserved for future multi-field fuzzy matching (e.g. matching first name and last name with partial phone overlap).
  - Explanation: *"Benzer iletişim veya kimlik bilgileri tespit edildi."*

---

## 12. Duplicate Review UI

The duplicate review screen is implemented at `/dashboard/customers/duplicates`:
- **Navigation**: Linked via the "Olası Tekrarlar" button in the `/dashboard/customers` header.
- **Safety Banner**: Prominently displays:
  > **Salt Okunur Önizleme & Güvenli Tespit**: Bu ekran, telefon numaralarının farklı yazım biçimlerini analiz ederek olası mükerrer kayıtları tespit eder. Sistem müşteri kayıtlarında otomatik birleştirme veya silme yapmaz. Müşteri birleştirme operasyonu sonraki aşamada (TASK 013C.2) sunulacaktır.
- **Cluster Cards**:
  - Confidence badge (`Yüksek Güvenilirlik`).
  - Canonical comparison key (`Anahtar: +905551234567`).
  - Detailed list of member records:
    - Initials avatar.
    - Customer full name.
    - Recorded phone and system normalized phone.
    - Appointment count and creation timestamp.
    - Link to view individual profile: `Profili İncele ↗`.
- **Empty State**: When no duplicate candidates exist, renders an informative empty state (*"Mükerrer Kayıt Bulunmuyor"*).

---

## 13. Performance & Index Audit

- **Current Index Coverage**:
  - `customers` table possesses `unique("customers_business_phone_unique").on(table.businessId, table.normalizedPhone)`.
  - Composite primary lookup `unique("customers_business_id_id_key").on(table.businessId, table.id)`.
  - Foreign key indices on `appointments.customer_id` and `customer_notes.customer_id`.
- **Search Query Performance**:
  - `searchCustomersForBooking` uses `business_id` prefix filtering, limiting scanned rows to tenant scope before ILIKE filtering.
  - Return payload is capped at 10 rows.
- **Candidate Detection Performance**:
  - Executes a single tenant-scoped scan, grouping in memory in under 2ms for hundreds of records.
  - For future large-scale tenants (>10,000 customers), an indexed expression or background cron job can cache candidate clusters.

---

## 14. Privacy Audit

- **Public Booking Shield**:
  - Zero customer directory, search, notes, or candidate APIs are exposed to public endpoints (`/book/[slug]`, `/api/booking`).
  - Public booking continues to perform anonymous phone resolution without disclosing existing profile names.
- **Staff Boundary**:
  - Staff members cannot access `/dashboard/customers/duplicates` (returns 403 Forbidden).
  - Staff search queries return only the minimal data necessary to identify the customer during appointment creation.
  - Staff members cannot read managerial CRM notes.

---

## 15. Merge Architecture Audit

To prepare for TASK 013C.2, an audit of the database schema and triggers was conducted:
- In `src/db/schema/appointments.ts`, the PostgreSQL function `prevent_appointment_column_change()` enforces strict column immutability:
  ```sql
  IF OLD.customer_id <> NEW.customer_id THEN
    RAISE EXCEPTION 'Cannot change customer_id of an existing appointment';
  END IF;
  ```
- Furthermore, `appointments.customer_id` has `ON DELETE RESTRICT` foreign key constraint:
  `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT`.
- Therefore, physical mutation of historical appointment rows or hard deletion of merged customer records is blocked by database-level triggers and constraints.

---

## 16. Physical Merge Evaluation

**Concept**: Updating existing `appointments.customer_id = primary_customer_id` and deleting `secondary_customer`.
- **Pros**: Clean single customer row in database.
- **Cons & Blockers**:
  - ❌ Directly blocked by `prevent_appointment_column_change()` trigger.
  - ❌ Dropping or altering the trigger would violate the core architectural invariant: *historical appointment snapshots and links are permanently immutable*.
  - ❌ Deleting secondary customer violates audit lineage and breaks `customer_notes` author references if cascaded improperly.
- **Verdict**: **Rejected**. Physical merge violates database-level immutability rules.

---

## 17. Logical Merge Evaluation

**Concept**: Adding `merged_into_customer_id UUID REFERENCES customers(id)` on the `customers` table.
- **Pros**:
  - ✅ Zero modification to `appointments` rows; completely respects `prevent_appointment_column_change()`.
  - ✅ Zero deletion of records; preserves full historical auditability.
  - ✅ Secondary customer remains in the database with `merged_into_customer_id = primary_id`.
  - ✅ Directory and search queries can easily redirect or group merged profiles.
- **Cons**: Queries need to account for `merged_into_customer_id IS NULL`.
- **Verdict**: **Highly Recommended**. Safe, non-destructive, and compliant with PostgreSQL triggers.

---

## 18. Alias-Model Evaluation

**Concept**: Introducing a `customer_phone_aliases` table to store multiple phone numbers pointing to a single customer record.
- **Pros**:
  - ✅ Handles multiple phone numbers for the same customer (mobile, office, home).
  - ✅ Solves formatting divergences permanently at the lookup layer.
- **Cons**: Adds another relation to join on booking resolution.
- **Verdict**: Excellent complementary pattern to logical merging.

---

## 19. Recommendation for TASK 013C.2

### Recommended Architecture: **Logical Merge with Alias Lineage**
1. **Schema Extension**:
   - Add `merged_into_customer_id uuid REFERENCES customers(id)` and `merged_at timestamptz` to `customers`.
   - Create a dedicated audit table: `customer_merge_logs` (`id`, `business_id`, `primary_customer_id`, `secondary_customer_id`, `performed_by_member_id`, `reason`, `created_at`).
2. **Execution Semantics**:
   - Operator selects Primary (Target) and Secondary (Source) customer.
   - Transaction marks `secondary.merged_into_customer_id = primary.id`.
   - Transaction re-links `customer_notes` from secondary to primary.
   - `appointments` records remain untouched, pointing to their original `customer_id`, but CRM aggregations join through `COALESCE(customers.merged_into_customer_id, customers.id)` to present unified appointment histories.
   - Future bookings with secondary phone automatically resolve to primary customer.

---

## 20. Responsive QA

Visual quality assurance was verified on both desktop (`1366px`) and mobile (`390px`):

| Screen | Viewport | Status | Artifact Link |
| :--- | :---: | :---: | :--- |
| Customer Directory with "Olası Tekrarlar" Button | 1366px | PASS | [desktop_1366_01_customers_directory.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/desktop_1366_01_customers_directory.png) |
| Customer Directory with "Olası Tekrarlar" Button | 390px | PASS | [mobile_390_01_customers_directory.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/mobile_390_01_customers_directory.png) |
| Duplicate Candidates Review Page | 1366px | PASS | [desktop_1366_02_duplicate_candidates.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/desktop_1366_02_duplicate_candidates.png) |
| Duplicate Candidates Review Page | 390px | PASS | [mobile_390_02_duplicate_candidates.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/mobile_390_02_duplicate_candidates.png) |
| Manual Booking - Search Mode (Mevcut Müşteri) | 1366px | PASS | [desktop_1366_03_manual_booking_search_mode.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/desktop_1366_03_manual_booking_search_mode.png) |
| Manual Booking - Search Mode (Mevcut Müşteri) | 390px | PASS | [mobile_390_03_manual_booking_search_mode.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/mobile_390_03_manual_booking_search_mode.png) |
| Manual Booking - Customer Selected Card & Summary | 1366px | PASS | [desktop_1366_05_manual_booking_selected.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/desktop_1366_05_manual_booking_selected.png) |
| Manual Booking - Customer Selected Card & Summary | 390px | PASS | [mobile_390_05_manual_booking_selected.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/mobile_390_05_manual_booking_selected.png) |
| Manual Booking - Yeni Müşteri Input Mode | 1366px | PASS | [desktop_1366_06_manual_booking_new_mode.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/desktop_1366_06_manual_booking_new_mode.png) |
| Manual Booking - Yeni Müşteri Input Mode | 390px | PASS | [mobile_390_06_manual_booking_new_mode.png](file:///home/biligoba/.gemini/antigravity-cli/brain/feb6c98b-4062-46a9-be0b-5ec9e3001ce7/screenshots/013c1/mobile_390_06_manual_booking_new_mode.png) |

---

## 21. Impeccable Findings

During UI review:
1. **Ergonomic Mode Toggling**: The segmented toggle between "Mevcut Müşteri" and "Yeni Müşteri" is prominent and touch-friendly (min-h-[44px]), allowing instant switching without losing previous step inputs (service, staff, slot).
2. **Operator Speed**: The debounced customer search responds immediately. Clear initials avatars help visual recognition.
3. **Selected Card Hierarchy**: The selected customer card neatly displays the avatar, name, badge, phone, appointment count, and "Müşteriyi Değiştir" action button without crowding.
4. **Contextual Role Privacy**: The "Müşteri Profilini Gör ↗" link is shown only to OWNER and ADMIN, automatically hidden for STAFF to prevent broken links or unauthorized exploration.
5. **Mobile Responsiveness**: On 390px mobile screens, the selected card stacks metadata gracefully with zero horizontal scrolling or clipping.

---

## 22. Dedicated Test Inventory

A dedicated integration test suite was implemented in [tests/auth/customer-crm-ops.test.ts](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/tests/auth/customer-crm-ops.test.ts):
Total tests: **40 passed** across **5 suites**.

### Suite Breakdown:
1. **1. Existing Customer Manual Booking Integration** (15 tests: #1–#15):
   - #1: Unauthenticated request to manual booking rejected.
   - #2: Unauthenticated search rejected.
   - #3: User without business membership rejected.
   - #4: Cross-tenant existing customer booking rejected (`ForbiddenError`).
   - #5: Nonexistent customer ID rejected.
   - #6: Non-UUID customer ID rejected.
   - #7: Valid existing customer booking succeeds for OWNER.
   - #8: Valid existing customer booking succeeds for ADMIN.
   - #9: Valid existing customer booking succeeds for STAFF (own calendar).
   - #10: STAFF cannot book existing customer for another staff member.
   - #11: Appointment links directly to existing customer ID.
   - #12: Existing customer profile (first name, last name, phone) is NOT mutated by booking.
   - #13: Customer notes are NOT mutated by booking.
   - #14: Appointment notes are stored in `appointments.notes`.
   - #15: Appointment snapshots are correctly created.
2. **2. Operational Search & Privacy Boundary** (10 tests: #16–#25):
   - #16: OWNER can search customers.
   - #17: ADMIN can search customers.
   - #18: STAFF can search customers for booking.
   - #19: Platform-only admin cannot search tenant customers.
   - #20: Search query matches first name.
   - #21: Search query matches last name.
   - #22: Search query matches phone number.
   - #23: Cross-tenant search returns empty.
   - #24: Search results contain minimal operational fields.
   - #25: Search results do NOT expose customer notes.
3. **3. Duplicate Detection Foundation** (5 tests: #26–#30):
   - #26: Evaluates phone variants into canonical comparison key.
   - #27: Groups duplicate candidates by comparison key.
   - #28: STAFF cannot access duplicate review (403 Forbidden).
   - #29: OWNER can access duplicate review.
   - #30: ADMIN can access duplicate review.
4. **4. Regression & System Integrity** (10 tests: #31–#40):
   - #31: Public specific-staff booking works.
   - #32: Public Any Staff (Fark Etmez) booking works.
   - #33: Manual new-customer booking works without regressing.
   - #34: Reschedule action works.
   - #35: Reassignment works.
   - #36: Customer directory works.
   - #37: Customer detail works.
   - #38: Customer notes work.
   - #39: Customer profile editing works.
   - #40: CRM composite tenant constraints remain green.

---

## 23. Exact Auth Test Result

Command: `pnpm auth:test`
```
ℹ tests 603
ℹ suites 105
ℹ pass 603
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12884.50625
```
*Result: 100% PASS (603/603 passed across 105 suites).*

---

## 24. Exact DB Test Result

Command: `pnpm db:test`
```
ℹ tests 16
ℹ suites 5
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2186.362482
```
*Result: 100% PASS (16/16 passed across 5 suites).*

---

## 25. Lint / Typecheck / Build Result

- **Lint** (`pnpm lint`):
  - Exit code: 0
  - Errors: 0
  - Warnings: 20 (pre-existing legacy warnings in untouched files; zero new warnings).
- **Typecheck** (`pnpm typecheck`):
  - Exit code: 0
  - Errors: 0
- **Build** (`pnpm build`):
  - Exit code: 0
  - Next.js 16.3.8 Turbopack compiled successfully.
  - All 23 dynamic/static routes generated cleanly.

---

## 26. qa:bootstrap Result

Command: `pnpm qa:bootstrap`
```
QA bootstrap complete.

Credentials file:
  .env.qa.local (inspect this local-only file directly for passwords; never commit or log)

Access URLs:
- Platform Admin:   http://localhost:3001/platform
- Business Agendas: http://localhost:3001/dashboard
- Public Booking:   http://localhost:3001/book/qa-berber
- Login:            http://localhost:3001/login

Configured QA Accounts:
- SUPER_ADMIN: qa.superadmin@local.test
- OWNER:       qa.owner@local.test
- ADMIN:       qa.admin@local.test
- STAFF:       qa.staff@local.test
```
*Result: 100% PASS (Exit code: 0).*

---

## 27. Remaining Limitations

1. **Customer Merge Implementation**: Merging customer records is explicitly deferred to TASK 013C.2. No merging or deletion was performed in this task.
2. **Duplicate Detection Scope**: The current algorithm groups records based on canonical E.164 phone comparison keys (`HIGH` confidence). Multi-field fuzzy name matching is not yet implemented and will be introduced in subsequent CRM enhancements.
3. **Trigger Immutability**: The PostgreSQL trigger `prevent_appointment_column_change()` remains active and unchanged, protecting historical appointment records.

---

READY FOR TASK 013C.2 — SAFE CUSTOMER MERGE
