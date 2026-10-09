/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let dashboardService: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Businesses
const bizMain = uuid(100);
const bizOther = uuid(101);

// Users
const ownerId = uuid(200);
const adminId = uuid(201);
const staffId = uuid(202);
const staff2Id = uuid(203);
const otherOwnerId = uuid(204);
const otherStaffId = uuid(205);

// Staff Profiles
const staffProf1 = uuid(300);
const staffProf2 = uuid(301);
const otherStaffProf = uuid(302);

// Services
const svcMain = uuid(400);

describe("Dashboard Appointments Daily Agenda (TASK 008A)", { concurrency: false }, () => {
  before(async () => {
    const dbServer = await startDatabase();
    pgServer = dbServer;
    process.env.DATABASE_URL = pgServer.connectionString;

    const dbLib = await import("../../src/db");
    db = dbLib.db;

    dashboardService = await import("../../src/services/dashboard-appointments.service");

    // Seed Data
    // Businesses
    await db.execute(`
      INSERT INTO businesses (id, name, slug, timezone, currency)
      VALUES 
      ('${bizMain}', 'Main Biz', 'main-biz', 'Europe/Istanbul', 'TRY'),
      ('${bizOther}', 'Other Biz', 'other-biz', 'Europe/Istanbul', 'TRY');
    `);

    // Users
    await db.execute(`
      INSERT INTO users (id, name, email, email_verified, image)
      VALUES 
      ('${ownerId}', 'Owner', 'o@a.com', true, null),
      ('${adminId}', 'Admin', 'a@a.com', true, null),
      ('${staffId}', 'Staff 1', 's1@a.com', true, null),
      ('${staff2Id}', 'Staff 2', 's2@a.com', true, null),
      ('${otherOwnerId}', 'Other Owner', 'oo@a.com', true, null),
      ('${otherStaffId}', 'Other Staff', 'os@a.com', true, null);
    `);

    // Note: To link staff_profiles to business_members, we need business_members UUIDs.
    // Let's create specific UUIDs for business_members.
    const bmOwner = uuid(800);
    const bmAdmin = uuid(801);
    const bmStaff = uuid(802);
    const bmStaff2 = uuid(803);
    const bmOtherOwner = uuid(804);
    const bmOtherStaff = uuid(805);

    await db.execute(`
      INSERT INTO business_members (id, business_id, user_id, role)
      VALUES 
      ('${bmOwner}', '${bizMain}', '${ownerId}', 'OWNER'),
      ('${bmAdmin}', '${bizMain}', '${adminId}', 'ADMIN'),
      ('${bmStaff}', '${bizMain}', '${staffId}', 'STAFF'),
      ('${bmStaff2}', '${bizMain}', '${staff2Id}', 'STAFF'),
      ('${bmOtherOwner}', '${bizOther}', '${otherOwnerId}', 'OWNER'),
      ('${bmOtherStaff}', '${bizOther}', '${otherStaffId}', 'STAFF');
    `);

    // Staff Profiles
    await db.execute(`
      INSERT INTO staff_profiles (id, business_id, business_member_id, first_name, last_name, active, public_booking_enabled)
      VALUES 
      ('${staffProf1}', '${bizMain}', '${bmStaff}', 'S1', 'L1', true, true),
      ('${staffProf2}', '${bizMain}', '${bmStaff2}', 'S2', 'L2', false, false), -- Inactive
      ('${otherStaffProf}', '${bizOther}', '${bmOtherStaff}', 'OS', 'L3', true, true);
    `);

    // Customers
    const cust1 = uuid(500);
    const custOther = uuid(501);
    await db.execute(`
      INSERT INTO customers (id, business_id, first_name, phone, normalized_phone)
      VALUES 
      ('${cust1}', '${bizMain}', 'C1', '5551112233', '5551112233'),
      ('${custOther}', '${bizOther}', 'CO', '5559998877', '5559998877');
    `);

    // Services
    const svcOther = uuid(401);
    await db.execute(`
      INSERT INTO services (id, business_id, name, duration_minutes, price)
      VALUES 
      ('${svcMain}', '${bizMain}', 'Cut', 30, 200.00),
      ('${svcOther}', '${bizOther}', 'CutOther', 30, 200.00);
    `);

    // Appointments
    // Biz 1: 2026-10-10 (Istanbul) -> UTC boundaries: 2026-10-09T21:00:00Z to 2026-10-10T21:00:00Z
    
    // app1: 10:00 UTC = 13:00 TRT (Same day) -> staffProf1
    const app1 = uuid(601);
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
      VALUES ('${app1}', '${bizMain}', '${cust1}', '${staffProf1}', '${svcMain}', '2026-10-10T10:00:00Z', '2026-10-10T10:30:00Z', 'CONFIRMED', 'Cut-Snap', 30, 200.00);
    `);

    // app2: 21:00 UTC = 00:00 TRT (Next day, so 2026-10-11 in local)
    const app2 = uuid(602);
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
      VALUES ('${app2}', '${bizMain}', '${cust1}', '${staffProf1}', '${svcMain}', '2026-10-10T21:00:00Z', '2026-10-10T21:30:00Z', 'PENDING', 'Cut', 30, 200.00);
    `);

    // app3: 20:30 UTC = 23:30 TRT (Same day, almost midnight)
    const app3 = uuid(603);
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
      VALUES ('${app3}', '${bizMain}', '${cust1}', '${staffProf1}', '${svcMain}', '2026-10-10T20:30:00Z', '2026-10-10T21:00:00Z', 'COMPLETED', 'Cut', 30, 200.00);
    `);

    // app4: Staff 2 appointment on same day
    const app4 = uuid(604);
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
      VALUES ('${app4}', '${bizMain}', '${cust1}', '${staffProf2}', '${svcMain}', '2026-10-10T11:00:00Z', '2026-10-10T11:30:00Z', 'CANCELLED', 'Cut', 30, 200.00);
    `);

    // app5: Cross tenant appointment at same time
    const app5 = uuid(605);
    await db.execute(`
      INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, start_time, end_time, status, service_name_snapshot, service_duration_snapshot, service_price_snapshot)
      VALUES ('${app5}', '${bizOther}', '${custOther}', '${otherStaffProf}', '${svcOther}', '2026-10-10T10:00:00Z', '2026-10-10T10:30:00Z', 'PENDING', 'Cut', 30, 200.00);
    `);
  });

  after(async () => {
    if (pgServer) {
      await pgServer.stop();
    }
  });

  it("OWNER can view business appointments without filter", async () => {
    const res = await dashboardService.getDashboardDailyAgenda(bizMain, ownerId, 'OWNER', '2026-10-10');
    assert.equal(res.appointments.length, 3);
    // ordered chronologically: app1 (10:00), app4 (11:00), app3 (20:30)
    assert.equal(res.appointments[0].id, uuid(601));
    assert.equal(res.appointments[1].id, uuid(604));
    assert.equal(res.appointments[2].id, uuid(603));
  });

  it("ADMIN can view business appointments with staff filter", async () => {
    const res = await dashboardService.getDashboardDailyAgenda(bizMain, adminId, 'ADMIN', '2026-10-10', staffProf1);
    assert.equal(res.appointments.length, 2);
    assert.equal(res.appointments[0].id, uuid(601));
    assert.equal(res.appointments[1].id, uuid(603));
  });

  it("STAFF sees only own appointments and ignores filter", async () => {
    // Tries to filter for staffProf2, but should only get staffProf1 (their own)
    const res = await dashboardService.getDashboardDailyAgenda(bizMain, staffId, 'STAFF', '2026-10-10', staffProf2);
    assert.equal(res.appointments.length, 2);
    assert.equal(res.appointments[0].id, uuid(601));
  });

  it("STAFF without profile gets safe empty result", async () => {
    const emptyStaff = uuid(299);
    const bmEmpty = uuid(899);
    await db.execute(`INSERT INTO users (id, name, email, email_verified, image) VALUES ('${emptyStaff}', 'E', 'e@e.com', true, null);`);
    await db.execute(`INSERT INTO business_members (id, business_id, user_id, role) VALUES ('${bmEmpty}', '${bizMain}', '${emptyStaff}', 'STAFF');`);
    
    const res = await dashboardService.getDashboardDailyAgenda(bizMain, emptyStaff, 'STAFF', '2026-10-10');
    assert.equal(res.appointments.length, 0);
  });

  it("Cross-tenant leaks are prevented", async () => {
    const res = await dashboardService.getDashboardDailyAgenda(bizOther, otherOwnerId, 'OWNER', '2026-10-10');
    assert.equal(res.appointments.length, 1);
    assert.equal(res.appointments[0].id, uuid(605));
  });

  it("Local midnight belongs to correct day", async () => {
    // 2026-10-11 local in Istanbul is 2026-10-10T21:00:00Z
    const res = await dashboardService.getDashboardDailyAgenda(bizMain, ownerId, 'OWNER', '2026-10-11');
    assert.equal(res.appointments.length, 1);
    assert.equal(res.appointments[0].id, uuid(602)); // app2 is exactly at 21:00 UTC
  });

  it("Malformed local date handled safely", async () => {
    await assert.rejects(
      dashboardService.getDashboardDailyAgenda(bizMain, ownerId, 'OWNER', '2026-10-35'),
      /Geçersiz tarih formatı/
    );
  });

  it("Snapshots and names are returned instead of raw UUIDs", async () => {
    const res = await dashboardService.getDashboardDailyAgenda(bizMain, ownerId, 'OWNER', '2026-10-10', staffProf1);
    const app = res.appointments[0];
    assert.equal(app.service.nameSnapshot, 'Cut-Snap');
    assert.equal(app.customer.firstName, 'C1');
    assert.equal(app.staff.displayName, 'S1 L1');
    assert.equal(app.status, 'CONFIRMED');
    assert.ok(app.localStartTime);
  });

});
