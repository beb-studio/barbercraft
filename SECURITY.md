# BarberCraft Security Architecture & Policy

> **Authoritative Security Architecture & Implementation Guide**  
> Hardened in TASK 020A for production readiness. Adheres strictly to zero-trust boundaries, multi-tenant isolation, atomic rate limiting, and defence-in-depth principles.

---

## 1. Threat Model & Trust Boundaries

BarberCraft operates as a multi-tenant appointment scheduling platform serving barbershops, their staff, and their retail customers. The system defines four distinct trust tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM SUPER ADMIN / ADMIN                    │
│            (Global tenant supervision, provisioning, system health)    │
└────────────────────────────────────────────────────────────────────────┘
                                    │ (Zero cross-session impersonation)
┌────────────────────────────────────────────────────────────────────────┐
│                        TENANT INTERNAL WORKSPACE                       │
│      OWNER: Full business config, staff & admin management, analytics  │
│      ADMIN: Day-to-day operations, booking management, schedule view   │
│      STAFF: Personal daily agenda, appointment status (No financial)   │
└────────────────────────────────────────────────────────────────────────┘
                                    │ (Strict multi-tenant isolation)
┌────────────────────────────────────────────────────────────────────────┐
│                     PUBLIC CAPABILITY MANAGEMENT                       │
│     Customer capability tokens: Fragment hash (#token=...) access to   │
│     single appointment view/reschedule/cancel. Zero CRM/note exposure. │
└────────────────────────────────────────────────────────────────────────┘
                                    │ (Rate limited, input bounded)
┌────────────────────────────────────────────────────────────────────────┐
│                         PUBLIC ANONYMOUS                               │
│     Public booking portal (/book/[slug]). No accounts, no password.    │
│     Public self-registration disabled (/register denied).              │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Public Anonymous
- **Scope**: Visiting public booking pages (`/book/[slug]`), fetching eligible staff and active services, viewing public booking slots, creating an appointment.
- **Threats**: Slot hoarding, scraping staff schedules, brute-forcing booking slots, denial of service, SQL injection.
- **Controls**: Strict rate limits (15 bookings per 10 minutes per IP, 120 availability checks per minute), parameterized queries (Drizzle ORM), phone normalization, input size bounds.

### 1.2 Customer Capability Token Model
- **Scope**: Customer self-service reschedule and cancellation via `/randevu#token=...`.
- **Design Principles**:
  - **No Customer Accounts**: Customers do not create passwords or accounts. Access to their specific appointment lifecycle is mediated through cryptographically random 256-bit capability tokens.
  - **Fragment-Based Passing**: The token is transmitted via URL hash fragment (`#token=<token>`). Browsers never transmit URL fragments in HTTP request headers or referrer headers, keeping tokens out of access logs and intermediary caches.
  - **SHA-256 Storage**: The database only stores the SHA-256 hash of the token (`appointment_access_tokens.token_hash`). If the database is compromised, active raw tokens cannot be reversed.
  - **Scope & Expiry**: Tokens are strictly scoped to a single `appointment_id` and expire upon appointment completion or after a bounded operational lifetime (`expires_at > created_at`).
  - **Zero Privacy Leakage**: Resolving a token never exposes customer notes, internal barber notes, other customers, or financial lineage.

### 1.3 Tenant Roles & RBAC Boundaries
- **OWNER**: Full administrative control over the tenant, including business settings, staff members, administrative roles, working hours, services, and business analytics.
- **ADMIN**: Operational management within the tenant, appointment scheduling, and customer records. Cannot modify business ownership or manage owner accounts.
- **STAFF**: Restricted strictly to their own operational agenda and personal time blocks.
  - **Zero Financial Exposure**: Workspace payload contains no service pricing, business revenue, or financial analytics.
  - **Privacy Boundary**: Cannot view CRM customer notes, internal administrative notes, or merged customer lineage.
  - **Personal Resource Isolation**: Cannot view or modify appointments, schedules, or time-blocks belonging to other staff members.
- **Tenant Isolation (Anti-IDOR)**:
  - All database queries for tenant entities (`appointments`, `staff_profiles`, `customers`, `services`, `time_blocks`, `business_working_hours`) strictly filter on `business_id`.
  - Forged business IDs in payloads or URL segments are rejected at authorization guards (`requireBusinessMembership`, `requireBusinessPermission`).

### 1.4 Platform Supervision
- **SUPER_ADMIN & ADMIN**: Oversee platform operational health, business active/suspended status, and initial business provisioning.
- **Impersonation Boundary**: Platform administrators have NO session impersonation bridge into tenant internal sessions. Platform operators interact exclusively through `/platform` routes and platform-scoped services.

---

## 2. Authentication & Session Security

BarberCraft uses **Better Auth** with strict enterprise hardening:

### 2.1 Public Self-Registration Disabled
- Public sign-up is explicitly disabled in the Better Auth configuration:
  ```ts
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // Native Better Auth blocking of /api/auth/sign-up/email
  }
  ```
- Public users cannot create unauthorized accounts or obtain tenant membership.

### 2.2 Trusted Server-Side Administrative User Provisioning
- To enable authorized provisioning (Platform Super Admin creating initial Business Owners, Owners onboarding staff members, and local QA bootstrapping) without enabling public self-registration, the system uses a dedicated administrative helper: `src/lib/auth/admin-user.ts`.
- `createAdministrativeUser` uses Better Auth's internal adapter (`createUser` + `linkAccount`) to create identity records, hash passwords securely, and mark emails verified without exposing a public endpoint.

### 2.3 Session Limits & Cookie Hardening
- **Session Lifetimes**:
  - Session expiration: 7 days (`expiresIn: 60 * 60 * 24 * 7`).
  - Session refresh interval: 1 day (`updateAge: 60 * 60 * 24`).
- **Cookie Security**:
  - `useSecureCookies: process.env.NODE_ENV === "production"`.
  - `HttpOnly`, `SameSite: Lax`, and `Secure` attributes enabled in production.
- **Password Reset**:
  - When users are administratively provisioned, `forcePasswordChange: true` is flagged in the database, forcing a password change on their initial login.

---

## 3. Atomic Multi-Process Rate Limiting

Rate limiting is backed by PostgreSQL to ensure consistency across multiple Node.js worker processes, PM2 clusters, or container replicas without requiring an external Redis instance.

### 3.1 Schema & Implementation
- Table: `rate_limits` (`key` VARCHAR PRIMARY KEY, `count` INTEGER NOT NULL, `expires_at` TIMESTAMPTZ NOT NULL).
- Implementation: `src/lib/rate-limit.ts` uses a single atomic SQL upsert:
  ```sql
  INSERT INTO rate_limits (key, count, expires_at)
  VALUES ($1, 1, $2)
  ON CONFLICT (key) DO UPDATE
  SET
    count = CASE
      WHEN rate_limits.expires_at <= CURRENT_TIMESTAMP THEN 1
      ELSE rate_limits.count + 1
    END,
    expires_at = CASE
      WHEN rate_limits.expires_at <= CURRENT_TIMESTAMP THEN EXCLUDED.expires_at
      ELSE rate_limits.expires_at
    END
  RETURNING count, expires_at;
  ```
- **Atomicity**: Zero race conditions between concurrent requests.

### 3.2 Rate Limiting Policies
| Scope | Endpoint / Action | Limit | Window | Identifier |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Sign-In (`/sign-in/email`) | 5 attempts | 60 sec | IP + normalized email |
| **Public Booking** | Create Appointment | 60 attempts | 10 min | Client IP (hashed) |
| **Public Booking** | Availability Slot Search | 120 queries | 60 sec | Client IP (hashed) |
| **Capability Token** | Token Resolution | 120 queries | 10 min | Client IP (hashed) |
| **Capability Token** | Reschedule / Cancellation | 20 actions | 10 min | Client IP (hashed) |

### 3.3 Privacy & IP Anonymization
- Raw IP addresses are never persisted in the rate limiting table.
- All identifiers are hashed using SHA-256 via `hashIdentifier(clientIp)`.

---

## 4. HTTP Browser Security Headers

Configured globally in `next.config.ts`:

```typescript
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';"
  },
];
```

### 4.1 Strict Transport Security (HSTS)
- In production (`NODE_ENV === "production"`):
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

### 4.2 Cache-Control Hardening
- Management and sensitive operational routes are configured with anti-caching headers:
  - Paths: `/dashboard/:path*`, `/platform/:path*`, `/onboarding/:path*`, `/randevu/:path*`
  - Header: `Cache-Control: private, no-store, max-age=0, must-revalidate`

---

## 5. Data Redaction & Error Sanitization

### 5.1 Sensitive Data Redaction
- Centralized utility in `src/lib/redact.ts`:
  - Automatically redacts passwords, tokens, API keys, session cookies, and database credentials from objects and logs (`redactSensitiveData`).
  - Strips credentials from database connection URIs (`redactUrlCredentials`, e.g. `postgres://user:[REDACTED]@host/db`).

### 5.2 Client-Facing Error Sanitization
- Database internal errors, SQL syntax errors, foreign key/check constraint errors, table names, and stack traces are suppressed from returning to client UI components:
  - `sanitizeClientError(err)` replaces hostile or sensitive errors with localized user-friendly Turkish messages (e.g. `"İşlem sırasında bir hata oluştu."`).

---

## 6. Centralized Environment Validation

- Centralized in `src/lib/env.ts` (`assertProductionEnvironment()`):
  - Validates `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_BASE_URL` / `BETTER_AUTH_URL`.
  - Rejects known placeholder secrets (e.g., `secret`, `changeme`, `123456...`).
  - Strictly enforces that server secrets are never exposed under `NEXT_PUBLIC_*` prefixes.

---

## 7. QA Bootstrap Production Safety

- The local test and staging data generation script (`scripts/qa-bootstrap.ts` and `src/services/qa-bootstrap.service.ts`) includes a hard check:
  ```ts
  if (process.env.NODE_ENV === "production") {
    throw new Error("QA bootstrap cannot be executed in production environment (NODE_ENV=production).");
  }
  ```
- Guaranteed prevention of development seed accounts and test fixtures in production databases.

---

## 8. Residual Risks & Next Phase (TASK 020B)

While application-layer security is fully hardened, the following operational requirements are addressed in TASK 020B:
1. **Network Layer**: Reverse proxy TLS termination (Nginx / Cloudflare), edge DDoS mitigation, and firewall rules.
2. **Database Operations**: Automated daily backups, point-in-time recovery (WAL archiving), and connection pool sizing.
3. **Runtime Monitoring**: Health check probes (`/api/health`), PM2 process clustering, and log shipping.
