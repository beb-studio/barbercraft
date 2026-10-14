# BarberCraft Production Release Checklist & Protocol

> **Authoritative Release Sign-Off & Verification Checklist**  
> Established in TASK 020B. All items must be verified before declaring production release readiness.  
> Following this task, the codebase enters **FEATURE FREEZE**.

---

## 1. Feature Freeze Policy & Defect Severity Protocol

> [!IMPORTANT]
> **FEATURE FREEZE IS IN EFFECT.**  
> - **NO new product features** may be introduced during acceptance or release testing.  
> - **P0 Blockers**: Fixed immediately. Narrow schema migrations, server fixes, or targeted UI corrections are explicitly permitted if required to resolve a P0 blocker.  
> - **P1 Usability / Launch-Critical Defects**: Addressed and verified prior to pilot launch.  
> - **P2 Enhancements / Improvements**: Deferred to future backlog.  
> - *This is a strict FEATURE freeze, not a BUGFIX freeze.*

---

## 2. Pre-Release Verification Checklist

Execute and pass all steps in the staging or pre-production verification environment:

### 2.1 Code Quality & Static Analysis
- [ ] **Typecheck**: `pnpm typecheck` exits with code 0 (zero TypeScript errors).
- [ ] **Linter**: `pnpm lint` exits with code 0 (zero ESLint warnings or errors).
- [ ] **Whitespace & Formatting**: `git diff --check` reports zero trailing whitespace issues.
- [ ] **Git Tree Purity**: No untracked scratch files, experimental scripts, or uncommitted secrets in tracked paths.

### 2.2 Automated Test Suites
- [ ] **Database Integrity Suite**: `pnpm db:test` passes all tests (53/53 tests passing).
- [ ] **Auth, RBAC, Domain & Security Suite**: `pnpm auth:test` passes all tests (1061+ tests passing).
- [ ] **Production Deployment Suite**: `tests/auth/production-deployment.test.ts` (11/11 tests passing).
- [ ] **Notification Worker Suite**: `tests/auth/notification-worker.test.ts` (6/6 tests passing).

### 2.3 Build & Containerization
- [ ] **Standalone Next.js Build**: `pnpm build` creates `.next/standalone` without warnings.
- [ ] **Docker Multi-Stage Build**: `docker build -t barbercraft:latest .` completes cleanly with unprivileged non-root user (`nextjs:nodejs`).
- [ ] **Static Assets Present**: Standalone build contains `.next/standalone/.next/static` and `.next/standalone/public`.
- [ ] **Dependency Audit**: `pnpm audit --prod --audit-level critical` reports 0 critical security advisories.

### 2.4 Environment & Secret Configuration
- [ ] `NODE_ENV` is set to `production`.
- [ ] `ALLOW_HTTP_LOCALHOST` is **UNSET** (empty or absent).
- [ ] `APP_BASE_URL`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` are identical, start with `https://`, and use valid public hostnames.
- [ ] `BETTER_AUTH_SECRET` is generated via `openssl rand -hex 32` (min 32 characters, non-default).
- [ ] `DATABASE_URL` uses production credentials with SSL/TLS mode enabled where applicable.
- [ ] `DB_POOL_MAX` is configured appropriately (default: 10 connections).
- [ ] SMS Gateway credentials (`NETGSM_*`) are provisioned and verified with active credits if `SMS_PROVIDER=netgsm`.

---

## 3. Deployment Day Step-by-Step Execution

Follow this sequential checklist during production maintenance or release window:

### Step 1: Pre-Release Backup
- [ ] Run logical database backup:
  ```bash
  ./scripts/backup/backup.sh
  ```
- [ ] Verify backup archive exists in `backups/` with non-zero byte size and `0600` permissions.

### Step 2: Apply Database Migrations
- [ ] Run migration container or script:
  ```bash
  docker compose -f docker-compose.production.yml run --rm migrator
  ```
- [ ] Verify migration journal completed without constraint violations or errors.

### Step 3: Deploy Application Service
- [ ] Launch or update the Next.js standalone application container:
  ```bash
  docker compose -f docker-compose.production.yml up -d --no-deps app
  ```
- [ ] Monitor container logs for startup exceptions:
  ```bash
  docker compose -f docker-compose.production.yml logs -f --tail=50 app
  ```

### Step 4: Verify Health & Readiness Probes
- [ ] Test liveness probe:
  ```bash
  curl -i https://randevu.isletmeniz.com/api/health
  # Must return HTTP 200 {"status":"ok"}
  ```
- [ ] Test readiness probe:
  ```bash
  curl -i https://randevu.isletmeniz.com/api/ready
  # Must return HTTP 200 {"status":"ready","latencyMs":...}
  ```

### Step 5: Deploy Notification Worker Daemon
- [ ] Launch or update the background worker container:
  ```bash
  docker compose -f docker-compose.production.yml up -d --no-deps worker
  ```
- [ ] Inspect worker startup logs:
  ```bash
  docker compose -f docker-compose.production.yml logs -f --tail=50 worker
  # Must report: "Notification worker daemon started"
  ```

### Step 6: Edge Proxy & Security Header Audit
- [ ] Verify TLS certificate validity (HTTPS padlock, TLS 1.3 / 1.2).
- [ ] Verify HTTP response headers include:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `Content-Security-Policy: default-src 'self' ...`
  - `Cache-Control: private, no-store...` on sensitive dashboard paths.
- [ ] Verify reverse proxy correctly sets `X-Real-IP` and prevents header spoofing.

---

## 4. Post-Deployment Smoke Verification

Perform rapid validation across all application surface areas:

| Test Area | Target Path | Verification Action | Expected Result |
| :--- | :--- | :--- | :--- |
| **Health Probe** | `/api/health` | HTTP GET | 200 `{ status: "ok" }` |
| **Ready Probe** | `/api/ready` | HTTP GET | 200 `{ status: "ready" }` |
| **Public Booking** | `/book/[slug]` | Load business booking page in browser | Renders active barbers, services, calendar slots |
| **Capability Token** | `/randevu#<token>` | Load appointment via URL fragment | Resolves capability token via hash, scrubs token from URL, displays details |
| **Staff Workspace** | `/dashboard` | Sign in as STAFF user | Renders personal staff workspace; zero financial data |
| **Staff Agenda** | `/dashboard/appointments` | Sign in as STAFF user | Renders personal daily agenda |
| **Owner Dashboard** | `/dashboard` | Sign in as OWNER user | Displays full business metrics, staff list, settings |
| **Platform Console** | `/platform` | Sign in as SUPER_ADMIN | Displays system health, business directory, audit log |
| **Public Signup Denied** | `/register` or `/api/auth/sign-up/email` | POST request attempt | Blocked / Disabled (`EMAIL_PASSWORD_SIGN_UP_DISABLED`) |

---

## 5. Rollback Triggers & Procedure

Initiate rollback immediately if any of the following occur within 15 minutes of release:
- Readiness probe `/api/ready` fails continuously (HTTP 503).
- Critical user booking path throws unhandled 500 errors.
- Background worker crashes or experiences unrecoverable deadlocks.

**Rollback Action**:
```bash
# 1. Revert app container image to previous tag
docker compose -f docker-compose.production.yml up -d --no-deps app

# 2. Revert worker container image to previous tag
docker compose -f docker-compose.production.yml up -d --no-deps worker

# 3. If database was corrupted, restore from pre-release backup:
./scripts/backup/restore.sh backups/backup_barbercraft_<timestamp>.sql.gz barbercraft
```
