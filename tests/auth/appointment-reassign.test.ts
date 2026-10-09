/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import assert from "node:assert/strict";
import { after, before, describe, it, beforeEach } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let schema: any;
let AppointmentService: any;
let eq: any, and: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const MOCK = {
  biz1: uuid(1),
  owner1: uuid(2),
  staffUser1: uuid(3),
  staffUser2: uuid(4),
  cust1: uuid(5),
  svc1: uuid(6),
  staffProf1: uuid(7),
  staffProf2: uuid(8),
};

describe("Appointment Reassignment (TASK 008C.3)", () => {
  before(async () => {
    const dbServer = await startDatabase();
    pgServer = dbServer;
    process.env.DATABASE_URL = pgServer.connectionString;

    const dbLib = await import("../../src/db");
    db = dbLib.db;
    
    const schemaModule = await import("../../src/db/schema/index.js");
    schema = schemaModule;
    const drizzle = await import("drizzle-orm");
    eq = drizzle.eq;
    and = drizzle.and;

    const svc = await import("../../src/services/appointment.service.js");
    AppointmentService = svc.AppointmentService;

    // Seed minimal data
    await db.insert(schema.users).values([
      { id: MOCK.owner1, email: "owner1@test.com", passwordHash: "h", name: "Owner", emailVerified: true },
      { id: MOCK.staffUser1, email: "staff1@test.com", passwordHash: "h", name: "Staff1", emailVerified: true },
      { id: MOCK.staffUser2, email: "staff2@test.com", passwordHash: "h", name: "Staff2", emailVerified: true },
      { id: MOCK.cust1, email: "cust1@test.com", passwordHash: "h", name: "Cust1", emailVerified: true },
    ]);

    await db.insert(schema.businesses).values({
      id: MOCK.biz1,
      name: "Biz",
      slug: "biz",
      timezone: "Europe/Istanbul",
      currency: "TRY",
    });

    await db.insert(schema.businessMembers).values([
      { id: uuid(10), businessId: MOCK.biz1, userId: MOCK.owner1, role: "OWNER" },
      { id: uuid(11), businessId: MOCK.biz1, userId: MOCK.staffUser1, role: "STAFF" },
      { id: uuid(12), businessId: MOCK.biz1, userId: MOCK.staffUser2, role: "STAFF" },
    ]);

    await db.insert(schema.staffProfiles).values([
      { id: MOCK.staffProf1, businessId: MOCK.biz1, businessMemberId: uuid(11), firstName: "Staff", lastName: "One", active: true, publicBookingEnabled: true, usesBusinessHours: false },
      { id: MOCK.staffProf2, businessId: MOCK.biz1, businessMemberId: uuid(12), firstName: "Staff", lastName: "Two", active: true, publicBookingEnabled: false, usesBusinessHours: false },
    ]);

    const days = [1, 2, 3, 4, 5];
    for (const d of days) {
      await db.insert(schema.staffWorkingHours).values({ businessId: MOCK.biz1, staffId: MOCK.staffProf1, dayOfWeek: d, isWorking: true, startTime: "09:00", endTime: "17:00" });
      await db.insert(schema.staffWorkingHours).values({ businessId: MOCK.biz1, staffId: MOCK.staffProf2, dayOfWeek: d, isWorking: true, startTime: "09:00", endTime: "17:00" });
    }

    await db.insert(schema.services).values({
      id: MOCK.svc1,
      businessId: MOCK.biz1,
      name: "Haircut",
      durationMinutes: 30,
      price: "100.00",
      active: true,
    });

    await db.insert(schema.staffServices).values([
      { businessId: MOCK.biz1, staffId: MOCK.staffProf1, serviceId: MOCK.svc1 },
      { businessId: MOCK.biz1, staffId: MOCK.staffProf2, serviceId: MOCK.svc1 }
    ]);

    await db.insert(schema.customers).values({
      id: MOCK.cust1,
      businessId: MOCK.biz1,
      firstName: "C",
      lastName: "1",
      phone: "5551234567",
      normalizedPhone: "+905551234567",
    });
  });

  after(async () => {
    if (pgServer) {
      await pgServer.stop();
    }
  });

  let testApptId: string;
  let testApptUpdatedAt: string;

  beforeEach(async () => {
    await db.delete(schema.appointments);

    // Provide an initial appointment on staff1
    // Let's make it next Monday to ensure it's a weekday
    const nextMonday = new Date();
    nextMonday.setHours(12, 0, 0, 0);
    const day = nextMonday.getDay();
    const daysUntilMonday = ((1 + 7 - day) % 7) || 7;
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    
    // Set to 10:00 AM UTC -> 13:00 Istanbul time
    nextMonday.setUTCHours(10, 0, 0, 0);

    const endTime = new Date(nextMonday.getTime() + 30 * 60000);

    const [appt] = await db.insert(schema.appointments).values({
      businessId: MOCK.biz1,
      customerId: MOCK.cust1,
      staffId: MOCK.staffProf1,
      serviceId: MOCK.svc1,
      startTime: nextMonday,
      endTime: endTime,
      status: "CONFIRMED",
      source: "MANUAL_ADMIN",
      serviceNameSnapshot: "Haircut",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "100.00",
    }).returning();

    testApptId = appt.id;
    testApptUpdatedAt = appt.updatedAt.toISOString();
  });

  it("should successfully reassign appointment to target staff", async () => {
    const res = await AppointmentService.reassignAppointment(
      MOCK.biz1,
      testApptId,
      MOCK.staffProf2,
      testApptUpdatedAt,
      "OWNER",
      MOCK.owner1
    );

    assert.equal(res.success, true);

    const appt = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    assert.equal(appt.staffId, MOCK.staffProf2, "Staff ID should be updated");
    assert.equal(appt.serviceNameSnapshot, "Haircut", "Snapshots should remain untouched");
  });

  it("should reject STAFF role", async () => {
    await assert.rejects(
      AppointmentService.reassignAppointment(
        MOCK.biz1, testApptId, MOCK.staffProf2, testApptUpdatedAt, "STAFF", MOCK.staffUser1
      ),
      /FORBIDDEN/
    );
  });

  it("should return NO_CHANGE if target is current staff", async () => {
    const res = await AppointmentService.reassignAppointment(
      MOCK.biz1, testApptId, MOCK.staffProf1, testApptUpdatedAt, "OWNER", MOCK.owner1
    );
    assert.equal(res.success, true);
    assert.equal(res.reason, "NO_CHANGE");
  });

  it("should reject if stale updated at", async () => {
    const staleTime = new Date(new Date(testApptUpdatedAt).getTime() - 1000).toISOString();
    await assert.rejects(
      AppointmentService.reassignAppointment(
        MOCK.biz1, testApptId, MOCK.staffProf2, staleTime, "OWNER", MOCK.owner1
      ),
      /STALE_APPOINTMENT/
    );
  });

  it("should allow target staff with public_booking_enabled=false", async () => {
    // staffProf2 has publicBookingEnabled = false
    const res = await AppointmentService.reassignAppointment(
      MOCK.biz1, testApptId, MOCK.staffProf2, testApptUpdatedAt, "OWNER", MOCK.owner1
    );
    assert.equal(res.success, true);
  });

  it("should safely handle concurrent deadlocks via deterministic locking", async () => {
    // Test A->B and B->A concurrent reassignments
    const nextMonday = new Date();
    nextMonday.setHours(12, 0, 0, 0);
    const day = nextMonday.getDay();
    const daysUntilMonday = ((1 + 7 - day) % 7) || 7;
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    nextMonday.setUTCHours(11, 0, 0, 0);

    const [appt2] = await db.insert(schema.appointments).values({
      businessId: MOCK.biz1,
      customerId: MOCK.cust1,
      staffId: MOCK.staffProf2,
      serviceId: MOCK.svc1,
      startTime: nextMonday,
      endTime: new Date(nextMonday.getTime() + 30 * 60000),
      status: "CONFIRMED",
      source: "MANUAL_ADMIN",
      serviceNameSnapshot: "Haircut",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "100.00",
    }).returning();

    // Appt1: Staff1 -> Staff2
    const p1 = AppointmentService.reassignAppointment(MOCK.biz1, testApptId, MOCK.staffProf2, testApptUpdatedAt, "OWNER", MOCK.owner1);
    // Appt2: Staff2 -> Staff1
    const p2 = AppointmentService.reassignAppointment(MOCK.biz1, appt2.id, MOCK.staffProf1, appt2.updatedAt.toISOString(), "OWNER", MOCK.owner1);

    await Promise.all([p1, p2]);

    const updated1 = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    const updated2 = await db.select().from(schema.appointments).where(eq(schema.appointments.id, appt2.id)).then((r: any) => r[0]);

    assert.equal(updated1.staffId, MOCK.staffProf2);
    assert.equal(updated2.staffId, MOCK.staffProf1);
  });
});
