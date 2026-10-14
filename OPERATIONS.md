# BarberCraft Production Operations Runbook

> **Authoritative Operations, Monitoring, Backup & Incident Response Runbook**  
> Established in TASK 020B. Covers daily operations, health probes, background workers, disaster recovery, and incident runbooks.

---

## 1. Health Checks & Runtime Probes

BarberCraft provides two distinct endpoints designed for container orchestrators (Docker, Kubernetes, Nomad) and external uptime monitors.

### 1.1 Liveness Probe (`/api/health`)
- **URL**: `GET /api/health`
- **Authentication**: None (Public)
- **Database Dependency**: **Zero**. Does NOT query PostgreSQL.
- **Cache-Control**: `no-store, no-cache, must-revalidate`
- **Purpose**: Confirms the Node.js event loop is unblocked and HTTP listener is accepting connections.
- **Success Response**: `HTTP/1.1 200 OK`
  ```json
  {
    "status": "ok",
    "uptimeSeconds": 1420,
    "timestamp": "2026-10-13T19:30:00.000Z"
  }
  ```
- **Failure Trigger**: Network timeout or unresponsive process.
- **Action on Failure**: Container restart.

### 1.2 Readiness Probe (`/api/ready`)
- **URL**: `GET /api/ready`
- **Authentication**: None (Public)
- **Database Dependency**: **Active**. Executes bounded `SELECT 1` with a strict 3000ms timeout (`checkDatabaseHealth(3000)`).
- **Environment Validation**: Validates production environment constraints.
- **Cache-Control**: `no-store, no-cache, must-revalidate`
- **Purpose**: Confirms the application is connected to PostgreSQL and ready to receive customer traffic.
- **Success Response**: `HTTP/1.1 200 OK`
  ```json
  {
    "status": "ready",
    "latencyMs": 4,
    "timestamp": "2026-10-13T19:30:00.000Z"
  }
  ```
- **Degraded Response**: `HTTP/1.1 503 Service Unavailable`
  ```json
  {
    "status": "not_ready"
  }
  ```
  *(Detailed diagnosis is sanitized and recorded strictly in server logs; no raw database errors or stack traces are returned to untrusted callers.)*
- **Action on Failure**: Remove container from reverse proxy load-balancer pool; do NOT restart immediately unless liveness probe also fails.

---

## 2. Background Notification Worker

The background worker daemon (`scripts/worker.ts` and `src/worker/notification-worker.ts`) operates autonomously to process notification outbox events, materialize reminder deliveries, dispatch SMS, and run database maintenance.

### 2.1 Execution Architecture
- **Daemon Loop**: Polls every `WORKER_POLL_INTERVAL_MS` (default 5000ms).
- **Concurrency & Locking**: Claims batches using PostgreSQL `FOR UPDATE SKIP LOCKED`. Multiple worker processes can safely run against the same database without race conditions or double dispatch.
- **Batch Size**: Bounded by `WORKER_BATCH_SIZE` (default 25 items per cycle).
- **Three-Tier Processing Cycle**:
  1. `NotificationPlannerService.processPendingBatch(batchSize)`: Transforms unprocessed outbox events into concrete deliveries based on business notification rules (booking created, rescheduled, cancelled, reminders).
  2. `NotificationDeliveryService.processDueNotificationDeliveries(batchSize)`: Claims deliveries where `status IN ('PENDING', 'FAILED')`, `availableAt <= NOW()`, and `attemptCount < 8`. Delivers messages via the active SMS gateway provider.
  3. `cleanupExpiredRateLimits()`: Housekeeping every 60 seconds to prune expired rows from the PostgreSQL `rate_limits` table.

### 2.2 Graceful Shutdown Semantics
- Traps `SIGTERM` and `SIGINT` signals.
- Halts new polling sweeps immediately.
- Awaits in-flight notification dispatch completion before terminating (up to 15-second grace period).
- Closes the PostgreSQL connection pool cleanly (`closeDatabasePool()`).

### 2.3 Terminal Failure & Recovery Semantics
- **Transient Failures**: Network glitches or rate limits increment `attemptCount` and schedule retry with exponential backoff (`availableAt = NOW() + backoff`).
- **Terminal Failures**: Notifications transition to terminal failure state if:
  - `attemptCount >= 8` (maximum attempts exhausted).
  - SMS provider returns a permanent error code (`PERMANENT_DELIVERY_ERROR_CODES`: invalid phone number, blacklisted recipient, unroutable prefix).
- **Terminal Exclusions**: `claimDueDeliveryBatch` strictly excludes permanent error codes and exhausted attempts, preventing toxic rows from clogging worker sweeps.
- **Operator Replay**: Super Admins can audit and manually replay terminal failures through the Platform Console:
  - Route: `/platform/businesses/[id]/notifications`
  - Action: Resets attempt count and error state, returning the item to the active queue.

---

## 3. Database Backup, Restore & Verification Drills

All operational backup scripts reside in `scripts/backup/` with strict executable permissions (`chmod +x`).

### 3.1 Automated Backup (`scripts/backup/backup.sh`)
- **Mechanism**: Compressed streaming logical dump using `pg_dump --format=plain --no-owner --no-privileges | gzip -9`.
- **Target Directory**: Set by `BACKUP_DIR` (default: `./backups`).
- **File Permissions**: Locked strictly to `0600` (read/write by owner only).
- **Automated Pruning**: Automatically prunes backup archives older than `RETENTION_DAYS` (default: 7 days).
- **Cron Configuration (Recommended hourly or daily)**:
  ```cron
  # Run daily at 03:00 AM
  0 3 * * * /opt/barbercraft/scripts/backup/backup.sh >> /var/log/barbercraft/backup.log 2>&1
  ```

### 3.2 Safe Restoration (`scripts/backup/restore.sh`)
- **Usage**: `./scripts/backup/restore.sh <path_to_backup.sql.gz> [target_database_name]`
- **Safety Interlock**: Requires manual interactive typing of the database name to prevent accidental overwrites.
- **Execution**: Decompresses and pipes directly into `psql --single-transaction --set ON_ERROR_STOP=on`.

### 3.3 Non-Destructive Restore Drill (`scripts/backup/verify-restore.sh`)
- **Purpose**: Regularly verifies backup integrity without disrupting the live production database.
- **Mechanism**:
  1. Creates an isolated temporary database (`restore_drill_<timestamp>`).
  2. Restores the target backup into the temporary database.
  3. Verifies schema integrity, table counts, and row counts across `businesses`, `users`, `appointments`.
  4. Drops the temporary database cleanly.
- **Execution**:
  ```bash
  ./scripts/backup/verify-restore.sh backups/backup_barbercraft_20261013_030000.sql.gz
  ```

### 3.4 Recovery Objectives: Design Targets vs. Guarantees

> [!IMPORTANT]
> **RPO and RTO are operational design targets, NOT guaranteed automated SLAs.**  
> A successful restore verification drill proves that the backup and restore tooling works; it cannot guarantee an RPO if backups are scheduled infrequently or unmonitored.

- **Implemented Tooling**:
  - Compressed streaming logical backup (`scripts/backup/backup.sh`).
  - Automated retention pruning (default 7 days).
  - Decompressed transactional restore (`scripts/backup/restore.sh`).
  - Automated non-destructive verification drill (`scripts/backup/verify-restore.sh`).
- **Operator Configuration Required**:
  - **Backup Scheduler**: Cron or systemd timer determining backup execution frequency.
  - **Off-Host Storage**: Replication of `backups/` directory to offsite S3-compatible or secondary storage.
  - **Monitoring & Alerting**: Monitoring backup script exit codes and backup archive byte sizes.
- **Operational Design Targets**:
  - **Desired RPO**: **$\le$ 1 Hour** (achieved only if the operator configures an hourly cron schedule, yielding a theoretical maximum 1-hour data-loss window; near-zero RPO requires WAL archiving).
  - **Desired RTO**: **$\le$ 15 Minutes** (operational target to decompress, restore, and verify service restart via container tooling).

---

## 4. Structured Logging & Log Management

### 4.1 Production Structured Logger (`src/lib/logger.ts`)
The application and worker emit newline-delimited JSON logs to `stdout` (info/warn) and `stderr` (error):
```json
{
  "timestamp": "2026-10-13T19:30:15.123Z",
  "level": "info",
  "subsystem": "notification-worker",
  "message": "Notification batch processed successfully",
  "data": {
    "planned": 3,
    "delivered": 2,
    "failed": 0
  }
}
```

### 4.2 Automated Credential Redaction
All logger entries pass through `redactSensitiveData` before formatting:
- Passwords, Better Auth secret tokens, authorization bearer headers, and database connection strings (`postgres://user:***@host/db`) are automatically masked with `[REDACTED]`.

### 4.3 Log Shipping & Rotation
In Docker environments, configure log rotation in `docker-compose.production.yml` or `/etc/docker/daemon.json`:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

---

## 5. Incident Response Runbooks

### Runbook 1: PostgreSQL Database Unreachable
- **Symptoms**: Readiness probe `/api/ready` returns HTTP 503; web requests return 500 error; application logs display `Database health check timed out`.
- **Triage**:
  1. Check PostgreSQL container status: `docker compose ps postgres`.
  2. Check PostgreSQL resource consumption: `docker stats postgres`.
  3. Inspect database logs: `docker compose logs --tail=100 postgres`.
  4. Test direct connectivity: `docker compose exec postgres pg_isready -U <user>`.
- **Mitigation**:
  - If out of disk space: expand volume and vacuum dead tuples (`VACUUM FULL`).
  - If pool exhausted: verify active connections against `max_connections` in PostgreSQL (`SELECT count(*) FROM pg_stat_activity;`).
  - Restart database: `docker compose restart postgres`.

### Runbook 2: Notification Queue Backlog / Worker Lag
- **Symptoms**: Customer SMS appointments not arriving on time; pending notifications count increasing in `/platform` dashboard.
- **Triage**:
  1. Check worker container status: `docker compose ps worker`.
  2. Inspect worker logs: `docker compose logs -f --tail=200 worker`.
  3. Query queue lag directly:
     ```sql
     SELECT status, count(*) FROM notification_deliveries GROUP BY status;
     SELECT count(*) FROM notification_deliveries WHERE status = 'PENDING' AND available_at < NOW() - INTERVAL '5 minutes';
     ```
- **Mitigation**:
  - If worker crashed or exited: `docker compose restart worker`.
  - If processing volume exceeds single-worker capacity: increase batch size (`WORKER_BATCH_SIZE=50`) or scale worker container replicas (`docker compose up -d --scale worker=2`). PostgreSQL `FOR UPDATE SKIP LOCKED` guarantees safe concurrent execution across multiple workers.

### Runbook 3: Upstream SMS Gateway Outage (Netgsm)
- **Symptoms**: Deliveries entering `FAILED` status with Netgsm HTTP errors or timeouts; terminal failures increasing.
- **Triage**:
  1. Inspect delivery errors:
     ```sql
     SELECT last_error_code, last_error_message, count(*) 
     FROM notification_deliveries 
     WHERE status = 'FAILED' 
     GROUP BY last_error_code, last_error_message;
     ```
  2. Check Netgsm API status or credit balance.
- **Mitigation**:
  - Transient provider outages: Worker automatically retries deliveries with exponential backoff up to 8 attempts.
  - If provider credentials expired: Update `.env.production` and restart worker: `docker compose restart worker`.
  - Requeueing terminal failures: Once upstream provider is restored, visit `/platform/businesses/[id]/notifications` and use the Bulk Replay button to requeue terminally failed messages.

### Runbook 4: SSL/TLS Certificate Expiration
- **Symptoms**: Browsers display `NET::ERR_CERT_DATE_INVALID` when visiting the domain.
- **Triage**:
  1. Verify domain DNS records point to server public IP.
  2. Inspect reverse proxy logs: `docker compose logs --tail=100 caddy`.
- **Mitigation**:
  - For Caddy: Trigger forced certificate renewal: `docker compose exec caddy caddy reload --force`.
  - For Nginx / Certbot: Run `certbot renew --force-renewal` and reload Nginx (`systemctl reload nginx`).
