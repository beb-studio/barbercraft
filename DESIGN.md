# DESIGN: Impeccable Design System Foundation

This document defines the visual and interaction design principles for BarberCraft, moving away from generic dark themes into a professional, light-first SaaS operational interface.

## 1. Visual Identity
- **Vibe**: Professional, sophisticated, operational, and clean. 
- **Theme**: **Light-First Only**. Dark mode is explicitly removed or disabled to ensure a consistent, premium administrative experience.
- **Avoidances**: No pure black backgrounds, no flashy gold gradients, no floating glassmorphism cards without grounding, no barber clichés (razors everywhere).

## 2. Semantic Color Tokens
The color palette uses tailored `oklch` or hex values to represent a clean, high-contrast, trustworthy environment.
- **Background (`--background`)**: Warm off-white (`#FAFAFA` or zinc-50 equivalent) to reduce eye strain during day-long operational use.
- **Surface (`--card`, `--popover`)**: Pure white (`#FFFFFF`) to pop against the background.
- **Foreground (`--foreground`)**: Deep zinc (`#18181B` or zinc-900) for excellent readability.
- **Muted Text (`--muted-foreground`)**: Mid-zinc (`#71717A` or zinc-500) for secondary information.
- **Primary (`--primary`)**: Deep slate/navy (`#0F172A` or slate-900) for primary actions and highlights, communicating stability.
- **Accent/Interactive**: A subdued professional blue or teal can be used for active states, but generally we rely on high-contrast primary for primary actions.
- **Borders (`--border`)**: Light, subtle dividers (`#E4E4E7` or zinc-200).

## 3. Typography
- **Primary Font**: *Geist Sans* (var: `--font-geist-sans`) - Used for all general UI, headings, and body copy.
- **Tabular Font**: *Geist Mono* (var: `--font-geist-mono`) - Reserved strictly for tabular data, numbers, times, and technical IDs where alignment is crucial.
- **Hierarchy**: Strong contrast between headings (semibold, dark) and metadata (regular, muted).

## 4. Spacing & Borders
- **Border Radius (`--radius`)**: `0.5rem` (`md`). This is a balanced radius—not overly playful (like full pills), not overly harsh (like sharp squares).
- **Shadows**: Subtle, natural shadows (`shadow-sm` for cards, `shadow-md` for dropdowns). No harsh, colored, or oversized shadows.
- **Density**: The UI should feel structured. Use `gap-4` or `gap-6` for section divisions, and tighter spacing (`gap-2`) for related data points.

## 5. Responsive Layout Rules
- **Mobile (< 768px)**: 
  - 100% width, stacked columns.
  - Bottom navigation or compact hamburger menus.
  - Cards should not have excessive padding (use `p-4` instead of `p-6`).
- **Tablet (768px - 1024px)**: 
  - Transition to 2-column grids where appropriate.
  - Side navigation can become a compact icon rail.
- **Desktop (1024px - 1440px)**: 
  - Rich operational view. 
  - Persistent left sidebar.
  - Use the horizontal space! Dashboards should expand to fill the area with useful columns, charts, or lists. Do NOT constrain the main content to a narrow `max-w-md` column.
- **Large Desktop (> 1440px)**: 
  - Expand to a sensible maximum (e.g., `max-w-screen-2xl`) or continue to use CSS Grid to distribute space intelligently.

## 6. Components
- **Cards**: Flat white background, 1px subtle border, very light shadow. Clean separation.
- **Buttons**: Primary buttons are dark (high contrast). Secondary buttons are outlined or muted.
- **Forms**: Clearly defined inputs with borders. Labels must be bold or distinct. Focus rings (`ring-offset-2`, `ring-primary`) must be visible for accessibility.

## 7. Public Appointment Management
- The appointment summary remains the visual anchor; management actions sit below it and never resemble a second booking checkout.
- `Randevu Saatini Değiştir` is a normal primary management action. `Randevuyu İptal Et` remains a visually distinct destructive action.
- Rescheduling uses a horizontally scrollable mobile date ribbon, a native extended-date affordance, 48px-or-larger time choices, and a deliberate old-versus-new comparison before confirmation.
- Server-derived empty, stale-slot, ineligible, pending, and success states use concise Turkish messages with live-region semantics. No internal identifiers or policy details appear in the interface.

## 8. Booking Policy Settings
- `Randevu Kuralları` uses one primary settings card and one restrained, sticky desktop summary; mobile stacks both without narrowing the operational canvas.
- Amount and unit controls are visually paired, fully labeled, keyboard accessible, and at least 44px high. Zero-value meaning and unlimited horizon state are explicit rather than encoded as magic numbers.
- Saving is an ordinary primary action. Reset is secondary. Success, validation, and stale-edit recovery use restrained live feedback without destructive styling.
- Public booking guidance remains concise and subordinate to date/slot selection. Notice-window messages on `/randevu` preserve the appointment summary as the visual anchor.
