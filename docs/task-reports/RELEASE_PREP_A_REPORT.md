# RELEASE PREP A — REPRODUCIBLE DEVELOPMENT ENVIRONMENT & CANONICAL QA FIXTURES

## 1. Overview & Objectives

In accordance with release preparation guidelines following the completion of TASK 020 (Application & Operational Hardening) and RELEASE PREP 0 (Role Taxonomy Cleanup), this task standardizes the BarberCraft developer onboarding workflow, local service topology, canonical port configuration, and QA test fixtures.

The overarching goal is to enable any developer cloning the repository on a clean machine to follow [`README.md`](../../README.md) and establish a fully reproducible local development and verification environment with zero external machine dependencies.

---

## 2. Canonical Application Port 4380 Migration

The application's canonical HTTP port has been standardized to **`4380`** (`http://localhost:4380`) across all development tooling, Docker configurations, reverse proxy configs, environment templates, and documentation.

### Modified Files & Authoritative Configuration:
1. **`package.json`**:
   - `"dev": "next dev -p 4380"`
   - `"start": "next start -p 4380"`
   - Added `"dev:setup": "tsx scripts/dev-setup.ts"`
   - Added `"dev:all": "tsx scripts/dev-all.ts"`
   - Added `"qa:reset": "tsx --conditions react-server scripts/qa-reset.ts"`
   - Updated `"worker:start": "tsx --conditions react-server scripts/worker.ts"`
   - Pinned Node engine: `"engines": { "node": ">=20.0.0 <21.0.0" }`
   - Pinned package manager: `"packageManager": "pnpm@11.12.0"`
2. **`.nvmrc`**:
   - Pinned Node LTS runtime to version `20`.
3. **`src/lib/env.ts`**:
   - Updated `getAppBaseUrl()` default fallback origin from `http://localhost:3000` to `http://localhost:4380`.
4. **`Dockerfile`**:
   - Updated runner stage: `ENV PORT=4380` and `EXPOSE 4380`.
5. **`docker-compose.production.yml`**:
   - Updated internal app service environment: `PORT: 4380`.
   - Updated healthcheck test probe: `wget -qO- http://127.0.0.1:4380/api/ready`.
   - Production PostgreSQL service (`db`) remains on internal container port `5432`, strictly isolated inside the Docker network with no published host port.
6. **`Caddyfile`**:
   - Updated internal upstream proxy directive: `reverse_proxy app:4380`.
7. **`nginx.conf`**:
   - Updated upstream server: `server app:4380`.
8. **`DEPLOYMENT.md`**:
   - Updated internal architecture diagram and healthcheck examples to port `4380`.
9. **`tests/auth/production-deployment.test.ts`**:
   - Updated assertions verifying `docker-compose.production.yml` healthcheck probe on port `4380`.
10. **Visual QA Scripts (`scripts/qa-*.ts`)**:
    - Updated fallback base URLs from `http://127.0.0.1:3001` to `http://localhost:4380`.

---

## 3. Local PostgreSQL Topology & Port 55432 Isolation (`docker-compose.dev.yml`)

To prevent port collisions with any existing PostgreSQL daemon running on the host's default port 5432, the local development container explicitly isolates its host port mapping to **`55432`**:

- **Service**: `db` running `postgres:16-alpine`.
- **Container Name**: `barbercraft_dev_db`.
- **Database**: `barbercraft_dev`.
- **User / Password**: `barbercraft_user` / `barbercraft_password`.
- **Container Port**: `5432` (internal).
- **Host Port Mapping**: Bound strictly to `127.0.0.1:55432:5432` on the loopback interface (`"127.0.0.1:55432:5432"`). No wildcards (`0.0.0.0`) or default host port 5432 are bound.
- **Named Volume**: `barbercraft_dev_pgdata`.
- **Healthcheck**: Validated via `pg_isready -U barbercraft_user -d barbercraft_dev`.
- **Production Contrast**: Production PostgreSQL in `docker-compose.production.yml` listens on internal container port `5432` only, with no host port exposed.

---

## 4. Safe Environment Templates

### `.env.local.example`
A comprehensive template for local development:
- Default `PORT=4380`.
- Local URLs: `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, and `BETTER_AUTH_URL` set to `http://localhost:4380`.
- Canonical Local PostgreSQL connection string: `postgresql://barbercraft_user:barbercraft_password@127.0.0.1:55432/barbercraft_dev`.
- Development Better Auth secret: `dev_secret_key_at_least_32_characters_for_local_testing_only_12345`.
- Development SMS Safety: Explicit `SMS_PROVIDER="test"` configured by default. Stock local setup does not perform real Netgsm calls. Netgsm credentials are commented out for safe local inert mode (zero live external network calls or accidental SMS sends).

### `.env.production.example`
A hardened template for production deployment:
- Enforces HTTPS URLs, mandatory 32+ char secrets, production database credentials targeting internal port 5432, Netgsm credentials, and SSL requirements.

### `.gitignore` Updates
Ensured git ignores active secret files (`.env`, `.env.local`, `.env.production`, `.env.qa.local`) while explicitly tracking all template examples:
- `!.env.example`
- `!.env.local.example`
- `!.env.production.example`

---

## 5. Developer Experience & Automation Scripts

### Developer Onboarding Workflow (README Contract)
A fresh developer on a clean machine executes exactly:
```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.local.example .env.local
pnpm dev:setup
pnpm dev:all
```

### 1. `pnpm dev:setup` (`scripts/dev-setup.ts`)
Automates developer onboarding with strict fail-closed contract enforcement:
1. **`.env.local` Prerequisite**: Checks if `.env.local` exists. If missing, it fails immediately with a clear Turkish error instructing the developer to copy `.env.local.example` (`cp .env.local.example .env.local`). It does **NOT** silently auto-create `.env.local`, ensuring misconfigurations are never masked.
2. **DATABASE_URL Contract Validation**: Using `validateDevSetupConfig()`, verifies that `DATABASE_URL` targets `127.0.0.1` or `localhost`, canonical port `55432`, database `barbercraft_dev`, and user `barbercraft_user`.
3. **Live Database Verification**: Probes PostgreSQL connectivity. If not running, automatically launches `docker compose -f docker-compose.dev.yml up -d db` and polls healthcheck readiness.
4. **Runtime Identity Verification**: Executes `SELECT current_database(), current_user` against the connected database to guarantee runtime identity matches `barbercraft_dev` and `barbercraft_user`.
5. **Migration Execution**: Executes `pnpm db:migrate` to apply all pending Drizzle migrations.
6. **Canonical Seeding**: Executes `pnpm qa:bootstrap` to seed the canonical QA fixture data.
7. **Summary Banner**: Displays a Turkish summary banner with URLs and the next step (`pnpm dev:all`).

### 2. `pnpm dev:all` (`scripts/dev-all.ts`)
Concurrently runs both required development services:
- **Web**: Next.js App Router on `http://localhost:4380` (`[web]` cyan prefix).
- **Worker**: Notification background daemon (`scripts/worker.ts`) with `--conditions react-server` (`[worker]` magenta prefix).
- **Graceful Termination**: Catches `SIGINT` (Ctrl+C), `SIGTERM`, and `SIGHUP` and terminates child processes cleanly without leaving orphaned processes on port `4380`.

### 3. `pnpm qa:reset` (`scripts/qa-reset.ts`)
Provides a safe local database reset mechanism with fail-closed safety guards:
- **Fail-Closed Environment & Connection Guard**: `validateQaResetTarget()` enforces:
  - `NODE_ENV === "production"` is strictly rejected.
  - Host must be an explicit recognized local loopback or local container (`localhost`, `127.0.0.1`, `::1`, `barbercraft_dev_db`). Remote IPs and domains are rejected.
  - Database name must strictly be `barbercraft_dev`.
  - Database user must strictly be `barbercraft_user`.
- **Runtime Identity Verification**: Executes `SELECT current_database(), current_user` at connection time before issuing any DDL/DML.
- **Explicit Table Allowlist (`BARBERCRAFT_APP_TABLES`)**: Truncation is strictly restricted to an explicit allowlist of the 25 BarberCraft application tables. It does **NOT** dynamically truncate arbitrary public schema tables. Drizzle migration history (`__drizzle_migrations`) is preserved.
- **Canonical Re-seeding**: Calls `bootstrapQA()` to re-seed all canonical QA fixture data.

---

## 6. Development SMS Safety Architecture

In local development, the application is architecturally guaranteed to never dispatch live SMS messages to real phone numbers:

1. **Default Configuration**: `.env.local.example` explicitly specifies `SMS_PROVIDER="test"`.
2. **Provider Resolution**: `resolveSmsProvider()` in `src/services/notification-delivery.service.ts` and `src/worker/notification-worker.ts`:
   - If `SMS_PROVIDER="test"` or `"mock"` -> returns `TestSmsProvider`.
   - In production (`NODE_ENV="production"`) -> returns `NetgsmSmsProvider`.
   - In development without complete Netgsm credentials (`NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_MSGHEADER`) -> fails safe to `TestSmsProvider`.
3. **Inert Local Execution**: Running `pnpm worker:start` or `pnpm dev:all` locally executes notification deliveries through `TestSmsProvider`, generating zero external HTTP calls to `api.netgsm.com.tr`.

---

## 7. Canonical QA Matrix & Fixture Data

The QA bootstrap service (`src/services/qa-bootstrap.service.ts` and `scripts/qa-bootstrap.ts`) enforces the authoritative role model with zero ambiguous legacy roles:

**Universal QA Password**: `BarberCraft-QA-4380!`

| Category | Authenticated Role (Auth Role) | Bookable Staff Profile | Turkish UI Label | E-mail | Business Slug |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Platform | `SUPER_ADMIN` | N/A | Süper Yönetici | `qa.superadmin@local.test` | N/A |
| Platform | `PLATFORM_ADMIN` | N/A | Platform Yöneticisi | `qa.platformadmin@local.test` | N/A |
| Primary Tenant | `OWNER` | Ahmet Usta | İşletme Sahibi | `qa.owner@local.test` | `qa-berber` |
| Primary Tenant | `MANAGER` | N/A | İşletme Yöneticisi | `qa.manager@local.test` | `qa-berber` |
| Primary Tenant | `STAFF` | Mehmet Kalfa | Personel | `qa.staff@local.test` | `qa-berber` |
| Primary Tenant | `STAFF` | Ali Kalfa | Personel | `qa.staff2@local.test` | `qa-berber` |
| Second Tenant | `OWNER` | Murat Usta | İşletme Sahibi | `qa.owner2@local.test` | `qa-berber-2` |
| Second Tenant | `STAFF` | Kemal Kalfa | Personel | `qa.staff3@local.test` | `qa-berber-2` |
| Public Actor | *None (Accountless)* | N/A | Müşteri | *Accountless* | `qa-berber` |

### Key Role Model Invariants:
1. **Authenticated Roles vs Bookable Profiles**: `qa.owner@local.test` and `qa.owner2@local.test` hold authenticated membership role **`OWNER`**. They have linked bookable `staff_profiles` ("Ahmet Usta" and "Murat Usta"), but their security and authorization role strictly remains `OWNER`. They are **never** represented as authenticated `STAFF` identities.
2. **Accountless Customers**: Customers have records in the `customers` table with tenant isolation (`business_id`), but have zero user accounts or auth credentials.
3. **Password Convergence**: Running `pnpm qa:bootstrap` updates existing QA user credential accounts to converge all passwords back to `BarberCraft-QA-4380!` using the Better Auth internal adapter.

---

## 8. Reproducible Dev Safety Test Suite (`tests/auth/reproducible-dev-safety.test.ts`)

A dedicated automated test suite (`tests/auth/reproducible-dev-safety.test.ts`) verifies all 12 reproducibility and safety invariants:

| # | Invariant Tested | Result | Verification Details |
| :-: | :--- | :-: | :--- |
| 1 | `qa:reset` rejects `NODE_ENV=production` | **PASS** | Validated via `validateQaResetTarget()`. |
| 2 | `qa:reset` rejects non-local hostname | **PASS** | Rejects remote domains and IPs. |
| 3 | `qa:reset` rejects wrong database name | **PASS** | Rejects any database other than `barbercraft_dev`. |
| 4 | `qa:reset` rejects wrong database user | **PASS** | Rejects any user other than `barbercraft_user`. |
| 5 | Canonical `DATABASE_URL` uses `127.0.0.1:55432` | **PASS** | Verified in `.env.local.example`. |
| 6 | Dev compose exposes only `127.0.0.1:55432` | **PASS** | Verified in `docker-compose.dev.yml`. |
| 7 | `dev:setup` validates expected DB contract | **PASS** | Verified via `validateDevSetupConfig()`. |
| 8 | Local default selects `TestSmsProvider` | **PASS** | Verified via `resolveSmsProvider()`. |
| 9 | QA bootstrap is idempotent | **PASS** | Verified across sequential `bootstrapQA()` runs. |
| 10 | QA password converges to `BarberCraft-QA-4380!` | **PASS** | Tested via Better Auth sign-in endpoint before and after bootstrap. |
| 11 | Owner remains authenticated `OWNER` with staff profile | **PASS** | Verified membership role and RBAC guards. |
| 12 | Exact 8 canonical authenticated QA identities exist | **PASS** | Verified in `users`, `platform_admins`, and `business_members`. |

---

## 9. Quality Verification Gates Results

All automated quality verification gates have executed and passed:

| Gate | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **Database Tests** | `pnpm db:test` | **PASS** | 53 tests across 12 suites passed (0 failures) on embedded PostgreSQL. |
| **Auth & Domain Tests** | `pnpm auth:test` | **PASS** | 1102 tests across 210 suites passed (0 failures). |
| **Reproducible Safety** | `pnpm tsx --conditions react-server --test tests/auth/reproducible-dev-safety.test.ts` | **PASS** | 12/12 invariants passed (0 failures). |
| **Linting** | `pnpm lint` | **PASS** | 0 errors across entire repository. |
| **Type Check** | `pnpm typecheck` | **PASS** | `tsc --noEmit` clean with 0 type errors. |
| **Production Build** | `pnpm build` | **PASS** | Next.js 16.3.8 Turbopack production bundle compiled successfully (25/25 routes). |
| **Git Diff Check** | `git diff --check` | **PASS** | 0 whitespace or formatting anomalies. |
| **Security Audit** | `pnpm audit --prod --audit-level critical` | **PASS** | 0 critical production vulnerabilities. |

---

RELEASE PREP A CLOSEOUT COMPLETE — READY FOR TRACKED-FILES-ONLY REPRODUCIBILITY TEST
