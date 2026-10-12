/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `93000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  user: uuid(1),
  userB: uuid(2),
  business: uuid(10),
  member: uuid(20),
  memberB: uuid(21),
  staffA: uuid(30),
  staffB: uuid(31),
  service: uuid(40),
  seedCustomer: uuid(50),
};

let server: any;
let db: any;
let schema: any;
let orm: any;
let AppointmentService: any;
let AppointmentAccessService: any;
let NotificationOutboxService: any;
let NotificationOutboxError: any;

function at(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2030, 0, day, hour, minute, 0, 0));
}

async function directAppointment(input?: {
  startTime?: Date;
  status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  notes?: string;
}) {
  const startTime = input?.startTime ?? at(20, 10);
  const [row] = await db
    .insert(schema.appointments)
    .values({
      businessId: ids.business,
      customerId: ids.seedCustomer,
      staffId: ids.staffA,
      serviceId: ids.service,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60_000),
      status: input?.status ?? "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Bildirim Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "500.00",
      notes: input?.notes ?? "Gizli iç randevu notu",
    })
    .returning();
  return row;
}

async function eventsFor(appointmentId: string) {
  return db
    .select()
    .from(schema.notificationOutbox)
    .where(orm.eq(schema.notificationOutbox.appointmentId, appointmentId))
    .orderBy(schema.notificationOutbox.createdAt);
}

async function installFailingOutboxTrigger() {
  await db.execute(`
    CREATE OR REPLACE FUNCTION task_016_fail_outbox_insert()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'forced outbox failure';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER task_016_fail_outbox_insert_trigger
    BEFORE INSERT ON notification_outbox
    FOR EACH ROW EXECUTE FUNCTION task_016_fail_outbox_insert();
  `);
}

async function removeFailingOutboxTrigger() {
  await db.execute(`
    DROP TRIGGER IF EXISTS task_016_fail_outbox_insert_trigger ON notification_outbox;
    DROP FUNCTION IF EXISTS task_016_fail_outbox_insert();
  `);
}

before(async () => {
  server = await startDatabase();
  process.env.DATABASE_URL = server.connectionString;
  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  ({ AppointmentService } = await import(
    "../../src/services/appointment.service"
  ));
  ({ AppointmentAccessService } = await import(
    "../../src/services/appointment-access.service"
  ));
  ({ NotificationOutboxService, NotificationOutboxError } = await import(
    "../../src/services/notification-outbox.service"
  ));

  await db.insert(schema.users).values([
    {
      id: ids.user,
      name: "Bildirim Sahibi",
      email: "notification-owner@auth.test",
      emailVerified: true,
    },
    {
      id: ids.userB,
      name: "Bildirim Personeli",
      email: "notification-staff@auth.test",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.businesses).values({
    id: ids.business,
    name: "Bildirim Berberi",
    slug: "bildirim-berberi",
    timezone: "UTC",
    currency: "TRY",
    bookingIntervalMinutes: 15,
    active: true,
    onboardingCompletedAt: new Date(),
  });
  await db.insert(schema.businessMembers).values([
    {
      id: ids.member,
      businessId: ids.business,
      userId: ids.user,
      role: "OWNER",
    },
    {
      id: ids.memberB,
      businessId: ids.business,
      userId: ids.userB,
      role: "STAFF",
    },
  ]);
  await db.insert(schema.staffProfiles).values([
    {
      id: ids.staffA,
      businessId: ids.business,
      businessMemberId: ids.memberB,
      firstName: "Usta",
      lastName: "A",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
    {
      id: ids.staffB,
      businessId: ids.business,
      businessMemberId: ids.member,
      firstName: "Usta",
      lastName: "B",
      active: true,
      publicBookingEnabled: true,
      usesBusinessHours: true,
    },
  ]);
  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.business,
    name: "Bildirim Kesimi",
    durationMinutes: 30,
    price: "500.00",
    active: true,
  });
  await db.insert(schema.staffServices).values([
    { businessId: ids.business, staffId: ids.staffA, serviceId: ids.service },
    { businessId: ids.business, staffId: ids.staffB, serviceId: ids.service },
  ]);
  await db.insert(schema.businessWorkingHours).values(
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      businessId: ids.business,
      dayOfWeek,
      isClosed: false,
      startTime: "00:00",
      endTime: "23:59",
    }))
  );
  await db.insert(schema.customers).values({
    id: ids.seedCustomer,
    businessId: ids.business,
    firstName: "Bildirim",
    lastName: "Müşterisi",
    phone: "+905550016000",
    normalizedPhone: "+905550016000",
    phoneComparisonKey: "5550016000",
    notes: "Gizli CRM notu",
  });
});

after(async () => {
  await removeFailingOutboxTrigger().catch(() => undefined);
  await server?.stop();
});

describe("Durable appointment notification outbox", { concurrency: false }, () => {
  it("emits exactly one versioned creation event for specific staff", async () => {
    const appointment = await AppointmentService.createAppointment({
      businessId: ids.business,
      staffId: ids.staffA,
      serviceId: ids.service,
      startAt: at(2, 10).toISOString(),
      customer: { firstName: "Belirli", phone: "+905550016101" },
      context: "PUBLIC",
      issueManagementAccess: true,
    });
    const events = await eventsFor(appointment.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, "APPOINTMENT_CREATED");
    assert.equal(events[0].payloadVersion, 1);
    assert.deepEqual(events[0].payload, {
      startAt: appointment.startTime.toISOString(),
      endAt: appointment.endTime.toISOString(),
      status: "CONFIRMED",
    });
    assert.equal(events[0].idempotencyKey.length, 64);
  });

  it("emits creation events for Fark Etmez and manual creation", async () => {
    const any = await AppointmentService.createAnyStaffAppointment({
      businessId: ids.business,
      candidateStaffIds: [ids.staffB, ids.staffA],
      serviceId: ids.service,
      startAt: at(3, 11).toISOString(),
      customer: { firstName: "Fark Etmez", phone: "+905550016102" },
      context: "PUBLIC",
    });
    const manual = await AppointmentService.createAppointment({
      businessId: ids.business,
      staffId: ids.staffA,
      serviceId: ids.service,
      startAt: at(4, 12).toISOString(),
      customer: { firstName: "Manuel", phone: "+905550016103" },
      context: "INTERNAL",
      source: "MANUAL_ADMIN",
    });
    assert.equal((await eventsFor(any.appointment.id)).length, 1);
    assert.equal((await eventsFor(manual.id)).length, 1);
  });

  it("stores no raw capability, URL, internal note, CRM note, or recipient snapshot", async () => {
    const appointment = await AppointmentService.createAppointment({
      businessId: ids.business,
      staffId: ids.staffA,
      serviceId: ids.service,
      startAt: at(5, 13).toISOString(),
      customerId: ids.seedCustomer,
      notes: "Gizli iç randevu notu",
      context: "PUBLIC",
      issueManagementAccess: true,
    });
    assert.ok(appointment.managementToken);
    const [event] = await eventsFor(appointment.id);
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, new RegExp(appointment.managementToken));
    assert.doesNotMatch(serialized, /\/randevu#|Gizli iç randevu notu|Gizli CRM notu/);
    assert.equal("phone" in event.payload, false);
    assert.equal("customer" in event.payload, false);
  });

  it("emits internal reschedule history, skips no-op, and distinguishes later mutations", async () => {
    const appointment = await directAppointment({ startTime: at(6, 10) });
    const unchanged = await AppointmentService.rescheduleAppointment({
      businessId: ids.business,
      appointmentId: appointment.id,
      newStartAt: appointment.startTime.toISOString(),
      expectedUpdatedAt: appointment.updatedAt.toISOString(),
      userId: ids.user,
      userRole: "OWNER",
    });
    assert.equal(unchanged.reason, "NO_CHANGE");
    assert.equal((await eventsFor(appointment.id)).length, 0);

    await AppointmentService.rescheduleAppointment({
      businessId: ids.business,
      appointmentId: appointment.id,
      newStartAt: at(6, 11).toISOString(),
      expectedUpdatedAt: appointment.updatedAt.toISOString(),
      userId: ids.user,
      userRole: "OWNER",
    });
    const current = await db.query.appointments.findFirst({
      where: orm.eq(schema.appointments.id, appointment.id),
    });
    assert.ok(current);
    await AppointmentService.rescheduleAppointment({
      businessId: ids.business,
      appointmentId: appointment.id,
      newStartAt: at(6, 12).toISOString(),
      expectedUpdatedAt: current.updatedAt.toISOString(),
      userId: ids.user,
      userRole: "OWNER",
    });

    const events = await eventsFor(appointment.id);
    assert.equal(events.length, 2);
    assert.notEqual(events[0].idempotencyKey, events[1].idempotencyKey);
    assert.deepEqual(events[0].payload, {
      oldStartAt: at(6, 10).toISOString(),
      oldEndAt: at(6, 10, 30).toISOString(),
      newStartAt: at(6, 11).toISOString(),
      newEndAt: at(6, 11, 30).toISOString(),
      status: "CONFIRMED",
    });
  });

  it("emits public reschedule and one idempotent public cancellation event", async () => {
    const appointment = await directAppointment({ startTime: at(7, 10) });
    const access = await AppointmentAccessService.issue({
      businessId: ids.business,
      appointmentId: appointment.id,
    });
    const rescheduled = await AppointmentAccessService.reschedule(
      access.rawToken,
      at(7, 11).toISOString(),
      at(1, 0)
    );
    assert.equal(rescheduled.outcome, "RESCHEDULED");
    const cancelled = await AppointmentAccessService.cancel(
      access.rawToken,
      at(1, 0)
    );
    const repeated = await AppointmentAccessService.cancel(
      access.rawToken,
      at(1, 0)
    );
    assert.equal(cancelled.outcome, "CANCELLED");
    assert.equal(cancelled.changed, true);
    assert.equal(repeated.outcome, "CANCELLED");
    assert.equal(repeated.changed, false);
    const events = await eventsFor(appointment.id);
    assert.deepEqual(
      events.map((event: any) => event.eventType),
      ["APPOINTMENT_RESCHEDULED", "APPOINTMENT_CANCELLED"]
    );
  });

  it("emits only for internal transition to CANCELLED, not COMPLETED or NO_SHOW", async () => {
    const cancelled = await directAppointment({ startTime: at(8, 10) });
    await AppointmentService.updateAppointmentStatus(
      ids.business,
      cancelled.id,
      "CANCELLED",
      "OWNER",
      ids.user
    );
    assert.equal((await eventsFor(cancelled.id))[0].eventType, "APPOINTMENT_CANCELLED");

    const completed = await directAppointment({
      startTime: new Date(Date.now() - 2 * 60 * 60_000),
    });
    const noShow = await directAppointment({
      startTime: new Date(Date.now() - 3 * 60 * 60_000),
    });
    await AppointmentService.updateAppointmentStatus(
      ids.business,
      completed.id,
      "COMPLETED",
      "OWNER",
      ids.user
    );
    await AppointmentService.updateAppointmentStatus(
      ids.business,
      noShow.id,
      "NO_SHOW",
      "OWNER",
      ids.user
    );
    assert.equal((await eventsFor(completed.id)).length, 0);
    assert.equal((await eventsFor(noShow.id)).length, 0);
  });

  it("rolls back creation, reschedule, and cancellation when event insertion fails", async () => {
    await installFailingOutboxTrigger();
    try {
      const beforeAppointments = await db
        .select({ count: orm.sql<number>`count(*)::int` })
        .from(schema.appointments);
      await assert.rejects(
        AppointmentService.createAppointment({
          businessId: ids.business,
          staffId: ids.staffA,
          serviceId: ids.service,
          startAt: at(9, 10).toISOString(),
          customer: { firstName: "Rollback", phone: "+905550016104" },
          context: "PUBLIC",
        }),
        (error: any) =>
          error instanceof NotificationOutboxError &&
          error.code === "OUTBOX_PERSISTENCE_FAILED"
      );
      const afterAppointments = await db
        .select({ count: orm.sql<number>`count(*)::int` })
        .from(schema.appointments);
      assert.equal(afterAppointments[0].count, beforeAppointments[0].count);

      const reschedule = await directAppointment({ startTime: at(10, 10) });
      await assert.rejects(
        AppointmentService.rescheduleAppointment({
          businessId: ids.business,
          appointmentId: reschedule.id,
          newStartAt: at(10, 11).toISOString(),
          expectedUpdatedAt: reschedule.updatedAt.toISOString(),
          userId: ids.user,
          userRole: "OWNER",
        }),
        (error: any) =>
          error instanceof NotificationOutboxError &&
          error.code === "OUTBOX_PERSISTENCE_FAILED"
      );
      const rescheduleAfter = await db.query.appointments.findFirst({
        where: orm.eq(schema.appointments.id, reschedule.id),
      });
      assert.equal(rescheduleAfter.startTime.toISOString(), at(10, 10).toISOString());

      const cancellation = await directAppointment({ startTime: at(11, 10) });
      await assert.rejects(
        AppointmentService.updateAppointmentStatus(
          ids.business,
          cancellation.id,
          "CANCELLED",
          "OWNER",
          ids.user
        ),
        (error: any) =>
          error instanceof NotificationOutboxError &&
          error.code === "OUTBOX_PERSISTENCE_FAILED"
      );
      const cancellationAfter = await db.query.appointments.findFirst({
        where: orm.eq(schema.appointments.id, cancellation.id),
      });
      assert.equal(cancellationAfter.status, "CONFIRMED");
    } finally {
      await removeFailingOutboxTrigger();
    }
  });

  it("claims concurrently without duplication across 20 iterations", async () => {
    await db.execute(`
      UPDATE notification_outbox
      SET status = 'PROCESSED', processed_at = NOW(), locked_at = NULL, locked_by = NULL
      WHERE status <> 'PROCESSED'
    `);
    const appointment = await directAppointment({ startTime: at(12, 10) });
    const claimedIds = new Set<string>();

    for (let iteration = 0; iteration < 20; iteration += 1) {
      for (let item = 0; item < 2; item += 1) {
        const key = (iteration * 2 + item + 1).toString(16).padStart(64, "0");
        await db.insert(schema.notificationOutbox).values({
          businessId: ids.business,
          appointmentId: appointment.id,
          eventType: "APPOINTMENT_CREATED",
          payload: { iteration, item },
          idempotencyKey: key,
        });
      }
      const now = new Date(Date.UTC(2030, 0, 1, 0, iteration));
      const [a, b] = await Promise.all([
        NotificationOutboxService.claimPendingBatch({
          workerId: `worker-a-${iteration}`,
          batchSize: 1,
          referenceNow: now,
        }),
        NotificationOutboxService.claimPendingBatch({
          workerId: `worker-b-${iteration}`,
          batchSize: 1,
          referenceNow: now,
        }),
      ]);
      assert.equal(a.length, 1);
      assert.equal(b.length, 1);
      assert.notEqual(a[0].id, b[0].id);
      assert.equal(claimedIds.has(a[0].id), false);
      assert.equal(claimedIds.has(b[0].id), false);
      claimedIds.add(a[0].id);
      claimedIds.add(b[0].id);
      await NotificationOutboxService.markProcessed({
        eventId: a[0].id,
        workerId: a[0].lockedBy,
        referenceNow: now,
      });
      await NotificationOutboxService.markProcessed({
        eventId: b[0].id,
        workerId: b[0].lockedBy,
        referenceNow: now,
      });
    }
    assert.equal(claimedIds.size, 40);
  });

  it("honors availability, active leases, stale recovery, and claim ownership", async () => {
    const appointment = await directAppointment({ startTime: at(13, 10) });
    const base = new Date("2031-01-01T00:00:00.000Z");
    const rows = await db
      .insert(schema.notificationOutbox)
      .values([
        {
          businessId: ids.business,
          appointmentId: appointment.id,
          eventType: "APPOINTMENT_CREATED",
          payload: { kind: "future" },
          idempotencyKey: "e".repeat(64),
          availableAt: new Date(base.getTime() + 60_000),
        },
        {
          businessId: ids.business,
          appointmentId: appointment.id,
          eventType: "APPOINTMENT_CREATED",
          payload: { kind: "active" },
          idempotencyKey: "f".repeat(64),
          status: "PROCESSING",
          attemptCount: 1,
          lockedAt: new Date(base.getTime() - 60_000),
          lockedBy: "active-worker",
        },
        {
          businessId: ids.business,
          appointmentId: appointment.id,
          eventType: "APPOINTMENT_CREATED",
          payload: { kind: "stale" },
          idempotencyKey: "d".repeat(64),
          status: "PROCESSING",
          attemptCount: 1,
          lockedAt: new Date(base.getTime() - 6 * 60_000),
          lockedBy: "dead-worker",
        },
        {
          businessId: ids.business,
          appointmentId: appointment.id,
          eventType: "APPOINTMENT_CREATED",
          payload: { kind: "terminal-stale" },
          idempotencyKey: "b".repeat(64),
          status: "PROCESSING",
          attemptCount: 8,
          lockedAt: new Date(base.getTime() - 6 * 60_000),
          lockedBy: "dead-final-worker",
        },
      ])
      .returning();

    const claimed = await NotificationOutboxService.claimPendingBatch({
      workerId: "recovery-worker",
      batchSize: 10,
      referenceNow: base,
    });
    assert.deepEqual(claimed.map((row: any) => row.payload.kind), ["stale"]);
    await assert.rejects(
      NotificationOutboxService.markProcessed({
        eventId: claimed[0].id,
        workerId: "wrong-worker",
        referenceNow: base,
      }),
      (error: any) =>
        error instanceof NotificationOutboxError &&
        error.code === "OUTBOX_CLAIM_NOT_OWNED"
    );
    const active = rows.find((row: any) => row.payload.kind === "active");
    assert.equal(active.lockedBy, "active-worker");
    const terminalStale = await db.query.notificationOutbox.findFirst({
      where: orm.eq(
        schema.notificationOutbox.id,
        rows.find((row: any) => row.payload.kind === "terminal-stale").id
      ),
    });
    assert.equal(terminalStale.status, "FAILED");
    assert.equal(terminalStale.lastErrorCode, "LEASE_EXPIRED");
    assert.equal(terminalStale.lockedBy, null);
  });

  it("uses bounded retry backoff, sanitizes errors, and stops at terminal attempt", async () => {
    await db.execute(`
      UPDATE notification_outbox
      SET status = 'PROCESSED', processed_at = NOW(), locked_at = NULL, locked_by = NULL
      WHERE status <> 'PROCESSED'
    `);
    const appointment = await directAppointment({ startTime: at(14, 10) });
    const [event] = await db
      .insert(schema.notificationOutbox)
      .values({
        businessId: ids.business,
        appointmentId: appointment.id,
        eventType: "APPOINTMENT_CREATED",
        payload: { retry: true },
        idempotencyKey: "c".repeat(64),
      })
      .returning();
    let now = new Date("2032-01-01T00:00:00.000Z");

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const [claim] = await NotificationOutboxService.claimPendingBatch({
        workerId: "retry-worker",
        batchSize: 1,
        referenceNow: now,
      });
      assert.equal(claim.id, event.id);
      assert.equal(claim.attemptCount, attempt);
      const failure = await NotificationOutboxService.markFailed({
        eventId: event.id,
        workerId: "retry-worker",
        errorCode: attempt === 1 ? "provider stack\nsecret" : "TEMPORARY_ERROR",
        referenceNow: now,
      });
      assert.equal(failure.terminal, attempt === 8);
      now = failure.terminal
        ? new Date(now.getTime() + 1)
        : new Date(failure.availableAt.getTime());
    }

    const stored = await NotificationOutboxService.claimPendingBatch({
      workerId: "retry-worker",
      batchSize: 1,
      referenceNow: new Date(now.getTime() + 24 * 60 * 60_000),
    });
    assert.equal(stored.length, 0);
    const terminal = await db.query.notificationOutbox.findFirst({
      where: orm.eq(schema.notificationOutbox.id, event.id),
    });
    assert.equal(terminal.status, "FAILED");
    assert.equal(terminal.attemptCount, 8);
    assert.equal(terminal.lastErrorCode, "TEMPORARY_ERROR");
  });
});
