/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let PublicBookingService: any;
let AppointmentService: any;
let getPublicAnyStaffAvailabilityAction: any;
let createPublicAppointmentAction: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const biz = uuid(111);
const staffA = uuid(411);
const staffB = uuid(412);
const svcHaircut = uuid(511);
const TARGET_MONDAY = "2026-10-12";
const SLOT_TIME = "2026-10-12T07:00:00.000Z";

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;
  const dbLib = await import("../../src/db");
  db = dbLib.db;
  const svcLb = await import("../../src/services/public-booking.service");
  PublicBookingService = svcLb.PublicBookingService;
  const appSvc = await import("../../src/services/appointment.service");
  AppointmentService = appSvc.AppointmentService;
  const actionsLb = await import("../../src/actions/public-booking.actions");
  getPublicAnyStaffAvailabilityAction = actionsLb.getPublicAnyStaffAvailabilityAction;
  createPublicAppointmentAction = actionsLb.createPublicAppointmentAction;

  // Insert Business
  await db.execute(`
    INSERT INTO businesses (id, slug, name, timezone, currency, booking_interval_minutes, active, onboarding_completed_at) VALUES
    ('${biz}', 'concurrency-barber', 'Concurrency Barber', 'Europe/Istanbul', 'TRY', 15, true, NOW());
  `);

  // Insert Users
  await db.execute(`
    INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES
      ('${uuid(1)}', 'User 1', 'user1@example.com', true, NOW(), NOW()),
      ('${uuid(2)}', 'User 2', 'user2@example.com', true, NOW(), NOW());
  `);

  // Insert Members
  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role) VALUES
      ('${uuid(1)}', '${biz}', '${uuid(1)}', 'STAFF'),
      ('${uuid(2)}', '${biz}', '${uuid(2)}', 'STAFF');
  `);

  // Insert Staff Members
  await db.execute(`
    INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours) VALUES
    ('${staffA}', '${biz}', '${uuid(1)}', 'Staff', 'A', true, true, true),
    ('${staffB}', '${biz}', '${uuid(2)}', 'Staff', 'B', true, true, true);
  `);

  // Insert Services
  await db.execute(`
    INSERT INTO services (id, business_id, name, duration_minutes, price, active) VALUES
    ('${svcHaircut}', '${biz}', 'Saç Kesimi', 30, 200, true);
  `);

  // Insert Staff Services
  await db.execute(`
    INSERT INTO staff_services (business_id, staff_id, service_id) VALUES
    ('${biz}', '${staffA}', '${svcHaircut}'),
    ('${biz}', '${staffB}', '${svcHaircut}');
  `);

  // Insert Custom Working Hours (Staff A & Staff B both work Monday 09:00 - 12:00, others false)
  const swh = [];
  for (let day = 0; day <= 6; day++) {
    const isWorking = (day === 1);
    const st = isWorking ? "'09:00'" : "NULL";
    const et = isWorking ? "'12:00'" : "NULL";
    swh.push(`('${biz}', '${staffA}', ${day}, ${isWorking}, ${st}, ${et})`);
    swh.push(`('${biz}', '${staffB}', ${day}, ${isWorking}, ${st}, ${et})`);
  }
  await db.execute(`
    INSERT INTO staff_working_hours (business_id, staff_id, day_of_week, is_working, start_time, end_time)
    VALUES ${swh.join(',')};
  `);
  
  // Business Working Hours
  const bw = [];
  for (let day = 0; day <= 6; day++) {
    bw.push(`('${uuid(day+10)}', '${biz}', ${day}, false, '09:00', '18:00')`);
  }
  await db.execute(`
    INSERT INTO business_working_hours (id, business_id, day_of_week, is_closed, start_time, end_time)
    VALUES ${bw.join(',')};
  `);
  
  // Now they both use custom working hours instead of business hours
  await db.execute(`
    UPDATE staff_profiles SET uses_business_hours = false WHERE business_id = '${biz}';
  `);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

describe("TASK 009A.3A: Transactional Any Staff Concurrency Hardening", () => {
  it("CRITICAL CAPACITY TEST 1: Two eligible/free staff, two concurrent requests", async () => {
    // Both staff A and B are free at 09:00 local (06:00 UTC)
    const startAt = "2026-10-12T06:00:00.000Z";
    
    // Debug
    const avail = await getPublicAnyStaffAvailabilityAction({
      slug: "concurrency-barber",
      serviceId: svcHaircut,
      localDate: "2026-10-12"
    });
    console.log("AVAILABILITY:", JSON.stringify(avail, null, 2));

    // We fire two concurrent Any Staff requests
    const res = await Promise.all([
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Alice",
        customerPhone: "+905551112233",
      }),
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Bob",
        customerPhone: "+905554445566",
      }),
    ]);

    const successes = res.filter((r: any) => r.success);
    assert.equal(successes.length, 2, "Both appointments should succeed because we have 2 free staff");

    const appts = await db.execute(`
      SELECT staff_id FROM appointments 
      WHERE start_time = '${new Date(startAt).toISOString()}' AND business_id = '${biz}'
    `);
    assert.equal(appts.rows.length, 2);
    
    // Check that they were assigned to different staff
    const assignedIds = new Set(appts.rows.map((r: any) => r.staff_id));
    assert.equal(assignedIds.size, 2, "Staff double-booked!");
    assert.ok(assignedIds.has(staffA));
    assert.ok(assignedIds.has(staffB));
  });

  it("CRITICAL CAPACITY TEST 2: Only one eligible/free staff left, two concurrent requests", async () => {
    // Staff A and B were booked at 06:00 UTC. Now let's try 06:30 UTC.
    // Wait, let's manually block Staff A at 06:30 UTC so only B is free.
    const startAt = "2026-10-12T06:30:00.000Z";
    
    await db.execute(`
      INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES
      ('${uuid(10)}', '${biz}', 'Blocker', '+905559000000', '905559000000') ON CONFLICT DO NOTHING;

      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES
      (gen_random_uuid(), '${biz}', '${uuid(10)}', '${staffA}', '${svcHaircut}', '2026-10-12T06:30:00.000Z', '2026-10-12T07:00:00.000Z', 'CONFIRMED', 'Saç', 30, '200');
    `);

    const res = await Promise.all([
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Charlie",
        customerPhone: "+905557778899",
      }),
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Dave",
        customerPhone: "+905559990011",
      }),
    ]);

    const successes = res.filter((r: any) => r.success);
    const failures = res.filter((r: any) => !r.success);
    
    assert.equal(successes.length, 1, "Exactly one appointment should succeed");
    assert.equal(failures.length, 1, "Exactly one appointment should fail with SLOT_UNAVAILABLE");
    assert.equal(failures[0].error.includes("uygun değil"), true);
  });

  it("CRITICAL CAPACITY TEST 3: Two eligible/free staff, three concurrent requests", async () => {
    const startAt = "2026-10-12T07:00:00.000Z"; // 10:00 local
    
    const res = await Promise.all([
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Eve",
        customerPhone: "+905550001122",
      }),
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Frank",
        customerPhone: "+905550003344",
      }),
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: "Grace",
        customerPhone: "+905550005566",
      }),
    ]);

    const successes = res.filter((r: any) => r.success);
    const failures = res.filter((r: any) => !r.success);
    
    assert.equal(successes.length, 2, "Exactly two appointments should succeed");
    assert.equal(failures.length, 1, "Exactly one appointment should fail");
  });

  it("DEADLOCK TEST: Run several concurrent transactions", async () => {
    // We will spam 10 concurrent requests for 07:30 UTC
    // Only 2 should succeed, but what matters is it doesn't crash or hang
    const startAt = "2026-10-12T07:30:00.000Z"; // 10:30 local

    const reqs = Array.from({ length: 10 }).map((_, i) => 
      createPublicAppointmentAction({
        slug: "concurrency-barber",
        serviceId: svcHaircut,
        staffId: "any",
        startAt,
        customerName: `Spam ${i}`,
        customerPhone: `+90555000${i}${i}${i}${i}`,
      })
    );

    const res = await Promise.all(reqs);
    const successes = res.filter((r: any) => r.success);
    const failures = res.filter((r: any) => !r.success);
    
    assert.equal(successes.length, 2);
    assert.equal(failures.length, 8);
    // No deadlock occurred
  });
  it("LEAST-LOADED TEST: Assigns to staff with fewest appointments", async () => {
    // We'll update the working hours to include Tuesday for a clean slate
    await db.execute(`
      UPDATE staff_working_hours SET is_working = true, start_time = '09:00', end_time = '12:00' WHERE day_of_week = 2 AND business_id = '${biz}';
    `);

    // Add one appointment for staffB on Tuesday
    await db.execute(`
      INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES
      ('${uuid(11)}', '${biz}', 'Load', '+905558880000', '905558880000') ON CONFLICT DO NOTHING;

      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES
      (gen_random_uuid(), '${biz}', '${uuid(11)}', '${staffB}', '${svcHaircut}', '2026-10-13T06:00:00.000Z', '2026-10-13T06:30:00.000Z', 'CONFIRMED', 'Saç', 30, '200');
    `);

    // Now fire an Any Staff request for Tuesday 06:30 UTC
    const startAt = "2026-10-13T06:30:00.000Z";
    const res = await createPublicAppointmentAction({
      slug: "concurrency-barber",
      serviceId: svcHaircut,
      staffId: "any",
      startAt,
      customerName: "Least Loaded",
      customerPhone: "+905557776655",
    });

    assert.equal(res.success, true);
    // Should be assigned to staffA, because staffB has 1 workload on Tuesday and staffA has 0.
    const appts = await db.execute(`
      SELECT staff_id FROM appointments 
      WHERE start_time = '2026-10-13T06:30:00.000Z' AND business_id = '${biz}'
    `);
    assert.equal(appts.rows[0].staff_id, staffA);
  });

  it("CANCELLED EXCLUSION TEST: Cancelled appointments do not count towards workload", async () => {
    // We cancel the earlier appointment for staffB
    await db.execute(`
      UPDATE appointments SET status = 'CANCELLED' WHERE staff_id = '${staffB}' AND start_time = '2026-10-13T06:00:00.000Z'
    `);
    
    // Now both have 0 workload (actually staffA has 1 workload at 06:30 UTC because of the previous test)
    // Wait, staffA has 1 workload at 06:30 UTC. staffB has 0.
    // So if we book at 07:00 UTC, it should go to staffB!
    const startAt = "2026-10-13T07:00:00.000Z";
    const res = await createPublicAppointmentAction({
      slug: "concurrency-barber",
      serviceId: svcHaircut,
      staffId: "any",
      startAt,
      customerName: "Cancelled Test",
      customerPhone: "+905557776644",
    });

    assert.equal(res.success, true);
    // Should be assigned to staffB, because staffA has 1 workload on Tuesday and staffB has 0 (cancelled doesn't count).
    const appts = await db.execute(`
      SELECT staff_id FROM appointments 
      WHERE start_time = '2026-10-13T07:00:00.000Z' AND business_id = '${biz}'
    `);
    assert.equal(appts.rows[0].staff_id, staffB);
  });

  it("ANY STAFF vs TIME BLOCK TEST: Rejects if staff gets blocked concurrently", async () => {
    // Both staff A and B work on Wednesday. We will block Staff B entirely, and dynamically block Staff A via time block.
    // 2026-10-14 is Wednesday
    const { createStaffTimeBlockService } = await import("../../src/services/time-blocks.service");

    await db.execute(`
      UPDATE staff_working_hours SET is_working = true, start_time = '09:00', end_time = '12:00' WHERE day_of_week = 3 AND business_id = '${biz}';
    `);

    // Manually block staff B with a confirmed appointment for 09:00 - 09:30 local (06:00 UTC)
    await db.execute(`
      INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES
      ('${uuid(12)}', '${biz}', 'BlockerB', '+905558880001', '905558880001') ON CONFLICT DO NOTHING;

      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES
      (gen_random_uuid(), '${biz}', '${uuid(12)}', '${staffB}', '${svcHaircut}', '2026-10-14T06:00:00.000Z', '2026-10-14T06:30:00.000Z', 'CONFIRMED', 'Saç', 30, '200');
    `);

    // So only staff A is free at 06:00 UTC.
    // We concurrently create a time block for staff A AND try to book Any Staff.
    const startAt = "2026-10-14T06:00:00.000Z";
    
    const req1 = createPublicAppointmentAction({
      slug: "concurrency-barber",
      serviceId: svcHaircut,
      staffId: "any",
      startAt,
      customerName: "Race AnyStaff",
      customerPhone: "+905551112299",
    });

    const req2 = createStaffTimeBlockService(biz, staffA, {
      blockType: "TIME_OFF",
      startDate: "2026-10-14",
      startTime: "09:00",
      endDate: "2026-10-14",
      endTime: "09:30",
    }, "OWNER");

    const results = await Promise.allSettled([req1, req2]);

    const successes = results.filter((r: any) => {
      if (r.status === "rejected") return false;
      // createPublicAppointmentAction returns { success: boolean }
      if (r.value && typeof r.value.success === "boolean") return r.value.success;
      // createStaffTimeBlockService returns the block object without a success field
      if (r.value && r.value.id && r.value.blockType) return true;
      return false;
    });
    const failures = results.filter((r: any) => {
      if (r.status === "rejected") return true;
      // createPublicAppointmentAction returning success: false
      if (r.value && typeof r.value.success === "boolean") return !r.value.success;
      return false;
    });

    assert.equal(successes.length, 1, "Exactly one should succeed");
    assert.equal(failures.length, 1, "Exactly one should fail");
  });

  it("CUSTOMER ROLLBACK TEST: Rolls back customer creation if slot is unavailable", async () => {
    // Wednesday 06:30 UTC. Both staff are free. Let's block them both.
    const startAt = "2026-10-14T06:30:00.000Z";
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot) VALUES
      (gen_random_uuid(), '${biz}', '${uuid(12)}', '${staffA}', '${svcHaircut}', '${startAt}', '2026-10-14T07:00:00.000Z', 'CONFIRMED', 'Saç', 30, '200'),
      (gen_random_uuid(), '${biz}', '${uuid(12)}', '${staffB}', '${svcHaircut}', '${startAt}', '2026-10-14T07:00:00.000Z', 'CONFIRMED', 'Saç', 30, '200');
    `);

    const uniquePhone = "05559998811";
    const res = await createPublicAppointmentAction({
      slug: "concurrency-barber",
      serviceId: svcHaircut,
      staffId: "any",
      startAt,
      customerName: "Rollback Test",
      customerPhone: uniquePhone
    });

    assert.equal(res.success, false);
    assert.ok(res.error?.includes("uygun değil"));

    const customers = await db.execute(`SELECT * FROM customers WHERE normalized_phone = '905559998811'`);
    assert.equal(customers.rows.length, 0, "Customer should not be created for a failed Any Staff booking");
  });

  it("SUCCESS DTO PRIVACY TEST: Any Staff success does not leak DB IDs", async () => {
    // Wednesday 07:00 UTC. Both are free.
    const startAt = "2026-10-14T07:00:00.000Z";
    const res = await createPublicAppointmentAction({
      slug: "concurrency-barber",
      serviceId: svcHaircut,
      staffId: "any",
      startAt,
      customerName: "Privacy Test",
      customerPhone: "+905553332211"
    });

    assert.equal(res.success, true);
    const data = res.data;
    const keys = Object.keys(data);
    
    assert.ok(!keys.includes("customerId"), "Should NOT include customerId");
    assert.ok(!keys.includes("businessId"), "Should NOT include businessId");
    assert.equal((data as any).customer_id, undefined);
    assert.equal((data as any).business_id, undefined);
    
    // BUT we DO leak the assigned staff name and ID now? Wait, the DTO for ANY staff returns the assigned staff's name?
    // Let's check what it returns
    assert.ok(keys.includes("staffDisplayName"));
    assert.ok(keys.includes("serviceName"));
  });
});
