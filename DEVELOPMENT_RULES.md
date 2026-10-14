# Development & Architecture Rules

## 1. Core Principles

### 1.1 Mobile-First Viewport
- Primary mobile target viewport width: **390px**.
- Mobile-first CSS development: build from single-column mobile layouts up using Tailwind breakpoints (`md:`, `lg:`).
- Desktop layout must be supported gracefully without viewport scaling restrictions (`maximum-scale=1` and `user-scalable=no` are strictly prohibited).

### 1.2 Self-Hosted PostgreSQL & Drizzle ORM
- Connection must use `DATABASE_URL` as a private server-side environment variable.
- NEVER expose `DATABASE_URL` to client bundles or browser environments (never use `NEXT_PUBLIC_DATABASE_URL`).
- All database operations must happen in server-side files (`src/db/index.ts`, Server Components, Server Actions).
- No managed cloud platform dependencies (Better Auth, Railway, Neon, Firebase, PlanetScale) are allowed in production runtime.

### 1.3 Modular Application Boundaries
- React components must only handle UI rendering, local interaction state, and presentational formatting.
- Business logic, RBAC assertions, and database operations must reside in dedicated server modules (`src/lib/`, `src/actions/`, `src/db/`).
- No raw database queries or direct SQL calls directly inside React component files.

### 1.4 Application Security & Hardening (TASK 020A)
- **Public Registration Disabled**: Public signup endpoints (`/api/auth/sign-up/email`) must remain disabled. User creation is strictly restricted to trusted server-side administrative primitives (`createAdministrativeUser`).
- **Multi-Process Rate Limiting**: All publicly accessible or sensitive endpoints must enforce PostgreSQL-backed atomic rate limiting (`rateLimit` in `src/lib/rate-limit.ts`). Client IPs must be anonymized before hashing.
- **Client Error Sanitization**: Never return raw database errors, SQLSTATE codes, table names, or stack traces to client components or users. Use `sanitizeClientError` (`src/lib/redact.ts`) with Turkish user-facing messages.
- **Browser Security Headers**: Comprehensive CSP, clickjacking prevention (`X-Frame-Options: DENY`), sniffing protection (`X-Content-Type-Options: nosniff`), and anti-caching headers on operational dashboards are enforced via `next.config.ts`.
### 1.5 Production Deployment & Operations (TASK 020B)
- **Standalone Production Server**: The application builds to standalone output (`output: "standalone"` in `next.config.ts`), running as an isolated Node.js container process with zero cloud platform dependencies.
- **Background Notification Worker**: Notification processing and delivery materialize asynchronously via `scripts/worker.ts`. The worker uses `FOR UPDATE SKIP LOCKED` for concurrency safety and traps signals (`SIGTERM`/`SIGINT`) for graceful shutdown.
- **Operational Health Probes**:
  - `/api/health`: Unauthenticated liveness probe returning `{ status: "ok" }`.
  - `/api/ready`: Readiness probe verifying environment validity and executing a bounded `SELECT 1` database query.
- **Database Connection Lifecycle**: Database pool max is bounded via `DB_POOL_MAX` (default 10). Pools must be cleanly closed via `closeDatabasePool()` on process termination.
- **Feature Freeze Invariant**: Following TASK 020B, the codebase is under feature freeze. No new product features or scope expansions are permitted. P0 blockers are resolved immediately (narrow schema, server, or UI fixes permitted); P1 usability issues before pilot; P2 enhancements go to backlog. This is a feature freeze, not a bugfix freeze.

---

## 2. Verification Commands

Run all verification scripts before declaring task completion:

```bash
# 1. Run database tests against embedded PostgreSQL
pnpm db:test

# 2. Run complete authentication, RBAC, domain, and security regression test suite
pnpm auth:test

# 3. Run ESLint check
pnpm lint

# 4. Run TypeScript type checker
pnpm typecheck

# 5. Run Next.js production build
pnpm build

# 6. Run standalone database migration runner
pnpm db:migrate

# 7. Start background notification worker daemon
pnpm worker:start
```
