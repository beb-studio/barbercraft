# User Experience & Mobile-First Design Rules

## 1. The Mobile-First Imperative

The application is engineered strictly **mobile-first**. 

- **Primary Target Viewport**: `390px` width (iPhone 14/15/16 standard mobile baseline).
- **Core Viewport Range**: Fully optimized from `360px` to `430px` width before expanding to tablet and desktop.
- **Desktop Responsiveness**: Desktop layouts must gracefully scale, adopting multi-column structures or centered cards without distorting mobile-first ergonomic proportions.

---

## 2. Touch Ergonomics & Thumb Zone

1. **Touch Target Sizing**:
   - Every interactive element (buttons, date cells, time chips, form inputs) must have a touch target of at least **44 × 44 pixels**.
   - Spacing between adjacent interactive targets must be at least **8 pixels** to prevent accidental mis-taps.
2. **Bottom-Weighted Actions**:
   - Primary forward-action buttons (e.g., "Next Step", "Confirm Appointment") must be positioned in the bottom viewport zone (sticky bottom bar on mobile).
   - This ensures immediate thumb reachability on modern large smartphones.
3. **Safe Area Insets**:
   - All sticky bottom bars and navigations must include `pb-[env(safe-area-inset-bottom)]` to prevent clipping by home indicator bars on iOS devices.

---

## 3. Booking Step Ergonomics (6 Steps)

### Step 1: Dynamic Service Selection
- Services presented as high-contrast cards with clear pricing and duration badges.
- Instant visual selection feedback (border highlight + checkmark badge).
- Selected service state summarized persistently.

### Step 2: Staff Selection
- Staff cards display barber photo/avatar, display name, and specialty title.
- "Any Available Barber" option prominently displayed at top for fastest booking.

### Step 3: Date Selection
- Horizontal scrollable weekly calendar ribbon for rapid day-by-day navigation on mobile.
- Full monthly modal / popover available for future dates.
- Non-working days and fully booked days visually disabled with subdued contrast.

### Step 4: Time Slot Selection
- Time chips organized by period of day: Morning, Afternoon, Evening.
- Minimum 48px height per time chip for effortless single-finger tapping.
- Already booked or unavailable slots are hidden or disabled with strike-through styling.

### Step 5: Contact Information Form
- Mobile-optimized virtual keyboard triggers:
  - Phone input: `type="tel"` and `inputMode="tel"`.
  - Email input: `type="email"` and `inputMode="email"`.
- Minimal mandatory fields to reduce abandonment rate.
- Clear inline validation messages beneath input fields.

### Step 6: Confirmation & Receipt
- High-visibility confirmation screen with check icon, booking reference, and appointment summary.
- Single-tap actions: "Add to Google/Apple Calendar", "Directions", "Cancel/Modify".

---

## 4. Visual & Component Guidelines

1. **Dark Mode & Aesthetics**:
   - Modern, premium barbershop aesthetic with deep neutral tones (`#09090b` dark background, crisp borders, subtle accent highlights).
2. **Micro-Interactions**:
   - Active tap feedback using subtle scale (`active:scale-[0.98]`) or brightness transition.
   - Smooth skeleton loaders during server-side transitions.
3. **Typography Scaling**:
   - Mobile: Headers `1.5rem` to `1.75rem` (`text-2xl` to `text-3xl`), body `0.875rem` (`text-sm`).
   - Desktop: Headers expand to `2.25rem` (`text-4xl`), body to `1rem` (`text-base`).

---

## 5. Public Appointment Rescheduling

1. Show `Randevu Saatini Değiştir` only when the secure management DTO says the current appointment is eligible; the server still revalidates every mutation.
2. Keep the assigned service and staff visible but non-editable. Never display staff/service selectors or imply that `Fark Etmez` assignment will run again.
3. Date and slot options must be keyboard accessible, expose selected state programmatically, retain visible focus, and meet the 44px touch-target minimum.
4. Before mutation, compare `Mevcut Randevu` and `Yeni Randevu` date/start/end values and require explicit `Randevuyu Değiştir` confirmation. `Vazgeç` and Escape close the dialog without mutation.
5. Pending state disables conflicting reschedule/cancel controls and announces `Randevu Değiştiriliyor...`. Success and error feedback use polite live regions.
6. A stale slot is never replaced automatically. Keep the old schedule, refresh current truth/slots, and ask the customer to choose again.

---

## 6. Booking Policy Settings

1. OWNER/ADMIN policy controls live at `/dashboard/settings/booking`; STAFF receives neither the navigation entry nor the route content.
2. Every duration presents a labeled amount and keyboard-usable unit selector. Existing values must round-trip exactly; the interface never silently rounds minutes.
3. Unlimited maximum advance is a labeled checkbox state. Finite mode reveals an associated whole-day input, and `NULL` remains the only persisted unlimited representation.
4. The committed policy summary is distinct from editable controls. A successful save refreshes it from server truth; a stale save replaces the form with current values and explains what happened.
5. Inputs and actions meet the 44px touch target. Help text is associated with controls, pending state disables conflicting input, and success/errors are announced with live-region semantics.
6. Public booking date controls must not encourage dates beyond the trusted business-local horizon. Lead/horizon guidance is concise; server-derived availability remains authoritative.
7. When notice alone closes online cancellation/rescheduling, `/randevu` explains that the customer may contact the business while retaining secure read access.

---

## 7. Notification Settings

1. `/dashboard/settings/notifications` is available only to tenant OWNER/ADMIN users and is not advertised to STAFF in dashboard navigation.
2. The customer-notifications switch conveys its checked and disabled relationship programmatically. Turning it off preserves but clearly deactivates event and reminder choices.
3. A reminder row pairs an associated whole-number amount with an accessible minute/hour/day selector. Values must round-trip without rounding; duplicate canonical offsets and the three-rule limit receive inline Turkish validation.
4. Add/remove, save, pending, success, and stale-state controls are keyboard accessible, have visible focus, meet the 44px touch target rule, and communicate results through live feedback rather than color alone.
5. The page presents configuration only. It must not show recipient contacts, capability URLs, provider metadata, or assertions that an external message has been delivered.
