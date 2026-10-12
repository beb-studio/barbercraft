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

const MOCK_IDS = {
  biz1: uuid(1),
  owner1: uuid(2),
  staff1: uuid(3),
  staff2: uuid(4), // Another staff
  customer1: uuid(5),
  service1: uuid(6),
};

describe("Appointment Rescheduling", () => {
  let testApptId: string;

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
      { id: MOCK_IDS.owner1, email: "owner1@test.com", passwordHash: "h", name: "Owner", emailVerified: true },
      { id: MOCK_IDS.staff1, email: "staff1@test.com", passwordHash: "h", name: "Staff1", emailVerified: true },
      { id: MOCK_IDS.staff2, email: "staff2@test.com", passwordHash: "h", name: "Staff2", emailVerified: true },
      { id: MOCK_IDS.customer1, email: "cust1@test.com", passwordHash: "h", name: "Cust1", emailVerified: true },
    ]);

    await db.insert(schema.businesses).values({
      id: MOCK_IDS.biz1,
      name: "Biz",
      slug: "biz",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    });

    await db.insert(schema.businessMembers).values([
      { id: uuid(7), businessId: MOCK_IDS.biz1, userId: MOCK_IDS.owner1, role: "OWNER" },
      { id: uuid(8), businessId: MOCK_IDS.biz1, userId: MOCK_IDS.staff1, role: "STAFF" },
      { id: uuid(9), businessId: MOCK_IDS.biz1, userId: MOCK_IDS.staff2, role: "STAFF" },
    ]);

    await db.insert(schema.staffProfiles).values([
      { id: MOCK_IDS.staff1, businessId: MOCK_IDS.biz1, businessMemberId: uuid(8), firstName: "Staff", lastName: "One", active: true, publicBookingEnabled: true, usesBusinessHours: false },
      { id: MOCK_IDS.staff2, businessId: MOCK_IDS.biz1, businessMemberId: uuid(9), firstName: "Staff", lastName: "Two", active: true, publicBookingEnabled: true, usesBusinessHours: false },
    ]);

    await db.insert(schema.staffWorkingHours).values([
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 2, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 3, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 4, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 5, isWorking: true, startTime: "09:00", endTime: "17:00" },
    ]);

    await db.insert(schema.services).values({
      id: MOCK_IDS.service1,
      businessId: MOCK_IDS.biz1,
      name: "Haircut",
      durationMinutes: 30,
      price: "100.00",
      active: true,
    });

    await db.insert(schema.staffServices).values({
      businessId: MOCK_IDS.biz1,
      staffId: MOCK_IDS.staff1,
      serviceId: MOCK_IDS.service1,
    });

    await db.insert(schema.customers).values({
      id: MOCK_IDS.customer1,
      businessId: MOCK_IDS.biz1,
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

  beforeEach(async () => {
    await db.delete(schema.notificationOutbox);
    await db.delete(schema.appointments);
    await db.delete(schema.timeBlocks);

    // Create a base appointment tomorrow at 10:00 (Tuesday to be safe, but just say we force it)
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : 1)); // skip sunday
    d.setHours(10, 0, 0, 0);

    const end = new Date(d.getTime() + 30 * 60000);

    const [appt] = await db.insert(schema.appointments).values({
      businessId: MOCK_IDS.biz1,
      customerId: MOCK_IDS.customer1,
      staffId: MOCK_IDS.staff1,
      serviceId: MOCK_IDS.service1,
      startTime: d,
      endTime: end,
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Haircut",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "100.00",
    }).returning();

    testApptId = appt.id;
  });

  it("should successfully reschedule to an available slot", async () => {
    const appt = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    const expectedUpdatedAt = appt.updatedAt.toISOString();

    const newStart = new Date(appt.startTime);
    newStart.setHours(13, 0, 0, 0);

    const result = await AppointmentService.rescheduleAppointment({
      businessId: MOCK_IDS.biz1,
      appointmentId: testApptId,
      newStartAt: newStart.toISOString(),
      expectedUpdatedAt,
      userId: MOCK_IDS.owner1,
      userRole: "OWNER"
    });

    assert.equal(result.success, true);

    const updated = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    assert.equal(updated.startTime.getTime(), newStart.getTime());
    assert.equal(updated.endTime.getTime(), newStart.getTime() + 30 * 60000);
  });

  it("should ignore its own previous slot for conflict checking (self conflict bypass)", async () => {
    const appt = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    const expectedUpdatedAt = appt.updatedAt.toISOString();

    const result = await AppointmentService.rescheduleAppointment({
      businessId: MOCK_IDS.biz1,
      appointmentId: testApptId,
      newStartAt: appt.startTime.toISOString(),
      expectedUpdatedAt,
      userId: MOCK_IDS.owner1,
      userRole: "OWNER"
    });

    assert.equal(result.success, true);
  });

  it("should fail if expectedUpdatedAt does not match (stale update)", async () => {
    const appt = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    const staleDate = new Date(appt.updatedAt.getTime() - 1000).toISOString();

    const newStart = new Date(appt.startTime);
    newStart.setHours(13, 0, 0, 0);

    await assert.rejects(
      AppointmentService.rescheduleAppointment({
        businessId: MOCK_IDS.biz1,
        appointmentId: testApptId,
        newStartAt: newStart.toISOString(),
        expectedUpdatedAt: staleDate,
        userId: MOCK_IDS.owner1,
        userRole: "OWNER"
      }),
      /STALE_APPOINTMENT/
    );
  });

  it("should fail if there is a conflict with another appointment", async () => {
    const appt = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);
    
    const conflictStart = new Date(appt.startTime);
    conflictStart.setHours(14, 0, 0, 0);
    const conflictEnd = new Date(conflictStart.getTime() + 30 * 60000);

    await db.insert(schema.appointments).values({
      businessId: MOCK_IDS.biz1,
      customerId: MOCK_IDS.customer1,
      staffId: MOCK_IDS.staff1,
      serviceId: MOCK_IDS.service1,
      startTime: conflictStart,
      endTime: conflictEnd,
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Haircut",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "100.00",
    });

    await assert.rejects(
      AppointmentService.rescheduleAppointment({
        businessId: MOCK_IDS.biz1,
        appointmentId: testApptId,
        newStartAt: conflictStart.toISOString(),
        expectedUpdatedAt: appt.updatedAt.toISOString(),
        userId: MOCK_IDS.owner1,
        userRole: "OWNER"
      }),
      /overlaps with another booking/
    );
  });

  it("should fail if role is STAFF and appointment belongs to another staff", async () => {
    const appt = await db.select().from(schema.appointments).where(eq(schema.appointments.id, testApptId)).then((r: any) => r[0]);

    const newStart = new Date(appt.startTime);
    newStart.setHours(13, 0, 0, 0);

    await assert.rejects(
      AppointmentService.rescheduleAppointment({
        businessId: MOCK_IDS.biz1,
        appointmentId: testApptId,
        newStartAt: newStart.toISOString(),
        expectedUpdatedAt: appt.updatedAt.toISOString(),
        userId: MOCK_IDS.staff2, // staff2 trying to edit staff1's appt
        userRole: "STAFF"
      }),
      /FORBIDDEN/
    );
  });

  it("should fail if appointment is in the past", async () => {
    const pastAppt = await db.insert(schema.appointments).values({
      businessId: MOCK_IDS.biz1,
      customerId: MOCK_IDS.customer1,
      staffId: MOCK_IDS.staff1,
      serviceId: MOCK_IDS.service1,
      startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), 
      endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60000),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Haircut",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "100.00",
    }).returning().then((r: any) => r[0]);

    const newStart = new Date();
    while (newStart.getDay() === 0 || newStart.getDay() === 6) newStart.setDate(newStart.getDate() + 1); newStart.setDate(newStart.getDate() + (newStart.getDay() === 5 ? 3 : 1));
    newStart.setHours(13, 0, 0, 0);

    await assert.rejects(
      AppointmentService.rescheduleAppointment({
        businessId: MOCK_IDS.biz1,
        appointmentId: pastAppt.id,
        newStartAt: newStart.toISOString(),
        expectedUpdatedAt: pastAppt.updatedAt.toISOString(),
        userId: MOCK_IDS.owner1,
        userRole: "OWNER"
      }),
      /TOO_LATE/
    );
  });
});
