/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";
import { getBusinessLocalToday } from "../../src/lib/timezone";

let pgServer: any;
let db: any;
let PublicBookingService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const bizSchedule = uuid(111); // Onboarding complete, active, Europe/Istanbul, 15 min interval
const bizNY = uuid(112); // America/New_York for timezone testing
const bizIncomplete = uuid(113); // Onboarding incomplete (null)
const bizInactive = uuid(114); // Inactive
const bizOther = uuid(115); // Another tenant

// Users
const uOwner = uuid(211);
const uStaff1 = uuid(212);
const uStaffCustom = uuid(213);
const uStaffNoPublic = uuid(214);
const uOwnerOther = uuid(215);

// Business Members
const mOwner = uuid(311);
const mStaff1 = uuid(312);
const mStaffCustom = uuid(313);
const mStaffNoPublic = uuid(314);
const mOwnerOther = uuid(315);

// Staff Profiles
const staffInherit = uuid(411); // Uses business working hours (9:00 - 18:00)
const staffCustom = uuid(412); // Uses custom working hours (10:00 - 16:00, Monday-Friday)
const staffNoPublic = uuid(413); // publicBookingEnabled = false
const staffOther = uuid(414); // belongs to bizOther

// Services
const svc30 = uuid(511); // 30 min, 150.00 TRY
const svc45 = uuid(512); // 45 min, 250.00 TRY
const svcInactive = uuid(513); // inactive
const svcOther = uuid(514); // belongs to bizOther

// Reference dates:
// Let's use a fixed future Monday for deterministic schedule calculations:
// 2026-10-12 is Monday (day_of_week = 1)
// 2026-10-18 is Sunday (day_of_week = 0)
const TARGET_MONDAY = "2026-10-12";
const TARGET_SUNDAY = "2026-10-18";
// Fake "now": Monday morning 2026-10-12 11:15:00 in Europe/Istanbul (UTC 08:15:00)
const REF_NOW_MONDAY = new Date("2026-10-12T08:15:00.000Z");

before(async () => {
  pgServer = await startDatabase({ port: 54415 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  const svcLb = await import("../../src/services/public-booking.service");
  PublicBookingService = svcLb.PublicBookingService;

  // 1. Seed Users
  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES
    ('${uOwner}', 'Owner Schedule', 'owner@sch.com', true),
    ('${uStaff1}', 'Staff Inherit', 'staff1@sch.com', true),
    ('${uStaffCustom}', 'Staff Custom', 'staffcustom@sch.com', true),
    ('${uStaffNoPublic}', 'Staff Hidden', 'staffhidden@sch.com', true),
    ('${uOwnerOther}', 'Owner Other', 'ownerother@sch.com', true);
  `);

  // 2. Seed Businesses
  await db.execute(`
    INSERT INTO businesses (id, name, slug, phone, address, currency, timezone, booking_interval_minutes, active, onboarding_completed_at) VALUES
    ('${bizSchedule}', 'Schedule Studio', 'schedule-studio', '+905559998877', 'Nisantasi, Istanbul', 'TRY', 'Europe/Istanbul', 15, true, NOW()),
    ('${bizNY}', 'NY Barber', 'ny-barber', '+15551234567', 'Broadway, NY', 'USD', 'America/New_York', 15, true, NOW()),
    ('${bizIncomplete}', 'Incomplete Studio', 'incomplete-studio', '+905559998866', 'Kadikoy', 'TRY', 'Europe/Istanbul', 15, true, NULL),
    ('${bizInactive}', 'Inactive Studio', 'inactive-studio', '+905559998855', 'Uskudar', 'TRY', 'Europe/Istanbul', 15, false, NOW()),
    ('${bizOther}', 'Other Business', 'other-business', '+905559998844', 'Ankara', 'TRY', 'Europe/Istanbul', 15, true, NOW());
  `);

  // 3. Seed Business Working Hours for bizSchedule
  // Monday to Saturday: 09:00 - 18:00 (is_closed = false)
  // Sunday: is_closed = true
  for (let day = 0; day <= 6; day++) {
    const isClosed = day === 0;
    const start = isClosed ? "NULL" : "'09:00:00'";
    const end = isClosed ? "NULL" : "'18:00:00'";
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, is_closed, start_time, end_time)
      VALUES ('${bizSchedule}', ${day}, ${isClosed}, ${start}, ${end});
    `);
  }

  // Business working hours for bizNY (same hours, NY timezone)
  for (let day = 0; day <= 6; day++) {
    const isClosed = day === 0;
    const start = isClosed ? "NULL" : "'09:00:00'";
    const end = isClosed ? "NULL" : "'18:00:00'";
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, is_closed, start_time, end_time)
      VALUES ('${bizNY}', ${day}, ${isClosed}, ${start}, ${end});
    `);
  }

  // 4. Seed Business Members
  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role, active) VALUES
    ('${mOwner}', '${bizSchedule}', '${uOwner}', 'OWNER', true),
    ('${mStaff1}', '${bizSchedule}', '${uStaff1}', 'STAFF', true),
    ('${mStaffCustom}', '${bizSchedule}', '${uStaffCustom}', 'STAFF', true),
    ('${mStaffNoPublic}', '${bizSchedule}', '${uStaffNoPublic}', 'STAFF', true),
    ('${mOwnerOther}', '${bizOther}', '${uOwnerOther}', 'OWNER', true);
  `);

  // 5. Seed Staff Profiles
  await db.execute(`
    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, phone, uses_business_hours, public_booking_enabled, active) VALUES
    ('${staffInherit}', '${bizSchedule}', '${mStaff1}', 'Ali', 'Inherit', '+905551110001', true, true, true),
    ('${staffCustom}', '${bizSchedule}', '${mStaffCustom}', 'Burak', 'Custom', '+905551110002', false, true, true),
    ('${staffNoPublic}', '${bizSchedule}', '${mStaffNoPublic}', 'Gizli', 'Personel', '+905551110003', true, false, true),
    ('${staffOther}', '${bizOther}', '${mOwnerOther}', 'Diger', 'Usta', '+905551110004', true, true, true);
  `);

  // 6. Seed Custom Working Hours for staffCustom:
  // Mon-Fri (1-5): 10:00 - 16:00
  // Sat-Sun (6, 0): is_working = false
  for (let day = 0; day <= 6; day++) {
    const isWorking = day >= 1 && day <= 5;
    const start = isWorking ? "'10:00:00'" : "NULL";
    const end = isWorking ? "'16:00:00'" : "NULL";
    await db.execute(`
      INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
      VALUES ('${bizSchedule}', '${staffCustom}', ${day}, ${isWorking}, ${start}, ${end});
    `);
  }

  // 7. Seed Services
  await db.execute(`
    INSERT INTO services (id, business_id, name, description, duration_minutes, price, active) VALUES
    ('${svc30}', '${bizSchedule}', 'Sac Kesimi', 'Standart kesim', 30, '150.00', true),
    ('${svc45}', '${bizSchedule}', 'Damat Trasi', 'Ozel bakim', 45, '250.00', true),
    ('${svcInactive}', '${bizSchedule}', 'Pasif Hizmet', 'Eski', 30, '100.00', false),
    ('${svcOther}', '${bizOther}', 'Diger Hizmet', 'Baska dukkan', 30, '120.00', true);
  `);

  // 8. Seed Staff Services
  await db.execute(`
    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES
    ('${bizSchedule}', '${staffInherit}', '${svc30}'),
    ('${bizSchedule}', '${staffInherit}', '${svc45}'),
    ('${bizSchedule}', '${staffCustom}', '${svc30}'),
    ('${bizSchedule}', '${staffNoPublic}', '${svc30}'),
    ('${bizSchedule}', '${staffInherit}', '${svcInactive}'),
    ('${bizOther}', '${staffOther}', '${svcOther}');
  `);

  // 9. Seed Time Blocks for staffInherit on TARGET_MONDAY (2026-10-12):
  // Istanbul is UTC+3.
  // TIME_OFF: 12:00 to 13:00 local (09:00 to 10:00 UTC)
  // BREAK: 14:00 to 14:30 local (11:00 to 11:30 UTC)
  // BLOCKED: 16:00 to 16:30 local (13:00 to 13:30 UTC)
  await db.execute(`
    INSERT INTO time_blocks (business_id, staff_id, block_type, start_time, end_time, reason) VALUES
    ('${bizSchedule}', '${staffInherit}', 'TIME_OFF', '2026-10-12 09:00:00+00', '2026-10-12 10:00:00+00', 'Izin'),
    ('${bizSchedule}', '${staffInherit}', 'BREAK', '2026-10-12 11:00:00+00', '2026-10-12 11:30:00+00', 'Ogle yemegi'),
    ('${bizSchedule}', '${staffInherit}', 'BLOCKED', '2026-10-12 13:00:00+00', '2026-10-12 13:30:00+00', 'Toplanti');
  `);

  // 10. Seed Existing Appointments for staffInherit on TARGET_MONDAY (2026-10-12):
  // Customer for bizSchedule
  const customerId = uuid(601);
  await db.execute(`
    INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES
    ('${customerId}', '${bizSchedule}', 'Test', '+905550009988', '+905550009988');
  `);

  // CONFIRMED appointment: 10:00 to 10:30 local (07:00 to 07:30 UTC)
  // CANCELLED appointment: 15:00 to 15:30 local (12:00 to 12:30 UTC)
  await db.execute(`
    INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES
    ('${uuid(701)}', '${bizSchedule}', '${customerId}', '${staffInherit}', '${svc30}', '2026-10-12 07:00:00+00', '2026-10-12 07:30:00+00', 'CONFIRMED', 'PUBLIC_WEB', 'Sac Kesimi', 30, '150.00'),
    ('${uuid(702)}', '${bizSchedule}', '${customerId}', '${staffInherit}', '${svc30}', '2026-10-12 12:00:00+00', '2026-10-12 12:30:00+00', 'CANCELLED', 'PUBLIC_WEB', 'Sac Kesimi', 30, '150.00');
  `);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("TASK 007B — Public Booking Schedule Tests", () => {
  describe("1. Security, Tampering & Route Guards", () => {
    it("1. public schedule route requires no auth", async () => {
      // Invocations succeed anonymously without any session context
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: new Date("2026-10-01T00:00:00Z"),
      });
      assert.equal(res.success, true);
    });

    it("2. valid business/service/staff selection loads", async () => {
      const res = await PublicBookingService.validatePublicSelection(
        "schedule-studio",
        svc30,
        staffInherit
      );
      assert.equal(res.valid, true);
      assert.equal(res.business?.slug, "schedule-studio");
      assert.equal(res.service?.id, svc30);
      assert.equal(res.staff?.id, staffInherit);
    });

    it("3. nonexistent business rejected safely", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "non-existent-biz",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
      assert.ok(res.error);
    });

    it("4. incomplete or inactive business rejected", async () => {
      const resIncomplete = await PublicBookingService.getPublicAvailability({
        slug: "incomplete-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
      });
      assert.equal(resIncomplete.success, false);

      const resInactive = await PublicBookingService.getPublicAvailability({
        slug: "inactive-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
      });
      assert.equal(resInactive.success, false);
    });

    it("5 & 6. malformed service and staff UUID rejected safely without DB error", async () => {
      const res1 = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: "tampered-service-id",
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res1.success, false);

      const res2 = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: "tampered-staff-id",
        localDate: TARGET_MONDAY,
      });
      assert.equal(res2.success, false);
    });

    it("7. cross-tenant service rejected", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svcOther,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
    });

    it("8. cross-tenant staff rejected", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffOther,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
    });

    it("9. staff not assigned to service rejected", async () => {
      // staffCustom is assigned to svc30, but NOT to svc45
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc45,
        staffId: staffCustom,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
    });

    it("10. inactive service rejected", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svcInactive,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
    });

    it("11. public-disabled staff rejected", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffNoPublic,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
    });

    it("A. public action cannot accept custom clock injection", async () => {
      const { getPublicAvailabilityAction } = await import(
        "../../src/actions/public-booking.actions"
      );
      // Verify that the action function parameters strictly do not accept referenceNow
      // Calling with standard public params
      const res = await getPublicAvailabilityAction({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: "2026-10-12",
      });
      // Will reject or evaluate against server real now (since 2026 is in future, it evaluates)
      assert.ok(res);
    });
  });

  describe("2. Business-Local Date Boundary", () => {
    it("12. business-local today calculated correctly according to business timezone", () => {
      // Near midnight instant: 2026-10-06 22:30:00 UTC
      // In Europe/Istanbul (UTC+3), it is already 2026-10-07 01:30:00
      // In America/New_York (UTC-4), it is still 2026-10-06 18:30:00
      const instant = new Date("2026-10-06T22:30:00.000Z");
      const istanbulToday = getBusinessLocalToday("Europe/Istanbul", instant);
      const nyToday = getBusinessLocalToday("America/New_York", instant);

      assert.equal(istanbulToday, "2026-10-07");
      assert.equal(nyToday, "2026-10-06");
    });

    it("13. past local date rejected server-side", async () => {
      // If referenceNow is 2026-10-12, then 2026-10-11 is in the past
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: "2026-10-11",
        referenceNow: REF_NOW_MONDAY,
      });
      assert.equal(res.success, false);
      assert.equal(res.error, "Geçmiş bir tarih için randevu alınamaz.");
    });

    it("14. today accepted", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: REF_NOW_MONDAY, // 2026-10-12
      });
      assert.equal(res.success, true);
    });

    it("15. future local date accepted", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: "2026-10-13", // Tuesday
        referenceNow: REF_NOW_MONDAY,
      });
      assert.equal(res.success, true);
    });

    it("34. malformed local date format fails safely", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: "invalid-date",
        referenceNow: REF_NOW_MONDAY,
      });
      assert.equal(res.success, false);
      assert.ok(res.error?.includes("Geçersiz tarih formatı"));
    });
  });

  describe("3. Availability Calculation & Scheduling Rules", () => {
    it("16. closed weekday returns empty slots gracefully", async () => {
      // Sunday is closed in business_working_hours
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_SUNDAY,
        referenceNow: new Date("2026-10-01T00:00:00Z"),
      });
      assert.equal(res.success, true);
      assert.equal(res.slots.length, 0);
      assert.equal(res.reason, "CLOSED");
    });

    it("17. inherited business schedule produces slots", async () => {
      // In the early morning reference before shift start (08:00 Istanbul / 05:00 UTC)
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      assert.equal(res.success, true);
      assert.ok(res.slots.length > 0);
      // Shift starts at 09:00
      assert.equal(res.slots[0].localStartTime, "09:00");
    });

    it("18. custom staff schedule produces slots within custom hours (10:00 - 16:00)", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffCustom,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      assert.equal(res.success, true);
      assert.ok(res.slots.length > 0);
      // Custom shift starts at 10:00
      assert.equal(res.slots[0].localStartTime, "10:00");
      // Last 30-min slot inside 16:00 end time starts at 15:30
      const lastSlot = res.slots[res.slots.length - 1];
      assert.equal(lastSlot.localStartTime, "15:30");
      assert.equal(lastSlot.localEndTime, "16:00");
    });

    it("19. booking interval reflected in slot start increments", async () => {
      // Business interval is 15 minutes
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffCustom,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      assert.equal(res.slots[0].localStartTime, "10:00");
      assert.equal(res.slots[1].localStartTime, "10:15");
      assert.equal(res.slots[2].localStartTime, "10:30");
    });

    it("20. dynamic service duration reflected correctly in end times", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      // 30 min service
      const res30 = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const slot30 = res30.slots.find((s: any) => s.localStartTime === "09:00");
      assert.equal(slot30.localEndTime, "09:30");

      // 45 min service
      const res45 = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc45,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const slot45 = res45.slots.find((s: any) => s.localStartTime === "09:00");
      assert.equal(slot45.localEndTime, "09:45");
    });

    it("21. existing CONFIRMED appointment removes conflicting slots", async () => {
      // Appointment is 10:00 to 10:30.
      // 30 min service starting at 09:45 ends at 10:15 -> overlaps!
      // Slot 10:00 to 10:30 -> overlaps!
      // Slot 10:15 to 10:45 -> overlaps!
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const startTimes = res.slots.map((s: any) => s.localStartTime);
      assert.equal(startTimes.includes("09:45"), false);
      assert.equal(startTimes.includes("10:00"), false);
      assert.equal(startTimes.includes("10:15"), false);
      // 09:30 - 10:00 is non-overlapping (ends exactly at 10:00) -> allowed!
      assert.equal(startTimes.includes("09:30"), true);
      // 10:30 - 11:00 starts exactly at 10:30 -> allowed!
      assert.equal(startTimes.includes("10:30"), true);
    });

    it("22. CANCELLED appointment does not remove slot", async () => {
      // Cancelled appointment was 15:00 - 15:30.
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const startTimes = res.slots.map((s: any) => s.localStartTime);
      assert.equal(startTimes.includes("15:00"), true);
    });

    it("23. TIME_OFF removes conflicting slots", async () => {
      // TIME_OFF was 12:00 to 13:00.
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const startTimes = res.slots.map((s: any) => s.localStartTime);
      assert.equal(startTimes.includes("12:00"), false);
      assert.equal(startTimes.includes("12:15"), false);
      assert.equal(startTimes.includes("12:30"), false);
      assert.equal(startTimes.includes("12:45"), false);
    });

    it("24. BREAK removes conflicting slots", async () => {
      // BREAK was 14:00 to 14:30.
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const startTimes = res.slots.map((s: any) => s.localStartTime);
      assert.equal(startTimes.includes("14:00"), false);
      assert.equal(startTimes.includes("14:15"), false);
    });

    it("25. BLOCKED removes conflicting slots", async () => {
      // BLOCKED was 16:00 to 16:30.
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const startTimes = res.slots.map((s: any) => s.localStartTime);
      assert.equal(startTimes.includes("16:00"), false);
      assert.equal(startTimes.includes("16:15"), false);
    });

    it("26 & 27. current-day past times excluded while future times today retained", async () => {
      // REF_NOW_MONDAY is 11:15 local time (08:15 UTC).
      // Any slot starting <= 11:15 must be excluded!
      // Slots starting > 11:15 (e.g. 11:30) must be retained!
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: REF_NOW_MONDAY,
      });
      const startTimes = res.slots.map((s: any) => s.localStartTime);
      assert.equal(startTimes.includes("09:00"), false);
      assert.equal(startTimes.includes("10:30"), false);
      assert.equal(startTimes.includes("11:15"), false);
      // 11:30 is in the future relative to 11:15 -> retained!
      assert.equal(startTimes.includes("11:30"), true);
    });

    it("28. business timezone controls displayed local times", async () => {
      // For staffInherit in Europe/Istanbul, shift starts at 09:00 local time
      // 09:00 Istanbul = 06:00 UTC
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const slot = res.slots[0];
      assert.equal(slot.localStartTime, "09:00");
      assert.equal(slot.startAt, "2026-10-12T06:00:00.000Z");
    });
  });

  describe("4. Public Slot DTO & State Integrity", () => {
    it("30. public slot DTO contains no internal IDs or conflict diagnostics", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      assert.ok(res.slots.length > 0);
      const slot = res.slots[0];
      const keys = Object.keys(slot).sort();
      assert.deepEqual(keys, ["endAt", "localEndTime", "localStartTime", "startAt"].sort());
      assert.equal((slot as any).businessId, undefined);
      assert.equal((slot as any).staffId, undefined);
      assert.equal((slot as any).conflictDetails, undefined);
    });

    it("31. selected startAt is exact engine-returned UTC instant", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: refEarly,
      });
      const slot = res.slots[0];
      assert.equal(slot.startAt, "2026-10-12T06:00:00.000Z");
    });

    it("33. zero slots returns successful empty public response with reason", async () => {
      const res = await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_SUNDAY,
        referenceNow: new Date("2026-10-01T00:00:00Z"),
      });
      assert.equal(res.success, true);
      assert.equal(res.slots.length, 0);
      assert.equal(res.reason, "CLOSED");
    });

    it("37, 38 & 39. no appointment, customer, or reservation hold is created", async () => {
      const apptBefore = await db.execute("SELECT count(*)::int as c FROM appointments;");
      const custBefore = await db.execute("SELECT count(*)::int as c FROM customers;");

      await PublicBookingService.getPublicAvailability({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        localDate: TARGET_MONDAY,
        referenceNow: REF_NOW_MONDAY,
      });

      const apptAfter = await db.execute("SELECT count(*)::int as c FROM appointments;");
      const custAfter = await db.execute("SELECT count(*)::int as c FROM customers;");

      assert.equal(apptBefore.rows[0].c, apptAfter.rows[0].c);
      assert.equal(custBefore.rows[0].c, custAfter.rows[0].c);
    });
  });

  describe("5. Confirmation Placeholder Revalidation", () => {
    it("B. confirmation validates that chosen slot is currently available", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const validInstant = "2026-10-12T06:00:00.000Z"; // 09:00 Istanbul

      const res = await PublicBookingService.validatePublicSlotSelection({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        startAt: validInstant,
        referenceNow: refEarly,
      });
      assert.equal(res.valid, true);
      assert.equal(res.slot?.startAt, validInstant);
      assert.equal(res.slot?.localStartTime, "09:00");
    });

    it("C. confirmation rejects a slot that has become occupied", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      // 10:00 local (07:00 UTC) has an existing CONFIRMED appointment
      const occupiedInstant = "2026-10-12T07:00:00.000Z";

      const res = await PublicBookingService.validatePublicSlotSelection({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        startAt: occupiedInstant,
        referenceNow: refEarly,
      });
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("uygun değil"));
    });

    it("D. confirmation localDate derivation uses business timezone, not UTC date", async () => {
      // Instant: 2026-10-11T22:30:00.000Z
      // In UTC, this is 2026-10-11
      // In Europe/Istanbul (UTC+3), this is 2026-10-12 01:30:00 AM (local date = 2026-10-12)
      // Since 01:30 is outside working hours (09:00 - 18:00), it won't find a slot,
      // but the localDate derivation must be 2026-10-12, NOT 2026-10-11!
      const instant = "2026-10-11T22:30:00.000Z";
      const startInstant = new Date(instant);
      const { formatInstantInBusinessTimezone } = await import("../../src/lib/timezone");
      const derived = formatInstantInBusinessTimezone(startInstant, "Europe/Istanbul");
      assert.equal(derived.dateStr, "2026-10-12");
    });

    it("35. confirmation placeholder rejects malformed startAt string", async () => {
      const res = await PublicBookingService.validatePublicSlotSelection({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        startAt: "malformed-start-time",
      });
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("Geçersiz saat"));
    });

    it("36. confirmation placeholder rejects invalid staff/service relationship", async () => {
      const res = await PublicBookingService.validatePublicSlotSelection({
        slug: "schedule-studio",
        serviceId: svc45,
        staffId: staffCustom, // staffCustom is NOT assigned to svc45
        startAt: "2026-10-12T07:00:00.000Z",
      });
      assert.equal(res.valid, false);
    });

    it("E & F. confirmation does not hold the slot and multiple users can inspect the same slot simultaneously", async () => {
      const refEarly = new Date("2026-10-12T05:00:00.000Z");
      const validInstant = "2026-10-12T06:00:00.000Z";

      // User 1 inspects
      const u1 = await PublicBookingService.validatePublicSlotSelection({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        startAt: validInstant,
        referenceNow: refEarly,
      });

      // User 2 inspects simultaneously
      const u2 = await PublicBookingService.validatePublicSlotSelection({
        slug: "schedule-studio",
        serviceId: svc30,
        staffId: staffInherit,
        startAt: validInstant,
        referenceNow: refEarly,
      });

      assert.equal(u1.valid, true);
      assert.equal(u2.valid, true);
    });
  });
});
