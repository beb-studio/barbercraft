/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  owner: uuid(1),
  business: uuid(10),
  ownerMember: uuid(20),
  staffProfile: uuid(30),
  service: uuid(40),
  customer: uuid(50),
  appointment1: uuid(61),
  appointment2: uuid(62),
  appointment3: uuid(63),
  appointmentCancel: uuid(70),
  appointmentReschedule: uuid(71),
  appointmentRestart: uuid(72),
};

let server: any;
let db: any;
let schema: any;
let NotificationWorker: any;
let NotificationOutboxService: any;
let TestSmsProvider: any;
let testProvider: any;
let isDeliveryTerminalFailed: any;


const baseTime = new Date("2030-06-01T10:00:00.000Z");
const apptStart = new Date("2030-06-01T14:00:00.000Z"); // 4 hours later
const apptEnd = new Date("2030-06-01T14:45:00.000Z");

before(async () => {
  server = await startDatabase();
  process.env.DATABASE_URL = server.connectionString;
  process.env.APP_BASE_URL = "https://barber.test.local";

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");

  const workerMod = await import("../../src/worker/notification-worker");
  NotificationWorker = workerMod.NotificationWorker;

  const outboxMod = await import("../../src/services/notification-outbox.service");
  NotificationOutboxService = outboxMod.NotificationOutboxService;

  const smsMod = await import("../../src/lib/sms/test-sms-provider");
  TestSmsProvider = smsMod.TestSmsProvider;
  const delivMod = await import("../../src/lib/notification-delivery");
  isDeliveryTerminalFailed = delivMod.isDeliveryTerminalFailed;
  testProvider = new TestSmsProvider();


  // Seed baseline tenant entities

  await db.insert(schema.users).values({
    id: ids.owner,
    name: "Worker Owner",
    email: "worker-owner@test.local",
    emailVerified: true,
  });

  await db.insert(schema.businesses).values({
    id: ids.business,
    name: "Usta Makas",
    slug: "usta-makas",
    timezone: "Europe/Istanbul",
    currency: "TRY",
    onboardingCompletedAt: new Date(),
  });

  await db.insert(schema.businessMembers).values({
    id: ids.ownerMember,
    businessId: ids.business,
    userId: ids.owner,
    role: "OWNER",
  });

  await db.insert(schema.staffProfiles).values({
    id: ids.staffProfile,
    businessId: ids.business,
    businessMemberId: ids.ownerMember,
    firstName: "Kemal",
    lastName: "Usta",
  });

  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.business,
    name: "Sakal Tıraşı",
    durationMinutes: 45,
    price: "300.00",
  });

  await db.insert(schema.customers).values({
    id: ids.customer,
    businessId: ids.business,
    firstName: "Ali",
    lastName: "Veli",
    phone: "05321112233",
    normalizedPhone: "+905321112233",
    phoneComparisonKey: "5321112233",
  });

  // Enable customer notifications and add a 120-minute reminder offset
  await db.execute(sql`
    UPDATE business_notification_settings
    SET customer_notifications_enabled = true,
        appointment_created_enabled = true,
        appointment_rescheduled_enabled = true,
        appointment_cancelled_enabled = true
    WHERE business_id = ${ids.business};
  `);

  await db.execute(sql`
    INSERT INTO business_notification_reminder_rules (business_id, minutes_before, enabled)
    VALUES (${ids.business}, 120, true)
    ON CONFLICT (business_id, minutes_before) DO UPDATE SET enabled = true;
  `);

});

after(async () => {
  if (server) {
    await server.stop();
  }
});

beforeEach(() => {
  testProvider.reset();
});

describe("Notification Background Worker Execution", () => {
  it("43.1 processes APPOINTMENT_CREATED outbox event end-to-end to SENT delivery", async () => {
    // 1. Insert appointment
    await db.insert(schema.appointments).values({
      id: ids.appointment1,
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: apptStart,
      endTime: apptEnd,
      status: "CONFIRMED",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "300.00",
    });

    // 2. Emit outbox event inside transaction
    await NotificationOutboxService.emitAppointmentCreated(db, {
      businessId: ids.business,
      appointmentId: ids.appointment1,
      startAt: apptStart,
      endAt: apptEnd,
      status: "CONFIRMED",
    });

    // 3. Verify outbox event is PENDING before worker runs
    const beforeEvents = await db.query.notificationOutbox.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.appointmentId, ids.appointment1),
    });
    assert.equal(beforeEvents.length, 1);
    assert.equal(beforeEvents[0].status, "PENDING");

    // 4. Run single worker cycle
    const worker = new NotificationWorker({
      workerId: "test-worker-1",
      provider: testProvider,
    });
    const result = await worker.runOnce(baseTime);

    assert.equal(result.planned.processed, 1);
    assert.equal(result.delivered.sent, 1);

    // 5. Verify outbox event is now PROCESSED
    const afterEvents = await db.query.notificationOutbox.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.appointmentId, ids.appointment1),
    });
    assert.equal(afterEvents[0].status, "PROCESSED");

    // 6. Verify notification plan created
    const plans = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.appointmentId, ids.appointment1),
    });
    assert.ok(plans.length >= 1);
    const creationPlan = plans.find((p: any) => p.type === "APPOINTMENT_CREATED");
    assert.ok(creationPlan);

    // 7. Verify delivery created with SENT status
    const deliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, creationPlan.id),
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "SENT");
    assert.equal(deliveries[0].recipient, "+905321112233");

    // 8. Verify test provider received SMS
    assert.equal(testProvider.recordedCalls.length, 1);
    assert.equal(testProvider.recordedCalls[0].to, "+905321112233");
    assert.ok(testProvider.recordedCalls[0].message.includes("Usta Makas"));
    assert.ok(testProvider.recordedCalls[0].message.includes("Sakal Tıraşı"));
    assert.ok(testProvider.recordedCalls[0].message.includes("/randevu#"));
  });

  it("43.2 schedules reminder plan and dispatches reminder when due", async () => {
    // Check reminder plan created by 43.1
    const plans = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointment1), eq(tbl.type, "APPOINTMENT_REMINDER")),
    });
    assert.equal(plans.length, 1);
    const reminderPlan = plans[0];
    assert.equal(reminderPlan.status, "PENDING");
    assert.equal(reminderPlan.reminderOffsetMinutes, 120);

    // Advance time to 1 hour before appointment (120m offset is now due)
    const reminderDueTime = new Date(apptStart.getTime() - 60 * 60_000); // 13:00 (due at 12:00)

    const worker = new NotificationWorker({
      workerId: "test-worker-1",
      provider: testProvider,
    });
    const result = await worker.runOnce(reminderDueTime);

    assert.equal(result.delivered.sent, 1);
    assert.equal(testProvider.recordedCalls.length, 1);
    assert.ok(testProvider.recordedCalls[0].message.includes("Usta Makas"));

    // Verify reminder delivery row is SENT
    const deliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, reminderPlan.id),
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "SENT");
  });

  it("43.3 cancelled obsolete reminder does not send", async () => {
    testProvider.reset();

    // 1. Create appointment
    await db.insert(schema.appointments).values({
      id: ids.appointmentCancel,
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: apptStart,
      endTime: apptEnd,
      status: "CONFIRMED",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "300.00",
    });

    // 2. Emit created outbox event
    await NotificationOutboxService.emitAppointmentCreated(db, {
      businessId: ids.business,
      appointmentId: ids.appointmentCancel,
      startAt: apptStart,
      endAt: apptEnd,
      status: "CONFIRMED",
    });

    // 3. Worker plans creation and future reminder
    const worker = new NotificationWorker({
      workerId: "test-worker-cancel",
      provider: testProvider,
    });
    await worker.runOnce(baseTime);

    // Verify reminder plan was created with PENDING status
    const reminderPlansBefore = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointmentCancel), eq(tbl.type, "APPOINTMENT_REMINDER")),
    });
    assert.equal(reminderPlansBefore.length, 1);
    assert.equal(reminderPlansBefore[0].status, "PENDING");

    // 4. Cancel appointment and emit cancellation outbox event
    await db.execute(sql`
      UPDATE appointments
      SET status = 'CANCELLED'
      WHERE id = ${ids.appointmentCancel};
    `);

    await NotificationOutboxService.emitAppointmentCancelled(db, {
      businessId: ids.business,
      appointmentId: ids.appointmentCancel,
      startAt: apptStart,
      endAt: apptEnd,
      previousStatus: "CONFIRMED",
    });

    // 5. Worker processes cancellation event
    const cancelProcessTime = new Date(baseTime.getTime() + 60_000);
    await worker.runOnce(cancelProcessTime);

    // Verify reminder plan was cancelled
    const reminderPlansAfter = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointmentCancel), eq(tbl.type, "APPOINTMENT_REMINDER")),
    });
    assert.equal(reminderPlansAfter.length, 1);
    assert.equal(reminderPlansAfter[0].status, "CANCELLED");

    // 6. Reset test provider calls and advance clock to when reminder would have been due
    testProvider.reset();
    const reminderDueTime = new Date(apptStart.getTime() - 60 * 60_000); // 13:00 (was due at 12:00)
    const result = await worker.runOnce(reminderDueTime);

    // 7. Verify zero reminder deliveries materialized or sent
    const cancelDeliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, reminderPlansAfter[0].id),
    });
    assert.equal(cancelDeliveries.length, 0);
    assert.equal(result.delivered.sent, 0);
    assert.equal(testProvider.recordedCalls.length, 0);
  });

  it("43.4 rescheduled reminder cancels old reminder and dispatches at updated due time", async () => {
    testProvider.reset();

    // 1. Create appointment
    await db.insert(schema.appointments).values({
      id: ids.appointmentReschedule,
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: apptStart, // 14:00 (reminder due at 12:00)
      endTime: apptEnd,
      status: "CONFIRMED",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "300.00",
    });

    await NotificationOutboxService.emitAppointmentCreated(db, {
      businessId: ids.business,
      appointmentId: ids.appointmentReschedule,
      startAt: apptStart,
      endAt: apptEnd,
      status: "CONFIRMED",
    });

    const worker = new NotificationWorker({
      workerId: "test-worker-reschedule",
      provider: testProvider,
    });
    await worker.runOnce(baseTime);

    // 2. Reschedule appointment to 18:00 (reminder will be due at 16:00)
    const newApptStart = new Date("2030-06-01T18:00:00.000Z");
    const newApptEnd = new Date("2030-06-01T18:45:00.000Z");

    await db.execute(sql`
      UPDATE appointments
      SET start_time = ${newApptStart}, end_time = ${newApptEnd}
      WHERE id = ${ids.appointmentReschedule};
    `);

    await NotificationOutboxService.emitAppointmentRescheduled(db, {
      businessId: ids.business,
      appointmentId: ids.appointmentReschedule,
      previousVersion: "v1",
      oldStartAt: apptStart,
      oldEndAt: apptEnd,
      newStartAt: newApptStart,
      newEndAt: newApptEnd,
      status: "CONFIRMED",
    });

    const rescheduleProcessTime = new Date(baseTime.getTime() + 60_000);
    await worker.runOnce(rescheduleProcessTime);

    // Verify reminder plans: 1 CANCELLED (old), 1 PENDING (new at 16:00)
    const reminderPlans = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointmentReschedule), eq(tbl.type, "APPOINTMENT_REMINDER")),
      orderBy: (tbl: any, { asc }: any) => [asc(tbl.createdAt)],
    });
    assert.equal(reminderPlans.length, 2);
    assert.equal(reminderPlans[0].status, "CANCELLED"); // Old plan cancelled
    assert.equal(reminderPlans[1].status, "PENDING");   // New plan pending
    assert.equal(reminderPlans[1].scheduledFor.toISOString(), new Date(newApptStart.getTime() - 120 * 60_000).toISOString());

    // 3. Advance to 13:00 (when old reminder would have been due)
    testProvider.reset();
    const oldDueTime = new Date("2030-06-01T13:00:00.000Z");
    const oldDueResult = await worker.runOnce(oldDueTime);
    assert.equal(oldDueResult.delivered.sent, 0);
    assert.equal(testProvider.recordedCalls.length, 0);

    // 4. Advance to 16:30 (when new reminder is due)
    const newDueTime = new Date("2030-06-01T16:30:00.000Z");
    const newDueResult = await worker.runOnce(newDueTime);
    assert.equal(newDueResult.delivered.sent, 1);
    assert.equal(testProvider.recordedCalls.length, 1);

    // Verify new reminder delivery row is SENT
    const newDeliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, reminderPlans[1].id),
    });
    assert.equal(newDeliveries.length, 1);
    assert.equal(newDeliveries[0].status, "SENT");
  });

  it("43.5 repeated worker iteration does not duplicate logical delivery", async () => {
    testProvider.reset();

    const worker = new NotificationWorker({
      workerId: "test-worker-dedup",
      provider: testProvider,
    });

    // Run again at the same time as 43.4 (16:30)
    const repeatDueTime = new Date("2030-06-01T16:30:00.000Z");
    const repeatResult = await worker.runOnce(repeatDueTime);

    assert.equal(repeatResult.delivered.materialized, 0);
    assert.equal(repeatResult.delivered.claimed, 0);
    assert.equal(repeatResult.delivered.sent, 0);
    assert.equal(testProvider.recordedCalls.length, 0);
  });

  it("43.6 worker restart / crash recovery dispatches pending reminders safely and idempotently", async () => {
    testProvider.reset();

    // 1. Create appointment and plan reminder
    await db.insert(schema.appointments).values({
      id: ids.appointmentRestart,
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: apptStart,
      endTime: apptEnd,
      status: "CONFIRMED",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "300.00",
    });

    await NotificationOutboxService.emitAppointmentCreated(db, {
      businessId: ids.business,
      appointmentId: ids.appointmentRestart,
      startAt: apptStart,
      endAt: apptEnd,
      status: "CONFIRMED",
    });

    // Worker 1 runs and plans reminder
    const worker1 = new NotificationWorker({
      workerId: "crashed-worker-instance",
      provider: testProvider,
    });
    await worker1.runOnce(baseTime);

    // 2. Simulate worker 1 dying/stopping and worker 2 starting with new ID
    const worker2 = new NotificationWorker({
      workerId: "restarted-worker-instance-2",
      provider: testProvider,
    });

    testProvider.reset();
    const reminderDueTime = new Date(apptStart.getTime() - 60 * 60_000); // 13:00
    const result = await worker2.runOnce(reminderDueTime);

    assert.equal(result.delivered.sent, 1);
    assert.equal(testProvider.recordedCalls.length, 1);

    // Verify delivery row belongs to appointmentRestart's reminder
    const restartPlans = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointmentRestart), eq(tbl.type, "APPOINTMENT_REMINDER")),
    });
    assert.equal(restartPlans.length, 1);
    const restartDeliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, restartPlans[0].id),
    });
    assert.equal(restartDeliveries.length, 1);
    assert.equal(restartDeliveries[0].status, "SENT");
  });

  it("44.1 transient provider failure places delivery into retry backoff state", async () => {
    testProvider.forceRetryableError("GATEWAY_TIMEOUT");

    await db.insert(schema.appointments).values({
      id: ids.appointment2,
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: apptStart,
      endTime: apptEnd,
      status: "CONFIRMED",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "300.00",
    });

    await NotificationOutboxService.emitAppointmentCreated(db, {
      businessId: ids.business,
      appointmentId: ids.appointment2,
      startAt: apptStart,
      endAt: apptEnd,
      status: "CONFIRMED",
    });

    const worker = new NotificationWorker({
      workerId: "test-worker-2",
      provider: testProvider,
    });
    const result = await worker.runOnce(baseTime);

    assert.equal(result.planned.processed, 1);
    assert.equal(result.delivered.failed, 1);

    // Verify delivery row is in non-permanent FAILED state with backoff
    const plans = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointment2), eq(tbl.type, "APPOINTMENT_CREATED")),
    });
    const deliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, plans[0].id),
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "FAILED");
    assert.equal(isDeliveryTerminalFailed(deliveries[0].status, deliveries[0].attemptCount, deliveries[0].lastErrorCode), false);
    assert.equal(deliveries[0].attemptCount, 1);
    assert.ok(deliveries[0].availableAt > baseTime);
  });

  it("44.2 permanent provider failure places delivery into terminal FAILED state", async () => {
    testProvider.forcePermanentError("NETGSM_20");

    await db.insert(schema.appointments).values({
      id: ids.appointment3,
      businessId: ids.business,
      customerId: ids.customer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: apptStart,
      endTime: apptEnd,
      status: "CONFIRMED",
      serviceNameSnapshot: "Sakal Tıraşı",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "300.00",
    });

    await NotificationOutboxService.emitAppointmentCreated(db, {
      businessId: ids.business,
      appointmentId: ids.appointment3,
      startAt: apptStart,
      endAt: apptEnd,
      status: "CONFIRMED",
    });

    const worker = new NotificationWorker({
      workerId: "test-worker-3",
      provider: testProvider,
    });
    const result = await worker.runOnce(baseTime);

    assert.equal(result.planned.processed, 1);
    assert.equal(result.delivered.failed, 1);

    // Verify delivery row is in permanent FAILED state
    const plans = await db.query.notificationPlans.findMany({
      where: (tbl: any, { eq, and }: any) =>
        and(eq(tbl.appointmentId, ids.appointment3), eq(tbl.type, "APPOINTMENT_CREATED")),
    });
    const deliveries = await db.query.notificationDeliveries.findMany({
      where: (tbl: any, { eq }: any) => eq(tbl.planId, plans[0].id),
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "FAILED");
    assert.equal(isDeliveryTerminalFailed(deliveries[0].status, deliveries[0].attemptCount, deliveries[0].lastErrorCode), true);
  });

  it("44.3 idempotency: repeat worker runs without new work produce 0 messages", async () => {
    testProvider.reset();
    const worker = new NotificationWorker({
      workerId: "test-worker-1",
      provider: testProvider,
    });
    const result = await worker.runOnce(baseTime);

    assert.equal(result.planned.claimed, 0);
    assert.equal(result.delivered.claimed, 0);
    assert.equal(result.delivered.sent, 0);

    assert.equal(testProvider.recordedCalls.length, 0);
  });

  it("44.4 worker start and stop cycle gracefully without hanging", async () => {
    const worker = new NotificationWorker({
      workerId: "test-worker-graceful",
      pollIntervalMs: 50,
      provider: testProvider,
    });

    await worker.start();
    // Allow brief time for loop to initialize
    await new Promise((resolve) => setTimeout(resolve, 60));
    await worker.stop();
  });
});
