/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `83000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  user: uuid(1),
  business: uuid(10),
  member: uuid(20),
  staff: uuid(30),
  service: uuid(40),
  customer: uuid(50),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let policyModule: any;
let lifecycle: any;
let getStaffAvailability: any;
let getAnyStaffAvailability: any;
let AppointmentService: any;
let AppointmentAccessService: any;

function futureUtc(dayOffset: number, hour = 10): Date {
  const result = new Date();
  result.setUTCDate(result.getUTCDate() + dayOffset);
  result.setUTCHours(hour, 0, 0, 0);
  return result;
}

async function setPolicy(values: Record<string, number | null>) {
  await db
    .update(schema.businesses)
    .set(values)
    .where(orm.eq(schema.businesses.id, ids.business));
}

async function createAppointment(startTime: Date) {
  const [appointment] = await db
    .insert(schema.appointments)
    .values({
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staff,
      serviceId: ids.service,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Politika Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "500.00",
      notes: "değişmemeli",
    })
    .returning();
  return appointment;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  policyModule = await import("../../src/lib/business-booking-policy");
  lifecycle = await import("../../src/lib/appointment-lifecycle");
  ({ getStaffAvailability, getAnyStaffAvailability } = await import(
    "../../src/services/availability.service"
  ));
  ({ AppointmentService } = await import(
    "../../src/services/appointment.service"
  ));
  ({ AppointmentAccessService } = await import(
    "../../src/services/appointment-access.service"
  ));

  await db.insert(schema.users).values({
    id: ids.user,
    name: "Politika Sahibi",
    email: "policy-owner@auth.test",
    emailVerified: true,
  });
  await db.insert(schema.businesses).values({
    id: ids.business,
    name: "Politika Berberi",
    slug: "politika-berberi",
    timezone: "UTC",
    currency: "TRY",
    bookingIntervalMinutes: 30,
    active: true,
    onboardingCompletedAt: new Date(),
  });
  await db.insert(schema.businessMembers).values({
    id: ids.member,
    businessId: ids.business,
    userId: ids.user,
    role: "OWNER",
    active: true,
  });
  await db.insert(schema.staffProfiles).values({
    id: ids.staff,
    businessId: ids.business,
    businessMemberId: ids.member,
    firstName: "Usta",
    lastName: "Politika",
    active: true,
    publicBookingEnabled: true,
    usesBusinessHours: true,
  });
  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.business,
    name: "Politika Kesimi",
    durationMinutes: 30,
    price: "500.00",
    active: true,
  });
  await db.insert(schema.staffServices).values({
    businessId: ids.business,
    staffId: ids.staff,
    serviceId: ids.service,
  });
  await db.insert(schema.businessWorkingHours).values(
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      businessId: ids.business,
      dayOfWeek,
      isClosed: false,
      startTime: "00:00:00",
      endTime: "23:59:00",
    }))
  );
  await db.insert(schema.customers).values({
    id: ids.customer,
    businessId: ids.business,
    firstName: "Politika",
    lastName: "Müşterisi",
    phone: "+905550000830",
    normalizedPhone: "+905550000830",
    phoneComparisonKey: "905550000830",
  });
});

after(async () => {
  await pgServer?.stop();
});

beforeEach(async () => {
  await db.delete(schema.appointmentAccessTokens);
  await db.delete(schema.appointments);
  await setPolicy({
    minimumBookingLeadMinutes: 0,
    maximumAdvanceBookingDays: null,
    cancellationNoticeMinutes: 0,
    rescheduleNoticeMinutes: 0,
  });
});

describe("TASK 015A centralized booking policy", { concurrency: false }, () => {
  it("validates compatibility defaults and rejects unsafe values", () => {
    assert.deepEqual(
      policyModule.validateBusinessBookingPolicy(
        policyModule.DEFAULT_BUSINESS_BOOKING_POLICY
      ),
      {
        valid: true,
        policy: policyModule.DEFAULT_BUSINESS_BOOKING_POLICY,
      }
    );

    for (const [field, value] of [
      ["minimumBookingLeadMinutes", -1],
      ["cancellationNoticeMinutes", Number.NaN],
      ["rescheduleNoticeMinutes", Number.POSITIVE_INFINITY],
      ["minimumBookingLeadMinutes", 525_601],
      ["maximumAdvanceBookingDays", 0],
      ["maximumAdvanceBookingDays", 731],
      ["maximumAdvanceBookingDays", 1.5],
    ] as const) {
      const result = policyModule.validateBusinessBookingPolicy({
        ...policyModule.DEFAULT_BUSINESS_BOOKING_POLICY,
        [field]: value,
      });
      assert.equal(result.valid, false, `${field}=${value} must fail`);
    }
  });

  it("enforces lead time at exact instant boundaries", () => {
    const now = new Date("2030-01-01T08:00:00.000Z");
    const policy = {
      ...policyModule.DEFAULT_BUSINESS_BOOKING_POLICY,
      minimumBookingLeadMinutes: 120,
    };
    assert.equal(
      policyModule.canPubliclyBookAt({
        requestedStart: new Date("2030-01-01T09:59:59.999Z"),
        referenceNow: now,
        businessTimezone: "UTC",
        policy,
      }).reason,
      "MINIMUM_LEAD_TIME"
    );
    for (const requestedStart of [
      new Date("2030-01-01T10:00:00.000Z"),
      new Date("2030-01-01T10:00:00.001Z"),
    ]) {
      assert.equal(
        policyModule.canPubliclyBookAt({
          requestedStart,
          referenceNow: now,
          businessTimezone: "UTC",
          policy,
        }).allowed,
        true
      );
    }
  });

  it("uses an inclusive business-local maximum day across a UTC midnight", () => {
    const referenceNow = new Date("2030-01-01T21:30:00.000Z");
    const policy = {
      ...policyModule.DEFAULT_BUSINESS_BOOKING_POLICY,
      maximumAdvanceBookingDays: 1,
    };
    assert.equal(
      policyModule.canPubliclyBookAt({
        requestedStart: new Date("2030-01-03T20:59:00.000Z"),
        referenceNow,
        businessTimezone: "Europe/Istanbul",
        policy,
      }).allowed,
      true,
      "January 3 local is the inclusive final day"
    );
    assert.equal(
      policyModule.canPubliclyBookAt({
        requestedStart: new Date("2030-01-03T21:00:00.000Z"),
        referenceNow,
        businessTimezone: "Europe/Istanbul",
        policy,
      }).reason,
      "MAXIMUM_ADVANCE",
      "January 4 local is beyond the horizon"
    );
  });

  it("keeps zero notice strict and accepts an exact positive notice cutoff", () => {
    const startsAt = new Date("2030-01-02T12:00:00.000Z");
    const exactFourHours = new Date("2030-01-02T08:00:00.000Z");
    const insideFourHours = new Date("2030-01-02T08:00:00.001Z");
    const configured = {
      ...policyModule.DEFAULT_BUSINESS_BOOKING_POLICY,
      cancellationNoticeMinutes: 240,
      rescheduleNoticeMinutes: 240,
    };

    assert.equal(
      lifecycle.canPubliclyCancelAppointment({
        status: "CONFIRMED",
        startsAt,
        referenceNow: startsAt,
        policy: policyModule.DEFAULT_BUSINESS_BOOKING_POLICY,
      }).reason,
      "TOO_LATE"
    );
    assert.equal(
      lifecycle.canPubliclyCancelAppointment({
        status: "CONFIRMED",
        startsAt,
        referenceNow: exactFourHours,
        policy: configured,
      }).allowed,
      true
    );
    assert.equal(
      lifecycle.canPubliclyCancelAppointment({
        status: "CONFIRMED",
        startsAt,
        referenceNow: insideFourHours,
        policy: configured,
      }).reason,
      "TOO_LATE"
    );
    assert.equal(
      lifecycle.canPubliclyRescheduleAppointment({
        status: "CONFIRMED",
        startsAt,
        referenceNow: exactFourHours,
        publicSchedulingEligible: true,
        policy: configured,
      }).allowed,
      true
    );
    assert.equal(
      lifecycle.canPubliclyRescheduleAppointment({
        status: "CONFIRMED",
        startsAt,
        referenceNow: insideFourHours,
        publicSchedulingEligible: true,
        policy: configured,
      }).reason,
      "TOO_LATE"
    );
  });

  it("filters public availability by trusted lead and horizon but leaves internal availability unrestricted", async () => {
    const referenceNow = new Date("2030-01-01T08:00:00.000Z");
    await setPolicy({
      minimumBookingLeadMinutes: 120,
      maximumAdvanceBookingDays: 2,
    });

    const publicToday = await getStaffAvailability({
      businessId: ids.business,
      staffId: ids.staff,
      serviceId: ids.service,
      localDate: "2030-01-01",
      referenceNow,
      context: "PUBLIC",
    });
    assert.ok(publicToday.slots.length > 0);
    assert.equal(publicToday.slots[0].startAt, "2030-01-01T10:00:00.000Z");

    const finalDay = await getStaffAvailability({
      businessId: ids.business,
      staffId: ids.staff,
      serviceId: ids.service,
      localDate: "2030-01-03",
      referenceNow,
      context: "PUBLIC",
    });
    assert.ok(finalDay.slots.length > 0);

    const publicBeyond = await getStaffAvailability({
      businessId: ids.business,
      staffId: ids.staff,
      serviceId: ids.service,
      localDate: "2030-01-04",
      referenceNow,
      context: "PUBLIC",
    });
    assert.equal(publicBeyond.slots.length, 0);

    const anyStaffBeyond = await getAnyStaffAvailability({
      businessId: ids.business,
      serviceId: ids.service,
      localDate: "2030-01-04",
      referenceNow,
    });
    assert.equal(anyStaffBeyond.slots.length, 0);

    const internalBeyond = await getStaffAvailability({
      businessId: ids.business,
      staffId: ids.staff,
      serviceId: ids.service,
      localDate: "2030-01-04",
      referenceNow,
      context: "INTERNAL",
    });
    assert.ok(internalBeyond.slots.length > 0);
  });

  it("rejects manipulated public creation by lead or horizon while allowing the same internal slot", async () => {
    const target = futureUtc(30);
    await setPolicy({ maximumAdvanceBookingDays: 1 });

    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: ids.business,
        staffId: ids.staff,
        serviceId: ids.service,
        customerId: ids.customer,
        startAt: target.toISOString(),
        context: "PUBLIC",
      }),
      /Time slot not available/
    );

    await setPolicy({
      minimumBookingLeadMinutes: 525_600,
      maximumAdvanceBookingDays: null,
    });
    await assert.rejects(
      AppointmentService.createAppointment({
        businessId: ids.business,
        staffId: ids.staff,
        serviceId: ids.service,
        customerId: ids.customer,
        startAt: target.toISOString(),
        context: "PUBLIC",
      }),
      /Time slot not available/
    );

    const internal = await AppointmentService.createAppointment({
      businessId: ids.business,
      staffId: ids.staff,
      serviceId: ids.service,
      customerId: ids.customer,
      startAt: target.toISOString(),
      context: "INTERNAL",
      source: "MANUAL_ADMIN",
    });
    assert.equal(internal.startTime.toISOString(), target.toISOString());
  });

  it("re-reads cancellation policy at mutation time and preserves appointment history", async () => {
    const startTime = futureUtc(2);
    const appointment = await createAppointment(startTime);
    const token = await AppointmentAccessService.issue({
      businessId: ids.business,
      appointmentId: appointment.id,
    });
    const initialView = await AppointmentAccessService.resolve(token.rawToken);
    assert.equal(initialView.canCancel, true);

    await setPolicy({ cancellationNoticeMinutes: 4_320 });
    const currentView = await AppointmentAccessService.resolve(token.rawToken);
    assert.equal(currentView.canCancel, false);
    const result = await AppointmentAccessService.cancel(token.rawToken);
    assert.equal(result.outcome, "NOT_CANCELLABLE");

    const [stored] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.equal(stored.status, "CONFIRMED");
    assert.equal(stored.startTime.toISOString(), appointment.startTime.toISOString());
    assert.equal(stored.customerId, appointment.customerId);
    assert.equal(stored.serviceNameSnapshot, appointment.serviceNameSnapshot);
    assert.equal(
      await db
        .select()
        .from(schema.appointmentAccessTokens)
        .then((rows: any[]) => rows.length),
      1
    );
  });

  it("applies current reschedule notice plus lead/horizon to self-service targets", async () => {
    const referenceNow = futureUtc(0, 8);
    const startTime = futureUtc(5, 10);
    const appointment = await createAppointment(startTime);
    const token = await AppointmentAccessService.issue({
      businessId: ids.business,
      appointmentId: appointment.id,
    });

    assert.equal(
      (await AppointmentAccessService.resolve(token.rawToken, referenceNow))
        .canReschedule,
      true
    );

    await setPolicy({ rescheduleNoticeMinutes: 8_640 });
    assert.equal(
      (await AppointmentAccessService.resolve(token.rawToken, referenceNow))
        .canReschedule,
      false
    );
    const blockedByChangedPolicy = await AppointmentAccessService.reschedule(
      token.rawToken,
      futureUtc(1, 12).toISOString(),
      referenceNow
    );
    assert.equal(blockedByChangedPolicy.outcome, "NOT_RESCHEDULABLE");

    await setPolicy({
      rescheduleNoticeMinutes: 0,
      minimumBookingLeadMinutes: 120,
      maximumAdvanceBookingDays: 2,
    });
    const tooSoon = new Date(referenceNow.getTime() + 60 * 60_000);
    const tooFar = new Date(referenceNow.getTime() + 3 * 24 * 60 * 60_000);
    tooFar.setUTCHours(10, 0, 0, 0);

    for (const target of [tooSoon, tooFar]) {
      const result = await AppointmentAccessService.reschedule(
        token.rawToken,
        target.toISOString(),
        referenceNow
      );
      assert.equal(result.outcome, "SLOT_UNAVAILABLE");
      const [stored] = await db
        .select({ startTime: schema.appointments.startTime })
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointment.id));
      assert.equal(stored.startTime.toISOString(), startTime.toISOString());
    }
  });

  it("keeps nullable maximum advance behavior unlimited", async () => {
    const referenceNow = new Date("2030-01-01T08:00:00.000Z");
    const far = await getStaffAvailability({
      businessId: ids.business,
      staffId: ids.staff,
      serviceId: ids.service,
      localDate: "2031-01-01",
      referenceNow,
      context: "PUBLIC",
    });
    assert.ok(far.slots.length > 0);
  });

  it("does not apply public lead/horizon policy to authenticated internal reschedule", async () => {
    const appointment = await createAppointment(futureUtc(5, 10));
    await setPolicy({
      minimumBookingLeadMinutes: 525_600,
      maximumAdvanceBookingDays: 1,
      rescheduleNoticeMinutes: 525_600,
    });
    const target = futureUtc(30, 11);

    await AppointmentService.rescheduleAppointment({
      businessId: ids.business,
      appointmentId: appointment.id,
      newStartAt: target.toISOString(),
      expectedUpdatedAt: appointment.updatedAt.toISOString(),
      userId: ids.user,
      userRole: "OWNER",
    });

    const [stored] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.equal(stored.startTime.toISOString(), target.toISOString());
  });
});
