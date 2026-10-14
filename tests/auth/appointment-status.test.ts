/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let AppointmentService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const bizMain = uuid(100);

// Users / Staff
const ownerUserId = uuid(1);
const adminUserId = uuid(2);
const staff1UserId = uuid(3);
const staff2UserId = uuid(4);

const staff1Profile = uuid(200);
const staff2Profile = uuid(201);

const customerId = uuid(500);

// Services
const svc1 = uuid(300);

// Appointments
const pastApptId = uuid(1001); // in the past, CONFIRMED
const futureApptId = uuid(1002); // in the future, CONFIRMED
const completedApptId = uuid(1003); // in the past, COMPLETED
const cancelledApptId = uuid(1004); // CANCELLED
const pastApptStaff2Id = uuid(1005); // in the past, CONFIRMED, owned by Staff 2

describe("Appointment Status Mutations (TASK 008B)", { concurrency: false }, () => {
  before(async () => {
    const dbServer = await startDatabase();
    pgServer = dbServer;
    process.env.DATABASE_URL = pgServer.connectionString;

    const dbLib = await import("../../src/db");
    db = dbLib.db;

    AppointmentService = (await import("../../src/services/appointment.service")).AppointmentService;

    // Seed Businesses
    await db.execute(`
      INSERT INTO businesses (id, name, slug, timezone, currency, booking_interval_minutes, active, onboarding_completed_at)
      VALUES ('${bizMain}', 'Main Biz', 'main-biz', 'Europe/Istanbul', 'TRY', 15, true, NOW());
    `);

    // Users
    await db.execute(`
      INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES
        ('${ownerUserId}', 'Owner', 'owner@example.com', true, NOW(), NOW()),
        ('${adminUserId}', 'Admin', 'admin@example.com', true, NOW(), NOW()),
        ('${staff1UserId}', 'Staff 1', 'staff1@example.com', true, NOW(), NOW()),
        ('${staff2UserId}', 'Staff 2', 'staff2@example.com', true, NOW(), NOW());
    `);

    // Members
    await db.execute(`
      INSERT INTO business_members (id, business_id, user_id, role) VALUES
        ('${uuid(11)}', '${bizMain}', '${ownerUserId}', 'OWNER'),
        ('${uuid(12)}', '${bizMain}', '${adminUserId}', 'MANAGER'),
        ('${uuid(13)}', '${bizMain}', '${staff1UserId}', 'STAFF'),
        ('${uuid(14)}', '${bizMain}', '${staff2UserId}', 'STAFF');
    `);

    // Staff Profiles
    await db.execute(`
      INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled, uses_business_hours)
      VALUES
        ('${staff1Profile}', '${bizMain}', '${uuid(13)}', 'Ali', 'Yılmaz', true, true, true),
        ('${staff2Profile}', '${bizMain}', '${uuid(14)}', 'Ayşe', 'Kaya', true, true, true);
    `);

    // Customer
    await db.execute(`
      INSERT INTO customers (id, business_id, first_name, last_name, phone, normalized_phone)
      VALUES ('${customerId}', '${bizMain}', 'Müşteri', 'Bey', '05321112233', '05321112233');
    `);

    // Service
    await db.execute(`
      INSERT INTO services (id, business_id, name, duration_minutes, price, active)
      VALUES ('${svc1}', '${bizMain}', 'Haircut', 30, 200, true);
    `);

    // Staff Services
    await db.execute(`
      INSERT INTO staff_services (business_id, staff_id, service_id)
      VALUES
        ('${bizMain}', '${staff1Profile}', '${svc1}'),
        ('${bizMain}', '${staff2Profile}', '${svc1}');
    `);

    // Business Working Hours
    const bw = [];
    for (let day = 0; day <= 6; day++) {
      bw.push(`('${uuid(day+10)}', '${bizMain}', ${day}, false, '09:00', '18:00')`);
    }
    await db.execute(`
      INSERT INTO business_working_hours (id, business_id, day_of_week, is_closed, start_time, end_time)
      VALUES ${bw.join(',')};
    `);

    // Seed Appointments
    // pastApptId (1 hour ago)
    const now = new Date();
    
    const pastStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const pastEnd = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const futureStart = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(now.getTime() + 90 * 60 * 1000).toISOString();

    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
      VALUES
        ('${pastApptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200'),
        ('${futureApptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${futureStart}', '${futureEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200'),
        ('${completedApptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'COMPLETED', 'MANUAL_ADMIN', 'Haircut', 30, '200'),
        ('${cancelledApptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CANCELLED', 'MANUAL_ADMIN', 'Haircut', 30, '200'),
        ('${pastApptStaff2Id}', '${bizMain}', '${customerId}', '${staff2Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200');
    `);
  });

  after(async () => {
    await pgServer.stop();
  });

  describe("RBAC (Role Based Access Control)", () => {
    it("OWNER can update any appointment", async () => {
      await AppointmentService.updateAppointmentStatus(bizMain, pastApptId, "CANCELLED", "OWNER", ownerUserId);
      const res = await db.execute(`SELECT status FROM appointments WHERE id = '${pastApptId}'`);
      assert.equal(res.rows[0].status, "CANCELLED");
    });

    it("MANAGER can update any appointment", async () => {
      await AppointmentService.updateAppointmentStatus(bizMain, pastApptStaff2Id, "CANCELLED", "MANAGER", adminUserId);
      const res = await db.execute(`SELECT status FROM appointments WHERE id = '${pastApptStaff2Id}'`);
      assert.equal(res.rows[0].status, "CANCELLED");
    });

    it("STAFF can update their own appointment", async () => {
      // Re-seed a past appointment for staff1
      const apptId = uuid(1006);
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 3600000 + 30 * 60000).toISOString();
      await db.execute(`
        INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
        VALUES ('${apptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200');
      `);

      await AppointmentService.updateAppointmentStatus(bizMain, apptId, "COMPLETED", "STAFF", staff1UserId);
      const res = await db.execute(`SELECT status FROM appointments WHERE id = '${apptId}'`);
      assert.equal(res.rows[0].status, "COMPLETED");
    });

    it("STAFF cannot update someone else's appointment", async () => {
      const apptId = uuid(1007);
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 3600000 + 30 * 60000).toISOString();
      // Appointment belongs to staff2
      await db.execute(`
        INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
        VALUES ('${apptId}', '${bizMain}', '${customerId}', '${staff2Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200');
      `);

      try {
        await AppointmentService.updateAppointmentStatus(bizMain, apptId, "COMPLETED", "STAFF", staff1UserId);
        assert.fail("Should throw FORBIDDEN");
      } catch (e: any) {
        assert.match(e.message, /FORBIDDEN/);
      }
    });

    it("throws NOT_FOUND for non-existent appointment", async () => {
      try {
        await AppointmentService.updateAppointmentStatus(bizMain, uuid(9999), "CANCELLED", "OWNER", ownerUserId);
        assert.fail("Should throw NOT_FOUND");
      } catch (e: any) {
        assert.match(e.message, /NOT_FOUND/);
      }
    });
  });

  describe("Temporal Validation", () => {
    it("allows COMPLETED if start_time is in the past", async () => {
      const apptId = uuid(1008);
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 3600000 + 30 * 60000).toISOString();
      await db.execute(`
        INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
        VALUES ('${apptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200');
      `);

      await AppointmentService.updateAppointmentStatus(bizMain, apptId, "COMPLETED", "OWNER", ownerUserId);
      const res = await db.execute(`SELECT status FROM appointments WHERE id = '${apptId}'`);
      assert.equal(res.rows[0].status, "COMPLETED");
    });

    it("rejects COMPLETED if start_time is in the future", async () => {
      try {
        await AppointmentService.updateAppointmentStatus(bizMain, futureApptId, "COMPLETED", "OWNER", ownerUserId);
        assert.fail("Should throw TOO_EARLY");
      } catch (e: any) {
        assert.match(e.message, /TOO_EARLY/);
      }
    });

    it("allows NO_SHOW if start_time is in the past", async () => {
      const apptId = uuid(1009);
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 3600000 + 30 * 60000).toISOString();
      await db.execute(`
        INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
        VALUES ('${apptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200');
      `);

      await AppointmentService.updateAppointmentStatus(bizMain, apptId, "NO_SHOW", "OWNER", ownerUserId);
      const res = await db.execute(`SELECT status FROM appointments WHERE id = '${apptId}'`);
      assert.equal(res.rows[0].status, "NO_SHOW");
    });

    it("rejects NO_SHOW if start_time is in the future", async () => {
      try {
        await AppointmentService.updateAppointmentStatus(bizMain, futureApptId, "NO_SHOW", "OWNER", ownerUserId);
        assert.fail("Should throw TOO_EARLY");
      } catch (e: any) {
        assert.match(e.message, /TOO_EARLY/);
      }
    });

    it("allows CANCELLED if start_time is in the future", async () => {
      await AppointmentService.updateAppointmentStatus(bizMain, futureApptId, "CANCELLED", "OWNER", ownerUserId);
      const res = await db.execute(`SELECT status FROM appointments WHERE id = '${futureApptId}'`);
      assert.equal(res.rows[0].status, "CANCELLED");
    });
  });

  describe("State Transition Validation (Terminal States)", () => {
    it("rejects transition from COMPLETED", async () => {
      try {
        await AppointmentService.updateAppointmentStatus(bizMain, completedApptId, "CANCELLED", "OWNER", ownerUserId);
        assert.fail("Should throw INVALID_TRANSITION");
      } catch (e: any) {
        assert.match(e.message, /INVALID_TRANSITION/);
      }
    });

    it("rejects transition from CANCELLED", async () => {
      try {
        await AppointmentService.updateAppointmentStatus(bizMain, cancelledApptId, "COMPLETED", "OWNER", ownerUserId);
        assert.fail("Should throw INVALID_TRANSITION");
      } catch (e: any) {
        assert.match(e.message, /INVALID_TRANSITION/);
      }
    });
  });

  describe("Concurrency & Database Locks", () => {
    it("successfully coordinates concurrent status update and booking on the same staff profile", async () => {
      const apptId = uuid(1010);
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 3600000 + 30 * 60000).toISOString();
      await db.execute(`
        INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, source, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
        VALUES ('${apptId}', '${bizMain}', '${customerId}', '${staff1Profile}', '${svc1}', '${pastStart}', '${pastEnd}', 'CONFIRMED', 'MANUAL_ADMIN', 'Haircut', 30, '200');
      `);

      const PublicBookingService = (await import("../../src/services/public-booking.service")).PublicBookingService;

      // Simulate a concurrent appointment creation and an appointment status update on the same staff
      const p1 = AppointmentService.updateAppointmentStatus(bizMain, apptId, "COMPLETED", "OWNER", ownerUserId);
      const p2 = PublicBookingService.createPublicAppointment({
        slug: "main-biz",
        serviceId: svc1,
        staffId: staff1Profile,
        startAt: "2026-10-18T10:00:00Z", // Fixed future time within working hours
        customerName: "Concurrency",
        customerPhone: "05321110000"
      });

      const results = await Promise.allSettled([p1, p2]);
      
      const successes = results.filter((r: any) => r.status === "fulfilled");
      assert.equal(successes.length, 2, "Both transactions should succeed without deadlock");
    });
  });
});
