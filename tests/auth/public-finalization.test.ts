/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let PublicBookingService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const bizMain = uuid(100);
const bizOther = uuid(101);

// Users / Staff
const staff1 = uuid(200); // Main business
const staffOther = uuid(201); // Other business

// Services
const svc30 = uuid(300); // 30 min, Main biz
const svcOther = uuid(301); // Other biz

const TARGET_TIME = "2026-10-14T10:00:00Z";

describe("Public Booking Finalization (TASK 007C)", { concurrency: false }, () => {
  before(async () => {
    const dbServer = await startDatabase();
    pgServer = dbServer;
    process.env.DATABASE_URL = pgServer.connectionString;

    const dbLib = await import("../../src/db");
    db = dbLib.db;

    PublicBookingService = (await import("../../src/services/public-booking.service")).PublicBookingService;

    // Seed Businesses
    await db.execute(`
      INSERT INTO businesses (id, name, slug, timezone, currency, booking_interval_minutes, active, onboarding_completed_at)
      VALUES 
        ('${bizMain}', 'Main Biz', 'main-biz', 'Europe/Istanbul', 'TRY', 15, true, NOW()),
        ('${bizOther}', 'Other Biz', 'other-biz', 'Europe/Istanbul', 'TRY', 15, true, NOW());
    `);

    // Users
    await db.execute(`
      INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES
        ('${uuid(1)}', 'Owner 1', 'owner1@example.com', true, NOW(), NOW()),
        ('${uuid(2)}', 'Owner 2', 'owner2@example.com', true, NOW(), NOW()),
        ('${uuid(3)}', 'Staff 1', 'staff1@example.com', true, NOW(), NOW());
    `);

    // Members
    await db.execute(`
      INSERT INTO business_members (id, business_id, user_id, role) VALUES
        ('${uuid(1)}', '${bizMain}', '${uuid(1)}', 'OWNER'),
        ('${uuid(2)}', '${bizOther}', '${uuid(2)}', 'OWNER'),
        ('${uuid(3)}', '${bizMain}', '${uuid(3)}', 'STAFF');
    `);

    // Staff Profiles
    await db.execute(`
      INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours)
      VALUES
        ('${staff1}', '${bizMain}', '${uuid(3)}', 'Ali', 'Yılmaz', true, true, true),
        ('${staffOther}', '${bizOther}', '${uuid(2)}', 'Ayşe', 'Kaya', true, true, true);
    `);

    // Services
    await db.execute(`
      INSERT INTO services (id, business_id, name, duration_minutes, price, active)
      VALUES
        ('${svc30}', '${bizMain}', 'Haircut', 30, 200, true),
        ('${svcOther}', '${bizOther}', 'Beard', 30, 100, true);
    `);

    // Staff Services
    await db.execute(`
      INSERT INTO staff_services (business_id, staff_id, service_id)
      VALUES
        ('${bizMain}', '${staff1}', '${svc30}'),
        ('${bizOther}', '${staffOther}', '${svcOther}');
    `);

    // Business Working Hours
    const bw = [];
    for (let day = 0; day <= 6; day++) {
      bw.push(`('${uuid(day+10)}', '${bizMain}', ${day}, false, '09:00', '18:00')`);
      bw.push(`('${uuid(day+20)}', '${bizOther}', ${day}, false, '09:00', '18:00')`);
    }
    await db.execute(`
      INSERT INTO business_working_hours (id, business_id, day_of_week, is_closed, start_time, end_time)
      VALUES ${bw.join(',')};
    `);
  });

  after(async () => {
    await pgServer.stop();
  });

  describe("Validation & Trust Boundary", () => {
    it("rejects missing or tampered UUIDs", async () => {
      try {
        await PublicBookingService.createPublicAppointment({
          slug: "main-biz",
          serviceId: "invalid-uuid",
          staffId: staff1,
          startAt: TARGET_TIME,
          customerName: "Ali Yılmaz",
          customerPhone: "05321234567"
        });
        assert.fail("Should throw validation error");
      } catch (e: any) {
        assert.match(e.message, /VALIDATION_ERROR/);
      }
    });

    it("rejects cross-tenant staff and service", async () => {
      try {
        await PublicBookingService.createPublicAppointment({
          slug: "main-biz",
          serviceId: svc30,
          staffId: staffOther,
          startAt: TARGET_TIME,
          customerName: "Ali Yılmaz",
          customerPhone: "05321234567"
        });
        assert.fail("Should throw staff profile not found error");
      } catch (e: any) {
        assert.match(e.message, /Staff profile not found/);
      }
    });

    it("requires customer name and phone", async () => {
      try {
        await PublicBookingService.createPublicAppointment({
          slug: "main-biz",
          serviceId: svc30,
          staffId: staff1,
          startAt: TARGET_TIME,
          customerName: "   ",
          customerPhone: "05321234567"
        });
        assert.fail("Should throw validation error");
      } catch (e: any) {
        assert.match(e.message, /VALIDATION_ERROR/);
      }
    });

    it("rejects short or empty phone numbers", async () => {
      try {
        await PublicBookingService.createPublicAppointment({
          slug: "main-biz",
          serviceId: svc30,
          staffId: staff1,
          startAt: TARGET_TIME,
          customerName: "Ali Yılmaz",
          customerPhone: "123" 
        });
        assert.fail("Should throw validation error");
      } catch (e: any) {
        assert.match(e.message, /VALIDATION_ERROR/);
      }
    });
  });

  describe("Transactional Safety & Races", () => {
    it("successfully creates appointment when slot is free", async () => {
      const data = await PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T09:00:00Z", // 12:00 Istanbul time
        customerName: "Bir Müşteri",
        customerPhone: "05321112233"
      });
      
      assert.equal(data.serviceName, "Haircut");
      assert.equal(data.staffDisplayName, "Ali Yılmaz");
      
      // Verify row exists
      const apts = await db.execute(`SELECT * FROM appointments WHERE service_id = '${svc30}'`);
      assert.equal(apts.rows.length, 1);
      assert.equal(apts.rows[0].status, "CONFIRMED");
      assert.equal(apts.rows[0].source, "PUBLIC_WEB");
      assert.equal(apts.rows[0].service_name_snapshot, "Haircut");
      
      // Verify customer
      const cust = await db.execute(`SELECT * FROM customers WHERE id = '${apts.rows[0].customer_id}'`);
      assert.equal(cust.rows[0].first_name, "Bir");
      assert.equal(cust.rows[0].last_name, "Müşteri");
      assert.equal(cust.rows[0].normalized_phone, "05321112233");
    });

    it("rejects when slot is already taken", async () => {
      try {
        await PublicBookingService.createPublicAppointment({
          slug: "main-biz",
          serviceId: svc30,
          staffId: staff1,
          startAt: "2026-10-14T09:00:00Z", // Already booked!
          customerName: "İkinci Müşteri",
          customerPhone: "05324445566"
        });
        assert.fail("Should throw slot unavailable error");
      } catch (e: any) {
        assert.match(e.message, /SLOT_UNAVAILABLE/);
      }
    });

    it("handles concurrent requests safely (only one succeeds)", async () => {
      const req1 = PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T10:00:00Z", 
        customerName: "A",
        customerPhone: "5551112233"
      });
      
      const req2 = PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T10:00:00Z", 
        customerName: "B",
        customerPhone: "5559998877"
      });
      
      const results = await Promise.allSettled([req1, req2]);
      
      const successes = results.filter((r: any) => r.status === "fulfilled");
      const failures = results.filter((r: any) => r.status === "rejected");
      
      assert.equal(successes.length, 1, "Exactly one booking should succeed");
      assert.equal(failures.length, 1, "Exactly one booking should fail");
      assert.match((failures[0] as any).reason.message, /SLOT_UNAVAILABLE/);
      
      const apts = await db.execute(`SELECT * FROM appointments WHERE start_time = '2026-10-14T10:00:00Z'`);
      assert.equal(apts.rows.length, 1, "Only one appointment should be created in the DB");
    });
    
    it("reuses customer with same normalized phone", async () => {
      await PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T11:00:00Z", 
        customerName: "Test 1",
        customerPhone: "0532 999 88 77"
      });
      
      await PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T12:00:00Z", 
        customerName: "Test 2",
        customerPhone: "05329998877"
      });
      
      const customers = await db.execute(`SELECT * FROM customers WHERE normalized_phone = '05329998877'`);
      assert.equal(customers.rows.length, 1, "Should reuse the same customer row");
      assert.equal(customers.rows[0].first_name, "Test", "Should update the name based on the second booking");
      assert.equal(customers.rows[0].last_name, "2");
    });    it("rolls back and does not create customer if slot is invalid", async () => {
      const uniquePhone = "05559998811";
      try {
        await PublicBookingService.createPublicAppointment({
          slug: "main-biz",
          serviceId: svc30,
          staffId: staff1,
          startAt: "2026-10-14T09:00:00Z", // Already booked by earlier test
          customerName: "Rollback Test",
          customerPhone: uniquePhone
        });
        assert.fail("Should throw");
      } catch (e: any) {
        assert.match(e.message, /SLOT_UNAVAILABLE/);
      }

      const customers = await db.execute(`SELECT * FROM customers WHERE normalized_phone = '5559998811'`);
      assert.equal(customers.rows.length, 0, "Customer should not be created for a failed booking");
    });

    it("rejects overlapping concurrent bookings safely", async () => {
      const req1 = PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T13:00:00Z", 
        customerName: "A",
        customerPhone: "5551112233"
      });
      
      const req2 = PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T13:15:00Z", // Overlaps!
        customerName: "B",
        customerPhone: "5559998877"
      });
      
      const results = await Promise.allSettled([req1, req2]);
      
      const successes = results.filter((r: any) => r.status === "fulfilled");
      const failures = results.filter((r: any) => r.status === "rejected");
      
      assert.equal(successes.length, 1, "Exactly one booking should succeed");
      assert.equal(failures.length, 1, "Exactly one booking should fail");
    });

    it("rejects concurrent booking and time block", async () => {
      const { createStaffTimeBlockService } = await import("../../src/services/time-blocks.service");
      
      const req1 = PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T14:00:00Z", 
        customerName: "C",
        customerPhone: "5551112233"
      });
      
      const req2 = createStaffTimeBlockService(bizMain, staff1, {
        blockType: "TIME_OFF",
        startDate: "2026-10-14",
        startTime: "14:15",
        endDate: "2026-10-14",
        endTime: "14:45",
      }, "OWNER");
      
      const results = await Promise.allSettled([req1, req2]);
      
      const successes = results.filter((r: any) => r.status === "fulfilled");
      const failures = results.filter((r: any) => r.status === "rejected");
      
      assert.equal(successes.length, 1, "Exactly one should succeed");
      assert.equal(failures.length, 1, "Exactly one should fail");
    });
  });

  describe("End-to-End & Privacy", () => {
    it("success DTO does not leak internal DB IDs or PII", async () => {
      const data = await PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T07:00:00Z", 
        customerName: "Gizli Müşteri",
        customerPhone: "0532 000 00 00"
      });

      const keys = Object.keys(data);
      // Does not expose appointment id yet
      assert.ok(!keys.includes("customerId"), "Should NOT include customerId");
      assert.ok(!keys.includes("businessId"), "Should NOT include businessId");
      
      assert.equal((data as any).customer_id, undefined);
      assert.equal((data as any).business_id, undefined);
    });

    it("does not create auth side effects (users/members)", async () => {
      const usersBefore = await db.execute(`SELECT count(*) FROM users`);
      const membersBefore = await db.execute(`SELECT count(*) FROM business_members`);
      
      await PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc30,
        staffId: staff1,
        startAt: "2026-10-14T07:30:00Z", 
        customerName: "No Auth",
        customerPhone: "0532 999 99 99"
      });

      const usersAfter = await db.execute(`SELECT count(*) FROM users`);
      const membersAfter = await db.execute(`SELECT count(*) FROM business_members`);

      assert.equal(usersBefore.rows[0].count, usersAfter.rows[0].count, "Should not create auth users");
      assert.equal(membersBefore.rows[0].count, membersAfter.rows[0].count, "Should not create members");
    });
  });
});
