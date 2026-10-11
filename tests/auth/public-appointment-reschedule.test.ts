/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  ownerA: uuid(1),
  ownerB: uuid(2),
  businessA: uuid(10),
  businessB: uuid(11),
  memberA: uuid(20),
  memberB: uuid(21),
  memberAlt: uuid(22),
  staffA: uuid(30),
  staffB: uuid(31),
  staffAlt: uuid(32),
  serviceA: uuid(40),
  serviceB: uuid(41),
  customerA: uuid(50),
  customerB: uuid(51),
  customerAlt: uuid(52),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let AppointmentAccessService: any;
let AppointmentService: any;
let getStaffAvailability: any;
let canPubliclyRescheduleAppointment: any;
let getAppointmentRescheduleAvailabilityAction: any;
let rescheduleAppointmentAccessAction: any;

function futureAt(dayOffset: number, hour = 10, minute = 0): Date {
  const result = new Date();
  result.setUTCDate(result.getUTCDate() + dayOffset);
  result.setUTCHours(hour, minute, 0, 0);
  return result;
}

function localDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function createAppointment(input?: {
  businessId?: string;
  customerId?: string;
  staffId?: string;
  serviceId?: string;
  status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  startTime?: Date;
  durationMinutes?: number;
  source?: "PUBLIC_WEB" | "MANUAL_ADMIN";
}) {
  const startTime = input?.startTime ?? futureAt(10);
  const durationMinutes = input?.durationMinutes ?? 30;
  const [appointment] = await db
    .insert(schema.appointments)
    .values({
      businessId: input?.businessId ?? ids.businessA,
      customerId: input?.customerId ?? ids.customerA,
      staffId: input?.staffId ?? ids.staffA,
      serviceId: input?.serviceId ?? ids.serviceA,
      startTime,
      endTime: new Date(startTime.getTime() + durationMinutes * 60_000),
      status: input?.status ?? "CONFIRMED",
      source: input?.source ?? "PUBLIC_WEB",
      serviceNameSnapshot: "Snapshot Kesim",
      serviceDurationSnapshot: durationMinutes,
      servicePriceSnapshot: "450.00",
      cancellationReason: "değişmemeli",
      notes: "gizli iç not",
    })
    .returning();
  return appointment;
}

async function issue(appointment: any) {
  return AppointmentAccessService.issue({
    businessId: appointment.businessId,
    appointmentId: appointment.id,
  });
}

async function storedToken(rawToken: string) {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const [row] = await db
    .select()
    .from(schema.appointmentAccessTokens)
    .where(orm.eq(schema.appointmentAccessTokens.tokenHash, hash));
  return row;
}

function assertNoDatabaseInternals(values: unknown[]) {
  assert.doesNotMatch(
    JSON.stringify(values),
    /SQLSTATE|23\d{3}|constraint|duplicate key|postgres|drizzle|82000000-/i
  );
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  ({ AppointmentAccessService } = await import(
    "../../src/services/appointment-access.service"
  ));
  ({ AppointmentService } = await import(
    "../../src/services/appointment.service"
  ));
  ({ getStaffAvailability } = await import(
    "../../src/services/availability.service"
  ));
  ({ canPubliclyRescheduleAppointment } = await import(
    "../../src/lib/appointment-lifecycle"
  ));
  ({
    getAppointmentRescheduleAvailabilityAction,
    rescheduleAppointmentAccessAction,
  } = await import("../../src/actions/appointment-access.actions"));

  await db.insert(schema.users).values([
    {
      id: ids.ownerA,
      name: "Reschedule Owner A",
      email: "reschedule-owner-a@auth.test",
      emailVerified: true,
    },
    {
      id: ids.ownerB,
      name: "Reschedule Owner B",
      email: "reschedule-owner-b@auth.test",
      emailVerified: true,
    },
    {
      id: ids.memberAlt,
      name: "Alternate Staff",
      email: "reschedule-alt@auth.test",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "Güvenli Reschedule Berberi",
      slug: "guvenli-reschedule-berberi",
      timezone: "UTC",
      currency: "TRY",
      bookingIntervalMinutes: 30,
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Başka Reschedule Berberi",
      slug: "baska-reschedule-berberi",
      timezone: "UTC",
      currency: "TRY",
      bookingIntervalMinutes: 30,
      active: true,
      onboardingCompletedAt: new Date(),
    },
  ]);
  await db.insert(schema.businessMembers).values([
    {
      id: ids.memberA,
      businessId: ids.businessA,
      userId: ids.ownerA,
      role: "OWNER",
    },
    {
      id: ids.memberB,
      businessId: ids.businessB,
      userId: ids.ownerB,
      role: "OWNER",
    },
    {
      id: ids.memberAlt,
      businessId: ids.businessA,
      userId: ids.memberAlt,
      role: "STAFF",
    },
  ]);
  await db.insert(schema.staffProfiles).values([
    {
      id: ids.staffA,
      businessId: ids.businessA,
      businessMemberId: ids.memberA,
      firstName: "Ayşe",
      lastName: "Usta",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
    {
      id: ids.staffB,
      businessId: ids.businessB,
      businessMemberId: ids.memberB,
      firstName: "Başka",
      lastName: "Usta",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
    {
      id: ids.staffAlt,
      businessId: ids.businessA,
      businessMemberId: ids.memberAlt,
      firstName: "Alternatif",
      lastName: "Usta",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
  ]);
  await db.insert(schema.services).values([
    {
      id: ids.serviceA,
      businessId: ids.businessA,
      name: "Güncel Katalog Kesimi",
      durationMinutes: 60,
      price: "900.00",
      active: true,
    },
    {
      id: ids.serviceB,
      businessId: ids.businessB,
      name: "Başka Hizmet",
      durationMinutes: 30,
      price: "500.00",
      active: true,
    },
  ]);
  await db.insert(schema.staffServices).values([
    { businessId: ids.businessA, staffId: ids.staffA, serviceId: ids.serviceA },
    { businessId: ids.businessA, staffId: ids.staffAlt, serviceId: ids.serviceA },
    { businessId: ids.businessB, staffId: ids.staffB, serviceId: ids.serviceB },
  ]);
  await db.insert(schema.businessWorkingHours).values(
    [ids.businessA, ids.businessB].flatMap((businessId, businessIndex) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        id: uuid(100 + businessIndex * 10 + dayOfWeek),
        businessId,
        dayOfWeek,
        isClosed: false,
        startTime: "08:00:00",
        endTime: "20:00:00",
      }))
    )
  );
  await db.insert(schema.customers).values([
    {
      id: ids.customerA,
      businessId: ids.businessA,
      firstName: "Reschedule",
      lastName: "Müşterisi",
      phone: "+905551234101",
      normalizedPhone: "+905551234101",
    },
    {
      id: ids.customerAlt,
      businessId: ids.businessA,
      firstName: "Rakip",
      lastName: "Müşteri",
      phone: "+905551234102",
      normalizedPhone: "+905551234102",
    },
    {
      id: ids.customerB,
      businessId: ids.businessB,
      firstName: "Başka",
      lastName: "Müşteri",
      phone: "+905551234103",
      normalizedPhone: "+905551234103",
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

beforeEach(async () => {
  await db.delete(schema.appointmentAccessTokens);
  await db.delete(schema.appointments);
  await db.delete(schema.timeBlocks);
  await db.delete(schema.staffWorkingHours);
  await db
    .update(schema.businesses)
    .set({ active: true, onboardingCompletedAt: new Date() });
  await db
    .update(schema.businessMembers)
    .set({ active: true });
  await db
    .update(schema.staffProfiles)
    .set({ active: true, publicBookingEnabled: true, usesBusinessHours: true });
  await db.update(schema.services).set({ active: true, durationMinutes: 60 });
  await db.delete(schema.staffServices);
  await db.insert(schema.staffServices).values([
    { businessId: ids.businessA, staffId: ids.staffA, serviceId: ids.serviceA },
    { businessId: ids.businessA, staffId: ids.staffAlt, serviceId: ids.serviceA },
    { businessId: ids.businessB, staffId: ids.staffB, serviceId: ids.serviceB },
  ]);
  await db
    .update(schema.businessWorkingHours)
    .set({ isClosed: false, startTime: "08:00:00", endTime: "20:00:00" });
});

describe("TASK 014C public reschedule policy and availability", { concurrency: false }, () => {
  it("centralizes lifecycle, exact-start cutoff, and current public eligibility", () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const before = new Date(start.getTime() - 1);
    for (const status of ["PENDING", "CONFIRMED"] as const) {
      assert.deepEqual(
        canPubliclyRescheduleAppointment({
          status,
          startsAt: start,
          referenceNow: before,
          publicSchedulingEligible: true,
        }),
        { allowed: true }
      );
    }
    for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
      assert.equal(
        canPubliclyRescheduleAppointment({
          status,
          startsAt: start,
          referenceNow: before,
          publicSchedulingEligible: true,
        }).reason,
        "STATUS_NOT_RESCHEDULABLE"
      );
    }
    assert.equal(
      canPubliclyRescheduleAppointment({
        status: "CONFIRMED",
        startsAt: start,
        referenceNow: start,
        publicSchedulingEligible: true,
      }).reason,
      "TOO_LATE"
    );
    assert.equal(
      canPubliclyRescheduleAppointment({
        status: "CONFIRMED",
        startsAt: start,
        referenceNow: before,
        publicSchedulingEligible: false,
      }).reason,
      "PUBLIC_SCHEDULING_UNAVAILABLE"
    );
  });

  it("authorizes availability only by capability and never leaks tenant identifiers", async () => {
    const appointment = await createAppointment({ startTime: futureAt(10) });
    const token = await issue(appointment);
    const date = localDate(futureAt(11));
    const valid = await getAppointmentRescheduleAvailabilityAction(
      token.rawToken,
      date
    );
    assert.equal(valid.success, true);
    assert.ok(valid.data.slots.length > 0);
    assert.equal(valid.data.appointment.canReschedule, true);
    assertNoDatabaseInternals([valid]);

    for (const invalid of ["short", "x".repeat(43)]) {
      assert.deepEqual(
        await getAppointmentRescheduleAvailabilityAction(invalid, date),
        { success: false, type: "INVALID_CAPABILITY" }
      );
    }
    assert.equal(
      (
        await AppointmentAccessService.getRescheduleAvailability(
          token.rawToken,
          date,
          new Date(token.expiresAt.getTime() + 1)
        )
      ).outcome,
      "INVALID_CAPABILITY"
    );
    const revoked = await issue(appointment);
    await AppointmentAccessService.revoke(revoked.rawToken);
    assert.equal(
      (
        await AppointmentAccessService.getRescheduleAvailability(
          revoked.rawToken,
          date
        )
      ).outcome,
      "INVALID_CAPABILITY"
    );
  });

  it("uses fixed staff, snapshot duration, self-exclusion, other conflicts, and no arbitrary horizon", async () => {
    const current = await createAppointment({
      startTime: futureAt(12, 10),
      durationMinutes: 30,
    });
    const token = await issue(current);
    const targetDate = localDate(futureAt(12));
    const availability = await AppointmentAccessService.getRescheduleAvailability(
      token.rawToken,
      targetDate
    );
    assert.equal(availability.outcome, "AVAILABLE");
    assert.equal(
      availability.slots.some((slot: any) => slot.startAt === current.startTime.toISOString()),
      false,
      "unchanged current slot is excluded"
    );
    assert.equal(
      availability.slots.some((slot: any) => slot.localStartTime === "19:30"),
      true,
      "30-minute snapshot, not current 60-minute catalog duration, drives slots"
    );

    const blockedStart = futureAt(12, 13);
    await createAppointment({
      startTime: blockedStart,
      customerId: ids.customerAlt,
    });
    await createAppointment({
      startTime: futureAt(12, 14),
      customerId: ids.customerAlt,
      staffId: ids.staffAlt,
    });
    const afterConflict = await AppointmentAccessService.getRescheduleAvailability(
      token.rawToken,
      targetDate
    );
    assert.equal(afterConflict.outcome, "AVAILABLE");
    assert.equal(
      afterConflict.slots.some((slot: any) => slot.startAt === blockedStart.toISOString()),
      false,
      "other appointment on fixed current staff blocks"
    );

    const distant = localDate(futureAt(365));
    assert.equal(
      (
        await AppointmentAccessService.getRescheduleAvailability(
          token.rawToken,
          distant
        )
      ).outcome,
      "AVAILABLE"
    );
  });

  it("respects business/custom hours, time blocks, and past-slot filtering", async () => {
    const current = await createAppointment({ startTime: futureAt(14, 10) });
    const token = await issue(current);
    const target = futureAt(15, 0);
    const day = target.getUTCDay();
    const date = localDate(target);
    await db
      .update(schema.businessWorkingHours)
      .set({ startTime: "09:00:00", endTime: "12:00:00" })
      .where(
        orm.and(
          orm.eq(schema.businessWorkingHours.businessId, ids.businessA),
          orm.eq(schema.businessWorkingHours.dayOfWeek, day)
        )
      );
    await db.insert(schema.timeBlocks).values({
      businessId: ids.businessA,
      staffId: ids.staffA,
      blockType: "BREAK",
      startTime: futureAt(15, 10),
      endTime: futureAt(15, 11),
    });
    let result = await AppointmentAccessService.getRescheduleAvailability(
      token.rawToken,
      date
    );
    assert.equal(result.outcome, "AVAILABLE");
    assert.equal(result.slots.some((slot: any) => slot.localStartTime === "10:00"), false);
    assert.equal(result.slots.some((slot: any) => slot.localStartTime === "13:00"), false);

    await db
      .update(schema.staffProfiles)
      .set({ usesBusinessHours: false })
      .where(orm.eq(schema.staffProfiles.id, ids.staffA));
    await db.insert(schema.staffWorkingHours).values(
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        businessId: ids.businessA,
        staffId: ids.staffA,
        dayOfWeek,
        isWorking: true,
        startTime: "13:00:00",
        endTime: "15:00:00",
      }))
    );
    result = await AppointmentAccessService.getRescheduleAvailability(
      token.rawToken,
      date
    );
    assert.equal(result.outcome, "AVAILABLE");
    assert.ok(result.slots.every((slot: any) => slot.localStartTime >= "13:00"));

    const today = localDate(new Date());
    const referenceNow = new Date();
    referenceNow.setUTCHours(14, 0, 0, 0);
    const sameDay = await AppointmentAccessService.getRescheduleAvailability(
      token.rawToken,
      today,
      referenceNow
    );
    assert.equal(sameDay.outcome, "AVAILABLE");
    assert.ok(sameDay.slots.every((slot: any) => slot.localStartTime > "14:00"));
  });
});

describe("TASK 014C mutation and token behavior", { concurrency: false }, () => {
  it("reschedules date/time only, preserves snapshot duration, and recomputes management truth", async () => {
    const original = await createAppointment({
      status: "PENDING",
      startTime: futureAt(20, 10),
      durationMinutes: 30,
    });
    const token = await issue(original);
    const before = (await db.select().from(schema.appointments).where(
      orm.eq(schema.appointments.id, original.id)
    ))[0];
    const newStart = futureAt(21, 19, 30);
    const result = await AppointmentAccessService.reschedule(
      token.rawToken,
      newStart.toISOString()
    );
    assert.equal(result.outcome, "RESCHEDULED");
    assert.equal(result.appointment.status, "PENDING");
    assert.equal(result.appointment.localStartTime, "19:30");
    assert.equal(result.appointment.localEndTime, "20:00");
    assert.equal(result.appointment.canCancel, true);
    assert.equal(result.appointment.canReschedule, true);

    const [after] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, original.id));
    assert.equal(after.startTime.getTime(), newStart.getTime());
    assert.equal(after.endTime.getTime(), newStart.getTime() + 30 * 60_000);
    for (const key of [
      "businessId",
      "customerId",
      "staffId",
      "serviceId",
      "status",
      "source",
      "serviceNameSnapshot",
      "serviceDurationSnapshot",
      "servicePriceSnapshot",
      "cancellationReason",
      "notes",
    ] as const) {
      assert.deepEqual(after[key], before[key], `${key} changed unexpectedly`);
    }
  });

  it("keeps all tokens current, moves expiry later and earlier, and never revives revocation", async () => {
    const appointment = await createAppointment({ startTime: futureAt(25, 10) });
    const tokenA = await issue(appointment);
    const tokenB = await issue(appointment);
    const revoked = await issue(appointment);
    await AppointmentAccessService.revoke(revoked.rawToken);
    const revokedBefore = await storedToken(revoked.rawToken);

    const later = futureAt(27, 12);
    assert.equal(
      (await AppointmentAccessService.reschedule(tokenA.rawToken, later.toISOString())).outcome,
      "RESCHEDULED"
    );
    let rows = await db
      .select()
      .from(schema.appointmentAccessTokens)
      .where(orm.eq(schema.appointmentAccessTokens.appointmentId, appointment.id));
    const laterExpiry = new Date(later.getTime() + 30 * 60_000 + 24 * 60 * 60_000);
    assert.ok(rows.every((row: any) => row.expiresAt.getTime() === laterExpiry.getTime()));
    assert.equal(
      rows.find((row: any) => row.id === revokedBefore.id)?.revokedAt.getTime(),
      revokedBefore.revokedAt.getTime()
    );
    assert.equal(await AppointmentAccessService.resolve(revoked.rawToken), null);
    assert.equal((await AppointmentAccessService.resolve(tokenB.rawToken)).localStartTime, "12:00");

    const earlier = futureAt(26, 9);
    assert.equal(
      (await AppointmentAccessService.reschedule(tokenB.rawToken, earlier.toISOString())).outcome,
      "RESCHEDULED"
    );
    rows = await db
      .select()
      .from(schema.appointmentAccessTokens)
      .where(orm.eq(schema.appointmentAccessTokens.appointmentId, appointment.id));
    const earlierExpiry = new Date(earlier.getTime() + 30 * 60_000 + 24 * 60 * 60_000);
    assert.ok(rows.every((row: any) => row.expiresAt.getTime() === earlierExpiry.getTime()));
    assert.equal((await AppointmentAccessService.resolve(tokenA.rawToken)).localStartTime, "09:00");
  });

  it("rejects same-slot, taken-slot, stale lifecycle, and changed public eligibility without partial writes", async () => {
    const appointment = await createAppointment({ startTime: futureAt(30, 10) });
    const token = await issue(appointment);
    const same = await AppointmentAccessService.reschedule(
      token.rawToken,
      appointment.startTime.toISOString()
    );
    assert.equal(same.outcome, "UNCHANGED");

    const taken = futureAt(31, 13);
    const advisory = await AppointmentAccessService.getRescheduleAvailability(
      token.rawToken,
      localDate(taken)
    );
    assert.equal(advisory.outcome, "AVAILABLE");
    assert.ok(advisory.slots.some((slot: any) => slot.startAt === taken.toISOString()));
    await createAppointment({ startTime: taken, customerId: ids.customerAlt });
    assert.equal(
      (await AppointmentAccessService.reschedule(token.rawToken, taken.toISOString())).outcome,
      "SLOT_UNAVAILABLE"
    );
    let [stored] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.equal(stored.startTime.getTime(), appointment.startTime.getTime());

    await db
      .update(schema.appointments)
      .set({ status: "COMPLETED" })
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.equal(
      (await AppointmentAccessService.reschedule(token.rawToken, futureAt(32, 11).toISOString())).outcome,
      "NOT_RESCHEDULABLE"
    );

    for (const mutation of [
      async () => db.update(schema.businesses).set({ active: false }).where(orm.eq(schema.businesses.id, ids.businessA)),
      async () => db.update(schema.staffProfiles).set({ publicBookingEnabled: false }).where(orm.eq(schema.staffProfiles.id, ids.staffA)),
      async () => db.update(schema.services).set({ active: false }).where(orm.eq(schema.services.id, ids.serviceA)),
    ]) {
      await db.update(schema.appointments).set({ status: "CONFIRMED" }).where(orm.eq(schema.appointments.id, appointment.id));
      await db.update(schema.businesses).set({ active: true }).where(orm.eq(schema.businesses.id, ids.businessA));
      await db.update(schema.staffProfiles).set({ publicBookingEnabled: true }).where(orm.eq(schema.staffProfiles.id, ids.staffA));
      await db.update(schema.services).set({ active: true }).where(orm.eq(schema.services.id, ids.serviceA));
      await mutation();
      const result = await AppointmentAccessService.reschedule(
        token.rawToken,
        futureAt(33, 11).toISOString()
      );
      assert.equal(result.outcome, "ONLINE_UNAVAILABLE");
      stored = (await db.select().from(schema.appointments).where(
        orm.eq(schema.appointments.id, appointment.id)
      ))[0];
      assert.equal(stored.startTime.getTime(), appointment.startTime.getTime());
    }
  });

  it("releases the old slot, blocks the new slot, and cancellation uses the moved start", async () => {
    const oldStart = futureAt(36, 10);
    const newStart = futureAt(37, 14);
    const appointment = await createAppointment({ startTime: oldStart });
    const token = await issue(appointment);
    assert.equal(
      (await AppointmentAccessService.reschedule(token.rawToken, newStart.toISOString())).outcome,
      "RESCHEDULED"
    );

    const oldAvailability = await getStaffAvailability({
      businessId: ids.businessA,
      staffId: ids.staffA,
      serviceId: ids.serviceA,
      localDate: localDate(oldStart),
      serviceDurationMinutes: 30,
    });
    const newAvailability = await getStaffAvailability({
      businessId: ids.businessA,
      staffId: ids.staffA,
      serviceId: ids.serviceA,
      localDate: localDate(newStart),
      serviceDurationMinutes: 30,
    });
    assert.ok(oldAvailability.slots.some((slot: any) => slot.startAt === oldStart.toISOString()));
    assert.equal(newAvailability.slots.some((slot: any) => slot.startAt === newStart.toISOString()), false);

    const cancelled = await AppointmentAccessService.cancel(token.rawToken);
    assert.equal(cancelled.outcome, "CANCELLED");
    const [stored] = await db.select().from(schema.appointments).where(
      orm.eq(schema.appointments.id, appointment.id)
    );
    assert.equal(stored.status, "CANCELLED");
    assert.equal(stored.startTime.getTime(), newStart.getTime());
  });

  it("maps server actions to sanitized Turkish outcomes", async () => {
    const appointment = await createAppointment({ startTime: futureAt(40, 10) });
    const token = await issue(appointment);
    const success = await rescheduleAppointmentAccessAction(
      token.rawToken,
      futureAt(41, 11).toISOString()
    );
    assert.equal(success.success, true);
    assert.equal(success.message, "Randevunuz güncellendi.");
    const unchanged = await rescheduleAppointmentAccessAction(
      token.rawToken,
      futureAt(41, 11).toISOString()
    );
    assert.equal(unchanged.success, false);
    assert.equal(unchanged.type, "UNCHANGED");
    assert.deepEqual(await rescheduleAppointmentAccessAction("x".repeat(43), "bad"), {
      success: false,
      type: "INVALID_CAPABILITY",
    });
    assertNoDatabaseInternals([success, unchanged]);
  });
});

describe("TASK 014C concurrency hardening", { concurrency: false }, () => {
  it("keeps 10/10 public double submissions coherent", async () => {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const appointment = await createAppointment({ startTime: futureAt(50 + iteration, 9) });
      const token = await issue(appointment);
      const target = futureAt(50 + iteration, 11);
      const results = await Promise.all([
        AppointmentAccessService.reschedule(token.rawToken, target.toISOString()),
        AppointmentAccessService.reschedule(token.rawToken, target.toISOString()),
      ]);
      assert.equal(results.filter((result: any) => result.outcome === "RESCHEDULED").length, 1);
      assert.equal(results.filter((result: any) => result.outcome === "UNCHANGED").length, 1);
      const [stored] = await db.select().from(schema.appointments).where(
        orm.eq(schema.appointments.id, appointment.id)
      );
      assert.equal(stored.startTime.getTime(), target.getTime());
      assert.equal(stored.endTime.getTime(), target.getTime() + 30 * 60_000);
    }
  });

  it("allows exactly one winner in 10/10 public-reschedule vs normal-booking races", async () => {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const original = await createAppointment({ startTime: futureAt(70 + iteration, 9) });
      const token = await issue(original);
      const target = futureAt(70 + iteration, 13);
      const results = await Promise.allSettled([
        AppointmentAccessService.reschedule(token.rawToken, target.toISOString()),
        AppointmentService.createAppointment({
          businessId: ids.businessA,
          staffId: ids.staffA,
          serviceId: ids.serviceA,
          startAt: target.toISOString(),
          customerId: ids.customerAlt,
          context: "INTERNAL",
          source: "MANUAL_ADMIN",
        }),
      ]);
      const publicWon =
        results[0].status === "fulfilled" &&
        results[0].value.outcome === "RESCHEDULED";
      const bookingWon = results[1].status === "fulfilled";
      assert.notEqual(publicWon, bookingWon);
      const blockers = await db
        .select()
        .from(schema.appointments)
        .where(
          orm.and(
            orm.eq(schema.appointments.staffId, ids.staffA),
            orm.eq(schema.appointments.startTime, target),
            orm.ne(schema.appointments.status, "CANCELLED")
          )
        );
      assert.equal(blockers.length, 1);
      assertNoDatabaseInternals(
        results
          .filter((result) => result.status === "rejected")
          .map((result) => String(result.reason))
      );
    }
  });

  it("serializes public reschedules to different targets without a mixed schedule", async () => {
    const appointment = await createAppointment({ startTime: futureAt(85, 9) });
    const tokenA = await issue(appointment);
    const tokenB = await issue(appointment);
    const targetA = futureAt(85, 12);
    const targetB = futureAt(85, 15);

    const results = await Promise.all([
      AppointmentAccessService.reschedule(tokenA.rawToken, targetA.toISOString()),
      AppointmentAccessService.reschedule(tokenB.rawToken, targetB.toISOString()),
    ]);
    assert.ok(results.every((result: any) => result.outcome === "RESCHEDULED"));

    const [stored] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.ok(
      stored.startTime.getTime() === targetA.getTime() ||
        stored.startTime.getTime() === targetB.getTime()
    );
    assert.equal(stored.endTime.getTime(), stored.startTime.getTime() + 30 * 60_000);
    const expectedLocalTime = stored.startTime.toISOString().slice(11, 16);
    assert.equal(
      (await AppointmentAccessService.resolve(tokenA.rawToken)).localStartTime,
      expectedLocalTime
    );
    assert.equal(
      (await AppointmentAccessService.resolve(tokenB.rawToken)).localStartTime,
      expectedLocalTime
    );
  });

  it("keeps 5/5 public-reschedule vs cancellation races non-resurrecting", async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const appointment = await createAppointment({ startTime: futureAt(90 + iteration, 9) });
      const token = await issue(appointment);
      const target = futureAt(90 + iteration, 12);
      const results = await Promise.allSettled([
        AppointmentAccessService.reschedule(token.rawToken, target.toISOString()),
        AppointmentAccessService.cancel(token.rawToken),
      ]);
      const [stored] = await db.select().from(schema.appointments).where(
        orm.eq(schema.appointments.id, appointment.id)
      );
      assert.equal(stored.status, "CANCELLED");
      assert.ok(
        stored.startTime.getTime() === appointment.startTime.getTime() ||
          stored.startTime.getTime() === target.getTime()
      );
      assert.equal(stored.endTime.getTime(), stored.startTime.getTime() + 30 * 60_000);
      assertNoDatabaseInternals(results.map((result) =>
        result.status === "fulfilled" ? result.value : String(result.reason)
      ));
    }
  });

  it("keeps 5/5 public vs internal reschedules coherent", async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const appointment = await createAppointment({ startTime: futureAt(105 + iteration, 9) });
      const token = await issue(appointment);
      const publicTarget = futureAt(105 + iteration, 12);
      const internalTarget = futureAt(105 + iteration, 15);
      const results = await Promise.allSettled([
        AppointmentAccessService.reschedule(token.rawToken, publicTarget.toISOString()),
        AppointmentService.rescheduleAppointment({
          businessId: ids.businessA,
          appointmentId: appointment.id,
          newStartAt: internalTarget.toISOString(),
          expectedUpdatedAt: appointment.updatedAt.toISOString(),
          userId: ids.ownerA,
          userRole: "OWNER",
        }),
      ]);
      const [stored] = await db.select().from(schema.appointments).where(
        orm.eq(schema.appointments.id, appointment.id)
      );
      assert.ok(
        stored.startTime.getTime() === publicTarget.getTime() ||
          stored.startTime.getTime() === internalTarget.getTime()
      );
      assert.equal(stored.endTime.getTime(), stored.startTime.getTime() + 30 * 60_000);
      assertNoDatabaseInternals(results.map((result) =>
        result.status === "fulfilled" ? result.value : String(result.reason)
      ));
    }
  });
});

describe("TASK 014C management UX contract", () => {
  it("uses explicit accessible selection/review and exposes no switching or secret identifiers", async () => {
    const source = await readFile(
      path.resolve("src/app/(public)/randevu/appointment-management-client.tsx"),
      "utf8"
    );
    const actionSource = await readFile(
      path.resolve("src/actions/appointment-access.actions.ts"),
      "utf8"
    );
    assert.match(source, /Randevu Saatini Değiştir/);
    assert.match(source, /Mevcut Randevu/);
    assert.match(source, /Yeni Randevu/);
    assert.match(source, /aria-pressed/);
    assert.match(source, /reschedule-confirmation/);
    assert.match(source, /Randevu Değiştiriliyor\.\.\./);
    assert.match(actionSource, /Randevunuz güncellendi\./);
    assert.doesNotMatch(source, /Personel Seç|Hizmet Seç|appointmentId|businessId|serviceId|staffId/);
  });
});
