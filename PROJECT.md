# Project Specification: Multi-Tenant Barber Appointment Platform

## 1. Executive Summary
This application is a production-oriented, mobile-first appointment management platform tailored for modern barber shops and men's grooming salons. It provides end-to-end multi-tenant isolation, dynamic service catalogs, individual staff scheduling, and a streamlined 6-step customer booking lifecycle.

The system is fully self-hosted, running on a standard Linux server with Nginx as a reverse proxy, Next.js App Router, PostgreSQL database, and Drizzle ORM.

## 2. Core Personas & Roles

### 2.1 Owner (Authenticated Role)
- **Role**: Shop owner with full administrative and business management authority inside the tenant.
- **Capabilities**:
  - Manage business configuration (business name, address, contact, timezone, currency).
  - Manage memberships (invite/manage `ADMIN` and `STAFF` members).
  - Manage dynamic service catalogs.
  - View all tenant data, multi-staff calendar overviews, and appointment metrics.

### 2.2 Admin (Authenticated Role)
- **Role**: Operational manager within the tenant.
- **Capabilities**:
  - Manage operational tenant data (services, staff profiles, working hours, customers, appointments, time blocks).
  - Manage `STAFF` members.
  - Cannot modify business-level configuration or manage `OWNER`/`ADMIN` members.

### 2.3 Staff Member / Barber (Authenticated Role)
- **Role**: Individual barber or stylist working within the business.
- **Capabilities**:
  - Manage dedicated working calendar, custom working hours, and time blocks (`TIME_OFF`, `BREAK`, `BLOCKED`, `OTHER`).
  - View daily and weekly schedule of appointments assigned to them.
  - Update status of assigned appointments (`PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
  - Read-only access to shared business data (services, business hours, customers).

### 2.4 Public Customer (Unauthenticated)
- **Role**: End user booking a grooming service through the public booking funnel.
- **Capabilities**:
  - Browse dynamic shop services and real-time prices.
  - Select preferred staff member or any available staff member ("Fark Etmez").
  - Pick a date and view server-calculated available time slots.
  - Enter contact information (name, phone number, notes).
  - Complete the booking without requiring an account.

### 2.5 Platform Administrator (Platform-Level Authenticated Role)
- **Role**: Product owners and platform operators (`platform_admins` authorization layer).
- **Sub-roles**:
  - `SUPER_ADMIN`: Highest platform authority with administrator management privileges.
  - `ADMIN`: Platform operator managing platform-wide operational state.
- **Key Architectural Rule**: Platform administrators operate ABOVE tenant scope. Business roles (`OWNER`, `ADMIN`, `STAFF`) never imply platform administration privileges.
- **Capabilities (TASK 010A Foundation)**:
  - Access dedicated `/platform` management portal.
  - View global read-only aggregate metrics (Total Businesses, Active Businesses, Total Users, Total Staff, Total Appointments).
  - Traceable platform audit logging.

---

## 3. The 6-Step Customer Booking Journey

The customer-facing booking funnel is designed strictly mobile-first (optimized for 390px viewport):

1. **Step 1: Select Service**
   - Customer chooses one or more services from the dynamic service list.
   - Prices, descriptions, and durations are retrieved dynamically from the database.
2. **Step 2: Select Staff Member**
   - Customer selects a specific barber or opts for "Any Available Barber".
3. **Step 3: Select Date**
   - Customer picks an upcoming date on an interactive mobile calendar.
4. **Step 4: Select Available Time**
   - Real-time time slots calculated on the server.
5. **Step 5: Contact Information**
   - Simple mobile input form: Name, Phone (with normalized E.164 phone formatting), and notes.
6. **Step 6: Confirmation & Appointment Creation**
   - Instant confirmation screen with booking ID and snapshot of service price and duration.

---

## 4. Multi-Tenancy Architecture
- Every business is registered as an isolated tenant boundary (`businesses` table).
- Data records (`services`, `staff_profiles`, `appointments`, `working_hours`, `time_blocks`, `customers`) are scoped to `business_id`.
- Tenant data integrity is enforced in PostgreSQL using composite foreign keys `(business_id, entity_id)`, check constraints, partial indexes, and server-side database scoping.

---

## 5. Technology Stack
- **Framework**: Next.js App Router (Server Components & Server Actions)
- **Language**: TypeScript (Strict mode enabled)
- **Styling**: Tailwind CSS v4, shadcn/ui components
- **Database & ORM**: Self-Hosted PostgreSQL, Drizzle ORM, `pg` Pool
- **Migrations**: Drizzle Kit (`drizzle-kit`)
- **Package Manager**: pnpm
