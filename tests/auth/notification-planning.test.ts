/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) => `97000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { owner: uuid(1), admin: uuid(2), staff: uuid(3), platform: uuid(4), business: uuid(10), businessB: uuid(11), ownerMember: uuid(20), adminMember: uuid(21), staffMember: uuid(22), staffProfile: uuid(30), service: uuid(40), customer: uuid(50), appointment: uuid(60) };
const now = new Date("2030-01-01T09:00:00.000Z");
const start = new Date("2030-01-03T10:00:00.000Z");
let server: any; let db: any; let schema: any; let orm: any; let session: any; let planner: any; let actions: any; let outboxService: any; let settingsLib: any;

function mockSession(userId: string | null) {
  session.sessionDependencies.getCurrentUser = async () => userId ? { id: userId, email: `${userId}@notification.test`, forcePasswordChange: false } : null;
}

async function insertEvent(type: "APPOINTMENT_CREATED" | "APPOINTMENT_RESCHEDULED" | "APPOINTMENT_CANCELLED", payload: Record<string, unknown>) {
  const [event] = await db.insert(schema.notificationOutbox).values({ businessId: ids.business, appointmentId: ids.appointment, eventType: type, payload, payloadVersion: 1, idempotencyKey: `${type}-${Math.random()}`.padEnd(64, "x").slice(0, 64), availableAt: now }).returning();
  return event;
}

async function enable(reminders: number[] = [1440, 120]) {
  const current = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business);
  const result = await planner.NotificationPlannerService.updateSettings({ businessId: ids.business, expectedVersion: current.version, referenceNow: now, settings: { customerNotificationsEnabled: true, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderMinutes: reminders } });
  assert.equal(result.outcome, "UPDATED");
}

async function processPending(workerId = "planner-test") {
  return planner.NotificationPlannerService.processPendingBatch({ workerId, batchSize: 50, referenceNow: now });
}

async function plans() {
  return db.select().from(schema.notificationPlans).where(orm.eq(schema.notificationPlans.appointmentId, ids.appointment));
}

before(async () => {
  server = await startDatabase(); process.env.DATABASE_URL = server.connectionString;
  ({ db } = await import("../../src/db")); schema = await import("../../src/db/schema"); orm = await import("drizzle-orm");
  session = await import("../../src/lib/auth/session"); planner = await import("../../src/services/notification-planner.service"); actions = await import("../../src/actions/business-notification-settings.actions"); outboxService = await import("../../src/services/notification-outbox.service"); settingsLib = await import("../../src/lib/notification-settings");
  await db.insert(schema.users).values([
    { id: ids.owner, name: "Sahip", email: "notification-owner@test.local", emailVerified: true },
    { id: ids.admin, name: "Yönetici", email: "notification-admin@test.local", emailVerified: true },
    { id: ids.staff, name: "Personel", email: "notification-staff@test.local", emailVerified: true },
    { id: ids.platform, name: "Platform", email: "notification-platform@test.local", emailVerified: true },
  ]);
  await db.insert(schema.businesses).values([
    { id: ids.business, name: "Bildirim A", slug: "notification-a", timezone: "UTC", currency: "TRY", onboardingCompletedAt: new Date() },
    { id: ids.businessB, name: "Bildirim B", slug: "notification-b", timezone: "UTC", currency: "TRY", onboardingCompletedAt: new Date() },
  ]);
  await db.insert(schema.businessMembers).values([
    { id: ids.ownerMember, businessId: ids.business, userId: ids.owner, role: "OWNER" }, { id: ids.adminMember, businessId: ids.business, userId: ids.admin, role: "ADMIN" }, { id: ids.staffMember, businessId: ids.business, userId: ids.staff, role: "STAFF" },
  ]);
  await db.insert(schema.platformAdmins).values({ userId: ids.platform, role: "SUPER_ADMIN" });
  await db.insert(schema.staffProfiles).values({ id: ids.staffProfile, businessId: ids.business, businessMemberId: ids.staffMember, firstName: "Bildirim", lastName: "Personeli" });
  await db.insert(schema.services).values({ id: ids.service, businessId: ids.business, name: "Bildirim Hizmeti", durationMinutes: 30, price: "500.00" });
  await db.insert(schema.customers).values({ id: ids.customer, businessId: ids.business, firstName: "Müşteri", phone: "+905550001801", normalizedPhone: "+905550001801", phoneComparisonKey: "555001801" });
  await db.insert(schema.appointments).values({ id: ids.appointment, businessId: ids.business, customerId: ids.customer, staffId: ids.staffProfile, serviceId: ids.service, startTime: start, endTime: new Date(start.getTime() + 30 * 60_000), status: "CONFIRMED", source: "PUBLIC_WEB", serviceNameSnapshot: "Bildirim Hizmeti", serviceDurationSnapshot: 30, servicePriceSnapshot: "500.00", notes: "Gizli iç randevu notu" });
});
after(async () => { await server?.stop(); });

beforeEach(async () => {
  mockSession(ids.owner);
  await db.delete(schema.notificationPlans);
  await db.delete(schema.notificationOutbox);
  await db.delete(schema.businessNotificationReminderRules).where(orm.eq(schema.businessNotificationReminderRules.businessId, ids.business));
  await db.update(schema.businessNotificationSettings).set({ customerNotificationsEnabled: false, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true }).where(orm.eq(schema.businessNotificationSettings.businessId, ids.business));
  await db.update(schema.appointments).set({ startTime: start, endTime: new Date(start.getTime() + 30 * 60_000), status: "CONFIRMED" }).where(orm.eq(schema.appointments.id, ids.appointment));
});

describe("TASK 016B notification planning", { concurrency: false }, () => {
  it("enforces OWNER/ADMIN authority and rejects forged tenant data", async () => {
    const current = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business);
    const payload = { expectedVersion: current.version, customerNotificationsEnabled: true, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderRules: [{ amount: "2", unit: "HOUR" }], businessId: ids.businessB };
    for (const userId of [null, ids.staff, ids.platform]) { mockSession(userId); const result = await actions.updateBusinessNotificationSettingsAction(payload); assert.equal(result.success, false); assert.equal(result.type, "FORBIDDEN"); assert.doesNotMatch(JSON.stringify(result), /SQLSTATE|constraint|stack/i); }
    mockSession(ids.admin); const allowed = await actions.updateBusinessNotificationSettingsAction(payload); assert.equal(allowed.success, true);
    const other = await planner.NotificationPlannerService.getSettingsForBusiness(ids.businessB); assert.equal(other.customerNotificationsEnabled, false);
  });

  it("validates lossless units, canonical duplicates, and all-or-nothing rule saves", async () => {
    assert.deepEqual(settingsLib.minutesToReminderDuration(120), { amount: "2", unit: "HOUR" });
    assert.deepEqual(settingsLib.minutesToReminderDuration(1500), { amount: "1500", unit: "MINUTE" });
    const current = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business);
    const invalid = await actions.updateBusinessNotificationSettingsAction({ expectedVersion: current.version, customerNotificationsEnabled: true, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderRules: [{ amount: "24", unit: "HOUR" }, { amount: "1", unit: "DAY" }] });
    assert.equal(invalid.success, false); assert.equal(invalid.type, "INVALID");
    const unchanged = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business); assert.equal(unchanged.customerNotificationsEnabled, false); assert.deepEqual(unchanged.reminderMinutes, []);
    const tooMany = settingsLib.validateBusinessNotificationSettings({ customerNotificationsEnabled: true, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderRules: [{ amount: "5", unit: "MINUTE" }, { amount: "10", unit: "MINUTE" }, { amount: "15", unit: "MINUTE" }, { amount: "20", unit: "MINUTE" }] });
    assert.equal(tooMany.valid, false);
  });

  it("uses current safe defaults: master OFF consumes created events without plans", async () => {
    await insertEvent("APPOINTMENT_CREATED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" });
    const result = await processPending(); assert.deepEqual(result, { claimed: 1, processed: 1, failed: 0 });
    assert.equal((await plans()).length, 0);
    const [event] = await db.select().from(schema.notificationOutbox); assert.equal(event.status, "PROCESSED");
  });

  it("plans created intent and only future reminder offsets without recipient or capability data", async () => {
    await enable([1440, 30]);
    await insertEvent("APPOINTMENT_CREATED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" });
    await processPending();
    const createdPlans = await plans(); assert.deepEqual(createdPlans.map((plan: any) => plan.type).sort(), ["APPOINTMENT_CREATED", "APPOINTMENT_REMINDER", "APPOINTMENT_REMINDER"]);
    assert.doesNotMatch(JSON.stringify(createdPlans), /905550001801|Gizli iç randevu notu|randevu#|token/i);
  });

  it("retries a claimed event idempotently without duplicating plans", async () => {
    await enable([120]); const event = await insertEvent("APPOINTMENT_CREATED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" });
    const [claim] = await outboxService.NotificationOutboxService.claimPendingBatch({ workerId: "retry-planner", batchSize: 1, referenceNow: now });
    await planner.NotificationPlannerService.processClaimedEvent(claim, now);
    for (let iteration = 0; iteration < 20; iteration += 1) {
      await db.update(schema.notificationOutbox).set({ status: "PROCESSING", processedAt: null, lockedAt: now, lockedBy: "retry-planner" }).where(orm.eq(schema.notificationOutbox.id, event.id));
      await planner.NotificationPlannerService.processClaimedEvent({ ...claim, status: "PROCESSING", lockedAt: now, lockedBy: "retry-planner" }, now);
    }
    assert.equal((await plans()).length, 2);
  });

  it("supersedes stale intents/reminders on current reschedule and only retains new schedule reminders", async () => {
    await enable([1440]);
    await insertEvent("APPOINTMENT_CREATED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" }); await processPending();
    const moved = new Date("2030-01-04T11:00:00.000Z");
    await db.update(schema.appointments).set({ startTime: moved, endTime: new Date(moved.getTime() + 30 * 60_000) }).where(orm.eq(schema.appointments.id, ids.appointment));
    await insertEvent("APPOINTMENT_RESCHEDULED", { oldStartAt: start.toISOString(), oldEndAt: new Date(start.getTime() + 30 * 60_000).toISOString(), newStartAt: moved.toISOString(), newEndAt: new Date(moved.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" }); await processPending();
    const after = await plans(); assert.equal(after.filter((plan: any) => plan.status === "PENDING" && plan.type === "APPOINTMENT_RESCHEDULED").length, 1); assert.equal(after.filter((plan: any) => plan.status === "PENDING" && plan.type === "APPOINTMENT_REMINDER").length, 1); assert.ok(after.some((plan: any) => plan.status === "CANCELLED" && plan.type === "APPOINTMENT_CREATED"));
  });

  it("cancels obsolete pending plans and creates one cancellation intent only when enabled", async () => {
    await enable([120]); await insertEvent("APPOINTMENT_CREATED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" }); await processPending();
    await db.update(schema.appointments).set({ status: "CANCELLED" }).where(orm.eq(schema.appointments.id, ids.appointment));
    await insertEvent("APPOINTMENT_CANCELLED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), previousStatus: "CONFIRMED", status: "CANCELLED" }); await processPending();
    const after = await plans(); assert.equal(after.filter((plan: any) => plan.status === "PENDING" && plan.type === "APPOINTMENT_REMINDER").length, 0); assert.equal(after.filter((plan: any) => plan.status === "PENDING" && plan.type === "APPOINTMENT_CANCELLED").length, 1);
  });

  it("reconciles only future operational reminders atomically with current settings", async () => {
    await enable([120]); const first = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business);
    const updated = await planner.NotificationPlannerService.updateSettings({ businessId: ids.business, expectedVersion: first.version, referenceNow: now, settings: { customerNotificationsEnabled: true, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderMinutes: [1440] } });
    assert.equal(updated.outcome, "UPDATED");
    const after = await plans(); assert.equal(after.filter((plan: any) => plan.status === "PENDING" && plan.type === "APPOINTMENT_REMINDER").length, 1);
    const disable = await planner.NotificationPlannerService.updateSettings({ businessId: ids.business, expectedVersion: updated.record.version, referenceNow: now, settings: { customerNotificationsEnabled: false, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderMinutes: [1440] } });
    assert.equal(disable.outcome, "UPDATED"); assert.equal((await plans()).filter((plan: any) => plan.status === "PENDING" && plan.type === "APPOINTMENT_REMINDER").length, 0);
  });

  it("allows one concurrent settings writer and retains a coherent reminder set", async () => {
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const current = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business);
      const input = { businessId: ids.business, expectedVersion: current.version, referenceNow: now, settings: { customerNotificationsEnabled: true, appointmentCreatedEnabled: true, appointmentRescheduledEnabled: true, appointmentCancelledEnabled: true, reminderMinutes: [120] } };
      const [a, b] = await Promise.all([planner.NotificationPlannerService.updateSettings(input), planner.NotificationPlannerService.updateSettings({ ...input, settings: { ...input.settings, reminderMinutes: [60] } })]);
      assert.deepEqual([a.outcome, b.outcome].sort(), ["STALE", "UPDATED"]);
    }
    const final = await planner.NotificationPlannerService.getSettingsForBusiness(ids.business); assert.ok(final.reminderMinutes.length === 1 && [60, 120].includes(final.reminderMinutes[0]));
  });

  it("two planner workers claim distinct work and leave no duplicate logical plans", async () => {
    await enable([120]);
    await insertEvent("APPOINTMENT_CREATED", { startAt: start.toISOString(), endAt: new Date(start.getTime() + 30 * 60_000).toISOString(), status: "CONFIRMED" });
    const results = await Promise.all([processPending("planner-a"), processPending("planner-b")]);
    assert.equal(results.reduce((total: number, result: any) => total + result.processed, 0), 1);
    assert.equal((await plans()).length, 2);
  });
});
