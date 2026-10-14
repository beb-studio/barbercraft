# BarberCraft Production Deployment Guide

> **Authoritative Deployment & Runtime Specification**  
> Established in TASK 020B as the reference deployment architecture.  
> Target: Self-hosted Linux (x86_64 / arm64) using Docker Compose or bare-metal systemd.  
> Zero external managed cloud dependencies (no Vercel, Supabase, Neon, Firebase, or Railway locks).

---

## 1. System Topology & Architecture

BarberCraft runs as a containerized or service-managed architecture composed of four core decoupled components:

```
                          Internet (HTTPS / Port 443)
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │       Reverse Proxy & Edge TLS Termination        │
             │       (Caddy 2 or Nginx with Let's Encrypt)       │
             └──────────────────────────────────────────────────┘
                                      │
                      Private Internal Docker Network
                                      │
         ┌────────────────────────────┴───────────────────────────┐
         │                                                        │
         ▼                                                        ▼
┌───────────────────────────────┐              ┌──────────────────────────────┐
│     Next.js Web Service       │              │ Notification Background      │
│   (Standalone Node.js Server) │              │ Worker (Polling Daemon)      │
│   - Port: 4380 (Internal)     │              │ - Outbox Planning            │
│   - SSR & Server Actions      │              │ - Due SMS Delivery Batch     │
│   - Health & Ready Probes     │              │ - Rate Limit Housekeeping    │
└───────────────────────────────┘              └──────────────────────────────┘
         │                                                        │
         └────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │            PostgreSQL 16 Database                │
             │   - Port: 5432 (Internal Private Only)           │
             │   - Bounded Connection Pooling (DB_POOL_MAX=10)  │
             │   - Drizzle ORM Schema Migrations                │
             │   - Atomic PostgreSQL Rate Limiting              │
             └──────────────────────────────────────────────────┘
```

### Component Roles
1. **Edge Reverse Proxy (`caddy` or `nginx`)**: Terminates public TLS/HTTPS, enforces HTTP/2 or HTTP/3, strips and overwrites `X-Real-IP` and `X-Forwarded-For` from client connections to prevent IP spoofing, and forwards traffic to the internal Next.js application port (4380).
2. **Next.js Standalone Application (`app`)**: Minimalist Alpine container executing `node server.js` built via Next.js standalone output. Serves Turkish customer booking flows, business management dashboards, staff agendas, and the platform super admin console.
3. **Background Notification Worker (`worker`)**: Independent Node.js daemon executing `scripts/worker.ts`. Polls the notification outbox, materializes reminder deliveries, dispatches SMS via provider adapters, and runs periodic rate limit window pruning.
4. **PostgreSQL Database (`postgres`)**: Production database storing tenant data, appointments, audit logs, authentication records, and rate limiting states. Exposed only on internal container network.

---

## 2. Infrastructure Requirements

| Resource | Minimum Specification | Recommended Production |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 / 24.04 LTS, Debian 12 | Linux 64-bit with systemd & Docker |
| **CPU Architecture** | x86_64 or aarch64 (ARM64) | 2+ Physical or Virtual Cores |
| **Memory (RAM)** | 2 GB Available RAM | 4 GB+ RAM |
| **Storage (Disk)** | 20 GB SSD / NVMe | 50 GB+ High-IOPS SSD |
| **Container Engine**| Docker Engine 24+ & Docker Compose v2+| Docker CE with Compose plugin |
| **Network** | Static public IPv4/IPv6, ports 80 & 443 | Firewalled ingress (only 80/443 open) |

---

## 3. Environment Configuration

Production configuration is strictly validated at process startup. Missing variables or insecure placeholders (such as `localhost` in URLs or weak secrets) trigger immediate process termination (`process.exit(1)`).

### Production Environment Variables Reference

| Variable | Required | Description | Example / Allowed Values |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | Runtime environment mode | `production` |
| `DATABASE_URL` | **Yes** | PostgreSQL connection URI | `postgres://user:pass@postgres:5432/barbercraft` |
| `DB_POOL_MAX` | No | Maximum database connections per pool | `10` (default) |
| `BETTER_AUTH_SECRET` | **Yes** | High-entropy secret for auth tokens & session cookies (min 32 chars) | Generated via `openssl rand -hex 32` |
| `APP_BASE_URL` | **Yes** | Canonical public HTTPS base URL | `https://randevu.isletmeniz.com` |
| `BETTER_AUTH_URL` | **Yes** | Base URL for auth endpoints (must match `APP_BASE_URL`) | `https://randevu.isletmeniz.com` |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Client-accessible base URL (must match `APP_BASE_URL`) | `https://randevu.isletmeniz.com` |
| `WORKER_POLL_INTERVAL_MS`| No | Notification worker sleep between poll sweeps | `5000` (default) |
| `WORKER_BATCH_SIZE` | No | Maximum notifications claimed per worker sweep | `25` (default) |
| `SMS_PROVIDER` | No | Active SMS gateway provider adapter | `mock` (default) or `netgsm` |
| `NETGSM_USER_CODE` | Conditional | Required if `SMS_PROVIDER=netgsm` | Netgsm subscriber user code |
| `NETGSM_PASSWORD` | Conditional | Required if `SMS_PROVIDER=netgsm` | Netgsm API password |
| `NETGSM_MSG_HEADER` | Conditional | Required if `SMS_PROVIDER=netgsm` | Approved alphanumeric SMS header |
| `ALLOW_HTTP_LOCALHOST` | No | MUST NOT BE SET in real production. Only used for local acceptance tests. | `""` or unset |

### Generating Cryptographic Secrets

```bash
# Generate high-entropy Better Auth secret
openssl rand -hex 32

# Generate secure PostgreSQL password
openssl rand -base64 24 | tr -dc 'a-zA-Z0-9'
```

---

---

## 4. Database Connection Budget & Sizing

In the reference Docker Compose topology, database connections are strictly budgeted across services:

| Component | Default Pool Max | Concurrency / Lifecycle | Total Peak Connections |
| :--- | :---: | :--- | :---: |
| **`app` (Next.js Standalone)** | `10` (`DB_POOL_MAX`) | Long-lived connection pool | 10 |
| **`worker` (Notification Worker)**| `10` (`DB_POOL_MAX`) | Long-lived connection pool | 10 |
| **`migrator` (Migration Runner)** | `1` | Ephemeral (exits before app/worker start) | 0 (post-boot) |
| **Reserved Admin / Backups / psql** | — | Operational margin for `pg_dump` and CLI | 10–20 |
| **Total Reference Footprint** | — | Bounded active connections | **~30–40** |

### Connection Sizing Formula
When scaling container replicas horizontally across VPS hosts or clusters, size `DB_POOL_MAX` against PostgreSQL's `max_connections` (default 100 in `postgres:16-alpine`):

$$\text{Required Connections} = (N_{\text{app}} \times \text{DB\_POOL\_MAX}) + (N_{\text{worker}} \times \text{DB\_POOL\_MAX}) + \text{Reserved (20)} \le \text{PostgreSQL max\_connections}$$

> [!WARNING]
> Never set `DB_POOL_MAX` arbitrarily high on small memory instances. If application or worker replicas are increased, adjust `max_connections` in `postgresql.conf` accordingly to prevent connection starvation errors (`too many connections for role`).

---

## 5. Production Release Sequence

Always execute deployments in this exact order to prevent downtime, schema drift, or orphaned background tasks:

```
[1. Backup Database] ──► [2. Run Migrations] ──► [3. Start Application] ──► [4. Verify Readiness] ──► [5. Start Worker]
```

### Step 1: Pre-Release Database Backup
Before applying any code update or migration, generate a full logical database dump:
```bash
./scripts/backup/backup.sh
```

### Step 2: Database Migration
Apply schema migrations against the target database using the standalone migration container:
```bash
docker compose -f docker-compose.production.yml run --rm migrator
```
*Note: Schema migrations are additive. Existing columns and tables remain compatible with running application containers.*

### Step 3: Rolling or In-Place Application Update
Pull or build the application image and start the web server:
```bash
docker compose -f docker-compose.production.yml up -d --no-deps app
```

### Step 4: Verify Health & Readiness Probes
Wait for container initialization and verify application readiness:
```bash
# Verify internal health probe (unauthenticated liveness, zero DB queries)
curl -fsS http://127.0.0.1:4380/api/health

# Verify internal readiness probe (database connectivity check via bounded SELECT 1)
curl -fsS http://127.0.0.1:4380/api/ready
```
- Liveness `/api/health` returns HTTP 200 `{ "status": "ok", "uptimeSeconds": ... }`.
- Readiness `/api/ready` returns HTTP 200 `{ "status": "ready", "latencyMs": ... }`.
- In failure scenarios, `/api/ready` returns HTTP 503 with minimal machine-safe JSON `{ "status": "not_ready" }`. Zero database credentials, table names, or error stack traces are exposed externally.

### Step 5: Start / Restart Background Worker
Deploy or update the worker service to consume outbox tasks and due reminder plans with new codebase logic:
```bash
docker compose -f docker-compose.production.yml up -d --no-deps worker
```

---

## 6. Reverse Proxy & Edge TLS Configuration

### 6.1 Authoritative Reference: Caddy (Automatic HTTPS)
Caddy is the **single authoritative reference reverse proxy** for BarberCraft production deployments. It automatically provisions and renews TLS certificates via Let's Encrypt / ZeroSSL and enforces trusted header forwarding.

Reference `Caddyfile`:
```caddy
{
    email admin@example.com
}

randevu.isletmeniz.com {
    encode zstd gzip

    # Reverse proxy to internal Next.js standalone container
    reverse_proxy app:4380 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto https
        header_up Host {host}
    }
}
```

### 6.2 Optional Alternative: Nginx (Manual / Certbot)
> [!NOTE]
> **OPTIONAL ALTERNATIVE — NOT THE REFERENCE DEPLOYMENT**  
> The reference deployment uses Caddy. If organizational policy mandates Nginx, refer to `nginx.conf` in the project root. Ensure `$remote_addr` strictly overwrites `X-Real-IP` to prevent IP spoofing.

### 6.3 Proxy Header Trust Invariants
- `getClientIp()` in `src/lib/rate-limit.ts` prioritizes `X-Real-IP`.
- The edge reverse proxy MUST overwrite `X-Real-IP` with the direct socket remote address (`$remote_addr` or `{remote_host}`).
- Clients must never be allowed to spoof their IP address by sending custom `X-Real-IP` or `X-Forwarded-For` headers.

---

## 6. Docker Standalone Deployment

The reference deployment topology is encapsulated in `docker-compose.production.yml`:

```bash
# 1. Clone repository to production host
git clone <repo-url> /opt/barbercraft
cd /opt/barbercraft

# 2. Copy production environment file and populate real credentials
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production

# 3. Build container images
docker compose -f docker-compose.production.yml build

# 4. Start database service
docker compose -f docker-compose.production.yml up -d postgres

# 5. Run database migrations
docker compose -f docker-compose.production.yml run --rm migrator

# 6. Start application, worker, and reverse proxy
docker compose -f docker-compose.production.yml up -d

# 7. Check container status
docker compose -f docker-compose.production.yml ps
```

---

## 7. Rollback Procedures

If an issue occurs after a release, follow the rollback sequence:

### Application Rollback
1. Re-tag or revert to the prior stable container image:
   ```bash
   docker compose -f docker-compose.production.yml up -d --no-deps app
   ```
2. Verify application health via `/api/ready`.
3. Revert worker container to matching image:
   ```bash
   docker compose -f docker-compose.production.yml up -d --no-deps worker
   ```

### Database Migration Rollback Caveat
- Database schema changes follow the **Expand / Contract** pattern.
- Migrations only add nullable columns, new tables, or additive indexes.
- Columns are never dropped or renamed in the same release as application code changes.
- Therefore, rolling back application code does not require immediate database schema rollback.
- If a catastrophic database corruption occurs, restore from the pre-release backup using `./scripts/backup/restore.sh`.

---

## 8. Container Runtime Verification Status

The reference Docker Compose configuration (`docker-compose.production.yml`) and its dependency graph have been validated via `docker compose config` with exit code 0.
- **Compose Schema & Environment Interpolation**: Fully verified.
- **Service Dependency Graph**: `db` (healthy via `pg_isready`) $\rightarrow$ `migrator` (exits 0) $\rightarrow$ `app` (healthy via `/api/ready`) $\rightarrow$ `proxy` (Caddy reverse proxy).
- **Environment Execution Note**: Full container daemon launch (`docker compose up`) requires root or `docker` group socket permissions (`/var/run/docker.sock`). In restricted build environments where the docker socket is unprivileged, full daemon container execution must be executed as a mandatory pre-pilot operator sign-off check on the target production host.

---

## 9. Better Auth Compatibility & Upgrade Risk Management

- **Installed Version**: Strictly pinned to `better-auth: 1.7.7` in `package.json` (no caret `^`) and locked in `pnpm-lock.yaml`.
- **Administrative Provisioning Invariant**: Because public registration is permanently disabled (`disableSignUp: true`), trusted server-side user provisioning in `src/lib/auth/admin-user.ts` uses Better Auth's internal adapter primitives (`internalAdapter.createUser` and `internalAdapter.linkAccount`).
- **Controlled Compatibility Risk**: These internal adapter methods are not part of Better Auth's public REST API contract. Any future upgrade of Better Auth MUST be preceded by running the complete authentication and provisioning test suites (`tests/auth/auth.test.ts`, `tests/auth/platform-provisioning.test.ts`, `tests/auth/production-deployment.test.ts`) in an isolated staging environment before deployment.
