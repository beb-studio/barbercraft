/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `81000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  ownerA: uuid(1),
  ownerB: uuid(2),
  businessA: uuid(10),
  businessB: uuid(11),
  memberA: uuid(20),
  memberB: uuid(21),
  staffA: uuid(30),
  staffB: uuid(31),
  serviceA: uuid(40),
  serviceB: uuid(41),
  customerA: uuid(50),
  customerB: uuid(51),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let AppointmentAccessService: any;
let AppointmentService: any;
let getStaffAvailability: any;
let canPubliclyCancelAppointment: any;
let DEFAULT_BUSINESS_BOOKING_POLICY: any;
let cancelAppointmentAccessAction: any;

function futureAt(dayOffset: number, hour = 10): Date {
  const result = new Date();
  result.setUTCDate(result.getUTCDate() + dayOffset);
  result.setUTCHours(hour, 0, 0, 0);
  return result;
}

async function createAppointment(input?: {
  businessId?: string;
  customerId?: string;
  staffId?: string;
  serviceId?: string;
  status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  startTime?: Date;
}) {
  const startTime = input?.startTime ?? futureAt(7);
  const [appointment] = await db
    .insert(schema.appointments)
    .values({
      businessId: input?.businessId ?? ids.businessA,
      customerId: input?.customerId ?? ids.customerA,
      staffId: input?.staffId ?? ids.staffA,
      serviceId: input?.serviceId ?? ids.serviceA,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: input?.status ?? "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Güvenli Kesim",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "450.00",
      notes: "Değişmemesi gereken iç not",
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

function assertNoDatabaseInternals(results: PromiseSettledResult<unknown>[]) {
  for (const result of results) {
    if (result.status === "rejected") {
      assert.doesNotMatch(
        String(result.reason?.message ?? result.reason),
        /SQLSTATE|23\d{3}|constraint|duplicate key|postgres|drizzle/i
      );
    }
  }
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
  ({ canPubliclyCancelAppointment } = await import(
    "../../src/lib/appointment-lifecycle"
  ));
  ({ DEFAULT_BUSINESS_BOOKING_POLICY } = await import(
    "../../src/lib/business-booking-policy"
  ));
  ({ cancelAppointmentAccessAction } = await import(
    "../../src/actions/appointment-access.actions"
  ));

  await db.insert(schema.users).values([
    {
      id: ids.ownerA,
      name: "İptal Owner A",
      email: "cancel-owner-a@auth.test",
      emailVerified: true,
    },
    {
      id: ids.ownerB,
      name: "İptal Owner B",
      email: "cancel-owner-b@auth.test",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "İptal Berberi",
      slug: "iptal-berberi",
      timezone: "UTC",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Başka İptal Berberi",
      slug: "baska-iptal-berberi",
      timezone: "UTC",
      currency: "TRY",
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
  ]);
  await db.insert(schema.services).values([
    {
      id: ids.serviceA,
      businessId: ids.businessA,
      name: "Güvenli Kesim",
      durationMinutes: 30,
      price: "450.00",
      active: true,
    },
    {
      id: ids.serviceB,
      businessId: ids.businessB,
      name: "Başka Kesim",
      durationMinutes: 30,
      price: "550.00",
      active: true,
    },
  ]);
  await db.insert(schema.staffServices).values([
    { businessId: ids.businessA, staffId: ids.staffA, serviceId: ids.serviceA },
    { businessId: ids.businessB, staffId: ids.staffB, serviceId: ids.serviceB },
  ]);
  await db.insert(schema.businessWorkingHours).values(
    [ids.businessA, ids.businessB].flatMap((businessId, businessIndex) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        id: uuid(100 + businessIndex * 10 + dayOfWeek),
        businessId,
        dayOfWeek,
        isClosed: false,
        startTime: "00:00:00",
        endTime: "23:59:00",
      }))
    )
  );
  await db.insert(schema.customers).values([
    {
      id: ids.customerA,
      businessId: ids.businessA,
      firstName: "İptal",
      lastName: "Müşterisi",
      phone: "+905551234001",
      normalizedPhone: "+905551234001",
    },
    {
      id: ids.customerB,
      businessId: ids.businessB,
      firstName: "Başka",
      lastName: "Müşteri",
      phone: "+905551234002",
      normalizedPhone: "+905551234002",
    },
  ]);
  await db.insert(schema.customerNotes).values({
    businessId: ids.businessA,
    customerId: ids.customerA,
    content: "Tarihsel CRM notu",
    createdByBusinessMemberId: ids.memberA,
  });
});

after(async () => {
  await pgServer?.stop();
});

beforeEach(async () => {
  await db.delete(schema.appointmentAccessTokens);
  await db.delete(schema.appointments);
});

describe("TASK 014B public cancellation policy and capability", { concurrency: false }, () => {
  it("centralizes allowed statuses and the exact before-start cutoff", () => {
    const start = new Date("2030-01-01T10:00:00.000Z");
    const before = new Date(start.getTime() - 1);

    assert.deepEqual(
      canPubliclyCancelAppointment({ status: "PENDING", startsAt: start, referenceNow: before, policy: DEFAULT_BUSINESS_BOOKING_POLICY }),
      { allowed: true }
    );
    assert.deepEqual(
      canPubliclyCancelAppointment({ status: "CONFIRMED", startsAt: start, referenceNow: before, policy: DEFAULT_BUSINESS_BOOKING_POLICY }),
      { allowed: true }
    );
    assert.equal(
      canPubliclyCancelAppointment({ status: "CANCELLED", startsAt: start, referenceNow: before, policy: DEFAULT_BUSINESS_BOOKING_POLICY }).reason,
      "ALREADY_CANCELLED"
    );
    for (const status of ["COMPLETED", "NO_SHOW"] as const) {
      assert.equal(
        canPubliclyCancelAppointment({ status, startsAt: start, referenceNow: before, policy: DEFAULT_BUSINESS_BOOKING_POLICY }).reason,
        "STATUS_NOT_CANCELLABLE"
      );
    }
    assert.equal(
      canPubliclyCancelAppointment({ status: "CONFIRMED", startsAt: start, referenceNow: start, policy: DEFAULT_BUSINESS_BOOKING_POLICY }).reason,
      "TOO_LATE"
    );
    assert.equal(
      canPubliclyCancelAppointment({
        status: "PENDING",
        startsAt: start,
        referenceNow: new Date(start.getTime() + 1),
        policy: DEFAULT_BUSINESS_BOOKING_POLICY,
      }).reason,
      "TOO_LATE"
    );
  });

  it("cancels both PENDING and CONFIRMED future appointments", async () => {
    for (const [index, status] of ["PENDING", "CONFIRMED"].entries()) {
      const appointment = await createAppointment({
        status: status as "PENDING" | "CONFIRMED",
        startTime: futureAt(7 + index),
      });
      const token = await issue(appointment);
      const result = await AppointmentAccessService.cancel(token.rawToken);
      assert.equal(result.outcome, "CANCELLED");
      assert.equal(result.changed, true);
    }
  });

  it("returns one generic invalid outcome for malformed, unknown, expired, and revoked capabilities", async () => {
    assert.deepEqual(await AppointmentAccessService.cancel("short"), {
      outcome: "INVALID_CAPABILITY",
    });
    assert.deepEqual(await AppointmentAccessService.cancel("x".repeat(43)), {
      outcome: "INVALID_CAPABILITY",
    });

    const appointment = await createAppointment();
    const expired = await issue(appointment);
    assert.equal(
      (
        await AppointmentAccessService.cancel(
          expired.rawToken,
          new Date(expired.expiresAt.getTime() + 1)
        )
      ).outcome,
      "INVALID_CAPABILITY"
    );

    const revoked = await issue(appointment);
    assert.equal(await AppointmentAccessService.revoke(revoked.rawToken), true);
    assert.equal(
      (await AppointmentAccessService.cancel(revoked.rawToken)).outcome,
      "INVALID_CAPABILITY"
    );
  });

  it("mutates only status/audit time and retains the row, history, snapshots, and all active tokens", async () => {
    const appointment = await createAppointment();
    const first = await issue(appointment);
    const second = await issue(appointment);
    const [before] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    const notesBefore = await db.select().from(schema.customerNotes);
    const customersBefore = await db.select().from(schema.customers);

    const result = await AppointmentAccessService.cancel(first.rawToken);
    assert.equal(result.outcome, "CANCELLED");
    assert.equal(result.changed, true);
    assert.equal(result.appointment.status, "CANCELLED");
    assert.equal(result.appointment.canCancel, false);

    const rows = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.equal(rows.length, 1);
    const after = rows[0];
    assert.equal(after.status, "CANCELLED");
    for (const key of [
      "businessId",
      "customerId",
      "staffId",
      "serviceId",
      "startTime",
      "endTime",
      "serviceNameSnapshot",
      "serviceDurationSnapshot",
      "servicePriceSnapshot",
      "cancellationReason",
      "notes",
    ] as const) {
      assert.deepEqual(after[key], before[key], `${key} must remain unchanged`);
    }
    assert.ok(after.updatedAt.getTime() >= before.updatedAt.getTime());
    assert.deepEqual(await db.select().from(schema.customerNotes), notesBefore);
    assert.deepEqual(await db.select().from(schema.customers), customersBefore);

    for (const rawToken of [first.rawToken, second.rawToken]) {
      const resolved = await AppointmentAccessService.resolve(rawToken);
      assert.equal(resolved.status, "CANCELLED");
      assert.equal(resolved.canCancel, false);
    }

    const repeated = await AppointmentAccessService.cancel(second.rawToken);
    assert.equal(repeated.outcome, "CANCELLED");
    assert.equal(repeated.changed, false);
  });

  it("a capability affects only its bound appointment and tenant", async () => {
    const own = await createAppointment({ startTime: futureAt(7, 9) });
    const sameTenantOther = await createAppointment({ startTime: futureAt(7, 11) });
    const crossTenant = await createAppointment({
      businessId: ids.businessB,
      customerId: ids.customerB,
      staffId: ids.staffB,
      serviceId: ids.serviceB,
      startTime: futureAt(7, 13),
    });
    const token = await issue(own);

    assert.equal((await AppointmentAccessService.cancel(token.rawToken)).outcome, "CANCELLED");
    const current = await db
      .select({ id: schema.appointments.id, status: schema.appointments.status })
      .from(schema.appointments);
    assert.equal(current.find((row: any) => row.id === own.id)?.status, "CANCELLED");
    assert.equal(current.find((row: any) => row.id === sameTenantOther.id)?.status, "CONFIRMED");
    assert.equal(current.find((row: any) => row.id === crossTenant.id)?.status, "CONFIRMED");
  });

  it("returns sanitized action success, stale-ineligible truth, and invalid capability outcomes", async () => {
    const cancellable = await createAppointment({ status: "PENDING" });
    const cancellableToken = await issue(cancellable);
    const success = await cancelAppointmentAccessAction(cancellableToken.rawToken);
    assert.deepEqual(
      {
        success: success.success,
        message: success.success ? success.message : null,
        status: success.success ? success.data.status : null,
      },
      {
        success: true,
        message: "Randevunuz iptal edildi.",
        status: "CANCELLED",
      }
    );

    const completed = await createAppointment({ status: "COMPLETED", startTime: futureAt(8) });
    const completedToken = await issue(completed);
    const stale = await cancelAppointmentAccessAction(completedToken.rawToken);
    assert.equal(stale.success, false);
    assert.equal(stale.type, "NOT_CANCELLABLE");
    assert.equal(stale.message, "Bu randevu artık iptal edilemiyor.");
    assert.equal(stale.data.canCancel, false);

    const invalid = await cancelAppointmentAccessAction("x".repeat(43));
    assert.deepEqual(invalid, { success: false, type: "INVALID_CAPABILITY" });
    assert.doesNotMatch(JSON.stringify([success, stale, invalid]), /SQLSTATE|constraint|stack|81000000-/i);
  });

  it("releases the cancelled slot through the existing availability engine", async () => {
    const startTime = futureAt(12, 10);
    const appointment = await createAppointment({ startTime });
    const token = await issue(appointment);
    const localDate = startTime.toISOString().slice(0, 10);
    const referenceNow = futureAt(2, 0);

    const before = await getStaffAvailability({
      businessId: ids.businessA,
      staffId: ids.staffA,
      serviceId: ids.serviceA,
      localDate,
      referenceNow,
    });
    assert.equal(before.slots.some((slot: any) => slot.startAt === startTime.toISOString()), false);

    assert.equal((await AppointmentAccessService.cancel(token.rawToken)).outcome, "CANCELLED");
    const after = await getStaffAvailability({
      businessId: ids.businessA,
      staffId: ids.staffA,
      serviceId: ids.serviceA,
      localDate,
      referenceNow,
    });
    assert.equal(after.slots.some((slot: any) => slot.startAt === startTime.toISOString()), true);

    const replacement = await AppointmentService.createAppointment({
      businessId: ids.businessA,
      staffId: ids.staffA,
      serviceId: ids.serviceA,
      startAt: startTime.toISOString(),
      customerId: ids.customerA,
      context: "INTERNAL",
      source: "MANUAL_ADMIN",
    });
    assert.equal(replacement.status, "CONFIRMED");
  });
});

describe("TASK 014B cancellation concurrency hardening", { concurrency: false }, () => {
  it("keeps 10/10 rapid double submissions coherent and idempotent", async () => {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const appointment = await createAppointment({
        startTime: futureAt(20 + iteration, 10),
      });
      const token = await issue(appointment);
      const results = await Promise.all([
        AppointmentAccessService.cancel(token.rawToken),
        AppointmentAccessService.cancel(token.rawToken),
      ]);

      assert.deepEqual(results.map((result: any) => result.outcome), [
        "CANCELLED",
        "CANCELLED",
      ]);
      assert.equal(results.filter((result: any) => result.changed).length, 1);
      const [stored] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointment.id));
      assert.equal(stored.status, "CANCELLED");
    }
  });

  it("serializes public cancellation against staff COMPLETE and NO_SHOW", async () => {
    for (const targetStatus of ["COMPLETED", "NO_SHOW"] as const) {
      const startTime = futureAt(targetStatus === "COMPLETED" ? 17 : 18);
      const appointment = await createAppointment({ startTime });
      const token = await issue(appointment);
      const results = await Promise.allSettled([
        AppointmentAccessService.cancel(token.rawToken),
        AppointmentService.updateAppointmentStatus(
          ids.businessA,
          appointment.id,
          targetStatus,
          "OWNER",
          ids.ownerA
        ),
      ]);
      assertNoDatabaseInternals(results);

      const [stored] = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointment.id));
      assert.ok(
        stored.status === "CANCELLED" || stored.status === targetStatus,
        `unexpected final status ${stored.status}`
      );

      if (stored.status === "CANCELLED") {
        assert.equal(results[0].status, "fulfilled");
        assert.equal(
          (results[0] as PromiseFulfilledResult<any>).value.outcome,
          "CANCELLED"
        );
        assert.equal(results[1].status, "rejected");
      } else {
        assert.equal(results[1].status, "fulfilled");
        assert.equal(results[0].status, "fulfilled");
        assert.equal(
          (results[0] as PromiseFulfilledResult<any>).value.outcome,
          "NOT_CANCELLABLE"
        );
      }
    }
  });

  it("serializes public and staff cancellation without a duplicate mutation", async () => {
    const appointment = await createAppointment({ startTime: futureAt(15) });
    const token = await issue(appointment);
    const results = await Promise.allSettled([
      AppointmentAccessService.cancel(token.rawToken),
      AppointmentService.updateAppointmentStatus(
        ids.businessA,
        appointment.id,
        "CANCELLED",
        "OWNER",
        ids.ownerA
      ),
    ]);
    assertNoDatabaseInternals(results);

    const rows = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, appointment.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "CANCELLED");
    assert.equal((await AppointmentAccessService.resolve(token.rawToken)).status, "CANCELLED");
  });

  it("keeps 5/5 cancellation-vs-reschedule races coherent with no resurrection", async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const startTime = futureAt(35 + iteration, 10);
      const appointment = await createAppointment({ startTime });
      const token = await issue(appointment);
      const newStart = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      const results = await Promise.allSettled([
        AppointmentAccessService.cancel(token.rawToken),
        AppointmentService.rescheduleAppointment({
          businessId: ids.businessA,
          appointmentId: appointment.id,
          newStartAt: newStart.toISOString(),
          expectedUpdatedAt: appointment.updatedAt.toISOString(),
          userId: ids.ownerA,
          userRole: "OWNER",
        }),
      ]);
      assertNoDatabaseInternals(results);
      assert.equal(results[0].status, "fulfilled");
      assert.equal((results[0] as PromiseFulfilledResult<any>).value.outcome, "CANCELLED");

      const rows = await db
        .select()
        .from(schema.appointments)
        .where(orm.eq(schema.appointments.id, appointment.id));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "CANCELLED");
      assert.ok(
        rows[0].startTime.getTime() === startTime.getTime() ||
          rows[0].startTime.getTime() === newStart.getTime()
      );
      assert.equal(rows[0].endTime.getTime(), rows[0].startTime.getTime() + 30 * 60 * 1000);
    }
  });
});

describe("TASK 014B management UX contract", () => {
  it("uses an accessible deliberate confirmation and contains no reason or public reschedule controls", async () => {
    const source = await readFile(
      path.resolve("src/app/(public)/randevu/appointment-management-client.tsx"),
      "utf8"
    );
    const actionSource = await readFile(
      path.resolve("src/actions/appointment-access.actions.ts"),
      "utf8"
    );
    assert.match(source, /AlertDialog\.Root/);
    assert.match(source, /Randevuyu İptal Et/);
    assert.match(source, /Vazgeç/);
    assert.match(source, /İptal Ediliyor\.\.\./);
    assert.match(source, /aria-busy/);
    assert.match(source, /appointment\.canCancel/);
    assert.match(actionSource, /Randevunuz iptal edildi\./);
    assert.doesNotMatch(source, /cancellationReason|textarea/);
  });
});
