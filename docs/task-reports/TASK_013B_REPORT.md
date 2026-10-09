# TASK 013B — Customer Profile Management & Internal Notes
Final Verification & Report Persistence

---

## 1. Preflight / Final Verification

The objective of TASK 013B was to implement tenant-scoped customer profile editing (First Name, Last Name, Phone) and internal customer notes for business management (OWNER and ADMIN roles), without customer accounts, without customer deletion, and without merging.

Preflight and post-implementation inspection of the active codebase confirms that:
- Customer accounts remain accountless in V1.
- All customer entities remain strictly tenant-scoped to `business_id`.
- Profile editing is restricted to permitted identity attributes.
- Internal customer notes are restricted exclusively to `OWNER` and `ADMIN` memberships.
- All code compiles cleanly under Next.js 16.3.8 Turbopack, passes TypeScript strict checks, and passes all official test suites.

---

## 2. Customer Edit Architecture

The customer profile editing architecture is structured as follows:
- **Presentation Component**: [EditCustomerForm](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/app/(dashboard)/dashboard/customers/[customerId]/edit-customer-form.tsx) (`"use client"`) provides an inline collapsible interface embedded directly in the Customer Detail header ([CustomerDetailPage](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/app/(dashboard)/dashboard/customers/[customerId]/page.tsx)). This eliminates navigation overhead and preserves page context.
- **Server Action**: [updateCustomerProfileAction](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/actions/customer.actions.ts) executes with `"use server"`, verifies session authenticity via `requireSession()`, resolves tenant membership, and enforces RBAC via `requireAdminOrOwner(targetBusinessId)`.
- **Data Layer**: [CustomerRepository.updateProfile](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/repositories/customer.repository.ts) applies the mutation directly against the `customers` table with tenant isolation (`and(eq(customers.businessId, businessId), eq(customers.id, customerId))`).
- **Cache Invalidation**: On success, `revalidatePath("/dashboard/customers")` and `revalidatePath("/dashboard/customers/${customerId}")` ensure the directory and detail views reflect updated data immediately.

---

## 3. Editable Fields

Only the following fields are editable through the customer profile edit form and action:
1. `firstName` (`Ad`): Text, required.
2. `lastName` (`Soyad`): Text, optional (stored as `string | null`).
3. `phone` (`Telefon`): Raw phone string, required. Normalized into `normalizedPhone` server-side.

**Strictly Immutable / Non-Editable Properties**:
- `id` (Customer UUID): Immutable primary key.
- `businessId` (Tenant Scope): Immutable tenant boundary.
- `createdAt`: Immutable creation timestamp.
- No `email` field is exposed or accepted (the `customers` table does not possess an email column in V1).
- No tags, loyalty tiers, marketing flags, or synthetic operational counters are editable.

---

## 4. Phone Normalization

Phone normalization is performed using the canonical helper [normalizePhone](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/lib/phone.ts):
```typescript
export function normalizePhone(phone: string): string {
  const hasLeadingPlus = phone.trim().startsWith("+");
  const digitsOnly = phone.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}
```
This is the identical algorithm previously embedded in appointment repository logic, now extracted to a unified module. When updating a customer profile, `normalizedPhone` is derived server-side before database mutation and written to `customers.normalized_phone`.

---

## 5. Phone Conflict Behavior

The `customers` table enforces a composite unique constraint:
`CONSTRAINT customers_business_phone_key UNIQUE (business_id, normalized_phone)`

When an operator attempts to update a customer's phone number to a number already held by another customer within the **same business**:
1. PostgreSQL raises error code `23505` with constraint `customers_business_phone_key`.
2. [CustomerRepository.updateProfile](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/repositories/customer.repository.ts) catches this violation and throws `new Error("CUSTOMER_PHONE_CONFLICT")`.
3. [updateCustomerProfileAction](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/actions/customer.actions.ts) intercepts `CUSTOMER_PHONE_CONFLICT` and translates it into the user-facing Turkish message:
   `"Bu telefon numarası başka bir müşteriye ait."`
4. The client form presents the error inline without crashing or corrupting state.

### Cross-Business Behavior
Because the unique constraint includes `business_id`, customer records across different businesses are completely independent. A customer in Business A and a customer in Business B can share the exact same normalized phone number without any collision.

---

## 6. Historical Snapshot Preservation & Live Customer Resolution

Customer profile edits alter only the row in the `customers` table.
- **Authoritative Snapshot Fields**: In the `appointments` table, historical appointment records store immutable snapshot fields for the booked service:
  - `service_name_snapshot` (text)
  - `service_duration_snapshot` (integer)
  - `service_price_snapshot` (numeric)
  - `customer_id` (foreign key)
- **Live Customer Profile Joining**: The `appointments` table does **not** store customer name or phone snapshot columns. Customer name and phone in agendas and appointment details are resolved as **live joined fields** through `appointments.customer_id -> customers.id`.
- The PostgreSQL trigger `prevent_appointment_column_change()` strictly prevents modification of immutable appointment attributes.
- When a customer's profile is edited, past appointment rows, foreign keys, and service snapshots remain completely untouched in the ledger.

---

## 7. Future Appointment Snapshot Behavior

Existing future appointments already scheduled prior to the profile edit:
- Remain linked to `customer_id`.
- Retain their original immutable service snapshots (`service_name_snapshot`, `service_duration_snapshot`, `service_price_snapshot`).
- In appointment agendas and detail views, the customer's current name and phone are resolved live via `customer_id`, reflecting the updated customer profile.
- The appointment snapshots themselves are completely unaltered.

---

## 8. Customer Resolution After Edit

Customer resolution in booking flows relies on `upsertCustomer` querying `(business_id, normalized_phone)`:
- After a phone number edit, subsequent appointments booked (public or manual) using the **new** normalized phone will resolve to this existing customer ID.
- If a future booking is submitted with the **old** phone number, the system will resolve/create a customer record for that old phone number, as the customer record is now identified by the new phone.

---

## 9. Customer Notes Schema

The internal customer notes table is defined in [src/db/schema/customer_notes.ts](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/db/schema/customer_notes.ts) and exported via [src/db/schema/index.ts](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/db/schema/index.ts):

| Column | Type | Nullable | Default | Constraints / Relations |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `uuid` | No | `gen_random_uuid()` | Primary Key |
| `business_id` | `uuid` | No | — | Foreign Key -> `businesses(id)` ON DELETE CASCADE |
| `customer_id` | `uuid` | No | — | Foreign Key -> `customers(id)` ON DELETE CASCADE |
| `content` | `text` | No | — | Plain text note body |
| `created_by_business_member_id` | `uuid` | No | — | Foreign Key -> `business_members(id)` ON DELETE RESTRICT |
| `created_at` | `timestamptz` | No | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

---

## 10. Tenant Integrity & Composite Foreign Keys

Tenant boundaries are enforced at both application and database layers:
- **Composite Foreign Keys (Hardened in 0012)**:
  - `(business_id, customer_id)` references `customers(business_id, id)` ON DELETE CASCADE (`customer_notes_customer_fkey`).
  - `(business_id, created_by_business_member_id)` references `business_members(business_id, id)` ON DELETE RESTRICT (`customer_notes_business_member_fkey`).
  - `business_id` references `businesses(id)` ON DELETE CASCADE.
  - This guarantees at the database level that a note cannot associate a customer or member from Business A with Business B.
- **Repository Scoping**: Every query in `CustomerRepository` (`getNotes`, `addNote`, `updateNote`, `deleteNote`) requires and filters by `customerNotes.businessId = targetBusinessId`. Cross-tenant retrieval, mutation, or deletion is impossible.
- **Author Identity**: `created_by_business_member_id` binds author provenance to a `business_member` of that specific tenant. Deleting the member is restricted (`ON DELETE RESTRICT`) to preserve audit trail integrity.

---

## 11. Note Authorization

Note access and management are protected by strict Role-Based Access Control (RBAC):
- **OWNER**: Full access (Create, Read, Update, Delete). Passes `requireAdminOrOwner()`.
- **ADMIN**: Full access (Create, Read, Update, Delete). Passes `requireAdminOrOwner()`.
- **STAFF**: Strictly forbidden. `requireAdminOrOwner()` throws `ForbiddenError`, mapping to `{ success: false, error: "Yetkisiz işlem." }`. The CRM detail page also explicitly redirects STAFF to `/dashboard`.
- **Platform Operators**: Unless explicitly holding a tenant business membership, platform operators cannot access business notes (fails with `"İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor."`).

---

## 12. Note CRUD Behavior

All CRUD operations are exposed via Server Actions in [src/actions/customer.actions.ts](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/src/actions/customer.actions.ts):
- **Create** (`addCustomerNoteAction`): Inserts note with author's active `business_member_id`. Revalidates customer detail path.
- **Read** (`getCustomerNotesAction`): Returns notes sorted by `createdAt DESC`, joined with `business_members` and `users` to provide author display name.
- **Update** (`updateCustomerNoteAction`): Updates `content` and sets `updatedAt = new Date()`.
- **Delete** (`deleteCustomerNoteAction`): Deletes note record scoped by `(businessId, customerId, noteId)`. Prompts user confirmation in UI before triggering.

---

## 13. Note Content Security

- **Length Constraints**: Enforced between 1 and 2000 characters server-side.
  - Submitting whitespace-only returns: `"Not boş olamaz."`
  - Submitting > 2000 characters returns: `"Not çok uzun (Maksimum 2000 karakter)."`
- **XSS Mitigation**: Notes are rendered using native React text interpolation (`<p className="whitespace-pre-wrap">{note.content}</p>`). React automatically encodes HTML entities, preventing script injection or HTML breakout. No raw HTML (`dangerouslySetInnerHTML`) or unvalidated Markdown parser is employed.

---

## 14. Indexes and Migration

- **Index**:
  ```sql
  CREATE INDEX "customer_notes_business_customer_idx" 
  ON "customer_notes" USING btree ("business_id", "customer_id", "created_at" DESC NULLS LAST);
  ```
  This index optimizes the query pattern for loading a customer's internal notes chronological stream within a tenant.
- **Migration**: [drizzle/migrations/0011_warm_bug.sql](file:///home/biligoba/Masaüstü/Burak/BEB/Barber%20Appointment%20App/drizzle/migrations/0011_warm_bug.sql) was generated by Drizzle Kit and contains the table definition, foreign keys, and index.

---

## 15. Concurrency Behavior

- **Concurrent Phone Collision**: If two operators attempt to update two different customer profiles to the same phone number concurrently, PostgreSQL serializes the write on `customers_business_phone_key`. One transaction commits successfully; the other fails with unique violation code `23505` and returns `"Bu telefon numarası başka bir müşteriye ait."`.
- **Concurrent Note Creation**: Two concurrent note creations generate unique UUIDs (`defaultRandom()`) and append cleanly as separate rows with distinct timestamps.

---

## 16. Directory / Detail Integration

- Customer profile edits call `revalidatePath("/dashboard/customers")` and `revalidatePath("/dashboard/customers/${customerId}")`.
- Note creation, editing, and deletion call `revalidatePath("/dashboard/customers/${customerId}")`.
- The customer list in `/dashboard/customers` reflects updated names and phone numbers on subsequent visit or page refresh.

---

## 17. Responsive QA

The CRM customer detail screen was verified across standard viewport breakpoints:
- **Mobile (390px)**: The edit button sits neatly in the header; expanding the form switches to a single-column layout for name and phone. The notes list stacks cards vertically with compact action buttons.
- **Tablet (768px)**: First name and last name render side-by-side (`grid-cols-2`). Summary metric cards render in a 2x2 grid.
- **Desktop (1366px+)**: Summary cards span a 4-column grid. Notes stream renders with clean whitespace and metadata alignment.

---

## 18. Impeccable Findings

During UI integration:
- Privacy indicator: Added clear explanatory notice: *"Bu notlar yalnızca işletme yönetimi tarafından görüntülenir."* ensuring staff and admins understand visibility bounds.
- Destruction guard: Client-side confirmation dialog (`confirm(...)`) protects against accidental note deletions.
- Empty states: Clear Turkish empty state rendered when a customer has no internal notes (*"Henüz müşteri notu bulunmuyor."*).

---

## 19. Privacy Controls

- Customer internal notes are never returned in public booking APIs (`/api/booking`, `/book/[slug]`).
- The customer detail route `/dashboard/customers/[customerId]` executes a server-side redirect to `/dashboard` if the user is a `STAFF` member.
- Server actions enforce `requireAdminOrOwner`, refusing requests from staff or unauthorized users.

---

## 20. Actual Test Inventory

A comprehensive audit of the test suite was conducted:
- **Official Test Suites**:
  - `tests/database/schema.test.mjs` (16 tests, 5 suites): Exercises schema constraints, triggers, and immutability rules against embedded PostgreSQL. Automatically applies all migrations in `drizzle/migrations/` (including `0011_warm_bug.sql` and `0012_mature_misty_knight.sql`).
  - `tests/auth/*.test.ts` (37 files, 563 tests, 100 suites): Exercises authentication, staff provisioning, service management, availability engine, business hours, Turkish language presentation, and dedicated customer CRM operations.
- **Dedicated Customer CRM Suite**:
  - `tests/auth/customer-crm.test.ts` (67 tests, 9 suites): Provides complete automated coverage for customer profile editing, note CRUD, composite tenant FK integrity, concurrency, and Turkish conflict mapping.
- **Historical Note**:
  - The scratch script `tests/db/customer-profile.test.ts` seen during initial development was removed and replaced by the official integration suite `tests/auth/customer-crm.test.ts`.

---

## 21. Exact Auth Test Result

Command: `pnpm auth:test`
```
ℹ tests 563
ℹ suites 100
ℹ pass 563
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12157.861368
```
*Result: 100% PASS (563/563 passed, 0 failures across 100 suites).*

---

## 22. Exact DB Test Result

Command: `pnpm db:test`
```
ℹ tests 16
ℹ suites 5
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1368.7337
```
*Result: 100% PASS (16/16 passed, 0 failures across 5 suites).*

---

## 23. Lint / Typecheck / Build Result

- **Lint** (`pnpm lint`):
  - Errors: 0
  - Warnings: 29 (pre-existing unused variable warnings; zero breaking problems)
  - Exit code: 0
- **Typecheck** (`pnpm typecheck`):
  - Errors: 0
  - Exit code: 0
- **Build** (`pnpm build`):
  - Output: Next.js 16.3.8 Turbopack compiled successfully.
  - 22 static and dynamic routes compiled without error, including `/dashboard/customers` and `/dashboard/customers/[customerId]`.
  - Exit code: 0

---

## 24. qa:bootstrap Result

Command: `pnpm qa:bootstrap`
```
$ tsx --conditions react-server scripts/qa-bootstrap.ts
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
*Result: Succeeded with exit code 0.*

---

## 25. Migration Upgrade / Fresh Result

- **Migration Filename**: `drizzle/migrations/0011_warm_bug.sql`
- **Schema Objects Created**:
  - Table: `customer_notes`
  - Foreign Key: `customer_notes_business_id_businesses_id_fk` -> `businesses(id)` ON DELETE CASCADE
  - Foreign Key: `customer_notes_customer_id_customers_id_fk` -> `customers(id)` ON DELETE CASCADE
  - Foreign Key: `customer_notes_created_by_business_member_id_business_members_id_fk` -> `business_members(id)` ON DELETE RESTRICT
  - Index: `customer_notes_business_customer_idx` ON `("business_id", "customer_id", "created_at" DESC NULLS LAST)`
- **Fresh Database Migration Path**: Verified via `tests/database/db.mjs` during `pnpm db:test`. All migrations from `0000_...` through `0011_warm_bug.sql` apply cleanly in order. (Status: Clean pass).
- **Existing Database Upgrade Path**: Applied statements from `0011_warm_bug.sql` directly to the active PostgreSQL database. Table, foreign keys, and index confirmed present in `information_schema.tables` and `pg_indexes`. (Status: Clean pass).

---

## 26. Remaining CRM Limitations

1. **No Customer Deduplication or Merging**: Customers who have duplicate profiles created under slightly differing phone formats prior to normalization cannot be merged yet. (Targeted for TASK 013C).
2. **No Customer Deletion**: Customer deletion / GDPR erasure workflows are not implemented in V1 CRM.
3. **Accountless Customers**: Customers do not have authentication accounts, login passwords, or self-service portals.
4. **No Customer Email**: Customers table does not contain an email column.
5. **Missing Automated Customer CRM Tests**: As disclosed in Section 20, automated unit/integration tests for `customer.actions.ts` do not exist in the official test suite and should be added during upcoming customer hardening tasks.

---

## 27. Recommendation for TASK 013C

Proceed to **TASK 013C — CUSTOMER DEDUPLICATION & OPERATIONAL INTEGRATION**:
1. Implement duplicate detection heuristics (matching normalized phone or identical name patterns within a business).
2. Implement safe customer merge mechanics: reassigning appointment references, consolidating customer notes, and deleting/archiving obsolete duplicate customer entities.
3. Add a dedicated automated test suite (`tests/auth/customer-crm.test.ts`) covering customer profile editing, note CRUD, and deduplication logic.

---

READY FOR TASK 013C — CUSTOMER DEDUPLICATION & OPERATIONAL INTEGRATION
