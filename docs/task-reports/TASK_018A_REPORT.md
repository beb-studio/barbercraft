# TASK 018A Report: Staff Workspace & Personal Operations Foundation

## 1. Recovery Audit / State Inherited from Interrupted Session
- **Interruption Context**: Previous session terminated unexpectedly due to tool/environment infrastructure disconnection (`NOT_FOUND (code 404)`).
- **Inherited Working Tree**:
  - Found extensive domain and test additions: `src/types/staff-workspace.ts`, `src/services/staff-workspace.service.ts`, `src/actions/staff-workspace.actions.ts`, `src/components/dashboard/staff-dashboard-view.tsx`, and `tests/auth/staff-workspace.test.ts` (64 test scenarios).
  - Modifications in tracked files: `src/actions/staff.actions.ts`, `src/actions/time-blocks.actions.ts`, `src/app/(dashboard)/dashboard/page.tsx`, `src/repositories/time-blocks.repository.ts`, `src/services/time-blocks.service.ts`, `src/types/index.ts`, `tests/auth/staff-time-blocks.test.ts`.
  - Discovered 2 test failures upon recovery:
    1. `tests/auth/staff-time-blocks.test.ts` test 1.4: Legacy test tested that `STAFF` was forbidden from creating time blocks for their own profile (`staffMemberA`). Under TASK 018A self-service rules, `STAFF` can create their own blocks, so the previous session targeted `staffOwnerA`, but the regex in test 1.4 did not match the Turkish forbidden message: `"Kendi personel profiliniz dışındaki zaman bloklarını yönetemezsiniz."`.
    2. `tests/auth/business-dashboard-ui.test.ts`: Test asserted `assert.doesNotMatch(staffViewCode, /priceSnapshot/)`, but `staff-dashboard-view.tsx` had mapped a dummy `priceSnapshot: ""` for a legacy interface.
  - No sound work was discarded; both root causes were addressed with precision.

## 2. Current STAFF Capability Audit
- `STAFF` role is now strictly defined as **Personal Operational Authority**:
  - Can read own daily agenda (today, selected day, current week Monday–Sunday in business timezone).
  - Can view next assigned upcoming appointment.
  - Can see own assigned services (read-only).
  - Can execute authorized lifecycle transitions on assigned appointments (`COMPLETE`, `NO_SHOW`, `CANCEL`).
  - Can reschedule assigned appointments within available slots while keeping staff/service/customer fixed.
  - Can create manual bookings assigned strictly to their own profile.
  - Can manage (create/delete) personal temporary time blocks (`TIME_OFF`, `BREAK`, `BLOCKED`) without appointment overlap.
- Prohibited for `STAFF`:
  - Business-wide analytics, financial values, or pricing snapshots.
  - Viewing other staff members' schedules or appointments.
  - Modifying weekly recurring schedule (`staff_working_hours`).
  - Reassigning appointments (`canReassign: false`).
  - Accessing CRM directory, customer notes, duplicate detection, or merge workflows.

## 3. Final STAFF Authority Matrix

| Capability / Entity | OWNER | ADMIN | STAFF | Customer Capability |
| :--- | :---: | :---: | :---: | :---: |
| Business Analytics (`BusinessAnalyticsService`) | Authoritative | Authoritative | **FORBIDDEN (0%)** | FORBIDDEN |
| Service Price Snapshots / Financials | Authoritative | Authoritative | **SCRUBBED (0%)** | Scrubbed |
| Other Staff Calendars / Appointments | Authoritative | Authoritative | **FORBIDDEN** | FORBIDDEN |
| Own Assigned Appointments | Authoritative | Authoritative | **Personal Read/Update** | View Only |
| Appointment Reassignment (`reassignAppointmentAction`) | Authoritative | Authoritative | **FORBIDDEN** | FORBIDDEN |
| Appointment Status (`COMPLETE`, `NO_SHOW`, `CANCEL`) | Authoritative | Authoritative | **Own Appt Only** | Cancel Only |
| Reschedule Appointment | Authoritative | Authoritative | **Own Appt Only** | Reschedule Only |
| Manual Booking | Any Staff | Any Staff | **Own Profile Only** | N/A (Public Flow) |
| Personal Time Blocks (`TIME_OFF`, `BREAK`, `BLOCKED`) | Any Staff | Non-Owner Staff | **Own Profile Only** | FORBIDDEN |
| Recurring Working Hours (`staff_working_hours`) | Authoritative | Authoritative | **FORBIDDEN (Read-only)** | FORBIDDEN |
| Service Management / Pricing | Authoritative | Authoritative | **FORBIDDEN (Read-only)** | FORBIDDEN |
| Customer Directory & CRM Notes | Full CRM | Full CRM | **FORBIDDEN (Lookup only)** | FORBIDDEN |

## 4. Workspace Read Model
Implemented in `src/types/staff-workspace.ts` and `src/services/staff-workspace.service.ts`:
- `profile`: `StaffWorkspaceProfile` (`staffId`, `firstName`, `lastName`, `title`, `photoUrl`, `isPublicBookingEnabled`, `isActive`).
- `business`: `StaffWorkspaceBusiness` (`businessId`, `businessName`, `timezone`, `localTodayDate`).
- `pulse`: `StaffWorkspaceOperationalPulse` (`totalAppointmentsToday`, `remainingAppointmentsToday`, `completedToday`, `cancelledToday`, `noShowToday`, `weekTotalAppointments`, `weekCompletedAppointments`).
- `nextAppointment`: `StaffWorkspaceNextAppointment | null` (`appointmentId`, `customerName`, `customerPhone`, `serviceName`, `startTime`, `endTime`, `localStartTime`, `localEndTime`, `localDate`, `status`). Note fields are strictly excluded.
- `selectedDayAgenda`: `StaffWorkspaceDayAgenda` (`dateStr`, `dayOfWeek`, `dayName`, `isWorkingDay`, `workingHours`, `appointments`, `timeBlocks`, `totalAppointments`, `completedAppointments`).
- `currentWeekAgenda`: 7 days array (`StaffWorkspaceDayAgenda[]`), Monday through Sunday in business timezone.
- `assignedServices`: `StaffWorkspaceAssignedService[]` (`id`, `name`, `durationMinutes`, `active`).
- `personalTimeBlocks`: `StaffWorkspaceTimeBlock[]` (`id`, `blockType`, `startTime`, `endTime`, `localStartTime`, `localEndTime`, `localDate`, `reason`, `isPast`).

## 5. Date & Week Semantics
- Evaluated strictly in the business's authoritative IANA timezone (`businesses.timezone`).
- Week starts on **Monday** (`dayOfWeek: 1`) and ends on **Sunday** (`dayOfWeek: 0`).
- Boundaries calculated via `getLocalDayBounds` and `getBusinessWeekDays`, generating half-open UTC intervals `[startInstant, endInstant)`.
- Eliminates browser clock discrepancies and midnight boundary edge cases (tested with 23:30 and 00:30 local appointments).

## 6. Appointment Visibility
- Queries filter by `and(eq(appointments.businessId, businessId), eq(appointments.staffId, activeProfile.id))`.
- No appointments belonging to other staff members are returned in the staff agenda, week calendar, or pulse counts.

## 7. Customer Privacy Boundary
- Appointment agenda and next appointment DTOs contain only:
  - `customer.firstName`
  - `customer.lastName`
  - `customer.phone`
- Explicit exclusions:
  - Internal appointment notes (`appointments.notes`) and cancellation reasons (`appointments.cancellation_reason`) are omitted from SQL `select` queries and excluded from all DTOs.
  - `customer_notes` (CRM internal notes) are never queried or embedded.
  - Customer directory (`getCustomerDirectoryAction`), customer details (`getCustomerDetailAction`), customer notes (`getCustomerNotesAction`), and merge tools (`mergeCustomersAction`) reject `STAFF` with `ForbiddenError`.
  - Manual booking search (`searchCustomersForBookingAction`) exposes only basic customer search results (`id`, `firstName`, `lastName`, `phone`).

## 8. Lifecycle Action Policy
- Enforced in `AppointmentService.updateAppointmentStatus`:
  - `STAFF` can only transition appointments where `appointments.staff_id = activeProfile.id`.
  - Permitted statuses: `COMPLETED`, `NO_SHOW`, `CANCELLED`.
  - Terminal statuses are immutable: once `COMPLETED`, `CANCELLED`, or `NO_SHOW`, attempts to change status throw errors.
  - Reassignment (`reassignAppointmentAction`) is strictly forbidden for `STAFF`.

## 9. Reschedule Policy
- Enforced in `AppointmentService.rescheduleAppointmentInternal`:
  - `STAFF` can reschedule their own assigned appointments.
  - Preserves original `staff_id`, original `service_id`, original `customer_id`, and immutable price/service snapshots.
  - Revalidates slot availability using internal scheduling engine with row locking (`SELECT ... FOR UPDATE`).
  - Conflicting slots are atomically rejected.

## 10. Manual Booking Policy
- Enforced in `createManualAppointmentAction`:
  - For `STAFF` callers, `staffId` is resolved exclusively from the verified active staff profile associated with their session.
  - Client-supplied `staffId` is ignored or rejected if it doesn't match the caller's profile.
  - Sets appointment source to `MANUAL_STAFF`.
  - Full scheduling conflict and double-booking checks remain enforced.

## 11. Personal Time-Block Policy
- Self-service enabled for `STAFF` on their own profile:
  - Allowed types: `TIME_OFF`, `BREAK`, `BLOCKED`.
  - `TimeBlockAppointmentOverlapError`: If requested interval overlaps an existing `PENDING` or `CONFIRMED` appointment, creation is rejected with `"Bu zaman aralığında mevcut bir randevunuz bulunuyor."`.
  - Cannot delete past time blocks (`isPast: true`).
  - Cannot create, update, or delete time blocks for other staff members.

## 12. Recurring Schedule Ownership
- Recurring weekly working hours (`staff_working_hours`) remain strictly owned by `OWNER` and `ADMIN`.
- `saveStaffWorkingHoursAction` rejects `STAFF` role with `ForbiddenError` and returns `"Bu işlem için yetkiniz yok."`.

## 13. Assigned-Service Visibility
- `STAFF` can view their assigned bookable services read-only (`assignedServices`).
- Service creation (`createServiceAction`), editing (`updateServiceAction`), and service assignment (`assignStaffServicesAction`) reject `STAFF` role.

## 14. Personal Operational Counts
- Operational pulse counts calculated server-side without financial data:
  - `totalAppointmentsToday`
  - `remainingAppointmentsToday` (pending/confirmed with start time >= reference now)
  - `completedToday`
  - `cancelledToday`
  - `noShowToday`
  - `weekTotalAppointments`
  - `weekCompletedAppointments`

## 15. Weekly Agenda
- 7-day Monday-to-Sunday structure returned by `currentWeekAgenda`.
- Each day includes date string, day of week, day name in Turkish, `isWorkingDay`, working hours interval, assigned appointments, and time blocks.

## 16. Tenant & Profile Authority
- Session resolution flow:
  1. `requireSession()` verifies authenticated user.
  2. `getMemberships()` verifies active business membership.
  3. `staffProfiles` lookup verifies profile exists and `active = true`.
- Zero trust for client-supplied `staffId` or `businessId`.
- Inactive staff profiles or revoked business memberships immediately fail with `ForbiddenError`.

## 17. Concurrency & Locking
- Time block creation acquires row lock on `staffProfiles` (`FOR UPDATE`) within PostgreSQL transaction to serialize overlapping time blocks and appointments.
- Status updates and reschedules execute within serializable/locked transactions ensuring 0 double-bookings and 0 state corruptions under concurrency.

## 18. Query & Index Audit
- Queries utilize existing composite indexes:
  - `appointments(business_id, staff_id, start_time, end_time)`
  - `time_blocks(business_id, staff_id, start_time, end_time)`
  - `staff_services(business_id, staff_id, service_id)`
- Zero N+1 queries. Single batch query covers appointments and time blocks across the entire target week.

## 19. Timezone Behavior
- All parsing and formatting uses `businesses.timezone` (e.g. `Europe/Istanbul`).
- Correctly formats UTC timestamps to local `HH:mm` and `YYYY-MM-DD`.
- Preserves calendar day attribution for early morning and late night appointments.

## 20. OWNER / ADMIN Regression
- OWNER and ADMIN dashboards continue to receive full `BusinessAnalyticsService` command center with all KPI cards, trend charts, and business metrics.
- All existing tests in `tests/auth/business-dashboard-ui.test.ts`, `tests/auth/business-analytics.test.ts`, and `tests/auth/staff-time-blocks.test.ts` pass without degradation.

## 21. Security & Privacy
- Zero financial exposure verified through deep recursive key inspection: no `priceSnapshot`, `servicePriceSnapshot`, `revenue`, `ciro`, or `completedServiceValue` exists in `StaffWorkspaceData`.
- Strict customer privacy: no CRM notes, duplicate candidate data, or customer directory access.
- Turkish-only user-facing error messages and status labels.

## 22. Focused-Test Failures Found During Recovery
1. `tests/auth/staff-time-blocks.test.ts:1.4`: Expected `/role required|yetkiniz yok/i`, but received `"Kendi personel profiliniz dışındaki zaman bloklarını yönetemezsiniz."`.
2. `tests/auth/business-dashboard-ui.test.ts`: Failed `assert.doesNotMatch(staffViewCode, /priceSnapshot/)` due to dummy mapping in `staff-dashboard-view.tsx`.

## 23. Exact Fixes Applied
1. Updated regex in `tests/auth/staff-time-blocks.test.ts` test 1.4 to include `/kendi personel profiliniz/i`.
2. Removed `priceSnapshot` and legacy `FormattedDashboardAppointment` reference from `src/components/dashboard/staff-dashboard-view.tsx`.
3. Removed unused `apptActions` variable in `tests/auth/staff-workspace.test.ts` to satisfy ESLint.
4. Cleaned trailing blank lines at EOF across `PRODUCT.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, and `UX_RULES.md` to pass `git diff --check`.

## 24. Dedicated Tests
- `tests/auth/staff-workspace.test.ts`: **64/64** passing tests across 8 mandatory groups:
  - Group 1: Authority & Identity (8 tests)
  - Group 2: Staff Workspace Read Model (8 tests)
  - Group 3: Customer Privacy & Data Scrubbing (8 tests)
  - Group 4: Appointment Lifecycle & Allowed Transitions (8 tests)
  - Group 5: Reschedule & Manual Booking (8 tests)
  - Group 6: Time Blocks & Availability Management (8 tests)
  - Group 7: Timezone & Week Boundary Correctness (8 tests)
  - Group 8: Concurrency & Invariant Safety (8 tests)

## 25. Stress & Concurrency Results
- Group 8 tests executed repeated real PostgreSQL concurrency races:
  - Concurrent status updates: 0 double transitions.
  - Concurrent reschedules: 0 double bookings.
  - Concurrent time block creation: 0 overlaps.
  - Concurrent appointment booking vs time block creation: 0 conflicting overlaps.
  - 10 iterations race test: 0 race leaks or raw database errors.

## 26. Exact Auth Result
- `pnpm auth:test`:
  - `ℹ tests 870`
  - `ℹ suites 155`
  - `ℹ pass 870`
  - `ℹ fail 0`

## 27. Exact DB Result
- `pnpm db:test`:
  - `ℹ tests 52`
  - `ℹ suites 11`
  - `ℹ pass 52`
  - `ℹ fail 0`

## 28. Lint / Typecheck / Build / Bootstrap
- `pnpm lint`: Pass (0 errors, 20 pre-existing warnings in unrelated files).
- `pnpm typecheck`: Pass (`tsc --noEmit` exited 0).
- `pnpm build`: Pass (`next build` compiled successfully in production mode).
- `pnpm qa:bootstrap`: Pass (all QA accounts verified and provisioned).

## 29. Git Diff Check
- `git diff --check`: Clean (0 whitespace/conflict errors).

## 30. Files Changed / Added
- **New Files**:
  - `src/types/staff-workspace.ts`
  - `src/services/staff-workspace.service.ts`
  - `src/actions/staff-workspace.actions.ts`
  - `src/components/dashboard/staff-dashboard-view.tsx`
  - `tests/auth/staff-workspace.test.ts`
  - `docs/task-reports/TASK_018A_REPORT.md`
- **Modified Tracked Files**:
  - `src/actions/staff.actions.ts`
  - `src/actions/time-blocks.actions.ts`
  - `src/app/(dashboard)/dashboard/page.tsx`
  - `src/repositories/time-blocks.repository.ts`
  - `src/services/time-blocks.service.ts`
  - `src/types/index.ts`
  - `tests/auth/staff-time-blocks.test.ts`
  - `PRODUCT.md`
  - `ARCHITECTURE.md`
  - `BUSINESS_RULES.md`
  - `UX_RULES.md`

## 31. Remaining Limitations
- Mobile UX ergonomics, weekly interactive ribbon selector, touch-optimized time-block creation dialogs, and responsive agenda cards are deferred to TASK 018B.
- Foundation provides full data and action readiness for all planned UX interactions.

## 32. Recommendation for TASK 018B
- TASK 018B should build upon this verified domain foundation to implement:
  - Mobile-first personal daily/weekly agenda views.
  - Touch-optimized status transition sheets (Complete, No-show, Cancel).
  - Ergonomic time-block creation/deletion UI for mobile viewports.
  - Bottom navigation integration tailored to `STAFF` role.

## 33. Security Closeout — Appointment Notes & Customer Contact
- **Appointment Notes (`notes`) Treatment**:
  - Investigation confirmed that `appointments.notes` stores internal/administrative notes entered during booking.
  - In accordance with the TASK 018A privacy boundary, `notes` was **completely removed** from:
    1. TypeScript domain models: `StaffWorkspaceAgendaAppointment` and `StaffWorkspaceNextAppointment` in `src/types/staff-workspace.ts`.
    2. SQL Query Projection: `StaffWorkspaceService.getStaffWorkspace` selectively projects only operational columns, omitting `appointments.notes` and `appointments.cancellation_reason` entirely from database queries.
    3. DTO shaping: `mappedAppointments` and `nextAppointment` omit note fields.
    4. Presentation: `src/components/dashboard/staff-dashboard-view.tsx` contains 0 note references.
- **Customer Phone (`phone`) Exposure Justification**:
  - Customer phone is preserved strictly within assigned operational appointment records (`StaffWorkspaceCustomer` and `StaffWorkspaceNextAppointment`).
  - **Justification**: Matches existing operational barbershop workflow established in `daily-agenda-view.tsx` (`<a href="tel:...">`), where the assigned barber must be able to directly contact their client for real-time chair operations (e.g. running 5 minutes ahead/behind, verifying attendance before marking `NO_SHOW`).
  - Phone numbers cannot be browsed arbitrarily; STAFF has zero access to the customer directory (`getCustomerDirectoryAction`), CRM notes, or unassigned client profiles.
- **Dedicated Privacy Verification Tests**:
  - `tests/auth/staff-workspace.test.ts` test 3.3: Recursive key inspection verifying no keys equal to or ending with `notes`, `customernotes`, `crmnotes`, `internalnotes`, or `appointmentnotes` exist in `StaffWorkspaceData`, plus JSON string value verification.
  - `tests/auth/business-dashboard-ui.test.ts` test 3: Verified `StaffDashboardView` source code does not contain `.notes`, `customerNotes`, or `internalNotes`.
  - `tests/auth/staff-workspace.test.ts` test 8.8: Deep recursive key verification proving zero financial or sensitive fields.

---

READY FOR TASK 018B — STAFF MOBILE WORKSPACE UX
