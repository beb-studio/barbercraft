/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let availabilityService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Users
const ownerUser = uuid(901);
const customerUser = uuid(902);

// Businesses
const bizA = uuid(903); // Istanbul
const bizB = uuid(904); // NY

// Staff (Biz A)
const staffA = uuid(905); // Active, Public, Uses Biz Hours
const staffInactive = uuid(906); // Inactive
const staffNoPublic = uuid(907); // No public booking
const staffInactiveMember = uuid(908); // Active but member inactive

// Staff (Biz B)
const staffB = uuid(909); // Active, Uses Staff Hours

// Services (Biz A)
const svc15 = uuid(910);
const svc20 = uuid(911);
const svc30 = uuid(912);
const svc45 = uuid(913);
const svc60 = uuid(914);
const svc75 = uuid(915);
const svcInactive = uuid(916);
const svcUnassigned = uuid(917);

// Services (Biz B)
const svcB = uuid(918);

before(async () => {
  pgServer = await startDatabase({ port: 54412 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  availabilityService = await import("../../src/services/availability.service");

  // USERS
  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES 
    ('${ownerUser}', 'Owner', 'owner@avh.com', true),
    ('${customerUser}', 'Customer', 'cust@avh.com', true),
    ('${uuid(991)}', 'U1', 'u1@a.com', true),
    ('${uuid(992)}', 'U2', 'u2@a.com', true),
    ('${uuid(993)}', 'U3', 'u3@a.com', true),
    ('${uuid(999)}', 'U9', 'u9@a.com', true);
  `);

  // BUSINESSES
  await db.execute(`
    INSERT INTO businesses (id, name, slug, timezone, booking_interval_minutes, currency) VALUES 
    ('${bizA}', 'Biz A', 'biz-a-avh', 'Europe/Istanbul', 15, 'TRY'),
    ('${bizB}', 'Biz B', 'biz-b-avh', 'America/New_York', 15, 'USD');
  `);

  // CUSTOMER
  await db.execute(`
    INSERT INTO customers (id, business_id, first_name, last_name, phone, normalized_phone) VALUES 
    ('${customerUser}', '${bizA}', 'Cust', 'Avh', '1234567', '+1234567');
  `);

  // MEMBERS
  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role, active) VALUES 
    ('${bizA}', '${bizA}', '${ownerUser}', 'OWNER', true),
    ('${uuid(991)}', '${bizA}', '${uuid(991)}', 'STAFF', true),
    ('${uuid(992)}', '${bizA}', '${uuid(992)}', 'STAFF', true),
    ('${uuid(993)}', '${bizA}', '${uuid(993)}', 'STAFF', true),
    ('${uuid(999)}', '${bizA}', '${uuid(999)}', 'STAFF', false), -- inactive member
    ('${bizB}', '${bizB}', '${ownerUser}', 'OWNER', true);
  `);

  // STAFF
  await db.execute(`
    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours) VALUES 
    ('${staffA}', '${bizA}', '${bizA}', 'A', 'A', true, true, true),
    ('${staffInactive}', '${bizA}', '${uuid(991)}', 'In', 'A', false, true, true),
    ('${staffNoPublic}', '${bizA}', '${uuid(992)}', 'No', 'Pub', true, false, true),
    ('${staffInactiveMember}', '${bizA}', '${uuid(999)}', 'In', 'Mem', true, true, true),
    ('${staffB}', '${bizB}', '${bizB}', 'B', 'B', true, true, false);
  `);

  // SERVICES
  await db.execute(`
    INSERT INTO services (id, business_id, name, duration_minutes, price, active) VALUES 
    ('${svc15}', '${bizA}', '15 Min', 15, 100, true),
    ('${svc20}', '${bizA}', '20 Min', 20, 100, true),
    ('${svc30}', '${bizA}', '30 Min', 30, 200, true),
    ('${svc45}', '${bizA}', '45 Min', 45, 200, true),
    ('${svc60}', '${bizA}', '60 Min', 60, 300, true),
    ('${svc75}', '${bizA}', '75 Min', 75, 400, true),
    ('${svcInactive}', '${bizA}', 'Inactive', 30, 100, false),
    ('${svcUnassigned}', '${bizA}', 'Unassigned', 30, 100, true),
    ('${svcB}', '${bizB}', 'Biz B Svc', 45, 100, true);
  `);

  // STAFF SERVICES
  await db.execute(`
    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES 
    ('${bizA}', '${staffA}', '${svc15}'),
    ('${bizA}', '${staffA}', '${svc20}'),
    ('${bizA}', '${staffA}', '${svc30}'),
    ('${bizA}', '${staffA}', '${svc45}'),
    ('${bizA}', '${staffA}', '${svc60}'),
    ('${bizA}', '${staffA}', '${svc75}'),
    ('${bizA}', '${staffA}', '${svcInactive}'),
    ('${bizB}', '${staffB}', '${svcB}');
    -- svcUnassigned is NOT assigned
  `);

  // BIZ WORKING HOURS (Biz A): Every day 09:10 - 18:00 (intentionally off-interval start)
  for (let i = 0; i < 7; i++) {
    const isClosed = i === 0; // Sunday closed
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, start_time, end_time, is_closed) VALUES 
      ('${bizA}', ${i}, ${isClosed ? "NULL" : "'09:10'"}, ${isClosed ? "NULL" : "'18:00'"}, ${isClosed});
    `);
  }

  // STAFF WORKING HOURS (Biz B - staffB): Every day 10:00 - 17:00, except Monday closed
  for (let i = 0; i < 7; i++) {
    const isWorking = i !== 1;
    await db.execute(`
      INSERT INTO staff_working_hours (id, business_id, staff_id, day_of_week, start_time, end_time, is_working) VALUES 
      ('${uuid(950 + i)}', '${bizB}', '${staffB}', ${i}, ${isWorking ? "'10:00'" : "NULL"}, ${isWorking ? "'17:00'" : "NULL"}, ${isWorking});
    `);
  }

});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

const referenceNow = new Date("2026-10-06T12:00:00Z"); // Fix time context for testing

describe("Availability Engine Hardening (TASK 006B.1A)", () => {
  describe("STAFF / SERVICE ELIGIBILITY", () => {
    it("1. inactive business membership => zero slots (STAFF_NOT_BOOKABLE)", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffInactiveMember, serviceId: svc30, localDate: "2030-10-10", referenceNow });
      assert.equal(res.reason, "STAFF_NOT_BOOKABLE");
    });
    it("2. inactive staff_profile => zero slots", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffInactive, serviceId: svc30, localDate: "2030-10-10", referenceNow });
      assert.equal(res.reason, "STAFF_NOT_BOOKABLE");
    });
    it("3. public_booking_enabled=false => zero slots", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffNoPublic, serviceId: svc30, localDate: "2030-10-10", referenceNow });
      assert.equal(res.reason, "STAFF_NOT_BOOKABLE");
    });
    it("4. inactive service => zero slots", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svcInactive, localDate: "2030-10-10", referenceNow });
      assert.equal(res.reason, "STAFF_NOT_BOOKABLE");
    });
    it("5. service not assigned to staff => zero slots", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svcUnassigned, localDate: "2030-10-10", referenceNow });
      assert.equal(res.reason, "STAFF_NOT_BOOKABLE");
    });
    it("6. cross-tenant staff fails closed", async () => {
      try {
        await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffB, serviceId: svc30, localDate: "2030-10-10", referenceNow });
        assert.fail("Should throw");
      } catch (e: any) { assert.match(e.message, /invalid request/i); }
    });
    it("7. cross-tenant service fails closed", async () => {
      try {
        await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svcB, localDate: "2030-10-10", referenceNow });
        assert.fail("Should throw");
      } catch (e: any) { assert.match(e.message, /does not belong to business/i); }
    });
  });

  describe("SCHEDULE SOURCE & DAY BOUNDARIES", () => {
    it("12 & 15. closed selected weekday returns zero slots", async () => {
      // 2030-10-13 is a Sunday. Biz A is closed on Sunday.
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svc30, localDate: "2030-10-13", referenceNow });
      assert.equal(res.reason, "CLOSED");
    });
    it("13 & 14. correct day_of_week mapping", async () => {
      // 2030-10-14 is Monday. Biz B staffB is closed on Monday.
      const res = await availabilityService.getStaffAvailability({ businessId: bizB, staffId: staffB, serviceId: svcB, localDate: "2030-10-14", referenceNow });
      assert.equal(res.reason, "CLOSED");
    });
  });

  describe("DYNAMIC SERVICE DURATION & INTERVAL GRID", () => {
    it("16 & 22. 20-minute service on 15-minute interval, starting at non-round time", async () => {
      // Biz A starts at 09:10
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svc20, localDate: "2030-10-15", referenceNow });
      assert.equal(res.slots[0].localStartTime, "09:10");
      assert.equal(res.slots[0].localEndTime, "09:30");
      assert.equal(res.slots[1].localStartTime, "09:25");
      assert.equal(res.slots[1].localEndTime, "09:45");
      assert.equal(res.slots[2].localStartTime, "09:40");
      assert.equal(res.slots[2].localEndTime, "10:00");
    });
    it("18 & 21. 75-minute service", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svc75, localDate: "2030-10-15", referenceNow });
      // End of day is 18:00. Last 75m slot should be 16:40 (16:40 + 75 = 17:55)
      // 16:55 + 75m = 18:10 (invalid)
      const last = res.slots[res.slots.length - 1];
      assert.equal(last.localStartTime, "16:40");
      assert.equal(last.localEndTime, "17:55");
    });
    it("24 & 25 & 26. boundaries exact match", async () => {
      const res = await availabilityService.getStaffAvailability({ businessId: bizB, staffId: staffB, serviceId: svcB, localDate: "2030-10-15", referenceNow }); // 45m svc, 10:00 - 17:00
      assert.equal(res.slots[0].localStartTime, "10:00"); // 26
      assert.equal(res.slots[res.slots.length - 1].localStartTime, "16:15");
      assert.equal(res.slots[res.slots.length - 1].localEndTime, "17:00"); // 24
    });
  });

  describe("TIME BLOCK OCCUPANCY & COMBINED BLOCKS", () => {
    it("40, 41, 42. partial overlap blocks candidate, exact boundary allowed", async () => {
      // Create block 11:15 - 12:00 local time
      // 2030-10-16 in Istanbul (UTC+3) 11:15 is 08:15Z
      await db.execute(`
        INSERT INTO time_blocks (business_id, staff_id, start_time, end_time, block_type) VALUES 
        ('${bizA}', '${staffA}', '2030-10-16T08:15:00Z', '2030-10-16T09:00:00Z', 'BREAK');
      `);
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svc30, localDate: "2030-10-16", referenceNow });
      
      const starts = res.slots.map((s:any) => s.localStartTime);
      // Candidates before block
      assert.ok(starts.includes("10:40")); // Ends 11:10 (ok)
      // Boundary 41
      assert.ok(starts.includes("12:10")); // After block
      
      // Blocks (partial overlap)
      assert.ok(!starts.includes("10:55")); // Ends 11:25 (overlaps)
      assert.ok(!starts.includes("11:10")); // Ends 11:40 (overlaps)
    });
  });

  describe("CURRENT TIME FILTERING", () => {
    it("47. candidate exactly at now is excluded", async () => {
      // Current time is simulated as 2026-10-06T12:00:00Z which is 15:00 local Istanbul
      const fixedNow = new Date("2026-10-06T12:00:00Z");
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svc15, localDate: "2026-10-06", referenceNow: fixedNow });
      
      const starts = res.slots.map((s:any) => s.localStartTime);
      // Candidates before or at exactly 15:00 should NOT be there.
      assert.ok(!starts.includes("15:00")); // exactly now
      assert.ok(starts.includes("15:10")); // valid future
    });
  });

  describe("APPOINTMENT OCCUPANCY", () => {
    it("36. candidate fully inside appointment interval blocks", async () => {
      // Appt: 12:00 - 13:00 local (09:00Z - 10:00Z on 2030-10-17)
      await db.execute(`
        INSERT INTO appointments (business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES 
        ('${bizA}', '${customerUser}', '${staffA}', '${svc60}', '2030-10-17T09:00:00Z', '2030-10-17T10:00:00Z', 'COMPLETED', 'Snap', 60, 300);
      `);
      const res = await availabilityService.getStaffAvailability({ businessId: bizA, staffId: staffA, serviceId: svc15, localDate: "2030-10-17", referenceNow });
      
      const starts = res.slots.map((s:any) => s.localStartTime);
      // 15m slots fully inside 12:00 - 13:00 should be removed
      assert.ok(!starts.includes("12:10")); 
      assert.ok(!starts.includes("12:25")); 
      assert.ok(!starts.includes("12:40")); 
    });
  });
});

