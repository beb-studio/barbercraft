# TASK 017B — Business Dashboard & Analytics UX

## 1. Overview & Objective

TASK 017B completes **TASK 017 — Business Dashboard & Analytics** by transforming `/dashboard` into an operational command center for tenant **OWNER** and **ADMIN** users, while preserving an operational daily agenda experience for **STAFF** members without privilege escalation or analytical data leaks.

The UI consumes the domain read model established in TASK 017A (`BusinessAnalyticsService.getDashboardAnalytics`), providing immediate operational situational awareness alongside historical performance analysis.

---

## 2. Design System & Manual Design Audit

> [!NOTE]
> The automated Impeccable tool was unavailable in the current environment. A focused manual design audit was conducted according to the guidelines in `DESIGN.md` and `UX_RULES.md`.

### Visual Principles Applied
- **Light-First Administrative Aesthetic**: Built with warm off-white canvas (`#FAFAFA`), pure white card surfaces (`#FFFFFF`), deep slate headers (`#0F172A`), and subtle neutral dividers (`border-border/70`). Strictly avoids dark/gold clichés, heavy gradients, or generic BI card overload.
- **Operational-First Hierarchy**: Today's operational state (appointments count, remaining today, completed today, next upcoming appointment) is positioned directly above the fold before historical analytics.
- **Restrained Semantic Palette**:
  - Slate/navy (`primary`): Navigation, active range tab, general appointment volumes.
  - Emerald: Completed appointments and services.
  - Blue: Unique customer acquisition and new customer volume.
  - Amber: Pending/remaining appointments requiring attention.
  - Red / Muted Zinc: Cancelled and no-show rates.

### Responsive Viewport Verification
- **Mobile (390px baseline)**:
  - Header actions stack cleanly into a full-width wrapped flex layout.
  - Range selector tabs span full width with minimum 44px touch targets.
  - Operational and KPI cards stack into a clean single-column or 2-column grid without horizontal overflow (`overflow-x-hidden`).
  - Next appointment card presents high-density readable metadata.
  - Daily trend chart renders proportional bars with touch labels and a toggleable structured data table.
  - Today's agenda adapts into mobile card list with direct management links.
- **Tablet (768px)**:
  - Operational strip and KPI cards transition to 2-column layout.
  - Top services and staff workload cards sit side-by-side or stacked cleanly.
- **Desktop (1366px – 1920px)**:
  - Full operational command center leverages horizontal canvas width with two-column analytics grids and desktop table views.

---

## 3. Strict Role Separation & STAFF Isolation

### Critical RBAC Enforcement
- **`OWNER` and `ADMIN`**:
  - Receive the full Business Analytics Command Center (`RangeSelector`, `TodayOperationalStrip`, `KpiMetricCards`, `DailyTrendChart`, `TopServicesCard`, `StaffWorkloadCard`, `BusyPeriodsCard`, `CustomerSummaryCard`, and today's agenda stream).
- **`STAFF`**:
  - Server-side guard in `src/app/(dashboard)/dashboard/page.tsx` checks `if (role === "STAFF")` before any analytics query is initiated.
  - Directly renders `<StaffDashboardView>`, passing only their personal operational daily agenda (`getDashboardDailyAgenda` scoped forcefully to `myProfile.id`).
  - `BusinessAnalyticsService` is **never called** for `STAFF`.
  - Exposes zero business-wide performance metrics, zero financial values, zero other staff workloads, and zero customer acquisition totals.

---

## 4. Non-Revenue Semantic Honesty

Because the platform currently does not maintain an authoritative payment ledger, `appointments.service_price_snapshot` represents completed booked service value, **NOT** collected revenue.

- **Authoritative Label**: **"Tamamlanan Hizmet Tutarı"**.
- **Explaining Subtitle & Tooltip**:
  > *"Tamamlanan randevuların kayıtlı hizmet tutarıdır; tahsilat verisi değildir."*
- **Prohibited Terms**: Strictly excluded from user-facing metric labels:
  - "Ciro"
  - "Gelir"
  - "Tahsilat"
  - "Net Gelir"
  - "Revenue"
  - "Kâr"
- Derived exclusively from `service_price_snapshot` of `COMPLETED` appointments. Cancelled, no-show, pending, and confirmed appointments contribute 0.

---

## 5. Information Architecture & Component Hierarchy

1. **Workspace Header**:
   - Title: "Genel Bakış"
   - Role badge: "İşletme Sahibi" or "Yönetici"
   - Contextual subtitle: Localized Turkish date and business name
   - Contextual actions: "Yeni Randevu" (`/dashboard/appointments/new`) and "Ajandaya Git" (`/dashboard/appointments`)
2. **RangeSelector (`src/components/dashboard/analytics/range-selector.tsx`)**:
   - URL-driven segmented control for `Bugün` (`TODAY`), `Son 7 Gün` (`LAST_7_DAYS`), and `Son 30 Gün` (`LAST_30_DAYS`).
   - Displays active date span (e.g. `12 Eki 2026 – 18 Eki 2026`).
   - Accessible `role="tablist"` / `role="tab"` with `min-h-[44px]` touch targets.
3. **TodayOperationalStrip (`src/components/dashboard/analytics/today-operational-strip.tsx`)**:
   - Bugünkü Toplam: Total today appointments count and status badge distribution.
   - Kalan Randevular: Operational appointments remaining today (`remainingToday`).
   - Tamamlanan Randevular: Successfully completed appointments today.
   - Sıradaki Randevu: Next upcoming operational appointment card with customer name, service snapshot, staff name, local time slot, status badge, and direct management link. Calm empty state when none remain.
4. **KpiMetricCards (`src/components/dashboard/analytics/kpi-metric-cards.tsx`)**:
   - Toplam Randevu: Total appointments in selected range with active/pending context.
   - Tamamlanan Randevu: Completed appointments count and completion percentage.
   - Tekil Müşteri: Unique customers with new vs returning breakdown.
   - Tamamlanan Hizmet Tutarı: Formatted currency with explicit non-revenue explanatory subtitle and tooltip.
   - İptal Oranı: Cancellation percentage (safe `null` handling rendering `"—"`).
   - Gelmedi Oranı: No-show percentage (safe `null` handling rendering `"—"`).
5. **DailyTrendChart (`src/components/dashboard/analytics/daily-trend-chart.tsx`)**:
   - Pure CSS/SVG bar chart showing day-by-day appointment volume and completed service ratio.
   - Daily date labels (`12 Eki`, `Pzt`).
   - Interactive hover/focus card showing volume, completion, and service value.
   - Toggleable structured tabular view for keyboard and screen-reader accessibility.
6. **TopServicesCard (`src/components/dashboard/analytics/top-services-card.tsx`)**:
   - Top 5 services ranked by volume, completed counts, completed service values, and relative popularity bars.
7. **StaffWorkloadCard (`src/components/dashboard/analytics/staff-workload-card.tsx`)**:
   - Neutral workload context ("Personel İş Yükü Dağılımı") showing appointment counts, completion counts, and completed service values. Strictly excludes salary or commission terms.
8. **BusyPeriodsCard (`src/components/dashboard/analytics/busy-periods-card.tsx`)**:
   - Weekday distribution (Pazartesi to Pazar) with horizontal proportional bars.
   - Top peak hours of the day (e.g. `14:00 – 15:00`).
9. **CustomerSummaryCard (`src/components/dashboard/analytics/customer-summary-card.tsx`)**:
   - Customer acquisition mix (new vs. returning customer proportion).
   - Upcoming booking forecast (tomorrow and next 7 days counts).
10. **Today's Appointments Agenda Stream**:
    - Preserves desktop table and mobile card view of today's appointments for immediate daily operation.
11. **Quick Shortcuts**:
    - Four 56px touch target cards to "Yeni Randevu", "Randevu Ajandası", "Hizmet Tarifesi", and "Personel Ekibi".

---

## 6. Number & Presentation Formatting

- **Currency (`formatCurrency`)**:
  - Turkish locale formatting (`350 ₺`, `1.250,5 ₺`).
  - Supports non-TRY currencies preserving currency code (`100 EUR`, `150 USD`).
- **Rates (`formatPercentage`)**:
  - Formats 0..1 decimal ratio to Turkish percentage (e.g. `0.125` -> `"%12,5"`).
  - Division-by-zero / null / undefined / NaN safe: returns `"—"`.
- **Range Presets (`getAnalyticsRangePresetLabel`)**:
  - Maps `TODAY` -> `Bugün`, `LAST_7_DAYS` -> `Son 7 Gün`, `LAST_30_DAYS` -> `Son 30 Gün`.

---

## 7. Verification & Test Suite Results

1. **Dedicated Integration Tests (`tests/auth/business-dashboard-ui.test.ts`)**:
   - 13 passing tests verifying:
     - Role-aware routing & strict staff isolation.
     - Scoped agenda for STAFF without analytics leakage.
     - Complete analytics read model for OWNER/ADMIN.
     - Date range preset parsing and safe fallback to `LAST_7_DAYS`.
     - Non-revenue terminology enforcement ("Tamamlanan Hizmet Tutarı" only, prohibited terms absent).
     - Neutral staff workload terminology without salary/commission labels.
     - StaffDashboardView zero-financial isolation.
     - Rate formatting and null-safe division.
     - Mobile touch target (`min-h-[44px]`) and accessibility semantics (`role="tablist"`).
2. **Turkish Presentation Tests (`tests/auth/turkish-language.test.ts`)**:
   - 16 passing tests (added `formatPercentage` and `getAnalyticsRangePresetLabel` assertions).
3. **Business Analytics Domain Tests (`tests/auth/business-analytics.test.ts`)**:
   - 22 passing tests across 8 suites (including 360-appointment volume test in 32ms).
4. **Full Auth Test Suite**:
   - `pnpm auth:test`: **806 tests pass, 0 fail, 0 cancelled** in 19.5s.
5. **Database Test Suite**:
   - `pnpm db:test`: **52 tests pass, 0 fail, 0 cancelled** in 4.6s.
6. **Code Quality**:
   - `pnpm typecheck`: **0 errors**.
   - `pnpm lint`: **0 errors**.
   - `pnpm build`: **Compiled successfully**; all 25 routes validated.
   - `pnpm qa:bootstrap`: **Successfully provisioned**.
   - `git diff --check`: **Clean, zero trailing whitespace or format issues**.

---

TASK 017 COMPLETE — BUSINESS DASHBOARD & ANALYTICS FINALIZED
