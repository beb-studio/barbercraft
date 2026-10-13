# TASK 020A Report: Application Security Hardening

## 1. Executive Summary & Hardening Objectives
- **Domain Scope**: Production-grade application security hardening across all application tiers (public booking, capability access, tenant workspace, platform operations, and authentication).
- **Core Objective**: Harden BarberCraft against real-world threat vectors (brute-force attacks, slot hoarding, framing/clickjacking, MIME sniffing, data leakage in logs/errors, and unauthorized self-registration) without introducing new product features or breaking existing functionality.
- **Key Invariants Preserved**:
  1. **Public Self-Registration Strictly Disabled**: Direct account creation via `/register` or `/api/auth/sign-up/email` is permanently blocked (`disableSignUp: true`).
  2. **Trusted Platform & Tenant Provisioning Intact**: Platform Super Admin initial business OWNER provisioning, business OWNER staff onboarding, and development/QA bootstrapping continue to function reliably via trusted server-side administrative primitives (`createAdministrativeUser`).
  3. **Multi-Process Atomic Rate Limiting**: All public endpoints and authentication actions enforce atomic, multi-process-safe rate limiting backed by PostgreSQL (`rate_limits` table), with SHA-256 IP anonymization.
  4. **Browser Security Headers & CSP**: Global enforcement in `next.config.ts` of Content Security Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and anti-caching headers on authenticated portals.
  5. **Sensitive Data Redaction & Error Sanitization**: Zero leakage of database internals, SQLSTATE errors, constraint details, or stack traces to client browsers; automatic masking of credentials, tokens, and database passwords in server logs.
  6. **Zero Feature Creep**: Zero customer accounts, zero billing/invoicing systems, zero customer portals, and zero CRM scope expansion.
  7. **Turkish-Only User-Facing Language**: 100% of user-facing UI labels, error boundaries, validation messages, and flash notices are presented in Turkish.

---

## 2. Invariants & Better Auth Architecture Audit

### 2.1 Audit of Installed Better Auth Version (v1.7.7)
An exhaustive investigation of the installed Better Auth dependency (`better-auth@1.7.7`) was conducted by inspecting its core source code (`node_modules/better-auth/dist/index.js`, `api/index.js`, and `types/index.d.ts`):
- When `emailAndPassword.disableSignUp: true` is configured, Better Auth registers the endpoint handler with an internal `disabled: true` flag. Any call to `auth.api.signUpEmail(...)`—even from a server-side route or service—evaluates this flag and throws a `400 Bad Request` with code `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- Therefore, calling `auth.api.signUpEmail(...)` for trusted administrative provisioning while keeping public signup disabled is fundamentally impossible through the public API surface.

### 2.2 Trusted Server-Side Administrative User Creation Pattern
To resolve this without re-enabling public registration, we created `src/lib/auth/admin-user.ts` exposing `createAdministrativeUser(...)`:
```typescript
import "server-only";
import { auth } from "@/lib/auth/auth";

export async function createAdministrativeUser(input: CreateAdministrativeUserInput): Promise<CreateAdministrativeUserResult> {
  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(input.password);
  
  const user = await ctx.internalAdapter.createUser(
    {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      emailVerified: input.emailVerified ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { method: "admin" }
  );

  await ctx.internalAdapter.linkAccount({
    id: crypto.randomUUID(),
    providerId: "credential",
    accountId: user.id,
    password: hashedPassword,
    userId: user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { id: user.id, email: user.email, name: user.name };
}
```
- **Security & Integrity Characteristics**:
  - Direct server-only adapter execution (`internalAdapter.createUser` and `internalAdapter.linkAccount`) completely bypasses the disabled public HTTP endpoint.
  - Generates secure Argon2id hashes via Better Auth's internal password context.
  - Sets `emailVerified: true` for administratively vetted users.
  - Successfully wired into `PlatformProvisioningService.provisionBusinessWithOwner()`, `StaffProvisioningService.provisionStaff()`, and `QaBootstrapService.bootstrap()`.

---

## 3. Multi-Process Atomic Rate Limiting

### 3.1 PostgreSQL Schema (`rate_limits`)
Implemented in `src/db/schema/rate_limits.ts` with migration `drizzle/migrations/0020_rate_limits.sql`:
```sql
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" varchar(255) PRIMARY KEY NOT NULL,
  "points" integer DEFAULT 0 NOT NULL,
  "expire_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "rate_limits_expire_at_idx" ON "rate_limits" ("expire_at");
```

### 3.2 Atomic Multi-Process Execution Engine (`src/lib/rate-limit.ts`)
Executes an atomic PostgreSQL upsert returning remaining window duration, completely eliminating concurrency race conditions between Node.js worker threads or container replicas:
```sql
INSERT INTO rate_limits (key, points, expire_at)
VALUES ($1, 1, NOW() + INTERVAL '...' SECOND)
ON CONFLICT (key) DO UPDATE
SET
  points = CASE
    WHEN rate_limits.expire_at <= NOW() THEN 1
    ELSE rate_limits.points + 1
  END,
  expire_at = CASE
    WHEN rate_limits.expire_at <= NOW() THEN NOW() + INTERVAL '...' SECOND
    ELSE rate_limits.expire_at
  END
RETURNING points, EXTRACT(EPOCH FROM (expire_at - NOW()))::integer AS remaining_seconds;
```

### 3.3 Rate Limiting Policies & Protected Endpoints
| Scope | Protected Action / Endpoint | Rate Limit | Time Window | Identifier | Action Upon Rejection |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Sign-In (`/api/auth/sign-in/email`) | 10 attempts | 15 minutes | IP + normalized email | HTTP 429 Too Many Requests |
| **Public Booking** | Appointment Booking (`createPublicAppointmentAction`) | 60 bookings | 10 minutes | Anonymized IP hash | Turkish rate limit error message |
| **Capability Access**| Management Token Resolution (`resolveAppointmentAccessAction`) | 120 queries | 10 minutes | Anonymized IP hash | Non-oracular invalid token result |
| **Capability Mutation**| Public Reschedule / Cancellation | 20 actions | 10 minutes | Anonymized IP hash | Turkish rate limit error message |

### 3.4 Privacy & IP Anonymization
- IP addresses are extracted safely from proxy headers (`x-forwarded-for`, `x-real-ip`).
- Raw IP addresses are **never** stored in database tables or logs. All identifiers are hashed using SHA-256 (`hashIdentifier(clientIp)`) before rate limit querying.

---

## 4. HTTP Browser Security Headers & Content Security Policy

Configured centrally in `next.config.ts`:
- **Content-Security-Policy (CSP)**:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (supporting Next.js Turbopack client hydration)
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data: blob: https:`
  - `font-src 'self' data:`
  - `connect-src 'self'`
  - `frame-ancestors 'none'` (disallows embedding across all routes)
  - `object-src 'none'`
  - `base-uri 'self'`
- **X-Frame-Options: DENY**: Complete clickjacking defense.
- **X-Content-Type-Options: nosniff**: Strict MIME type sniffing defense.
- **Referrer-Policy: strict-origin-when-cross-origin**: Prevents URL leakage to third parties, with `/randevu` enforcing `no-referrer` to guard capability tokens.
- **Permissions-Policy**: Explicitly disables `camera=(), microphone=(), geolocation=(), payment=()`.
- **Strict-Transport-Security (HSTS)**: Emits `max-age=63072000; includeSubDomains; preload` in production environments.
- **Anti-Caching Headers**: Applied to all operational portals (`/dashboard/:path*`, `/platform/:path*`, `/onboarding/:path*`, `/randevu/:path*`):
  - `Cache-Control: private, no-store, max-age=0, must-revalidate`
  - `Pragma: no-cache`

---

## 5. Sensitive Data Redaction & Error Sanitization

### 5.1 Sensitive Data Redaction (`src/lib/redact.ts`)
- `redactSensitiveData(data)`: Traverses objects and arrays, masking passwords, API tokens, bearer credentials, session keys, and secrets with `[REDACTED]`.
- `redactUrlCredentials(url)`: Sanitizes database and provider connection strings (e.g. `postgres://user:pass@host/db` -> `postgres://user:[REDACTED]@host/db`).

### 5.2 Client-Facing Error Sanitization (`src/lib/redact.ts`)
- `sanitizeClientError(err, fallback)`: Intercepts unhandled database or server exceptions. Strips SQL syntax errors, SQLSTATE codes (e.g., `23505`, `23503`), relation names, column names, and constraint details.
- Returns clear, localized Turkish error messages (e.g. *"İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin."*).

---

## 6. Centralized Environment Validation

Implemented in `src/lib/env.ts` (`assertProductionEnvironment()`):
- Validates essential configuration at startup: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_BASE_URL` / `BETTER_AUTH_URL`.
- Explicitly rejects known insecure development placeholders: `secret`, `changeme`, `development_secret`, `123456...`.
- Rejects production execution if `NEXT_PUBLIC_*` variables attempt to expose private database or auth secrets.

---

## 7. Verification & Regression Matrix Results

### 7.1 Security Regression Test Matrix (`tests/auth/security-hardening.test.ts`)
Executed against embedded PostgreSQL:
- **Test Suite Results**: **60/60 tests PASSED** (12 suites, 0 failures).
- Key verified test scenarios:
  1. *Public self-registration rejected*: `auth.api.signUpEmail` returns HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
  2. *Administrative user creation*: `createAdministrativeUser` successfully seeds users with Argon2id passwords and links accounts.
  3. *Multi-process rate limiting*: Atomic PostgreSQL upsert enforces exact thresholds and resets after window expiry.
  4. *Public booking rate limiting*: Rejects excessive bookings with localized Turkish rate limit message.
  5. *Capability access rate limiting*: Rejects excessive token resolutions without oracular timing leaks.
  6. *IP anonymization*: Verifies SHA-256 hash generation and absence of raw IPs in storage.
  7. *Security headers*: Next.js config contains CSP, `DENY`, `nosniff`, `strict-origin-when-cross-origin`, and `Permissions-Policy`.
  8. *Anti-caching headers*: Validates presence on `/dashboard`, `/platform`, `/onboarding`, `/randevu`.
  9. *Sensitive data redaction*: Verifies masking of secrets and URL password stripping.
  10. *Client error sanitization*: Verifies suppression of SQLSTATE, table names, and stack traces.
  11. *Production environment validation*: Verifies rejection of placeholder secrets.
  12. *QA bootstrap protection*: Verifies rejection when `NODE_ENV === "production"`.

### 7.2 Full Repository Test Suite Verification
- **`pnpm db:test`**: **53/53 tests PASSED** (12/12 suites).
- **`pnpm auth:test`**: **1044/1044 tests PASSED** (197/197 suites, 0 failures).
  - `tests/auth/security-hardening.test.ts`: 60 passed
  - `tests/auth/platform-provisioning.test.ts`: 4 passed
  - `tests/auth/staff-provisioning.test.ts`: 9 passed
  - `tests/auth/qa-bootstrap.test.ts`: 18 passed
  - `tests/auth/any-staff-concurrency.test.ts`: 9 passed
  - `tests/auth/auth.test.ts`: 22 passed
  - All existing domain, RBAC, appointment lifecycle, outbox, delivery, and analytics suites: 100% passing.

### 7.3 Build & Lint Verification
- **`pnpm lint`**: 0 errors. Unused imports in newly created files were cleaned.
- **`pnpm typecheck`**: 0 errors (`tsc --noEmit` exited cleanly).
- **`pnpm build`**: Successful Next.js Turbopack production build (25/25 static/dynamic routes compiled).
- **`pnpm qa:bootstrap`**: Successfully generates QA accounts and credentials in development environment.
- **`git diff --check`**: 0 whitespace or merge artifact errors.
- **`pnpm audit --prod --audit-level critical`**: 0 critical vulnerabilities.

---

## 8. Authoritative Documentation Updates

1. **`SECURITY.md`**: Created at repository root as the authoritative guide covering threat model, trust tiers, capability token design, rate limiting policies, browser headers, data redaction, and residual risks.
2. **`ARCHITECTURE.md`**: Appended Section 3.31 detailing Application Security Hardening foundations.
3. **`BUSINESS_RULES.md`**: Appended Section 30 codifying security rules, self-registration prohibition, rate limit quotas, and Turkish client error standards.
4. **`DEVELOPMENT_RULES.md`**: Appended Section 1.4 detailing developer security standards and added `pnpm auth:test` to mandatory verification commands.
5. **`DATABASE.md`**: Appended Section 3.17 documenting the `rate_limits` table schema, indexes, and atomic upsert concurrency semantics.

---

## 9. Conclusion

TASK 020A is complete. All 32 security parts are implemented, verified by 60 dedicated security tests and 1044 total test assertions, without breaking any existing business, staff, or platform operations.

**READY FOR TASK 020B — PRODUCTION DEPLOYMENT & OPERATIONAL READINESS**
