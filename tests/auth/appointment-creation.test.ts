/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";
import { parseDateTimeInBusinessTimezone } from "../../src/lib/timezone";
import { eq } from "drizzle-orm";

let pgServer: any;
let db: any;
let AppointmentService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const bizA = uuid(903); 
const bizB = uuid(904);

// Staff
const staffA = uuid(905); // Active, Public, Uses Biz Hours
const staffInactive = uuid(906);
const staffNoPublic = uuid(907);
const staffInactiveMember = uuid(908);
const staffB = uuid(909);

// Services
const svc15 = uuid(910);
const svc20 = uuid(911);
const svc30 = uuid(912);
const svc45 = uuid(913);
const svc60 = uuid(914);
const svc75 = uuid(915);
const svcInactive = uuid(916);
const svcUnassigned = uuid(917);
const svcB = uuid(918);

before(async () => {
  pgServer = await startDatabase({ port: 54413 });
  process.env.DATABASE_URL = pgServer.connectionString;

  const dbLib = await import("../../src/db");
  db = dbLib.db;
  
  const apptSvcLib = await import("../../src/services/appointment.service");
  AppointmentService = apptSvcLib.AppointmentService;

  // USERS
  await db.execute(`
    INSERT INTO users (id, name, email, email_verified) VALUES 
    ('${uuid(901)}', 'Owner', 'owner@avh.com', true),
    ('${uuid(991)}', 'U1', 'u1@a.com', true),
    ('${uuid(992)}', 'U2', 'u2@a.com', true),
    ('${uuid(993)}', 'U3', 'u3@a.com', true),
    ('${uuid(999)}', 'U9', 'u9@a.com', true);
  `);

  // BUSINESSES
  await db.execute(`
    INSERT INTO businesses (id, name, slug, timezone, booking_interval_minutes, currency) VALUES 
    ('${bizA}', 'Biz A', 'biz-a-ac', 'Europe/Istanbul', 15, 'TRY'),
    ('${bizB}', 'Biz B', 'biz-b-ac', 'America/New_York', 15, 'USD');
  `);

  // MEMBERS
  await db.execute(`
    INSERT INTO business_members (id, business_id, user_id, role, active) VALUES 
    ('${bizA}', '${bizA}', '${uuid(901)}', 'OWNER', true),
    ('${uuid(991)}', '${bizA}', '${uuid(991)}', 'STAFF', true),
    ('${uuid(992)}', '${bizA}', '${uuid(992)}', 'STAFF', true),
    ('${uuid(993)}', '${bizA}', '${uuid(993)}', 'STAFF', true),
    ('${uuid(999)}', '${bizA}', '${uuid(999)}', 'STAFF', false),
    ('${bizB}', '${bizB}', '${uuid(901)}', 'OWNER', true);
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
  `);

  // BIZ WORKING HOURS (Biz A): 09:00 - 18:00
  for (let i = 0; i < 7; i++) {
    const isClosed = false;
    await db.execute(`
      INSERT INTO business_working_hours (business_id, day_of_week, start_time, end_time, is_closed) VALUES 
      ('${bizA}', ${i}, ${isClosed ? "NULL" : "'09:00'"}, ${isClosed ? "NULL" : "'18:00'"}, ${isClosed});
    `);
  }

  // STAFF WORKING HOURS (Biz B)
  for (let i = 0; i < 7; i++) {
    const isWorking = true;
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

describe("Appointment Creation - Write Path Validation", () => {
  it("creates a successful appointment and upserts customer", async () => {
    // Pick a Tuesday 10:00 in Istanbul
    const startAt = parseDateTimeInBusinessTimezone("2030-01-08", "10:00", "Europe/Istanbul").toISOString();
    
    const appt = await AppointmentService.createAppointment({
      businessId: bizA,
      staffId: staffA,
      serviceId: svc30,
      startAt,
      customer: {
        firstName: "Test",
        lastName: "Customer",
        phone: "+90 555 123 45 67" // should normalize
      }
    });

    assert.ok(appt.id);
    assert.equal(appt.status, "CONFIRMED");
    assert.equal(appt.source, "PUBLIC_WEB");
    assert.equal(appt.serviceNameSnapshot, "30 Min");
    assert.equal(appt.serviceDurationSnapshot, 30);
    assert.equal(Number(appt.servicePriceSnapshot), 200);

    const customersLib = await import("../../src/db/schema/customers");
    const { customers } = customersLib;
    
    const [customerRecord] = await db.select().from(customers).where(eq(customers.id, appt.customerId));
    assert.ok(customerRecord);
    assert.equal(customerRecord.firstName, "Test");
    assert.equal(customerRecord.phone, "+90 555 123 45 67");
    assert.equal(customerRecord.normalizedPhone, "+905551234567");
  });

  it("fails if staff is inactive", async () => {
    const startAt = parseDateTimeInBusinessTimezone("2030-01-08", "10:00", "Europe/Istanbul").toISOString();
    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffInactive,
        serviceId: svc30,
        startAt,
        customer: { firstName: "Test", phone: "123" }
      }),
      /not bookable/i
    );
  });

  it("fails if staff does not have public booking enabled", async () => {
    const startAt = parseDateTimeInBusinessTimezone("2030-01-08", "10:00", "Europe/Istanbul").toISOString();
    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffNoPublic,
        serviceId: svc30,
        startAt,
        customer: { firstName: "Test", phone: "123" }
      }),
      /not bookable/i
    );
  });

  it("fails if service is unassigned", async () => {
    const startAt = parseDateTimeInBusinessTimezone("2030-01-08", "10:00", "Europe/Istanbul").toISOString();
    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svcUnassigned,
        startAt,
        customer: { firstName: "Test", phone: "123" }
      }),
      /not bookable or not assigned/i
    );
  });

  it("fails if startAt is not a valid grid slot (off interval)", async () => {
    // 10:07 is not on the 15m grid
    const startAt = parseDateTimeInBusinessTimezone("2030-01-08", "10:07", "Europe/Istanbul").toISOString();
    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt,
        customer: { firstName: "Test", phone: "123" }
      }),
      /not available or overlaps/i
    );
  });

  it("fails if appointment goes past end of day", async () => {
    // 17:45 + 30m = 18:15 (past 18:00)
    const startAt = parseDateTimeInBusinessTimezone("2030-01-08", "17:45", "Europe/Istanbul").toISOString();
    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt,
        customer: { firstName: "Test", phone: "123" }
      }),
      /not available or overlaps/i
    );
  });

  describe("Concurrency and Double Booking Protection", () => {
    it("prevents double booking when two concurrent requests try to book the exact same slot", async () => {
      const startAt = parseDateTimeInBusinessTimezone("2030-01-09", "11:00", "Europe/Istanbul").toISOString();
      
      const req1 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt,
        customer: { firstName: "C1", phone: "111" }
      });
      const req2 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt,
        customer: { firstName: "C2", phone: "222" }
      });
      const req3 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt,
        customer: { firstName: "C3", phone: "333" }
      });

      const results = await Promise.allSettled([req1, req2, req3]);
      
      const fulfilled = results.filter(r => r.status === "fulfilled");
      const rejected = results.filter(r => r.status === "rejected");

      assert.equal(fulfilled.length, 1, "Exactly one appointment should be created");
      assert.equal(rejected.length, 2, "Two appointments should be rejected due to overlap");
      assert.match((rejected[0] as any).reason.message, /not available or overlaps/i);
    });

    it("prevents overlapping booking (e.g., booking a 45m slot at 12:00, and a 30m slot at 12:15)", async () => {
      const startAt1 = parseDateTimeInBusinessTimezone("2030-01-10", "12:00", "Europe/Istanbul").toISOString();
      const startAt2 = parseDateTimeInBusinessTimezone("2030-01-10", "12:15", "Europe/Istanbul").toISOString();
      
      const req1 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc45, // 12:00 - 12:45
        startAt: startAt1,
        customer: { firstName: "C1", phone: "111" }
      });
      const req2 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30, // 12:15 - 12:45
        startAt: startAt2,
        customer: { firstName: "C2", phone: "222" }
      });

      const results = await Promise.allSettled([req1, req2]);
      
      const fulfilled = results.filter(r => r.status === "fulfilled");
      const rejected = results.filter(r => r.status === "rejected");

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
    });

    it("allows bookings that touch but do not overlap", async () => {
      // 14:00 - 14:30
      const startAt1 = parseDateTimeInBusinessTimezone("2030-01-11", "14:00", "Europe/Istanbul").toISOString();
      // 14:30 - 15:00
      const startAt2 = parseDateTimeInBusinessTimezone("2030-01-11", "14:30", "Europe/Istanbul").toISOString();
      
      const req1 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt: startAt1,
        customer: { firstName: "C1", phone: "111" }
      });
      const req2 = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt: startAt2,
        customer: { firstName: "C2", phone: "222" }
      });

      const results = await Promise.allSettled([req1, req2]);
      
      const fulfilled = results.filter(r => r.status === "fulfilled");
      assert.equal(fulfilled.length, 2, "Both appointments should be created successfully");
    });
  });

  describe("Customer Upsert Logic", () => {
    it("updates existing customer's name if same business and phone", async () => {
      const startAt = parseDateTimeInBusinessTimezone("2030-01-12", "10:00", "Europe/Istanbul").toISOString();
      
      const appt1 = await AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc15,
        startAt,
        customer: { firstName: "Original", lastName: "Name", phone: "+905559998877" }
      });

      const startAt2 = parseDateTimeInBusinessTimezone("2030-01-12", "11:00", "Europe/Istanbul").toISOString();
      const appt2 = await AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc15,
        startAt: startAt2,
        customer: { firstName: "Updated", lastName: "Name2", phone: "+90 555 999 88 77" } // same normalized phone
      });

      assert.equal(appt1.customerId, appt2.customerId, "Should use the exact same customer ID");

      const customersLib = await import("../../src/db/schema/customers");
      const { customers } = customersLib;
      const [customerRecord] = await db.select().from(customers).where(eq(customers.id, appt1.customerId));
      
      assert.equal(customerRecord.firstName, "Updated", "First name should be updated");
      assert.equal(customerRecord.lastName, "Name2", "Last name should be updated");
    });
  });

  describe("Conflicts with Time Blocks", () => {
    it("fails if overlapping with a TIME_OFF block", async () => {
      const startTime = parseDateTimeInBusinessTimezone("2030-01-13", "10:00", "Europe/Istanbul");
      const endTime = parseDateTimeInBusinessTimezone("2030-01-13", "11:00", "Europe/Istanbul");

      // Actually time blocks are in scheduling.ts
      const schedLib = await import("../../src/db/schema/scheduling");
      const { timeBlocks } = schedLib;

      await db.insert(timeBlocks).values({
        businessId: bizA,
        staffId: staffA,
        blockType: "TIME_OFF",
        startTime,
        endTime
      });

      const startAt = parseDateTimeInBusinessTimezone("2030-01-13", "10:30", "Europe/Istanbul").toISOString();
      await assert.rejects(
        AppointmentService.createAppointment({
          businessId: bizA,
          staffId: staffA,
          serviceId: svc30,
          startAt,
          customer: { firstName: "Test", phone: "123" }
        }),
        /not available or overlaps/i
      );
    });

    it("prevents double booking between appointment and time block concurrently", async () => {
      const tbRepo = await import("../../src/repositories/time-blocks.repository");

      const startAt = parseDateTimeInBusinessTimezone("2030-01-14", "10:00", "Europe/Istanbul").toISOString();
      const endAt = parseDateTimeInBusinessTimezone("2030-01-14", "10:30", "Europe/Istanbul").toISOString();

      const reqAppt = AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt,
        customer: { firstName: "C1", phone: "111" }
      });

      const reqBlock = tbRepo.createStaffTimeBlockWithLock(bizA, staffA, {
        blockType: "BLOCKED",
        startTime: new Date(startAt),
        endTime: new Date(endAt),
        reason: "Test block"
      });

      const results = await Promise.allSettled([reqAppt, reqBlock]);
      const fulfilled = results.filter(r => r.status === "fulfilled");
      const rejected = results.filter(r => r.status === "rejected");

      assert.equal(fulfilled.length, 1, "Exactly one mutation should succeed");
      assert.equal(rejected.length, 1, "Exactly one mutation should be rejected due to overlap");
    });
  });

  describe("Rollback Guarantees", () => {
    it("leaves no orphaned customer if appointment creation fails due to validation", async () => {
      const customersLib = await import("../../src/db/schema/customers");
      const { customers } = customersLib;

      const randomPhone = "+90999999999";
      
      const startAt = parseDateTimeInBusinessTimezone("2030-01-15", "10:07", "Europe/Istanbul").toISOString(); // Invalid slot
      
      await assert.rejects(
        AppointmentService.createAppointment({
          businessId: bizA,
          staffId: staffA,
          serviceId: svc30,
          startAt,
          customer: { firstName: "TestOrphan", phone: randomPhone }
        })
      );

      const [customerRecord] = await db.select().from(customers).where(eq(customers.phone, randomPhone));
      assert.equal(customerRecord, undefined, "Customer should not have been created because transaction rolled back");
    });
  });

  describe("Read/Write Consistency", () => {
    it("removes a booked slot from the availability engine read model immediately", async () => {
      const { getStaffAvailability } = await import("../../src/services/availability.service");
      
      const localDate = "2030-01-16";
      const startAtStr = "11:00";
      const startAtISO = parseDateTimeInBusinessTimezone(localDate, startAtStr, "Europe/Istanbul").toISOString();

      // 1. Initial Read
      const res1 = await getStaffAvailability({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        localDate
      });
      const slotBefore = res1.slots.find(s => s.startAt === startAtISO);
      assert.ok(slotBefore, "Slot should be available initially");

      // 2. Transactional Booking
      await AppointmentService.createAppointment({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        startAt: startAtISO,
        customer: { firstName: "Test", phone: "Consistency" }
      });

      // 3. Subsequent Read
      const res2 = await getStaffAvailability({
        businessId: bizA,
        staffId: staffA,
        serviceId: svc30,
        localDate
      });
      const slotAfter = res2.slots.find(s => s.startAt === startAtISO);
      assert.equal(slotAfter, undefined, "Slot should no longer be available after booking");
    });
  });
});
