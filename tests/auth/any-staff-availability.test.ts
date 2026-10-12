/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let PublicBookingService: any;
let getAnyStaffAvailability: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const biz = uuid(111);

// Users
const uStaffA = uuid(211);
const uStaffB = uuid(212);
const uStaffC = uuid(213);
const uStaffNoPublic = uuid(214);
const uStaffInactive = uuid(215);

// Business Members
const mStaffA = uuid(311);
const mStaffB = uuid(312);
const mStaffC = uuid(313);
const mStaffNoPublic = uuid(314);
const mStaffInactive = uuid(315);

// Staff Profiles
const staffA = uuid(411);
const staffB = uuid(412);
const staffC = uuid(413);
const staffNoPublic = uuid(414);
const staffInactive = uuid(415);

// Services
const svc30 = uuid(511);

// Reference dates:
// 2026-10-12 is Monday (day_of_week = 1)
const TARGET_MONDAY = "2026-10-12";
const REF_NOW_MONDAY = new Date("2026-10-12T05:00:00.000Z");

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  const svcLb = await import("../../src/services/public-booking.service");
  PublicBookingService = svcLb.PublicBookingService;

  const availLb = await import("../../src/services/availability.service");
  getAnyStaffAvailability = availLb.getAnyStaffAvailability;

  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES
    ('${uStaffA}', 'Staff A', 'a@sch.com', true),
    ('${uStaffB}', 'Staff B', 'b@sch.com', true),
    ('${uStaffC}', 'Staff C', 'c@sch.com', true),
    ('${uStaffNoPublic}', 'Staff No Public', 'np@sch.com', true),
    ('${uStaffInactive}', 'Staff Inactive', 'in@sch.com', true);

    INSERT INTO businesses (id, name, slug, phone, address, currency, timezone, booking_interval_minutes, active, onboarding_completed_at) VALUES
    ('${biz}', 'Any Staff Studio', 'any-staff-studio', '+905559998877', 'Istanbul', 'TRY', 'Europe/Istanbul', 15, true, NOW());
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
    ('${mStaffC}', '${biz}', '${uStaffC}', 'STAFF', true),
    ('${mStaffNoPublic}', '${biz}', '${uStaffNoPublic}', 'STAFF', true),
    ('${mStaffInactive}', '${biz}', '${uStaffInactive}', 'STAFF', false);

    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours) VALUES
    ('${staffA}', '${biz}', '${mStaffA}', 'Staff', 'A', true, true, false),
    ('${staffB}', '${biz}', '${mStaffB}', 'Staff', 'B', true, true, false),
    ('${staffC}', '${biz}', '${mStaffC}', 'Staff', 'C', true, true, true),
    ('${staffNoPublic}', '${biz}', '${mStaffNoPublic}', 'Staff', 'NoPub', true, false, true),
    ('${staffInactive}', '${biz}', '${mStaffInactive}', 'Staff', 'Inactive', false, true, true);

    INSERT INTO services (id, business_id, name, duration_minutes, price, active) VALUES
    ('${svc30}', '${biz}', 'Haircut', 30, '150.00', true);

    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES
    ('${biz}', '${staffA}', '${svc30}'),
    ('${biz}', '${staffB}', '${svc30}'),
    ('${biz}', '${staffC}', '${svc30}'),
    ('${biz}', '${staffNoPublic}', '${svc30}');
  `);

  // Custom hours for A and B on Monday
  // A works 09:00 - 13:00
  // B works 11:00 - 15:00
  // C works business hours (09:00 - 18:00) but we will add a block
  await db.execute(`
    INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time) VALUES
    ('${biz}', '${staffA}', 1, true, '09:00:00', '13:00:00'),
    ('${biz}', '${staffB}', 1, true, '11:00:00', '15:00:00');
  `);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("Any Staff Availability (Fark Etmez)", () => {
  it("union algorithm: multiple staff union their slots correctly", async () => {
    // A: 09:00-13:00 -> 09:00, 09:15, ..., 12:30
    // B: 11:00-15:00 -> 11:00, 11:15, ..., 14:30
    // C: 09:00-18:00 -> 09:00, ..., 17:30
    // If all work, union should be 09:00 to 17:30.
    const res = await getAnyStaffAvailability({
      businessId: biz,
      serviceId: svc30,
      localDate: TARGET_MONDAY,
      referenceNow: REF_NOW_MONDAY
    });

    assert.ok(res.slots.length > 0);
    assert.equal(res.slots[0].localStartTime, "09:00");
    assert.equal(res.slots[res.slots.length - 1].localStartTime, "17:30");
  });

  it("slot disappears only when all eligible staff unavailable", async () => {
    // Add block for A, B, C at 10:00 - 10:30
    const startIso = "2026-10-12T07:00:00.000Z"; // 10:00 Istanbul
    const endIso = "2026-10-12T07:30:00.000Z"; // 10:30 Istanbul
    
    await db.execute(`
      INSERT INTO time_blocks (business_id, staff_id, start_time, end_time, block_type) VALUES
      ('${biz}', '${staffA}', '${startIso}', '${endIso}', 'BREAK'),
      ('${biz}', '${staffB}', '${startIso}', '${endIso}', 'BREAK'),
      ('${biz}', '${staffC}', '${startIso}', '${endIso}', 'BREAK');
    `);

    const res = await getAnyStaffAvailability({
      businessId: biz,
      serviceId: svc30,
      localDate: TARGET_MONDAY,
      referenceNow: REF_NOW_MONDAY
    });

    const has10 = res.slots.some((s: any) => s.localStartTime === "10:00");
    const has1015 = res.slots.some((s: any) => s.localStartTime === "10:15");
    assert.equal(has10, false, "10:00 should be missing");
    assert.equal(has1015, false, "10:15 should be missing");
    
    const has0930 = res.slots.some((s: any) => s.localStartTime === "09:30");
    assert.equal(has0930, true, "09:30 should be present");
  });
  
  it("slot available for one staff remains available even if another is blocked", async () => {
    // Add block for A at 11:00-11:30
    const startIso = "2026-10-12T08:00:00.000Z"; // 11:00 Istanbul
    const endIso = "2026-10-12T08:30:00.000Z"; // 11:30 Istanbul
    
    await db.execute(`
      INSERT INTO time_blocks (business_id, staff_id, start_time, end_time, block_type) VALUES
      ('${biz}', '${staffA}', '${startIso}', '${endIso}', 'BREAK');
    `);

    const res = await getAnyStaffAvailability({
      businessId: biz,
      serviceId: svc30,
      localDate: TARGET_MONDAY,
      referenceNow: REF_NOW_MONDAY
    });

    // C and B are still available at 11:00
    const has11 = res.slots.some((s: any) => s.localStartTime === "11:00");
    assert.equal(has11, true, "11:00 should still be present because B and C are available");
  });

  it("public DTO does not expose candidate staff IDs or internal user IDs", async () => {
    const res = await PublicBookingService.getPublicAnyStaffAvailability({
      slug: 'any-staff-studio',
      serviceId: svc30,
      localDate: TARGET_MONDAY,
      referenceNow: REF_NOW_MONDAY
    });

    assert.equal(res.success, true);
    assert.ok(res.slots.length > 0);
    
    const sampleSlot = res.slots[0];
    assert.equal("candidateStaffIds" in sampleSlot, false);
    assert.equal("staffId" in sampleSlot, false);
    assert.ok(sampleSlot.startAt);
    assert.ok(sampleSlot.endAt);
    assert.ok(sampleSlot.localStartTime);
    assert.ok(sampleSlot.localEndTime);
  });

  it("inactive memberships, inactive staff, no public booking are excluded", async () => {
    // If we only query for Staff No Public's specific schedule, they have hours, but they shouldn't contribute.
    // They are public_booking_enabled = false
    // Since we can't test internal contribution count easily without modifying result, we rely on the fact that if ONLY staffNoPublic is available, slot should be empty.
    
    // We can block A, B, C for 14:00 - 15:00
    const startIso = "2026-10-12T11:00:00.000Z"; // 14:00 Istanbul
    const endIso = "2026-10-12T12:00:00.000Z"; // 15:00 Istanbul
    await db.execute(`
      INSERT INTO time_blocks (business_id, staff_id, start_time, end_time, block_type) VALUES
      ('${biz}', '${staffA}', '${startIso}', '${endIso}', 'BREAK'),
      ('${biz}', '${staffB}', '${startIso}', '${endIso}', 'BREAK'),
      ('${biz}', '${staffC}', '${startIso}', '${endIso}', 'BREAK');
    `);
    
    const res = await getAnyStaffAvailability({
      businessId: biz,
      serviceId: svc30,
      localDate: TARGET_MONDAY,
      referenceNow: REF_NOW_MONDAY
    });

    const has14 = res.slots.some((s: any) => s.localStartTime === "14:00");
    assert.equal(has14, false, "14:00 should be missing because only NoPub is available, and they are excluded");
  });
});
