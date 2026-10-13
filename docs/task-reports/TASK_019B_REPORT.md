# TASK 019B Report: Platform Operations Console UX

## 1. Executive Summary & Operational Overview
- **Domain Scope**: Production-grade platform operations console for platform administrators (`SUPER_ADMIN` and `ADMIN`).
- **Objective**: Deliver an intuitive, resilient, and responsive administrative interface enabling platform operators to supervise platform health, inspect individual tenants, audit lifecycle changes, and perform controlled recovery on failed notification events without exposing customer PII, disclosing staff financial compensation, or enabling tenant impersonation.
- **Key Deliverables**:
  1. **Platform Command Center (`/platform`)**: System-wide health metrics (`PlatformOperationsSummary`), notification pipeline status cards (outbox & delivery queues with retryable vs. terminal breakdowns), and quick navigation to newly provisioned and active businesses.
  2. **Tenant Operations Directory (`/platform/businesses`)**: Bounded, paginated directory (`PlatformBusinessOperationsSummary`) with real-time search (by business name and slug), health filter tabs (`Tümü`, `Sağlıklı`, `Dikkat Gerekiyor`, `Askıya Alınmış`), desktop data table ($\ge md$), and responsive mobile cards ($< md$, 390px baseline).
  3. **Tenant Operations Detail (`/platform/businesses/[businessId]`)**: Comprehensive 8-panel inspection view presenting tenant identity, explainable health diagnostics, safe operational rosters, appointment aggregates, notification infrastructure status, terminal failure recovery controls, platform audit timeline, and lifecycle management actions.
  4. **Controlled Recovery Workflows**: Safe modal dialogs using `@base-ui/react/alert-dialog` for requeueing terminal outbox events and deliveries, with truthful copy clarifying that requeuing only re-evaluates message dispatch and does not mutate appointment or customer records.
  5. **Tenant Lifecycle Controls**: Suspend and Reactivate modal dialogs with mandatory reason input ($\ge 5$ characters, validated both client-side and at the service layer) and transparent impact warnings.
  6. **Security & Privacy Boundary Enforcement**: Absolute zero customer PII, zero CRM exposure, zero appointment notes, zero staff compensation/revenue metrics, and zero tenant impersonation affordances.
  7. **Strict Turkish User-Facing Language**: 100% of UI titles, labels, badges, empty states, and modal dialogs are presented in Turkish.

---

## 2. Platform Command Center (`/platform`)

### Architectural Design & Server Component
Located at `src/app/platform/page.tsx`, the Command Center is implemented as an async React Server Component protected by `requirePlatformAdminWithUser()`.

### Key Metrics & Information Panels:
- **Tenant Overview**:
  - `Toplam İşletme`: Total provisioned businesses.
  - `Aktif İşletme`: Active businesses not platform-suspended (does not imply accepting public bookings, which is subject to tenant booking configuration).
  - `Askıya Alınan`: Suspended businesses with halted public bookings.
  - `Kurulumu Tamamlanmamış`: Businesses with incomplete onboarding.
- **Platform Actor Aggregates**:
  - `Aktif Üye & Personel`: Total active tenant members and staff profiles across all businesses.
- **Appointment Activity**:
  - `Toplam Randevu`: All-time appointment count.
  - `Son 7 Gün`: Appointments created or scheduled in the rolling 7-day window.
  - `Bugün`: Appointments scheduled for the current business day.
- **Notification Pipeline Health Cards**:
  - **Outbox Kuyruğu**: Displays total pending backlog (`notificationOutboxBacklog`), transient retryable failures (`retryableOutboxFailures`), and terminal failures (`terminalOutboxFailures`).
  - **SMS Teslimat Durumu**: Displays total sent deliveries, transient delivery retryable failures (`retryableDeliveryFailures`), and terminal delivery failures (`terminalDeliveryFailures`).
- **Recent Tenants Table**: Bounded list of recent tenants with status badges, staff and appointment counts, and direct links to `/platform/businesses/[businessId]`.
- **Backwards Compatibility**: Satisfies legacy assertion checks (string presences required by `tests/auth/platform-admin.test.ts` test 29) while presenting modern TASK 019 operational models.

---

## 3. Tenant Operations Directory (`/platform/businesses`)

### Features & Implementation
Located at `src/app/platform/businesses/page.tsx` with client toolbar `src/app/platform/businesses/_components/business-list-toolbar.tsx`.

### Capabilities:
- **Query Boundedness & Pagination**: Fetches data via `PlatformOperationsService.listBusinessOperations()` with clamped page sizes and deterministic limiters.
- **Search & Filtering**: Live search input for tenant name or slug; tabbed health filter selector supporting `Tümü` (`ALL`), `Sağlıklı` (`HEALTHY`), `Dikkat Gerekiyor` (`ATTENTION`), and `Askıya Alınmış` (`SUSPENDED`).
- **Dual Responsive Layout**:
  - **Desktop View ($\ge md$)**: Rich accessible data table with columns for İşletme Adı, Durum & Sağlık, Yönetici & Personel, Randevu Hacmi, Bildirim Hataları, Son Aktivite, and İşlemler.
  - **Mobile View ($< md$, 390px baseline)**: Structured operational cards displaying business title, slug, creation date, health badge, staff and appointment counts, last operational activity timestamp, and a full-width "Yönet" button meeting the $\ge 44$px touch target guideline.
- **Deterministic Health Badging**:
  - Employs `src/app/platform/_components/health-badge.tsx` rendering emerald (`Sağlıklı`), amber (`Dikkat Gerekiyor`), or red/rose (`Askıya Alınmış`) badges.
  - When status is `ATTENTION` or `SUSPENDED`, renders diagnostic explanation reasons mapped from `BUSINESS_HEALTH_REASON_LABELS` (e.g. *"Aktif personel bulunmuyor"*, *"N adet başarısız bildirim kuyruğu kaydı var"*).

---

## 4. Tenant Operations Detail (`/platform/businesses/[businessId]`)

### Structured 8-Panel Layout
Located at `src/app/platform/businesses/[businessId]/page.tsx`:
1. **Tenant Header**: Business title, slug, ID, creation date, timezone, and currency.
2. **Operational Health Status**: Prominent health badge with full list of active diagnostic reasons explaining why the business is healthy, requires attention, or is suspended.
3. **Safe Operational Rosters**:
   - **İşletme Sahipleri**: Table/list of active business owners displaying Name, Email, Status, and Membership Creation Date.
   - **Personel Profilleri**: Operational staff roster displaying Name, Title, Booking Availability (`Randevu Alınabilir` vs `Kapalı`), and Assigned Services Count.
   - *Privacy boundary*: Zero customer PII and zero staff compensation/revenue data.
4. **Appointment Volume Aggregates**:
   - Four KPI cards displaying volume counts: `Toplam Randevu`, `Son 30 Gün`, `Son 7 Gün`, and `Bugün`.
   - Strictly omits customer names, appointment internal notes, or financial totals.
5. **Notification Infrastructure Breakdown**:
   - 3-column breakdown displaying `Bildirim Kuyruğu (Outbox)` (bekleyen, işlenen, tamamlanan, yeniden denenen, nihai hata), `Zamanlanmış Planlar` (bekleyen, iptal edilen), and `SMS Teslimatları` (gönderilen, bekleyen, yeniden denenen, nihai hata).
   - Displays `Son Başarılı SMS Gönderimi` timestamp.
6. **Terminal Failures & Controlled Recovery**:
   - Bounded list of terminal notification failures (`PlatformTerminalFailureDetail[]`).
   - Displays failure channel, attempt count, last attempted date, sanitized error message, and a "Yeniden Kuyruğa Al" action button.
7. **Platform Audit Timeline**:
   - Chronological audit stream detailing administrative operations (`BUSINESS_SUSPENDED`, `BUSINESS_REACTIVATED`, `NOTIFICATION_OUTBOX_REQUEUED`, `NOTIFICATION_DELIVERY_REQUEUED`, etc.).
   - Discloses actor platform user ID, timestamp, and mandatory operator reason.
8. **Tenant Lifecycle Controls**:
   - Action card offering `Askıya Al` or `Yeniden Aktif Et` buttons with descriptive contextual guidance.

---

## 5. Controlled Recovery Flows (Requeue Actions)

### Components & Mechanics
Implemented in `src/app/platform/businesses/[businessId]/_components/terminal-failure-recovery.tsx` and Server Actions `src/actions/platform-operations.actions.ts`.

### Invariants & Safety Guarantees:
- **Accessible Base UI Modal**: Uses `@base-ui/react/alert-dialog` for modal dialog rendering with explicit backdrop, keyboard navigation, and focus management.
- **Truthful Consequence Notice**: Modal dialog alerts the operator with tailored, truthful copy:
  - For SMS delivery recovery:
    > *"Bu işlem kalıcı başarısız olmuş kaydı tekrar işlenmek üzere teslimat kuyruğuna alır. Randevu veya müşteri durumu değişmez. Yeniden kuyruğa alma işlemi yeni bir SMS gönderim denemesi oluşturabilir."*
  - For Outbox event recovery:
    > *"Bu işlem kalıcı başarısız olmuş kaydı tekrar işlenmek üzere bildirim dış kutusuna alır. Randevu veya müşteri durumu değişmez. Yeniden kuyruğa alma işlemi yeni bir bildirim işleme denemesi oluşturabilir."*
  - Truthfully acknowledges delivery retry uncertainty without impossible "exactly-once" delivery claims.
- **Domain Guarding**:
  - Non-terminal (`PENDING`, `PROCESSING`) items do not render requeue triggers.
  - Attempting to requeue a `SENT` delivery is strictly barred at both the UI and service level (`CannotRequeueSentDeliveryError`), preventing accidental duplicate SMS transmissions.
- **Revalidation**: On successful requeue, server actions call `safeRevalidatePath("/platform/businesses/[businessId]")` and `safeRevalidatePath("/platform/businesses")` ensuring immediate UI synchronization.

---

## 6. Tenant Lifecycle Controls (Suspend & Reactivate)

### Components & Mechanics
Implemented in `src/app/platform/businesses/[businessId]/_components/tenant-lifecycle-actions.tsx` and Server Actions `src/actions/platform-operations.actions.ts`.

### Invariants & Safety Guarantees:
- **Mandatory Operator Reason**:
  - Operators must provide an explanation of at least 5 characters (`reason.trim().length >= 5`).
  - Enforced client-side via form validation and disabled submit button.
  - Enforced server-side in `PlatformOperationsService.suspendBusiness` and `reactivateBusiness`, throwing descriptive error if violated.
- **Transparent Consequence Copy**:
  - Suspend modal warns:
    > *"İşletme askıya alındığında yeni herkese açık randevu oluşturulamaz. Mevcut randevular ve veriler korunur. Mevcut işletme kullanıcılarının panel erişimi bu işlemle otomatik olarak kaldırılmaz."*
  - Reactivate modal explains:
    > *"İşletmeyi yeniden aktifleştirmek, işletmenin herkese açık randevu erişilebilirliğini mevcut işletme ayarlarına göre tekrar kullanılabilir hale getirir. Mevcut veriler ve iç operasyon kayıtları değişmez."*
    > *(Does not claim internal operations were stopped or restarted; does not imply dashboard access was previously blocked).*
- **Audit Logging**: Every status change atomically records an entry to `platform_audit_logs` with actor attribution and mandatory reason.

---

## 7. Security, Privacy & Impersonation Boundary Audit

| Verification Area | Requirement | Status | Implementation Evidence |
| :--- | :--- | :--- | :--- |
| **Customer PII** | Zero customer names, phones, emails, addresses in platform console | **VERIFIED** | DTOs (`PlatformBusinessOperationsDetail`, `PlatformOperationsSummary`) omit customer tables. Tested in `platform-operations-ux.test.ts`. |
| **CRM Exposure** | Zero customer notes, merge histories, duplicate candidates | **VERIFIED** | No CRM tables are joined or queried in `PlatformOperationsRepository`. |
| **Appointment Notes** | Zero appointment internal notes (`notes`) exposed | **VERIFIED** | Only aggregate volume counts (`COUNT(*)`) are queried; appointment rows are not returned. |
| **Notification Privacy** | Zero SMS bodies or message content exposed | **VERIFIED** | Outbox payload and delivery text columns are excluded from DTOs; only sanitized error messages are rendered. |
| **Financial Privacy** | Zero revenue, ciro, price snapshots, or GMV metrics | **VERIFIED** | Platform views show zero financial symbols or currency totals. |
| **Tenant Impersonation** | Zero "Login as Owner" or tenant switching tokens | **VERIFIED** | No impersonation routes or session switching mechanisms exist in the platform namespace. |
| **RBAC Isolation** | Non-platform users and unauthorized callers barred | **VERIFIED** | All routes and actions protected by `requirePlatformAdminWithUser()`. |

---

## 8. Automated Test Verification Matrix

A comprehensive automated test suite was developed in `tests/auth/platform-operations-ux.test.ts` covering 7 distinct operational test categories (28 tests):

1. **Category 1: Platform Command Center (`/platform`) View & Access**:
   - `SUPER_ADMIN` can access `/platform` and view macro operational summary.
   - `ADMIN` can access `/platform` and view macro operational summary.
   - Non-platform `OWNER` without platform admin authority is denied access.
   - Unauthenticated access is denied.
2. **Category 2: Tenant Operations Directory (`/platform/businesses`)**:
   - Platform admins can view paginated tenant listings with health badges.
   - Health filter tabs correctly filter tenants (`HEALTHY`, `ATTENTION`, `SUSPENDED`).
   - Search query filters tenants by name and slug.
3. **Category 3: Tenant Operations Detail (`/platform/businesses/[businessId]`)**:
   - Displays all 8 operational panels.
   - Safe rosters disclose owners and staff without disclosing customer PII or staff compensation.
   - Aggregate appointment counts render without appointment notes or customer records.
   - Displays notification health breakdown and terminal failure list.
4. **Category 4: Controlled Requeue Workflows**:
   - Requeueing terminal outbox event resets status to `PENDING` and appends audit log.
   - Requeueing terminal delivery resets status to `PENDING` and appends audit log.
   - Attempting to requeue `SENT` delivery is rejected with `CannotRequeueSentDeliveryError`.
   - Attempting to requeue non-terminal outbox event is rejected.
5. **Category 5: Tenant Lifecycle Mutations & Semantic Accuracy**:
   - Suspending business requires $\ge 5$ char reason and records `BUSINESS_SUSPENDED` audit log.
   - Rejecting suspension with empty or short reason (< 5 chars).
   - Reactivating business requires $\ge 5$ char reason and records `BUSINESS_REACTIVATED` audit log.
   - Suspension copy truthfully states that new public booking is blocked and member sessions are not revoked.
   - Reactivation copy truthfully states public booking accessibility and does not claim internal operations are restarted.
   - Active business copy does not equate `active = true` with public booking enabled.
6. **Category 6: Recovery Copy & Delivery Uncertainty**:
   - Recovery modal copy explains requeueing does not mutate appointment or customer data.
   - Delivery recovery explicitly states a new SMS send attempt may occur.
   - No impossible "exactly-once" delivery guarantee is claimed.
7. **Category 7: Privacy, Non-Impersonation & Language Compliance**:
   - Zero customer PII is present in platform detail view DTOs.
   - Zero financial metrics or revenue terms are exposed.
   - Zero impersonation capabilities exist across the entire platform code tree.
   - Health badges, diagnostic reason labels, empty states, and modal copy are strictly Turkish.

### Full Test Suite Results:
- `pnpm auth:test`: **984 passing tests** across 185 test suites (0 failed).
- `pnpm db:test`: **52 passing tests** across 12 test suites (0 failed).
- `pnpm typecheck`: **0 errors**.
- `pnpm lint`: **0 errors**.
- `pnpm build`: **Turbopack clean build succeeded** with all static and dynamic platform routes validated.

---

## 9. Visual QA & Responsive Viewport Verification

Visual verification was conducted using Playwright across 4 standard viewports, with screenshot artifacts captured and stored:

| Viewport | Dimensions | Command Center Screenshot | Directory Screenshot | Detail Screenshot |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile** | 390 × 844 | `platform_command_center_mobile_390px.png` | `platform_businesses_directory_mobile_390px.png` | `platform_business_detail_mobile_390px.png` |
| **Tablet** | 768 × 1024 | `platform_command_center_tablet_768px.png` | `platform_businesses_directory_tablet_768px.png` | `platform_business_detail_tablet_768px.png` |
| **Laptop** | 1366 × 768 | `platform_command_center_laptop_1366px.png` | `platform_businesses_directory_laptop_1366px.png` | `platform_business_detail_laptop_1366px.png` |
| **Desktop** | 1920 × 1080 | `platform_command_center_desktop_1920px.png` | `platform_businesses_directory_desktop_1920px.png` | `platform_business_detail_desktop_1920px.png` |

### Visual Inspection Findings:
- **Mobile 390px Baseline**:
  - Horizontal scroll is completely absent (`overflow-x-hidden`).
  - Directory collapses into structured operational cards without clipping.
  - Detail view gracefully stacks the 8 panels with clean vertical rhythm.
  - All interactive buttons and inputs meet the minimum 44px touch target guideline.
- **Tablet (768px)**:
  - Metric grids adapt into 2-column layouts.
  - Directory transitions cleanly to responsive table display.
- **Laptop & Desktop (1366px & 1920px)**:
  - High information density with crisp zinc cards and clear visual hierarchy.
  - Table columns align with tabular numbers (`font-mono`) for operational clarity.

---

## 10. Semantic Closeout — Suspension, Reactivation & Delivery Recovery

A targeted semantic audit and closeout verified all operator-facing lifecycle and notification recovery copy for strict domain accuracy:

1. **Active Business Semantics (`businesses.active = true`)**:
   - `businesses.active = true` strictly denotes that a tenant is **not platform-suspended**.
   - It does not equate to "accepting bookings" or guarantee that public booking is currently live, because tenant-level booking policies, working hours, and bookable staff assignments independently govern public appointment availability.
   - All platform UI badges and tooltips across `/platform`, `/platform/businesses`, and `/platform/businesses/[businessId]` explicitly use the truthful semantic annotation: *"Platform tarafından askıya alınmamış işletme"*.

2. **Exact Suspension Semantics**:
   - Suspending a tenant (`businesses.active = false`) disables new public booking funnels immediately.
   - All existing tenant records, customer histories, staff rosters, services, and appointment schedules are preserved intact.
   - Suspension does NOT revoke or invalidate existing tenant member sessions, nor does it block OWNER, ADMIN, or STAFF dashboard access. Existing internal operations are not globally terminated.
   - Operator modal copy states:
     > *"İşletme askıya alındığında yeni herkese açık randevu oluşturulamaz. Mevcut randevular ve veriler korunur. Mevcut işletme kullanıcılarının panel erişimi bu işlemle otomatik olarak kaldırılmaz."*

3. **Exact Reactivation Semantics**:
   - Reactivating a tenant (`businesses.active = true`) restores public booking accessibility according to the tenant's current booking configuration.
   - Existing tenant data and internal operational records remain unchanged.
   - The UI does not imply that internal operations were previously stopped or restarted, does not claim dashboard access was previously blocked, and does not claim deleted data was restored.
   - Operator modal copy states:
     > *"İşletmeyi yeniden aktifleştirmek, işletmenin herkese açık randevu erişilebilirliğini mevcut işletme ayarlarına göre tekrar kullanılabilir hale getirir. Mevcut veriler ve iç operasyon kayıtları değişmez."*

4. **SMS Delivery Retry Uncertainty**:
   - Requeueing a terminal failed delivery resets its status to `PENDING`, enabling background SMS delivery workers to reprocess the dispatch.
   - Requeuing may result in a new SMS transmission attempt.
   - The recovery modal truthfully warns operators:
     > *"Yeniden kuyruğa alma işlemi yeni bir SMS gönderim denemesi oluşturabilir."*
   - The platform interface never asserts impossible "exactly-once" delivery, never claims the customer definitely did not receive a prior message, and never claims duplicate delivery is impossible under telephony provider retry conditions.
   - Outbox event recovery uses equivalent provider-neutral copy:
     > *"Yeniden kuyruğa alma işlemi yeni bir bildirim işleme denemesi oluşturabilir."*

---

## 11. Conclusion & Declaration

TASK 019B and its semantic closeout have successfully completed all requirements, architectural invariants, privacy boundaries, deterministic health rules, responsive design criteria, and operator copy accuracy standards.

**TASK 019 COMPLETE — PLATFORM OPERATIONS CONSOLE FINALIZED**
