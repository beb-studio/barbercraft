# Multi-Tenant Barber Appointment Platform

A production-oriented, mobile-first appointment management web application for modern barber shops and men's grooming salons.

Built with Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui, self-hosted PostgreSQL, and Drizzle ORM.

---

## 🌟 Key Features

- **Multi-Tenant System**: Complete tenant boundary isolation per barber shop business.
- **Role-Based Access Control**: `OWNER`, `ADMIN`, and `STAFF` authenticated roles.
- **Dynamic Service Catalog**: Custom service names, pricing, and duration per business.
- **Multi-Staff Calendar**: Dynamic working hours, time blocks (`BREAK`, `VACATION`, `BUSINESS_CLOSURE`, `OTHER`), and calendar scheduling per barber.
- **Mobile-First Customer Booking**: 6-step public booking funnel optimized for 390px mobile screens.
- **Self-Hosted Architecture**: Standard PostgreSQL database, Drizzle ORM, and private server-side configuration for self-hosted Linux deployments.

---

## 🛠 Tech Stack

- **Framework**: Next.js (App Router, Turbopack, Server Components)
- **Language**: TypeScript (Strict)
- **Styling**: Tailwind CSS v4, shadcn/ui
- **Database**: PostgreSQL (Self-hosted)
- **ORM & Migrations**: Drizzle ORM (`drizzle-orm`), Drizzle Kit (`drizzle-kit`)
- **Testing**: Node.js Test Runner + `embedded-postgres`
- **Package Manager**: pnpm

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL database (for dev/prod server)

### 1. Environment Configuration

Copy `.env.example` to `.env.local` and set your private PostgreSQL connection URL:

```bash
cp .env.example .env.local
```

Example `.env.local`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/barber_db"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Generate and Apply Database Migrations

```bash
# Generate SQL migrations from Drizzle schemas
npx drizzle-kit generate

# Run database tests against embedded PostgreSQL
pnpm db:test
```

### 4. Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser (use mobile viewport emulation at 390px).

---

## 🧪 Verification & Linting

```bash
# Run database schema & integrity tests
pnpm db:test

# Run ESLint
pnpm lint

# Run TypeScript typecheck
pnpm typecheck

# Production build
pnpm build
```

---

## 📚 Documentation

Detailed documentation available in the repository root:

- [`PROJECT.md`](./PROJECT.md) - Product specifications & customer booking lifecycle.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - System architecture, folder structure, and server-only isolation.
- [`DATABASE.md`](./DATABASE.md) - Entity relationship schema, tables, constraints, composite FKs, and triggers.
- [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) - Detailed domain rules, RBAC role capabilities, and validation constraints.
- [`UX_RULES.md`](./UX_RULES.md) - Mobile-first design system guidelines & 390px viewport rules.
- [`DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md) - Coding standards, database guidelines, and verification commands.
