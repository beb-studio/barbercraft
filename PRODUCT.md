# PRODUCT: BarberCraft

## The Multi-Tenant SaaS Platform for Barber & Hairdresser Businesses

BarberCraft is an operational business platform. It is NOT primarily a consumer marketplace. The primary audience using the application to manage their day-to-day operations are the business owners, managers, and staff members of grooming businesses.

### Core Audience
1. **Business Owners & Managers**: Need a high-level view of revenue, staff utilization, and daily agenda. They require a professional, trustworthy, and sophisticated operational view.
2. **Staff Members (Barbers, Hairdressers)**: Need a clear, friction-free way to check their daily schedule, time-offs, and upcoming appointments. They need maximum legibility and speed.
3. **Platform Administrators**: Need macro-level oversight across all tenants (businesses) using BarberCraft.
4. **Customers**: End users booking an appointment via the public flow. The booking flow must be seamless, mobile-optimized, and conversion-focused.

### Design Paradigm: Operational SaaS Interface
- **Light-First Only**: The interface is intentionally designed as a premium, light-themed administrative tool. It avoids "barber clichés" like pure black backgrounds and gold gradients. This is a tool for professional businesses.
- **Sophisticated & Trustworthy**: The platform needs to feel stable, secure, and clear.
- **Information Hierarchy & Density**: We optimize for displaying data and schedules clearly. Mobile layout should be compact but legible. Desktop layout must leverage available screen real estate (no arbitrary max-widths that artificially constrain operational views).
- **Language**: Technical documentation and code are in English. Every user-facing UI string must be in Turkish.

### Current Evolution
- Replaced the initial generic, dark AI-generated UI with a custom light-first Design System (Task 011A).
- The product relies strictly on its multi-tenant foundation: Platform Admins → Business Owners → Staff Members.
- Tenant-Scoped Customer CRM & Operations: First-class customer directory, appointment history, internal notes, existing customer selection in manual bookings, duplicate review, and tenant-safe logical customer families. OWNER/ADMIN can explicitly choose a primary customer and confirm a logical merge; the product never auto-merges. Canonical CRM reads, alias-aware search, stale-ID redirects, retained lineage, and future-booking resolution operate on the canonical family while historical appointment and note foreign keys remain untouched. V1 intentionally provides no unmerge operation (Tasks 013A through 013C.2C).
- Accountless Public Appointment Management: every successful public booking receives a one-time-delivered, 256-bit capability link. PostgreSQL stores only its SHA-256 hash. The `/randevu#<token>` convention keeps the secret out of HTTP request URLs/access logs, removes it from browser history immediately after capture, and presents a private/no-store/noindex appointment summary. A valid capability may deliberately cancel or reschedule a future `PENDING`/`CONFIRMED` appointment after confirmation. Public rescheduling changes date/time only, retains the concrete staff, service, snapshots, status, and customer identity, and revalidates the selected slot against current server truth.
- Business-Controlled Public Scheduling Policy: each tenant owns centralized booking lead-time, optional maximum-advance, cancellation-notice, and reschedule-notice rules. Compatibility defaults preserve existing behavior (`0`, unlimited, `0`, `0`). Public booking and self-service use current trusted business policy; internal staff scheduling is not constrained by these customer-facing rules.
