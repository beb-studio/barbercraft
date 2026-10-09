/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import assert from "node:assert/strict";
import { after, before, describe, it, beforeEach } from "node:test";
import { startDatabase } from "../database/db.mjs";

let pgServer: any;
let db: any;
let schema: any;
let AppointmentService: any;
let eq: any, and: any;
let actions: any;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const MOCK_IDS = {
  biz1: uuid(1),
  owner1: uuid(2),
  staff1: uuid(3),
  staff2: uuid(4),
  service1: uuid(5),
  customer1: uuid(6),
};

describe("Internal Manual Appointment Creation (TASK 008C.2)", () => {
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
      // staff1 is public_booking_enabled = false
      { id: MOCK_IDS.staff1, businessId: MOCK_IDS.biz1, businessMemberId: uuid(8), firstName: "Staff", lastName: "One", active: true, publicBookingEnabled: false, usesBusinessHours: false },
      { id: MOCK_IDS.staff2, businessId: MOCK_IDS.biz1, businessMemberId: uuid(9), firstName: "Staff", lastName: "Two", active: true, publicBookingEnabled: true, usesBusinessHours: false },
    ]);

    await db.insert(schema.staffWorkingHours).values([
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 2, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 3, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 4, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, dayOfWeek: 5, isWorking: true, startTime: "09:00", endTime: "17:00" },
      
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff2, dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff2, dayOfWeek: 2, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff2, dayOfWeek: 3, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff2, dayOfWeek: 4, isWorking: true, startTime: "09:00", endTime: "17:00" },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff2, dayOfWeek: 5, isWorking: true, startTime: "09:00", endTime: "17:00" },
    ]);

    await db.insert(schema.services).values({
      id: MOCK_IDS.service1,
      businessId: MOCK_IDS.biz1,
      name: "Haircut",
      durationMinutes: 30,
      price: "100.00",
      active: true,
    });

    await db.insert(schema.staffServices).values([
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff1, serviceId: MOCK_IDS.service1 },
      { businessId: MOCK_IDS.biz1, staffId: MOCK_IDS.staff2, serviceId: MOCK_IDS.service1 },
    ]);
  });

  after(async () => {
    if (pgServer) await pgServer.stop();
  });

  beforeEach(async () => {
    await db.delete(schema.appointments);
    await db.delete(schema.customers);
  });

  it("should allow OWNER to manually create an appointment", async () => {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : 1));
    d.setHours(10, 0, 0, 0);

    const appt = await AppointmentService.createAppointment({
      businessId: MOCK_IDS.biz1,
      staffId: MOCK_IDS.staff1,
      serviceId: MOCK_IDS.service1,
      startAt: d.toISOString(),
      customer: { firstName: "Jane", phone: "5559876543" },
      context: "INTERNAL",
      source: "MANUAL_ADMIN"
    });

    assert.ok(appt.id);
    assert.equal(appt.source, "MANUAL_ADMIN");
    assert.equal(appt.status, "CONFIRMED");
    assert.equal(appt.serviceNameSnapshot, "Haircut");
  });

  it("should allow internal booking for staff with public_booking_enabled=false", async () => {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : 1));
    d.setHours(11, 0, 0, 0);

    const appt = await AppointmentService.createAppointment({
      businessId: MOCK_IDS.biz1,
      staffId: MOCK_IDS.staff1, // publicBookingEnabled=false
      serviceId: MOCK_IDS.service1,
      startAt: d.toISOString(),
      customer: { firstName: "Jane", phone: "5559876543" },
      context: "INTERNAL",
    });
    assert.ok(appt.id);
  });

  it("should reject public booking for staff with public_booking_enabled=false", async () => {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : 1));
    d.setHours(12, 0, 0, 0);

    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: MOCK_IDS.biz1,
        staffId: MOCK_IDS.staff1, // publicBookingEnabled=false
        serviceId: MOCK_IDS.service1,
        startAt: d.toISOString(),
        customer: { firstName: "Jane", phone: "5559876543" },
        context: "PUBLIC", // The default is PUBLIC
      }),
      /Staff is not bookable/
    );
  });

  it("should reject booking in the past", async () => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Yesterday

    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: MOCK_IDS.biz1,
        staffId: MOCK_IDS.staff2,
        serviceId: MOCK_IDS.service1,
        startAt: d.toISOString(),
        customer: { firstName: "Jane", phone: "5559876543" },
        context: "INTERNAL",
      }),
      /Time slot not available/
    );
  });

  it("should prevent double booking same slot", async () => {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : 1));
    d.setHours(14, 0, 0, 0);

    await AppointmentService.createAppointment({
      businessId: MOCK_IDS.biz1,
      staffId: MOCK_IDS.staff2,
      serviceId: MOCK_IDS.service1,
      startAt: d.toISOString(),
      customer: { firstName: "Jane", phone: "5559876543" },
      context: "INTERNAL",
    });

    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: MOCK_IDS.biz1,
        staffId: MOCK_IDS.staff2,
        serviceId: MOCK_IDS.service1,
        startAt: d.toISOString(), // exact same slot
        customer: { firstName: "John", phone: "5550001111" },
        context: "INTERNAL",
      }),
      /Time slot not available or overlaps/
    );
  });
});
