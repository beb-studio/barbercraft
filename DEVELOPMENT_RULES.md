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

---

## 2. Verification Commands

Run all verification scripts before declaring task completion:

```bash
# 1. Run database tests against embedded PostgreSQL
pnpm db:test

# 2. Run ESLint check
pnpm lint

# 3. Run TypeScript type checker
pnpm typecheck

# 4. Run Next.js production build
pnpm build
```
