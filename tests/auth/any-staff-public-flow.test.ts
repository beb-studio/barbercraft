/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let PublicBookingService: any;
let parsePublicStaffSelection: any;
let getPublicAnyStaffAvailabilityAction: any;
let createPublicAppointmentAction: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const biz = uuid(111);
const bizOther = uuid(112);
const bizInactive = uuid(113);

// Users
const uStaffA = uuid(211);
const uStaffB = uuid(212);
const uStaffDisabled = uuid(213);

// Business Members
const mStaffA = uuid(311);
const mStaffB = uuid(312);
const mStaffDisabled = uuid(313);

// Staff Profiles
const staffA = uuid(411);
const staffB = uuid(412);
const staffDisabled = uuid(413);

// Services
const svcHaircut = uuid(511);
const svcNoStaff = uuid(512);
const svcInactive = uuid(513);
const svcOtherBiz = uuid(514);

// Monday test date (future)
const TARGET_MONDAY = "2026-10-19";
const REF_NOW = new Date("2026-10-19T05:00:00.000Z");

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  const svcLb = await import("../../src/services/public-booking.service");
  PublicBookingService = svcLb.PublicBookingService;
  parsePublicStaffSelection = svcLb.parsePublicStaffSelection;

  const actionsLb = await import("../../src/actions/public-booking.actions");
  getPublicAnyStaffAvailabilityAction = actionsLb.getPublicAnyStaffAvailabilityAction;
  createPublicAppointmentAction = actionsLb.createPublicAppointmentAction;

  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES
    ('${uStaffA}', 'Staff A', 'a@flow.com', true),
    ('${uStaffB}', 'Staff B', 'b@flow.com', true),
    ('${uStaffDisabled}', 'Staff Disabled', 'dis@flow.com', true);

    INSERT INTO businesses (id, name, slug, phone, address, currency, timezone, booking_interval_minutes, active, onboarding_completed_at) VALUES
    ('${biz}', 'Flow Barber', 'flow-barber', '+905551112233', 'Istanbul', 'TRY', 'Europe/Istanbul', 15, true, NOW()),
    ('${bizOther}', 'Other Barber', 'other-barber', '+905551112244', 'Ankara', 'TRY', 'Europe/Istanbul', 15, true, NOW()),
    ('${bizInactive}', 'Inactive Barber', 'inactive-barber', '+905551112255', 'Izmir', 'TRY', 'Europe/Istanbul', 15, false, NOW());
  `);

  for (let day = 0; day <= 6; day++) {
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, is_closed, start_time, end_time)
      VALUES ('${biz}', ${day}, false, '09:00:00', '18:00:00');
    `);
  }

  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role, active) VALUES
    ('${mStaffA}', '${biz}', '${uStaffA}', 'STAFF', true),
    ('${mStaffB}', '${biz}', '${uStaffB}', 'STAFF', true),
    ('${mStaffDisabled}', '${biz}', '${uStaffDisabled}', 'STAFF', true);

    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours) VALUES
    ('${staffA}', '${biz}', '${mStaffA}', 'Staff', 'A', true, true, false),
    ('${staffB}', '${biz}', '${mStaffB}', 'Staff', 'B', true, true, true),
    ('${staffDisabled}', '${biz}', '${mStaffDisabled}', 'Staff', 'Disabled', true, false, true);

    INSERT INTO services (id, business_id, name, duration_minutes, price, active) VALUES
    ('${svcHaircut}', '${biz}', 'Saç Kesimi', 30, '200.00', true),
    ('${svcNoStaff}', '${biz}', 'Özel Bakım', 60, '500.00', true),
    ('${svcInactive}', '${biz}', 'Eski Hizmet', 30, '100.00', false),
    ('${svcOtherBiz}', '${bizOther}', 'Başka Dükkan', 30, '200.00', true);

    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES
    ('${biz}', '${staffA}', '${svcHaircut}'),
    ('${biz}', '${staffB}', '${svcHaircut}'),
    ('${biz}', '${staffDisabled}', '${svcHaircut}');
  `);

  // Staff A custom hours on Monday: 09:00 - 12:00
  // Staff B uses business hours (09:00 - 18:00)
  await db.execute(`
    INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time) VALUES
    ('${biz}', '${staffA}', 1, true, '09:00:00', '12:00:00');
  `);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("TASK 009A.2: Public Any Staff Flow Integration", () => {
  describe("1. Selection Model & Parameter Parsing", () => {
    it("parses 'any' to discriminated { kind: 'ANY' }", () => {
      const res = parsePublicStaffSelection("any");
      assert.deepEqual(res, { kind: "ANY" });
    });

    it("parses 'ANY' case-insensitively to { kind: 'ANY' }", () => {
      const res = parsePublicStaffSelection("ANY");
      assert.deepEqual(res, { kind: "ANY" });
    });

    it("parses valid UUID to { kind: 'SPECIFIC', staffId }", () => {
      const res = parsePublicStaffSelection(staffA);
      assert.deepEqual(res, { kind: "SPECIFIC", staffId: staffA });
    });

    it("rejects malformed string safely without throwing or passing to postgres", () => {
      assert.equal(parsePublicStaffSelection("invalid-uuid"), null);
      assert.equal(parsePublicStaffSelection("12345"), null);
      assert.equal(parsePublicStaffSelection(""), null);
      assert.equal(parsePublicStaffSelection(null), null);
      assert.equal(parsePublicStaffSelection(undefined), null);
    });
  });

  describe("2. Public Any Staff Selection Validation", () => {
    it("service with eligible staff validates successfully with 'Fark Etmez'", async () => {
      const res = await PublicBookingService.validatePublicAnyStaffSelection("flow-barber", svcHaircut);
      assert.equal(res.valid, true);
      assert.equal(res.business?.name, "Flow Barber");
      assert.equal(res.service?.name, "Saç Kesimi");
      assert.equal(res.staff?.id, "any");
      assert.equal(res.staff?.displayName, "Fark Etmez");
    });

    it("service with zero eligible staff fails validation", async () => {
      const res = await PublicBookingService.validatePublicAnyStaffSelection("flow-barber", svcNoStaff);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("uygun personel bulunmuyor"));
    });

    it("inactive service fails validation", async () => {
      const res = await PublicBookingService.validatePublicAnyStaffSelection("flow-barber", svcInactive);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("aktif değil"));
    });

    it("cross-tenant service fails validation", async () => {
      const res = await PublicBookingService.validatePublicAnyStaffSelection("flow-barber", svcOtherBiz);
      assert.equal(res.valid, false);
    });

    it("inactive business fails validation", async () => {
      const res = await PublicBookingService.validatePublicAnyStaffSelection("inactive-barber", svcHaircut);
      assert.equal(res.valid, false);
    });
  });

  describe("3. Any Staff Schedule & Server Action", () => {
    it("getPublicAnyStaffAvailabilityAction returns union slots without staff IDs", async () => {
      const res = await getPublicAnyStaffAvailabilityAction({
        slug: "flow-barber",
        serviceId: svcHaircut,
        localDate: TARGET_MONDAY,
      });

      assert.equal(res.success, true);
      assert.ok(res.slots && res.slots.length > 0);

      // Verify privacy: no candidate IDs or staff IDs
      const firstSlot = res.slots![0];
      assert.equal((firstSlot as any).staffId, undefined);
      assert.equal((firstSlot as any).candidateStaffIds, undefined);
      assert.ok(firstSlot.startAt);
      assert.ok(firstSlot.endAt);
      assert.ok(firstSlot.localStartTime);
      assert.ok(firstSlot.localEndTime);
    });

    it("getPublicAnyStaffAvailabilityAction fails safely with invalid parameters", async () => {
      const res = await getPublicAnyStaffAvailabilityAction({
        slug: "",
        serviceId: svcHaircut,
        localDate: TARGET_MONDAY,
      });
      assert.equal(res.success, false);
    });
  });

  describe("4. Confirmation Revalidation", () => {
    it("validates available Any Staff slot against union and returns Fark Etmez summary", async () => {
      // Pick first available slot from engine
      const avail = await PublicBookingService.getPublicAnyStaffAvailability({
        slug: "flow-barber",
        serviceId: svcHaircut,
        localDate: TARGET_MONDAY,
      });
      assert.ok(avail.slots.length > 0);
      const chosenSlot = avail.slots[0];

      const res = await PublicBookingService.validatePublicAnyStaffSlotSelection({
        slug: "flow-barber",
        serviceId: svcHaircut,
        startAt: chosenSlot.startAt,
        referenceNow: REF_NOW,
      });

      assert.equal(res.valid, true);
      assert.equal(res.staff?.id, "any");
      assert.equal(res.staff?.displayName, "Fark Etmez");
      assert.equal(res.slot?.startAt, chosenSlot.startAt);
      assert.equal(res.localDate, TARGET_MONDAY);
    });

    it("rejects an unavailable / non-existent Any Staff slot instant", async () => {
      const fakeStartAt = "2026-10-12T03:00:00.000Z"; // 06:00 local (before shop opens)
      const res = await PublicBookingService.validatePublicAnyStaffSlotSelection({
        slug: "flow-barber",
        serviceId: svcHaircut,
        startAt: fakeStartAt,
        referenceNow: REF_NOW,
      });

      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("uygun değil"));
    });
  });

  describe("5. Transactional Any Staff Appointment Creation", () => {
    it("creates an appointment when staffId is 'any' and assigns to least loaded staff", async () => {
      // Pick first available slot from engine
      const avail = await PublicBookingService.getPublicAnyStaffAvailability({
        slug: "flow-barber",
        serviceId: svcHaircut,
        localDate: TARGET_MONDAY,
      });
      assert.ok(avail.slots.length > 0);
      const chosenSlot = avail.slots[0];
      
      // Let's create a blocking appointment for staff A to increase their workload
      await db.execute(`
        INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES
        ('${uuid(999)}', '${biz}', 'Test Customer', '+905559876543', '905559876543')
        ON CONFLICT DO NOTHING;
        
        INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES
        (gen_random_uuid(), '${biz}', '${uuid(999)}', '${staffA}', '${svcHaircut}', '2026-10-12 14:00:00', '2026-10-12 14:30:00', 'CONFIRMED', 'Saç', 30, '100');
      `);

      const res = await createPublicAppointmentAction({
        slug: "flow-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt: chosenSlot.startAt,
        customerName: "Deneme Müşteri",
        customerPhone: "+905559876543",
      });
      
      assert.equal(res.success, true);
      assert.equal(res.data?.businessName, "Flow Barber");
      assert.equal(res.data?.serviceName, "Saç Kesimi");
      
      // We expect staffB to be chosen because staffA has 1 appointment, staffB has 0.
      // And staffDisabled is inactive so it is skipped.
      assert.equal(res.data?.staffDisplayName, "Staff B");
      
      // Check if DB reflects it
      const appts = await db.execute(`
        SELECT staff_id FROM appointments 
        WHERE start_time = '${new Date(chosenSlot.startAt).toISOString()}' 
        AND business_id = '${biz}'
      `);
      assert.equal(appts.rows.length, 1);
      assert.equal(appts.rows[0].staff_id, staffB);
    });

    it("preserves specific-staff appointment creation without regression", async () => {
      // Pick an available slot for Staff B on TARGET_MONDAY
      const avail = await PublicBookingService.getPublicAvailability({
        slug: "flow-barber",
        serviceId: svcHaircut,
        staffId: staffB,
        localDate: TARGET_MONDAY,
      });
      assert.ok(avail.slots.length > 0);
      const chosenSlot = avail.slots[0];

      const res = await createPublicAppointmentAction({
        slug: "flow-barber",
        serviceId: svcHaircut,
        staffId: staffB,
        startAt: chosenSlot.startAt,
        customerName: "Ahmet Veli",
        customerPhone: "+905553334455",
      });

      assert.equal(res.success, true);
      assert.equal(res.data?.businessName, "Flow Barber");
      assert.equal(res.data?.staffDisplayName, "Staff B");
      assert.equal(res.data?.serviceName, "Saç Kesimi");
    });
  });
});
