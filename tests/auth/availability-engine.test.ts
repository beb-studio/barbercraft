/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let availabilityService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Test Entities
const userOwner = uuid(801);
const userCustomer = uuid(802);
const bizA = uuid(803);
const bizB = uuid(804);
const staffA = uuid(805);
const staffB = uuid(806);
const svc15 = uuid(807);
const svc30 = uuid(808);
const svc60 = uuid(809);
const svcbizB = uuid(810);

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;

  availabilityService = await import("../../src/services/availability.service");

  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES 
    ('${userOwner}', 'Owner', 'owner@availability.com', true),
    ('${userCustomer}', 'Customer', 'cust@availability.com', true);
  `);

  await db.execute(`
    INSERT INTO businesses (id, name, slug, timezone, booking_interval_minutes, currency) VALUES 
    ('${bizA}', 'Biz A', 'biz-a-av', 'Europe/Istanbul', 15, 'TRY'),
    ('${bizB}', 'Biz B', 'biz-b-av', 'America/New_York', 15, 'USD');
  `);

  await db.execute(`
    INSERT INTO customers (id, business_id, first_name, last_name, phone, normalized_phone) VALUES 
    ('${userCustomer}', '${bizA}', 'Cust', 'Omer', '123456', '+123456');
  `);

  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role, active) VALUES 
    ('${bizA}', '${bizA}', '${userOwner}', 'OWNER', true),
    ('${bizB}', '${bizB}', '${userOwner}', 'OWNER', true);
  `);

  await db.execute(`
    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours) VALUES 
    ('${staffA}', '${bizA}', '${bizA}', 'Staff', 'A', true, true, true),
    ('${staffB}', '${bizB}', '${bizB}', 'Staff', 'B', true, true, false);
  `);

  await db.execute(`
    INSERT INTO services (id, business_id, name, duration_minutes, price, active) VALUES 
    ('${svc15}', '${bizA}', '15 Min Svc', 15, 100, true),
    ('${svc30}', '${bizA}', '30 Min Svc', 30, 200, true),
    ('${svc60}', '${bizA}', '60 Min Svc', 60, 300, true),
    ('${svcbizB}', '${bizB}', 'Biz B Svc', 45, 100, true);
  `);

  await db.execute(`
    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES 
    ('${bizA}', '${staffA}', '${svc15}'),
    ('${bizA}', '${staffA}', '${svc30}'),
    ('${bizA}', '${staffA}', '${svc60}'),
    ('${bizB}', '${staffB}', '${svcbizB}');
  `);

  // Setup Biz A business_working_hours: Every day 09:00 - 18:00
  for (let i = 0; i < 7; i++) {
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, start_time, end_time, is_closed) VALUES 
      ('${bizA}', ${i}, '09:00', '18:00', false);
    `);
  }

  // Setup Biz B staff_working_hours (Custom Hours): Every day 10:00 - 17:00
  for (let i = 0; i < 7; i++) {
    await db.execute(`
      INSERT INTO staff_working_hours (id, business_id, staff_id, day_of_week, start_time, end_time, is_working) VALUES 
      ('${uuid(900 + i)}', '${bizB}', '${staffB}', ${i}, '10:00', '17:00', true);
    `);
  }
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("Core Availability Engine (TASK 006B.1)", () => {
  it("should return NO_AVAILABLE_SLOTS for past date", async () => {
    const result = await availabilityService.getStaffAvailability({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc30,
      localDate: "2020-01-01"
    });
    assert.equal(result.reason, "NO_AVAILABLE_SLOTS");
    assert.equal(result.slots.length, 0);
  });

  it("should return valid slots for future date without conflicts", async () => {
    const result = await availabilityService.getStaffAvailability({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc60,
      localDate: "2030-01-01"
    });
    assert.equal(result.reason, undefined);
    assert.equal(result.slots.length, 33); // 8 hours * 4 slots/hr + 1 slot at 17:00 = 33 slots since duration 60 fits up to 17:00
    
    // First slot should be 09:00
    assert.equal(result.slots[0].localStartTime, "09:00");
    assert.equal(result.slots[0].localEndTime, "10:00");
    
    // Last slot should be 17:00 (since 17:00 + 60m = 18:00 closing)
    assert.equal(result.slots[result.slots.length - 1].localStartTime, "17:00");
    assert.equal(result.slots[result.slots.length - 1].localEndTime, "18:00");
  });

  it("should correctly handle time blocks (TIME_OFF)", async () => {
    // Insert a block from 12:00 to 13:00 on 2030-01-02
    await db.execute(`
      INSERT INTO time_blocks (id, business_id, staff_id, start_time, end_time, block_type) VALUES 
      ('${uuid(1001)}', '${bizA}', '${staffA}', '2030-01-02T09:00:00Z', '2030-01-02T10:00:00Z', 'TIME_OFF');
    `); // Note: UTC time 09:00Z is 12:00 local time in Istanbul (UTC+3)

    const result = await availabilityService.getStaffAvailability({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc30, // 30 min duration
      localDate: "2030-01-02"
    });
    
    // Check that slots overlapping 12:00-13:00 are missing
    // Since duration is 30m, and block is 12:00-13:00:
    // 11:30 -> 12:00 (Valid, back to back)
    // 11:45 -> 12:15 (Overlaps 12:00-13:00) -> invalid
    // 12:00 -> 12:30 (Overlaps) -> invalid
    // 12:15 -> 12:45 (Overlaps) -> invalid
    // 12:30 -> 13:00 (Overlaps) -> invalid
    // 12:45 -> 13:15 (Overlaps) -> invalid
    // 13:00 -> 13:30 (Valid, back to back)
    
    const slotsStartTimes = result.slots.map((s: any) => s.localStartTime);
    assert.ok(slotsStartTimes.includes("11:30"));
    assert.ok(!slotsStartTimes.includes("11:45"));
    assert.ok(!slotsStartTimes.includes("12:00"));
    assert.ok(!slotsStartTimes.includes("12:15"));
    assert.ok(!slotsStartTimes.includes("12:30"));
    assert.ok(!slotsStartTimes.includes("12:45"));
    assert.ok(slotsStartTimes.includes("13:00"));
  });

  it("should fail gracefully for cross-tenant data", async () => {
    // biz A requesting staff B
    try {
      await availabilityService.getStaffAvailability({
        businessId: bizA,
        staffId: staffB,
        serviceId: svc30,
        localDate: "2030-01-01"
      });
      assert.fail("Should have thrown error");
    } catch (e: any) {
      assert.match(e.message, /invalid request/i);
    }
  });

  it("should return STAFF_NOT_BOOKABLE if public_booking_enabled is false", async () => {
    await db.execute(`UPDATE staff_profiles SET public_booking_enabled = false WHERE id = '${staffA}'`);
    
    const result = await availabilityService.getStaffAvailability({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc30,
      localDate: "2030-01-03"
    });
    
    assert.equal(result.reason, "STAFF_NOT_BOOKABLE");
    
    // Reset back
    await db.execute(`UPDATE staff_profiles SET public_booking_enabled = true WHERE id = '${staffA}'`);
  });

  it("should use staff_working_hours for uses_business_hours = false", async () => {
    const result = await availabilityService.getStaffAvailability({
      businessId: bizB,
      staffId: staffB,
      serviceId: svcbizB, // 45 min duration
      localDate: "2030-01-01" // New York timezone
    });
    
    assert.equal(result.slots.length > 0, true);
    assert.equal(result.slots[0].localStartTime, "10:00");
    // Closing is 17:00, last 45 min slot is 16:15
    assert.equal(result.slots[result.slots.length - 1].localStartTime, "16:15");
    assert.equal(result.slots[result.slots.length - 1].localEndTime, "17:00");
  });

  it("should correctly handle appointment overlap", async () => {
    // Insert an appointment from 14:00 to 14:30 on 2030-01-05
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES 
      ('${uuid(1002)}', '${bizA}', '${userCustomer}', '${staffA}', '${svc30}', '2030-01-05T11:00:00Z', '2030-01-05T11:30:00Z', 'CONFIRMED', 'Snap', 30, 100);
    `); // 11:00Z is 14:00 local Istanbul

    const result = await availabilityService.getStaffAvailability({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc15, // 15 min duration
      localDate: "2030-01-05"
    });
    
    const slots = result.slots.map((s: any) => s.localStartTime);
    assert.ok(slots.includes("13:45"));
    assert.ok(!slots.includes("14:00"));
    assert.ok(!slots.includes("14:15"));
    assert.ok(slots.includes("14:30"));
  });

  it("should NOT subtract CANCELLED appointments", async () => {
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES 
      ('${uuid(1003)}', '${bizA}', '${userCustomer}', '${staffA}', '${svc30}', '2030-01-06T11:00:00Z', '2030-01-06T11:30:00Z', 'CANCELLED', 'Snap', 30, 100);
    `); 

    const result = await availabilityService.getStaffAvailability({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc15,
      localDate: "2030-01-06"
    });
    
    const slots = result.slots.map((s: any) => s.localStartTime);
    // 14:00 and 14:15 should be available because appointment is CANCELLED
    assert.ok(slots.includes("14:00"));
    assert.ok(slots.includes("14:15"));
  });

});
