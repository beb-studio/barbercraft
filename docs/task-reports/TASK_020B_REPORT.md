# TASK 020B Report: Production Deployment & Operational Readiness

> **Authoritative Final Implementation Phase Report & Operational Sign-Off**  
> Formally concludes TASK 020 and establishes the active **FEATURE FREEZE** ahead of manual acceptance testing.

---

## 1. Executive Summary & Release Objectives

TASK 020B is the final engineering task of the BarberCraft development lifecycle. It delivers an autonomous, self-hosted, containerized production deployment model with zero managed cloud locks (no Vercel, Supabase, Neon, Firebase, or Railway runtime dependencies).

### Core Architectural Invariants:
1. **Standalone Production Server Runtime**: Built via Next.js `output: "standalone"`, running in Docker via an unprivileged Alpine container (`nextjs:nodejs`, UID 1001) listening on private internal port 3000.
2. **Authoritative Reverse Proxy (Caddy)**: Single reference reverse proxy configured in `Caddyfile` and `docker-compose.production.yml`. Enforces automated Let's Encrypt TLS termination and strictly overwrites `X-Real-IP` and `X-Forwarded-For` with the TCP connection peer IP (`$remote_addr`) to eliminate rate-limiting IP spoofing.
3. **Decoupled Background Notification Worker Daemon**: Standalone Node.js daemon (`scripts/worker.ts` and `src/worker/notification-worker.ts`) executing outbox planning, due delivery materialization, SMS dispatch, terminal failure isolation, and rate limit table maintenance.
4. **Health & Readiness Probe Contract**:
   - `/api/health`: Unauthenticated liveness probe returning HTTP 200 `{ "status": "ok" }` with 0 database queries.
   - `/api/ready`: Container & application readiness probe executing environment assertion and a bounded `SELECT 1` query (`checkDatabaseHealth(3000)`). Returns HTTP 200 `{ "status": "ready" }` or HTTP 503 with minimal machine-safe JSON `{ "status": "not_ready" }`. Zero database credentials, table names, or error stack traces are exposed externally.
   - `docker-compose.production.yml` configures application container healthchecks strictly against `/api/ready`.
5. **Database Connection Budgeting**: PostgreSQL connection pool bounded via `DB_POOL_MAX=10` per container. Total reference Compose footprint consumes ~30–40 connections (well within default 100 `max_connections`).
6. **Disaster Recovery & Operational Tooling**: Logical streaming compressed backup (`scripts/backup/backup.sh`), interactive safe restore (`scripts/backup/restore.sh`), and non-destructive automated verification drill (`scripts/backup/verify-restore.sh`) with strict `0600` permissions.
7. **Feature Freeze Protocol**: Active feature freeze is in effect. No new features, but P0 blockers are fixed immediately (narrow schema, server, or UI fixes permitted); P1 usability issues before pilot; P2 enhancements go to backlog.

---

## 2. End-to-End Reminder Pipeline Audit & Execution Trace

To address **Issue 1**, the entire reminder lifecycle was traced through the actual codebase:

### 2.1 Trace Questions & Architectural Verification

| Question | Architectural Answer | Actual Code Location |
| :--- | :--- | :--- |
| **1. Where are reminder plans created when an appointment is created?** | When an appointment is booked, an `APPOINTMENT_CREATED` event is written to `notification_outbox`. When the worker claims this outbox event, `NotificationPlannerService.processClaimedEvent()` calls `createReminderPlans()`. It queries `business_notification_reminder_rules` and inserts rows into `notification_plans` with `type = 'APPOINTMENT_REMINDER'`, `scheduled_for = appointmentStartAt - offsetMinutes`, and `reminder_offset_minutes`. | `src/services/notification-planner.service.ts` (lines 59–89 & 282–288) |
| **2. When a reminder reaches its due time, what process notices it?** | The standalone background worker daemon (`NotificationWorker.runOnce()`) calls `NotificationDeliveryService.processDueNotificationDeliveries()`, which invokes `materializeDuePlansBatch()`. This runs `NotificationDeliveryRepository.findDuePendingPlans()` querying `notification_plans` where `status = 'PENDING'`, `scheduled_for <= referenceNow`, and no existing delivery exists for that plan on the SMS channel. | `src/services/notification-delivery.service.ts` (lines 226–266 & 507–514) |
| **3. What code materializes the due reminder into `notification_deliveries`?** | `NotificationDeliveryService.materializeDuePlan()` locks the plan and appointment in a PostgreSQL transaction, verifies the appointment is still operational (`PENDING` or `CONFIRMED`), fetches the customer's normalized phone, renders the SMS template, and inserts a `notification_deliveries` row with `status = 'PENDING'`, `channel = 'SMS'`, and `available_at = referenceNow`. | `src/services/notification-delivery.service.ts` (lines 142–224) |
| **4. What worker loop calls that code?** | `NotificationWorker.start()` runs an asynchronous polling loop executing `runOnce()` every `WORKER_POLL_INTERVAL_MS` (default 5000ms). In each cycle, it plans outbox events, materializes due plans, claims due deliveries via `FOR UPDATE SKIP LOCKED`, and dispatches SMS. | `src/worker/notification-worker.ts` (lines 59–120 & 126–163) |
| **5. Can reminders be sent automatically with NO web request occurring?** | **YES**. The background worker is an independent Node.js process (`scripts/worker.ts`) decoupled from Next.js HTTP request lifecycles. It continuously polls the database, materializes due plans, and sends SMS without any incoming web traffic. | `scripts/worker.ts` and `src/worker/notification-worker.ts` |
| **6. What happens after worker restart?** | Idempotency and lease expiration protect all rows. Any due unmaterialized plan is picked up by `findDuePendingPlans()`. Any materialized `PENDING` delivery is claimed by `claimDueDeliveryBatch()`. Any stuck leased row (`PROCESSING`) from an interrupted worker run expires its `available_at` lease and is re-claimed. `UNIQUE(plan_id, channel)` prevents duplicate deliveries. | `src/repositories/notification-delivery.repository.ts` |
| **7. Are cancelled/rescheduled reminder plans handled correctly?** | **YES**. Rescheduling cancels previous pending reminder plans and inserts new ones matching the new start time. Cancellation marks all pending reminder plans as `CANCELLED`. Furthermore, if an appointment was cancelled before a reminder was materialized, `materializeDuePlan()` cancels the plan without creating a delivery; if already materialized, `sendClaimedDelivery()` marks the delivery `CANCELLED` and skips SMS dispatch. | `src/services/notification-planner.service.ts` (lines 292–363) and `src/services/notification-delivery.service.ts` (lines 182–195 & 338–353) |

### 2.2 Deterministic Real-PostgreSQL Reminder E2E Test Suite
The test suite in `tests/auth/notification-worker.test.ts` was expanded and verified against real embedded PostgreSQL:
- **Test 43.1**: APPOINTMENT_CREATED outbox event processed end-to-end to SENT delivery.
- **Test 43.2**: Schedules reminder plan (120m offset); reference clock advances to 1 hour before start; worker iteration materializes delivery and dispatches to `TestSmsProvider` with status `SENT`.
- **Test 43.3**: Cancelled appointment cancels obsolete reminder plan; clock advances to due time; worker executes; **0 reminder deliveries created, 0 SMS dispatched**.
- **Test 43.4**: Rescheduled appointment cancels old reminder plan and creates new reminder plan; clock advances to old due time $\rightarrow$ **0 SMS dispatched**; clock advances to new due time $\rightarrow$ reminder materialized and dispatched to `TestSmsProvider` reflecting updated appointment time.
- **Test 43.5**: Repeated worker iteration on the same due time produces **0 duplicate deliveries, 0 provider calls** (idempotency verified).
- **Test 43.6**: Worker crash / restart simulation: worker 1 plans reminder; worker 2 starts with fresh ID and cleanly claims and dispatches due reminder without deadlock.

**Result**: 10/10 PASS in `tests/auth/notification-worker.test.ts`.

---

## 3. Liveness vs. Readiness in Production

### 3.1 Probes Contract
- **Liveness (`/api/health`)**: Process health only. Returns 200 `{ "status": "ok", "uptimeSeconds": ... }`. Zero database queries.
- **Readiness (`/api/ready`)**: Application and dependency readiness. Validates environment and executes bounded `SELECT 1` with 3000ms timeout (`checkDatabaseHealth`). Returns 200 `{ "status": "ready", "latencyMs": ... }` on success, or 503 `{ "status": "not_ready" }` on failure.
- **Machine-Safe Public Response**: The failure payload of `/api/ready` is strictly `{ "status": "not_ready" }`. Zero database credentials, table names, or error stack traces are exposed externally. Detailed error diagnosis is written strictly to sanitized server logs.

### 3.2 Docker Compose Healthcheck Alignment
In `docker-compose.production.yml`:
- `db`: Uses `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` (interval 5s, 5 retries).
- `migrator`: Ephemeral container running `scripts/migrate.ts`, depends on `db: condition: service_healthy`.
- `app`: Configured with `test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/ready"]`, depends on `db: condition: service_healthy` and `migrator: condition: service_completed_successfully`.
- `worker`: Depends on `db: condition: service_healthy` and `migrator: condition: service_completed_successfully`.
- `proxy` (Caddy): Depends on `app: condition: service_healthy`.

---

## 4. Disaster Recovery & Recovery Objectives (RPO / RTO)

### 4.1 Design Targets vs. Guarantees
- **Tooling Implemented**:
  - `scripts/backup/backup.sh`: Compressed logical dump (`pg_dump | gzip -9`) with `0600` permissions and automated 7-day retention pruning.
  - `scripts/backup/restore.sh`: Decompressed transactional restore with mandatory interactive confirmation.
  - `scripts/backup/verify-restore.sh`: Non-destructive verification drill restoring into an ephemeral temporary database.
- **Operator Configuration Required**:
  - Cron scheduler (e.g., hourly cron job).
  - Off-host backup archive replication (S3/offsite).
  - Monitoring backup success and archive sizes.
- **Operational Design Targets**:
  - **Desired RPO**: **$\le$ 1 Hour** (design target dependent on operator hourly backup scheduling; theoretical maximum data-loss window of 1 hour).
  - **Desired RTO**: **$\le$ 15 Minutes** (design target to decompress and restore services via container orchestrator).

---

## 5. Single Authoritative Reverse Proxy: Caddy

- **Authoritative Reference**: **Caddy** (`Caddyfile` and `docker-compose.production.yml`).
  - Automatic HTTPS with Let's Encrypt / ZeroSSL.
  - Enforces `header_up X-Real-IP {remote_host}` and `header_up X-Forwarded-For {remote_host}` to prevent IP spoofing.
- **Optional Alternative**: `nginx.conf` is retained solely as an optional alternative for environments where organizational policy mandates Nginx. It is explicitly labeled:
  `# OPTIONAL ALTERNATIVE — NOT THE REFERENCE DEPLOYMENT`.

---

## 6. Container Runtime Verification Status

- **Compose Configuration**: Validated via `docker compose -f docker-compose.production.yml config` with exit code 0.
- **Container Daemon Verification Note**: Full container daemon launch (`docker compose up`) requires root or `docker` group socket access (`/var/run/docker.sock`). In restricted build environments where the docker socket is unprivileged, full daemon container execution must be executed as a mandatory pre-pilot operator sign-off check on the target production host.

---

## 7. Database Connection Budget

| Component | Max Connections | Concurrency / Lifecycle | Total Peak Connections |
| :--- | :---: | :--- | :---: |
| **`app` (Next.js Standalone)** | `10` (`DB_POOL_MAX`) | Long-lived pool | 10 |
| **`worker` (Notification Worker)**| `10` (`DB_POOL_MAX`) | Long-lived pool | 10 |
| **`migrator` (Migration Runner)** | `1` | Ephemeral (exits before app/worker start) | 0 (post-boot) |
| **Reserved Admin / Backups / psql** | — | Operational margin for `pg_dump` and CLI | 10–20 |
| **Total Reference Footprint** | — | Bounded active connections | **~30–40** |

**Sizing Formula**:
$$\text{Total Connections} = (N_{\text{app}} \times \text{DB\_POOL\_MAX}) + (N_{\text{worker}} \times \text{DB\_POOL\_MAX}) + 20 \le \text{PostgreSQL max\_connections}$$

---

## 8. Better Auth `internalAdapter` Compatibility Risk

- **Installed Version**: Pinned strictly to `better-auth: 1.7.7` in `package.json` (no caret `^`) and locked in `pnpm-lock.yaml`.
- **Administrative Provisioning**: Uses `internalAdapter.createUser` and `internalAdapter.linkAccount` in `src/lib/auth/admin-user.ts` to provision initial business OWNERs and STAFF while public registration remains permanently disabled (`disableSignUp: true`).
- **Controlled Compatibility Risk**: Because these adapter methods are internal to Better Auth, any future Better Auth upgrade MUST be preceded by running the complete authentication and provisioning test suites (`tests/auth/auth.test.ts`, `tests/auth/platform-provisioning.test.ts`, `tests/auth/production-deployment.test.ts`) before deployment.

---

## 9. Manual Acceptance Routes & Capability Token Contract

### 9.1 Actual Route Tree
- **Public Customer Booking**: `/book/[slug]`
- **Customer Self-Service Capability**: `/randevu#<token>` (The client parses the raw hash token via `window.location.hash.slice(1)` and immediately scrubs it via `window.history.replaceState`).
- **Staff Workspace**: `/dashboard` (Automatically renders `StaffDashboardView` when `role === "STAFF"`; zero financial data).
- **Staff Daily Agenda**: `/dashboard/appointments` (Renders `DailyAgendaView`).
- *(Note: There is no `/dashboard/agenda` route.)*
- **Business Owner / Admin Workspace**: `/dashboard` (Renders business analytics and command center when `role === "OWNER"` or `"ADMIN"`).
- **Platform Super Admin Console**: `/platform`

---

## 10. Feature Freeze Policy & Defect Severity Protocol

- **FEATURE FREEZE IS IN EFFECT**: Zero new product features, scope expansions, or gratuitous refactors.
- **Defect Severity Protocol**:
  - **P0 Blockers**: Fixed immediately. Narrow schema migrations, server fixes, or targeted UI corrections are explicitly permitted if required to resolve a P0 blocker.
  - **P1 Usability / Launch-Critical Defects**: Resolved before pilot rollout.
  - **P2 Backlog**: Non-critical enhancements deferred to post-launch backlog.
  - *This is a strict feature freeze, not a bugfix freeze.*

---

## 11. Final Verification Suite Summary

| Check / Suite | Command | Result | Status |
| :--- | :--- | :---: | :---: |
| **Auth, RBAC, Domain, Ops & Worker Suite** | `pnpm auth:test` | 1071 / 1071 passed | **PASS** |
| **Database Integrity & Constraints Suite** | `pnpm db:test` | 53 / 53 passed | **PASS** |
| **Production Deployment Suite** | `tests/auth/production-deployment.test.ts` | 17 / 17 passed | **PASS** |
| **Notification Worker Suite** | `tests/auth/notification-worker.test.ts` | 10 / 10 passed | **PASS** |
| **Typecheck** | `pnpm typecheck` | 0 errors | **PASS** |
| **Linter** | `pnpm lint` | 0 errors | **PASS** |
| **Production Standalone Build** | `pnpm build` | Standalone compiled successfully | **PASS** |
| **QA Bootstrap** | `pnpm qa:bootstrap` | Bootstrapped successfully in non-prod | **PASS** |
| **Git Diff Whitespace Check** | `git diff --check` | 0 errors | **PASS** |
| **Production Security Audit** | `pnpm audit --prod --audit-level critical` | 0 critical vulnerabilities | **PASS** |
| **Compose Configuration Syntax** | `docker compose -f docker-compose.production.yml config` | Validated cleanly (exit code 0) | **PASS** |
| **Browser Smoke Test** | Headless Chromium standalone test | 0 CSP violations, 0 page errors | **PASS** |

---

> **TASK 020 COMPLETE — READY FOR MANUAL ACCEPTANCE & FEATURE FREEZE**
