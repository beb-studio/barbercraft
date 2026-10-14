# RELEASE PREP 0 — Role Taxonomy Cleanup Report

**Date**: 2026-10-14
**Branch**: `release-prep-0-role-taxonomy`
**Base Commit**: `0183c4f` (tag: `task-020-complete`)
**Scope**: Platform & Business Role Taxonomy Normalization, Forward-Only Migration, Authoritative Invariants, UI Standardization, Test Suite & Documentation Verification
**Status**: COMPLETE

---

## 1. Executive Summary & Authoritative Role Model

Before GitHub publication and reproducible-environment preparation, the BarberCraft role model has been made completely unambiguous across database schemas, domain types, authorization guards, services, repositories, server actions, UI pages, test suites, QA fixtures, and authoritative documentation.

The legacy ambiguous term `ADMIN`—which historically existed simultaneously in two completely disjoint authority domains—has been banished from both the platform and tenant domains:
- **Platform `ADMIN`** has been normalized to **`PLATFORM_ADMIN`**.
- **Business / Tenant `ADMIN`** has been normalized to **`MANAGER`**.

### The Authoritative Role Model

| Role Domain | System Identifier | Turkish UI Label | Description & Invariants |
| :--- | :--- | :--- | :--- |
| **Platform** | `SUPER_ADMIN` | Süper Yönetici | Platform owner with root supervision, complete platform-wide operational authority, and administrative provisioning capabilities. |
| **Platform** | `PLATFORM_ADMIN` | Platform Yöneticisi | Standard platform operator managing tenant operational health, suspension/reactivation, and notification outbox/delivery queues. |
| **Business / Tenant** | `OWNER` | İşletme Sahibi | Business account owner with total authority over the tenant account, settings, staff rosters, services, working hours, and analytics. |
| **Business / Tenant** | `MANAGER` | İşletme Yöneticisi | Operational manager handling day-to-day operations, scheduling, service catalogs, staff profiles, and customer CRM. Cannot deactivate or modify the `OWNER`. |
| **Business / Tenant** | `STAFF` | Personel | Service provider restricted strictly to their personal calendar, operational appointments, assigned services, and personal time blocks. Zero financial access, zero customer CRM access. |
| **Public Actor** | `CUSTOMER` | Müşteri | Accountless retail actor. Uses public booking and cryptographic capability tokens for self-service appointment inspection, cancellation, and rescheduling. |

> [!IMPORTANT]
> **CUSTOMER IS NOT AN AUTHENTICATED USER ROLE.** Customers remain strictly accountless and interact exclusively via public booking endpoints and transient cryptographic appointment capabilities (`/randevu#<token>`).

---

## 2. Elimination of Ambiguous `ADMIN` Identifier

Historically, the term `ADMIN` was overloaded:
1. `business_members.role = 'ADMIN'` represented a tenant operational manager.
2. `platform_admins.role = 'ADMIN'` represented a platform operational supervisor.

This ambiguity created confusion in authorization checks, TypeScript types, database queries, and documentation.

In this release prep phase, all active runtime references to standalone `"ADMIN"` in `src/`, `tests/`, and authoritative docs have been eliminated and migrated to either `PLATFORM_ADMIN` or `MANAGER`. Zero standalone `ADMIN` identifiers, aliases, or fallback branches remain in active application source.

---

## 3. Database Migration Strategy & Invariants

To avoid data loss, avoid table recreation, and preserve existing records and audit logs, a forward-only PostgreSQL schema migration was authored:
- **File**: `drizzle/migrations/0021_role_taxonomy_cleanup.sql`
- **Mechanism**: PostgreSQL native `ALTER TYPE ... RENAME VALUE ...`

```sql
-- Migration 0021: Role Taxonomy Cleanup
-- Renames 'ADMIN' to 'MANAGER' in business_member_role
ALTER TYPE "public"."business_member_role" RENAME VALUE 'ADMIN' TO 'MANAGER';

-- Renames 'ADMIN' to 'PLATFORM_ADMIN' in platform_admin_role
ALTER TYPE "public"."platform_admin_role" RENAME VALUE 'ADMIN' TO 'PLATFORM_ADMIN';
```

### PostgreSQL Migration Semantics & Safety
1. **Row Preservation**: `ALTER TYPE ... RENAME VALUE` updates all referenced enum columns in `business_members` and `platform_admins` transactionally without rewriting the underlying table rows or indices.
2. **Deterministic & Forward-Only**: The journal file `drizzle/migrations/meta/_journal.json` was updated with entry index `21` (`0021_role_taxonomy_cleanup`).
3. **Execution**: Migrations run safely via `pnpm db:migrate` (`scripts/migrate.ts`), with automated environment configuration loading.

---

## 4. Drizzle Database Schemas

The Drizzle schema files were updated to declare the canonical enum values:
- `src/db/schema/members.ts`:
  ```typescript
  export const businessMemberRoleEnum = pgEnum("business_member_role", [
    "OWNER",
    "MANAGER",
    "STAFF",
  ]);
  ```
- `src/db/schema/platform.ts`:
  ```typescript
  export const platformAdminRoleEnum = pgEnum("platform_admin_role", [
    "SUPER_ADMIN",
    "PLATFORM_ADMIN",
  ]);
  ```

---

## 5. Domain Types & TypeScript Contracts

All TypeScript types reflecting member and platform roles were updated:
- `src/types/database.types.ts`:
  - `BusinessMemberRole`: `"OWNER" | "MANAGER" | "STAFF"`
  - `PlatformAdminRole`: `"SUPER_ADMIN" | "PLATFORM_ADMIN"`
- `src/types/business.ts`:
  - Updated `StaffListItem` role representation to `BusinessMemberRole`.
- `src/types/platform-operations.ts`:
  - Updated platform operator context types to reference `PlatformAdminRole`.

---

## 6. Auth & RBAC Primitives

The core authorization and permission evaluation layer was refactored:
- `src/lib/auth/roles.ts`:
  - `PLATFORM_ROLES = { SUPER_ADMIN: "SUPER_ADMIN", PLATFORM_ADMIN: "PLATFORM_ADMIN" }`
  - `MEMBER_ROLES = { OWNER: "OWNER", MANAGER: "MANAGER", STAFF: "STAFF" }`
  - `isManagerOrOwner(role)`: returns true if role is `OWNER` or `MANAGER`.
- `src/lib/permissions/rbac.ts`:
  - `ROLE_HIERARCHY`: `OWNER (3) > MANAGER (2) > STAFF (1)`.
  - Permissions matrix updated: `MANAGER` inherits operations, scheduling, service catalogs, staff profiles, and CRM capabilities while remaining strictly subordinated to `OWNER`.
- `src/lib/auth/guards.ts`:
  - `requireManagerOrOwner(businessId)`: Replaces `requireAdminOrOwner`, enforcing active `OWNER` or `MANAGER` membership.
  - `requirePlatformAdmin()`: Validates authenticated user has active `SUPER_ADMIN` or `PLATFORM_ADMIN` record in `platform_admins`.

---

## 7. Turkish Presentation Standardization

User-facing Turkish labels were normalized in `src/lib/presentation.ts`:
- `SUPER_ADMIN` $\rightarrow$ `"Süper Yönetici"`
- `PLATFORM_ADMIN` $\rightarrow$ `"Platform Yöneticisi"`
- `OWNER` $\rightarrow$ `"İşletme Sahibi"`
- `MANAGER` $\rightarrow$ `"İşletme Yöneticisi"`
- `STAFF` $\rightarrow$ `"Personel"`
- `CUSTOMER` $\rightarrow$ `"Müşteri"`

Helper functions `getRoleLabel()`, `getPlatformRoleLabel()`, and `formatUserRole()` strictly emit these canonical Turkish labels with zero untranslated English leaks.

---

## 8. Domain Services Audit

1. **`PlatformAdminService`** (`src/services/platform-admin.service.ts`):
   - CLI grant and role inspection methods operate on `SUPER_ADMIN` and `PLATFORM_ADMIN`.
2. **`StaffService`** (`src/services/staff.service.ts`):
   - RBAC check validates that `MANAGER` can manage `STAFF` profiles, but is strictly prohibited with `ForbiddenError` from modifying or deactivating the `OWNER`.
3. **`StaffWorkspaceService`** (`src/services/staff-workspace.service.ts`):
   - Evaluates staff profile membership with `role = 'STAFF'`, preserving personal operational isolation and zero financial exposure.
4. **`StaffProvisioningService`** (`src/services/staff-provisioning.service.ts`):
   - Handles invitation and role assignment targeting `STAFF` or `MANAGER`.
5. **`CustomerMergeService`** (`src/services/customer-merge.service.ts`):
   - Restricted to active `OWNER` or `MANAGER` memberships.
6. **`DashboardAppointmentsService`** (`src/services/dashboard-appointments.service.ts`):
   - Resolves tenant-wide agenda for `OWNER`/`MANAGER` and personal agenda for `STAFF`.
7. **`QABootstrapService`** (`src/services/qa-bootstrap.service.ts`):
   - Provisions fixtures with canonical roles: `SUPER_ADMIN`, `PLATFORM_ADMIN`, `OWNER`, `MANAGER`, `STAFF`.

---

## 9. Repositories Audit

- **`PlatformOperationsRepository`** (`src/repositories/platform-operations.repository.ts`):
  - Platform operator resolution query filters on `role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN')`.
- **`StaffRepository`** (`src/repositories/staff.repository.ts`):
  - Updated role mappings in member joins and staff roster projections.

---

## 10. Server Actions Audit

All management server actions enforcing administrative tenant authority were upgraded from `requireAdminOrOwner` to `requireManagerOrOwner`:
- `src/actions/business-booking-policy.actions.ts`
- `src/actions/business-notification-settings.actions.ts`
- `src/actions/customer.actions.ts`
- `src/actions/service.actions.ts`
- `src/actions/staff.actions.ts`
- `src/actions/time-blocks.actions.ts`
- `src/actions/business-analytics.actions.ts`

---

## 11. UI Pages & Layouts Audit

- **Navigation & Shell** (`src/components/layout/dashboard-shell.tsx`, `src/components/layout/mobile-nav.tsx`):
  - Role-scoped navigation grants full management menus to `OWNER` and `MANAGER`, while keeping `STAFF` focused strictly on personal agenda and booking.
- **Roster & Staff Detail** (`src/app/(dashboard)/dashboard/staff/page.tsx`, `src/app/(dashboard)/dashboard/staff/[staffId]/page.tsx`):
  - Displays canonical role badges (`"İşletme Sahibi"`, `"İşletme Yöneticisi"`, `"Personel"`).
- **Customers & CRM** (`src/app/(dashboard)/dashboard/customers/page.tsx`, `src/app/(dashboard)/dashboard/customers/[customerId]/page.tsx`):
  - Notes author badge displays `"İşletme Yöneticisi"` instead of `"Yönetici"`.
- **Platform Console** (`src/app/platform/*`):
  - Renders `"Süper Yönetici"` and `"Platform Yöneticisi"` badges.

---

## 12. Comprehensive Test Suites Updates

All test suites across `tests/auth/*` and `tests/database/*` were audited and updated:
1. Created dedicated migration test: `tests/auth/role-taxonomy-migration.test.ts` (verifies forward-only enum migration, existing row preservation, and schema constraints).
2. Created dedicated authorization test: `tests/auth/role-taxonomy-authorization.test.ts` (verifies 15 explicit test cases across `SUPER_ADMIN`, `PLATFORM_ADMIN`, `OWNER`, `MANAGER`, `STAFF`, and `CUSTOMER`).
3. Updated all 26 existing test files to use canonical role identifiers and fixtures.

---

## 13. Verification: Database Schema Test Suite (`pnpm db:test`)

Ran `pnpm db:test`:
- Executed against PostgreSQL database.
- Result: **53 passed, 0 failed** across 12 test suites.

---

## 14. Verification: Auth & Domain Test Suite (`pnpm auth:test`)

Ran `pnpm auth:test`:
- Executed against ephemeral PostgreSQL instances with concurrency and RBAC tests.
- Result: **1090 passed, 0 failed, 0 skipped** across 209 test suites.

---

## 15. Verification: TypeScript Type Checking (`pnpm typecheck`)

Ran `pnpm typecheck`:
- Command: `tsc --noEmit`
- Result: **0 errors**. Typecheck passed cleanly.

---

## 16. Verification: ESLint Verification (`pnpm lint`)

Ran `pnpm lint`:
- Command: `eslint .`
- Result: **0 errors**, 19 non-blocking warnings.

---

## 17. Verification: Production Build (`pnpm build`)

Ran `pnpm build`:
- Command: `next build` (Next.js 16 Turbopack)
- Result: Successfully compiled and collected page data for all 25 static/dynamic routes. Production build generated cleanly.

---

## 18. Verification: QA Fixture Bootstrap (`pnpm qa:bootstrap`)

Ran `pnpm qa:bootstrap`:
- Forward-only migration `0021_role_taxonomy_cleanup.sql` applied to local database.
- Bootstrapped fixture accounts with the exact unambiguous role taxonomy:
  - **Platform**: `SUPER_ADMIN` (`qa.superadmin@local.test`), `PLATFORM_ADMIN` (`qa.platformadmin@local.test`).
  - **Primary Tenant**: `OWNER` (`qa.owner@local.test`), `MANAGER` (`qa.manager@local.test`), `STAFF` (`qa.staff@local.test`), `STAFF 2` (`qa.staff2@local.test`).
  - **Second Tenant**: `OWNER` (`qa.owner2@local.test`), `STAFF` (`qa.staff3@local.test`).

---

## 19. Verification: Git Formatting & Whitespace (`git diff --check`)

Ran `git diff --check`:
- Result: **Exit code 0**. Zero whitespace errors, zero trailing spaces, and zero EOF newline discrepancies.

---

## 20. Authoritative Documentation Updates

All authoritative documentation files were updated to remove ambiguous references and reflect the authoritative role model:
- `PRODUCT.md`
- `SECURITY.md`
- `BUSINESS_RULES.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `UX_RULES.md`

---

## 21. Preserving Feature Freeze

- Strict adherence to FEATURE FREEZE: zero new product features, zero route additions, zero task additions (`NO TASK 021`).
- Work strictly scoped to role taxonomy normalization and preparation for release.

---

## 22. Preservation of Customer Accountless Model

- `CUSTOMER` remains an accountless retail actor and is NOT an authenticated user role.
- Public customer flows continue to operate via unauthenticated public booking endpoints and transient cryptographic capability tokens.

---

## 23. Untracked Artifact Hygiene

- All legacy scratch scripts (`alter.mjs`, `fix.mjs`, etc.) and historical reports (`TASK_003*`, etc.) were left untouched in the workspace root without deletion or modification.

---

## 25. Final Legacy ADMIN Cleanup Closeout

A final source audit identified residual standalone `ADMIN` occurrences across source code, comments, fallbacks, and tests. Each was systematically resolved:

1. **`src/actions/business-analytics.actions.ts`**: Updated docstring from `OWNER and ADMIN` to `OWNER and MANAGER`.
2. **`src/actions/customer.actions.ts`**: Updated inline comment from `Strictly OWNER and ADMIN only` to `Strictly OWNER and MANAGER only`.
3. **`src/actions/service.actions.ts`**: Updated docstring from `role OWNER or ADMIN` to `role OWNER or MANAGER`.
4. **`src/actions/staff.actions.ts`**: Removed legacy error string compatibility branch `error.message === "ADMIN or OWNER role required"`; normalized to canonical `MANAGER or OWNER role required`.
5. **`src/app/(dashboard)/dashboard/appointments/new/manual-booking-flow.tsx`**: Updated JSX comment from `For OWNER & ADMIN` to `For OWNER & MANAGER`.
6. **`src/app/(dashboard)/dashboard/page.tsx`**: Updated role branch comment from `OWNER & ADMIN` to `OWNER & MANAGER`.
7. **`src/app/(dashboard)/dashboard/staff/[staffId]/page.tsx`**: Updated RBAC boundary comment and error redirection comment from `ADMIN` to `MANAGER`.
8. **`src/components/layout/dashboard-shell.tsx`**: Removed redundant legacy `case "ADMIN":` fallback; canonical role routing uses `case "MANAGER":`.
9. **`src/lib/presentation.ts`**: Removed legacy migration fallbacks `case "ADMIN":` from both `getPlatformRoleLabel` and `getRoleLabel`. Domain presentation strictly maps `PLATFORM_ADMIN` and `MANAGER` and rejects obsolete `ADMIN` string.
10. **`src/repositories/staff.repository.ts`**: Updated DB safety comment from `OWNER/ADMIN` to `OWNER/MANAGER`.
11. **`src/lib/auth/roles.ts`**: Removed unused legacy admin-level role alias.
12. **`tests/auth/turkish-language.test.ts`**: Removed obsolete assertions expecting `getRoleLabel("ADMIN")` and `getPlatformRoleLabel("ADMIN")` to return Turkish labels; test now strictly verifies canonical roles.

### Final Verification Results

| Check / Gate | Command | Result |
| :--- | :--- | :--- |
| **Standalone ADMIN Grep** | `git grep -nE '(^|[^A-Z_])ADMIN([^A-Z_]|$)' -- src` | **0 matches (Clean)** |
| **Quoted "ADMIN" Grep** | `git grep -n '"ADMIN"' -- src` | **0 matches (Clean)** |
| **Focused Authorization Test** | `pnpm exec tsx --conditions react-server --test tests/auth/role-taxonomy-authorization.test.ts` | **PASS (15/15 passed)** |
| **Focused Migration Test** | `pnpm exec tsx --conditions react-server --test tests/auth/role-taxonomy-migration.test.ts` | **PASS (4/4 passed)** |
| **Full Auth Test Suite** | `pnpm auth:test` | **PASS (1090/1090 passed across 209 suites)** |
| **Database Test Suite** | `pnpm db:test` | **PASS (53/53 passed across 12 suites)** |
| **ESLint Check** | `pnpm lint` | **PASS (0 errors)** |
| **TypeScript Typecheck** | `pnpm typecheck` | **PASS (0 errors)** |
| **Production Build** | `pnpm build` | **PASS (Next.js production build succeeded)** |
| **Git Whitespace & Diff** | `git diff --check` | **PASS (Clean, zero issues)** |

---

## 26. Release Milestone Status

All verification gates have passed cleanly with zero regressions.

READY FOR RELEASE PREP A — REPRODUCIBLE DEVELOPMENT ENVIRONMENT
