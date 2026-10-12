/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `98000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  owner: uuid(1),
  business: uuid(10),
  businessB: uuid(11),
  ownerMember: uuid(20),
  staffMember: uuid(21),
  staffProfile: uuid(30),
  service: uuid(40),
  canonicalCustomer: uuid(50),
  aliasCustomer: uuid(51),
  invalidCustomer: uuid(52),
  appointment: uuid(60),
  appointmentAlias: uuid(61),
  appointmentInvalid: uuid(62),
  outbox: uuid(70),
  plan: uuid(80),
};

const now = new Date("2030-01-01T09:00:00.000Z");
const start = new Date("2030-01-03T10:00:00.000Z");

let server: any;
let db: any;
let schema: any;
let orm: any;
let deliveryRepo: any;
let deliveryService: any;
let TestSmsProvider: any;
let NetgsmSmsProvider: any;
let formatPhoneForNetgsm: any;
let renderNotificationMessage: any;

before(async () => {
  server = await startDatabase();
  process.env.DATABASE_URL = server.connectionString;
  process.env.APP_BASE_URL = "https://app.test.local";

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");

  const repoMod = await import(
    "../../src/repositories/notification-delivery.repository"
  );
  deliveryRepo = repoMod.NotificationDeliveryRepository;

  const serviceMod = await import(
    "../../src/services/notification-delivery.service"
  );
  deliveryService = serviceMod.NotificationDeliveryService;

  const smsMod = await import("../../src/lib/sms");
  TestSmsProvider = smsMod.TestSmsProvider;
  NetgsmSmsProvider = smsMod.NetgsmSmsProvider;
  formatPhoneForNetgsm = smsMod.formatPhoneForNetgsm;

  const templateMod = await import("../../src/lib/notification-delivery");
  renderNotificationMessage = templateMod.renderNotificationMessage;

  // Seed base entities
  await db.insert(schema.users).values({
    id: ids.owner,
    name: "Deliv Owner",
    email: "deliv-owner@test.local",
    emailVerified: true,
  });

  await db.insert(schema.businesses).values([
    {
      id: ids.business,
      name: "Makas Berber Salonu",
      slug: "makas-berber",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Diğer Berber",
      slug: "diger-berber",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date(),
    },
  ]);

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
    firstName: "Ahmet",
    lastName: "Usta",
  });

  await db.insert(schema.services).values({
    id: ids.service,
    businessId: ids.business,
    name: "Klasik Saç Kesimi",
    durationMinutes: 45,
    price: "450.00",
  });

  // Canonical customer
  await db.insert(schema.customers).values({
    id: ids.canonicalCustomer,
    businessId: ids.business,
    firstName: "Mehmet",
    lastName: "Yılmaz",
    phone: "05321234567",
    normalizedPhone: "+905321234567",
    phoneComparisonKey: "5321234567",
    notes: "Gizli müşteri CRM notu",
  });

  // Merged alias customer pointing to canonicalCustomer
  await db.insert(schema.customers).values({
    id: ids.aliasCustomer,
    businessId: ids.business,
    firstName: "M. Yılmaz",
    phone: "05321234567",
    normalizedPhone: "+905321234567-alias",
    phoneComparisonKey: "5321234567",
    mergedIntoCustomerId: ids.canonicalCustomer,
    mergedAt: new Date(),
    mergedByBusinessMemberId: ids.ownerMember,
  });

  // Customer with invalid phone
  await db.insert(schema.customers).values({
    id: ids.invalidCustomer,
    businessId: ids.business,
    firstName: "Geçersiz",
    phone: "123",
    normalizedPhone: "123",
    phoneComparisonKey: "123",
  });

  await db.insert(schema.appointments).values([
    {
      id: ids.appointment,
      businessId: ids.business,
      customerId: ids.canonicalCustomer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: start,
      endTime: new Date(start.getTime() + 45 * 60_000),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Klasik Saç Kesimi",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "450.00",
      notes: "Müşterinin özel randevu notu",
    },
    {
      id: ids.appointmentAlias,
      businessId: ids.business,
      customerId: ids.aliasCustomer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: start,
      endTime: new Date(start.getTime() + 45 * 60_000),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Klasik Saç Kesimi",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "450.00",
    },
    {
      id: ids.appointmentInvalid,
      businessId: ids.business,
      customerId: ids.invalidCustomer,
      staffId: ids.staffProfile,
      serviceId: ids.service,
      startTime: start,
      endTime: new Date(start.getTime() + 45 * 60_000),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: "Klasik Saç Kesimi",
      serviceDurationSnapshot: 45,
      servicePriceSnapshot: "450.00",
    },
  ]);

  await db.insert(schema.notificationOutbox).values({
    id: ids.outbox,
    businessId: ids.business,
    appointmentId: ids.appointment,
    eventType: "APPOINTMENT_CREATED",
    payload: {},
    payloadVersion: 1,
    idempotencyKey: "outbox-seed".padEnd(64, "0"),
    availableAt: now,
  });
});

after(async () => {
  await server?.stop();
});

beforeEach(async () => {
  await db.delete(schema.notificationDeliveries);
  await db.delete(schema.notificationPlans);
  await db.delete(schema.appointmentAccessTokens);

  // Enable notifications
  await db
    .update(schema.businessNotificationSettings)
    .set({
      customerNotificationsEnabled: true,
      appointmentCreatedEnabled: true,
      appointmentRescheduledEnabled: true,
      appointmentCancelledEnabled: true,
    })
    .where(orm.eq(schema.businessNotificationSettings.businessId, ids.business));

  await db
    .update(schema.appointments)
    .set({
      startTime: start,
      endTime: new Date(start.getTime() + 45 * 60_000),
      status: "CONFIRMED",
    })
    .where(orm.eq(schema.appointments.businessId, ids.business));
});

describe("TASK 016C: Provider Contract Tests", () => {
  it("formats Turkish phone numbers to 10 digits for Netgsm", () => {
    assert.equal(formatPhoneForNetgsm("+905321234567"), "5321234567");
    assert.equal(formatPhoneForNetgsm("05321234567"), "5321234567");
    assert.equal(formatPhoneForNetgsm("5321234567"), "5321234567");
    assert.equal(formatPhoneForNetgsm("+90 (532) 123-4567"), "5321234567");
    assert.equal(formatPhoneForNetgsm("+441234567890"), "441234567890");
  });

  it("handles missing credentials gracefully without throwing", async () => {
    const provider = new NetgsmSmsProvider({
      usercode: "",
      password: "",
      msgheader: "",
    });
    const result = await provider.send({
      to: "+905321234567",
      message: "Test",
    });
    assert.equal(result.accepted, false);
    assert.equal(result.errorCode, "NETGSM_CONFIG_MISSING");
    assert.equal(result.isRetryable, false);
  });

  it("maps Netgsm success response 00 with jobid", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: "00", jobid: "987654321" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const provider = new NetgsmSmsProvider({
        usercode: "user",
        password: "pass",
        msgheader: "HEADER",
      });
      const result = await provider.send({
        to: "+905321234567",
        message: "Test",
      });
      assert.equal(result.accepted, true);
      assert.equal(result.providerMessageId, "987654321");
      assert.equal(result.isRetryable, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("classifies Netgsm error codes into retryable (80, 85) and permanent", async () => {
    const originalFetch = globalThis.fetch;
    const provider = new NetgsmSmsProvider({
      usercode: "user",
      password: "pass",
      msgheader: "HEADER",
    });

    try {
      // Code 85 (Rate limit) -> Retryable
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ code: "85" }), { status: 200 });
      let res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, true);
      assert.equal(res.errorCode, "NETGSM_85");

      // Code 30 (Invalid auth) -> Permanent
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ code: "30" }), { status: 200 });
      res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, false);
      assert.equal(res.errorCode, "NETGSM_30");

      // Code 40 (Header not found) -> Permanent
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ code: "40" }), { status: 200 });
      res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, false);
      assert.equal(res.errorCode, "NETGSM_40");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles HTTP 500 server error as retryable and HTTP 400 as permanent", async () => {
    const originalFetch = globalThis.fetch;
    const provider = new NetgsmSmsProvider({
      usercode: "user",
      password: "pass",
      msgheader: "HEADER",
    });

    try {
      globalThis.fetch = async () =>
        new Response("Server Error", { status: 503 });
      let res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, true);
      assert.equal(res.errorCode, "HTTP_503");

      globalThis.fetch = async () =>
        new Response("Bad Request", { status: 400 });
      res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, false);
      assert.equal(res.errorCode, "HTTP_400");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles network error and timeout safely", async () => {
    const originalFetch = globalThis.fetch;
    const provider = new NetgsmSmsProvider({
      usercode: "user",
      password: "pass",
      msgheader: "HEADER",
    });

    try {
      globalThis.fetch = async () => {
        const error = new Error("Connection timed out");
        error.name = "TimeoutError";
        throw error;
      };
      let res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, true);
      assert.equal(res.errorCode, "TIMEOUT");

      globalThis.fetch = async () => {
        throw new Error("Network unreachable");
      };
      res = await provider.send({ to: "+905321234567", message: "Test" });
      assert.equal(res.accepted, false);
      assert.equal(res.isRetryable, true);
      assert.equal(res.errorCode, "NETWORK_ERROR");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("TASK 016C: Materialization & Stale State", () => {
  it("materializes due CREATED plan into exactly one SMS delivery", async () => {
    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        id: ids.plan,
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: "created-mat-1".padEnd(64, "0"),
      })
      .returning();

    const res = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    assert.equal(res.outcome, "MATERIALIZED");
    assert.ok(res.deliveryId);

    const [d] = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.id, res.deliveryId));
    assert.equal(d.channel, "SMS");
    assert.equal(d.status, "PENDING");
    assert.equal(d.recipient, "+905321234567");
    assert.equal(d.provider, "netgsm");
    assert.equal(d.attemptCount, 0);

    // Repeat materialization returns ALREADY_MATERIALIZED without creating duplicate
    const repeat = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });
    assert.equal(repeat.outcome, "ALREADY_MATERIALIZED");
    assert.equal(repeat.deliveryId, res.deliveryId);

    const count = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.notificationDeliveries);
    assert.equal(count[0].count, 1);
  });

  it("does NOT materialize future or cancelled plan", async () => {
    const futureInstant = new Date(now.getTime() + 3600_000);
    const [futurePlan] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        type: "APPOINTMENT_REMINDER",
        scheduledFor: futureInstant,
        reminderOffsetMinutes: 120,
        idempotencyKey: "future-plan-mat".padEnd(64, "0"),
      })
      .returning();

    const futureRes = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: futurePlan.id,
      referenceNow: now,
    });
    assert.equal(futureRes.outcome, "SKIPPED_NOT_DUE");

    const [cancelledPlan] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        type: "APPOINTMENT_REMINDER",
        scheduledFor: now,
        reminderOffsetMinutes: 60,
        status: "CANCELLED",
        cancelledAt: now,
        idempotencyKey: "cancelled-plan-mat".padEnd(64, "0"),
      })
      .returning();

    const cancelledRes = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: cancelledPlan.id,
      referenceNow: now,
    });
    assert.equal(cancelledRes.outcome, "SKIPPED_PLAN_INACTIVE");
  });

  it("resolves recipient from canonical customer when appointment points to merged alias", async () => {
    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointmentAlias,
        type: "APPOINTMENT_REMINDER",
        reminderOffsetMinutes: 120,
        scheduledFor: now,
        idempotencyKey: "alias-mat-1".padEnd(64, "0"),
      })
      .returning();

    const res = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    assert.equal(res.outcome, "MATERIALIZED");
    const [d] = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.id, res.deliveryId));
    // Must resolve to canonical customer's phone (+905321234567), not the alias raw phone!
    assert.equal(d.recipient, "+905321234567");
  });

  it("records permanent sanitized failure when recipient phone is unavailable or invalid", async () => {
    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointmentInvalid,
        type: "APPOINTMENT_REMINDER",
        reminderOffsetMinutes: 120,
        scheduledFor: now,
        idempotencyKey: "invalid-mat-1".padEnd(64, "0"),
      })
      .returning();

    const res = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    assert.equal(res.outcome, "FAILED_RECIPIENT_UNAVAILABLE");
    const [d] = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.id, res.deliveryId));
    assert.equal(d.status, "FAILED");
    assert.equal(d.lastErrorCode, "RECIPIENT_UNAVAILABLE");
    assert.equal(d.attemptCount, 1);
    assert.ok(d.failedAt);
  });

  it("blocks stale reminder when appointment was cancelled or passed", async () => {
    // 1. Appointment is CANCELLED
    await db
      .update(schema.appointments)
      .set({ status: "CANCELLED" })
      .where(orm.eq(schema.appointments.id, ids.appointment));

    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        type: "APPOINTMENT_REMINDER",
        scheduledFor: now,
        reminderOffsetMinutes: 60,
        idempotencyKey: "stale-rem-1".padEnd(64, "0"),
      })
      .returning();

    const res = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    assert.equal(res.outcome, "SKIPPED_STALE_STATE");

    // Plan should have been marked CANCELLED
    const [updatedPlan] = await db
      .select()
      .from(schema.notificationPlans)
      .where(orm.eq(schema.notificationPlans.id, p.id));
    assert.equal(updatedPlan.status, "CANCELLED");

    // 2. Appointment start time is in the past
    await db
      .update(schema.appointments)
      .set({
        status: "CONFIRMED",
        startTime: new Date(now.getTime() - 1000),
      })
      .where(orm.eq(schema.appointments.id, ids.appointment));

    const [p2] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        type: "APPOINTMENT_REMINDER",
        scheduledFor: now,
        reminderOffsetMinutes: 30,
        idempotencyKey: "stale-rem-past".padEnd(64, "0"),
      })
      .returning();

    const res2 = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p2.id,
      referenceNow: now,
    });
    assert.equal(res2.outcome, "SKIPPED_STALE_STATE");
  });
});

describe("TASK 016C: Templates, Capability Links & Delivery Execution", () => {
  it("renders pure Turkish templates with business name and timezone-formatted date/time", () => {
    const msgCreated = renderNotificationMessage({
      type: "APPOINTMENT_CREATED",
      businessName: "Makas Berber",
      serviceName: "Saç Kesimi",
      dateTimeDisplay: "15 Eki 2026, 14:00",
      managementUrl: "https://app.test.local/randevu#token123",
    });
    assert.ok(msgCreated.includes("Makas Berber"));
    assert.ok(msgCreated.includes("Saç Kesimi"));
    assert.ok(msgCreated.includes("15 Eki 2026, 14:00"));
    assert.ok(msgCreated.includes("Randevu yönetimi: https://app.test.local/randevu#token123"));

    const msgRescheduled = renderNotificationMessage({
      type: "APPOINTMENT_RESCHEDULED",
      businessName: "Makas Berber",
      serviceName: "Saç Kesimi",
      dateTimeDisplay: "16 Eki 2026, 15:30",
      managementUrl: "https://app.test.local/randevu#token456",
    });
    assert.ok(msgRescheduled.includes("olarak güncellendi"));

    const msgCancelled = renderNotificationMessage({
      type: "APPOINTMENT_CANCELLED",
      businessName: "Makas Berber",
      serviceName: "Saç Kesimi",
      dateTimeDisplay: "15 Eki 2026, 14:00",
    });
    assert.ok(msgCancelled.includes("iptal edilmiştir"));

    const msgReminder = renderNotificationMessage({
      type: "APPOINTMENT_REMINDER",
      businessName: "Makas Berber",
      serviceName: "Saç Kesimi",
      dateTimeDisplay: "15 Eki 2026, 14:00",
      managementUrl: "https://app.test.local/randevu#token789",
    });
    assert.ok(msgReminder.includes("tarihindedir"));

    // Verify absence of CRM notes or internal notes
    assert.equal(msgCreated.includes("Gizli"), false);
    assert.equal(msgCreated.includes("Müşterinin özel"), false);
  });

  it("issues fresh capability transiently before send; raw token absent from database tables", async () => {
    const testProvider = new TestSmsProvider();

    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: "cap-test-plan".padEnd(64, "0"),
      })
      .returning();

    // Materialize
    const matRes = await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });
    assert.equal(matRes.outcome, "MATERIALIZED");

    // Claim
    const [claimed] = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-1",
      batchSize: 10,
      referenceNow: now,
    });
    assert.ok(claimed);

    // Send
    const sendRes = await deliveryService.sendClaimedDelivery({
      delivery: claimed,
      workerId: "worker-1",
      referenceNow: now,
      provider: testProvider,
    });

    assert.equal(sendRes.outcome, "SENT");
    assert.equal(testProvider.recordedCalls.length, 1);
    const recordedMessage = testProvider.recordedCalls[0].message;
    assert.ok(recordedMessage.includes("/randevu#"));

    // Extract raw token from recorded message in test memory
    const tokenMatch = recordedMessage.match(/\/randevu#([A-Za-z0-9_-]{43})/);
    assert.ok(tokenMatch);
    const rawToken = tokenMatch[1];

    // VERIFY: rawToken is ABSENT from notification_deliveries table
    const [deliveryRow] = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.id, claimed.id));
    assert.equal(deliveryRow.status, "SENT");
    assert.doesNotMatch(JSON.stringify(deliveryRow), new RegExp(rawToken));

    // VERIFY: rawToken is ABSENT from notification_plans table
    const [planRow] = await db
      .select()
      .from(schema.notificationPlans)
      .where(orm.eq(schema.notificationPlans.id, p.id));
    assert.doesNotMatch(JSON.stringify(planRow), new RegExp(rawToken));

    // VERIFY: rawToken is ABSENT from notification_outbox table
    const [outboxRow] = await db
      .select()
      .from(schema.notificationOutbox)
      .where(orm.eq(schema.notificationOutbox.id, ids.outbox));
    assert.doesNotMatch(JSON.stringify(outboxRow), new RegExp(rawToken));

    // VERIFY: full management URL is ABSENT from database tables
    assert.doesNotMatch(JSON.stringify(deliveryRow), /randevu#/);
    assert.doesNotMatch(JSON.stringify(planRow), /randevu#/);
    assert.doesNotMatch(JSON.stringify(outboxRow), /randevu#/);

    // VERIFY: appointment access token table stores hash only
    const tokens = await db
      .select()
      .from(schema.appointmentAccessTokens)
      .where(orm.eq(schema.appointmentAccessTokens.appointmentId, ids.appointment));
    assert.ok(tokens.length >= 1);
    for (const t of tokens) {
      assert.notEqual(t.tokenHash, rawToken);
      assert.equal(t.tokenHash.length, 64);
    }
  });

  it("handles retryable provider failure and schedules retry; retry issues fresh capability", async () => {
    const testProvider = new TestSmsProvider();
    testProvider.forceRetryableError("NETGSM_85");

    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: "retry-test-plan".padEnd(64, "0"),
      })
      .returning();

    await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    const [claimed] = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-retry",
      batchSize: 10,
      referenceNow: now,
    });

    const sendRes = await deliveryService.sendClaimedDelivery({
      delivery: claimed,
      workerId: "worker-retry",
      referenceNow: now,
      provider: testProvider,
    });

    assert.equal(sendRes.outcome, "FAILED");
    assert.equal(sendRes.isPermanent, false);
    assert.equal(sendRes.errorCode, "NETGSM_85");

    const [d] = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.id, claimed.id));
    assert.equal(d.status, "FAILED");
    assert.equal(d.lastErrorCode, "NETGSM_85");
    assert.equal(d.attemptCount, 1);
    assert.ok(d.availableAt.getTime() > now.getTime()); // scheduled in future!

    // Fast forward to retry available time and force success
    testProvider.forceSuccess("job-success-2");
    const retryNow = new Date(d.availableAt.getTime() + 1000);

    const [reclaimed] = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-retry-2",
      batchSize: 10,
      referenceNow: retryNow,
    });
    assert.equal(reclaimed.id, d.id);
    assert.equal(reclaimed.attemptCount, 2);

    const retrySendRes = await deliveryService.sendClaimedDelivery({
      delivery: reclaimed,
      workerId: "worker-retry-2",
      referenceNow: retryNow,
      provider: testProvider,
    });

    assert.equal(retrySendRes.outcome, "SENT");
    const [finalD] = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.id, claimed.id));
    assert.equal(finalD.status, "SENT");
    assert.equal(finalD.providerMessageId, "job-success-2");
  });
});

describe("TASK 016C: Claiming, Leases & Concurrency", () => {
  it("two workers cannot claim the same delivery", async () => {
    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: "claim-race-plan".padEnd(64, "0"),
      })
      .returning();

    await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    const [c1, c2] = await Promise.all([
      deliveryRepo.claimDueDeliveryBatch({
        workerId: "worker-A",
        batchSize: 1,
        referenceNow: now,
      }),
      deliveryRepo.claimDueDeliveryBatch({
        workerId: "worker-B",
        batchSize: 1,
        referenceNow: now,
      }),
    ]);

    const claimedCount = c1.length + c2.length;
    assert.equal(claimedCount, 1);
  });

  it("active lease is not stolen, and expired lease is recoverable", async () => {
    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: "lease-race-plan".padEnd(64, "0"),
      })
      .returning();

    await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    const [claimed] = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-lease-1",
      batchSize: 1,
      referenceNow: now,
    });
    assert.ok(claimed);

    // Another worker trying immediately cannot steal active lease
    const immediately = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-lease-2",
      batchSize: 1,
      referenceNow: new Date(now.getTime() + 60_000), // 1 min later
    });
    assert.equal(immediately.length, 0);

    // Worker trying after lease expiry (5 minutes) can recover the claim
    const afterExpiry = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-lease-3",
      batchSize: 1,
      referenceNow: new Date(now.getTime() + 5 * 60_000 + 1000),
    });
    assert.equal(afterExpiry.length, 1);
    assert.equal(afterExpiry[0].id, claimed.id);
    assert.equal(afterExpiry[0].lockedBy, "worker-lease-3");
    assert.equal(afterExpiry[0].attemptCount, 2);
  });

  it("worker mismatch prevents markSent or markFailed", async () => {
    const [p] = await db
      .insert(schema.notificationPlans)
      .values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: "mismatch-plan".padEnd(64, "0"),
      })
      .returning();

    await deliveryService.materializeDuePlan({
      businessId: ids.business,
      planId: p.id,
      referenceNow: now,
    });

    const [claimed] = await deliveryRepo.claimDueDeliveryBatch({
      workerId: "worker-owner",
      batchSize: 1,
      referenceNow: now,
    });

    const wrongSent = await deliveryRepo.markSent({
      deliveryId: claimed.id,
      workerId: "worker-intruder",
      referenceNow: now,
    });
    assert.equal(wrongSent, false);

    const wrongFailed = await deliveryRepo.markFailed({
      deliveryId: claimed.id,
      workerId: "worker-intruder",
      errorCode: "TEST",
      isPermanent: true,
      availableAt: now,
      referenceNow: now,
    });
    assert.equal(wrongFailed, false);

    const correctSent = await deliveryRepo.markSent({
      deliveryId: claimed.id,
      workerId: "worker-owner",
      providerMessageId: "job-1",
      referenceNow: now,
    });
    assert.equal(correctSent, true);
  });
});

describe("TASK 016C: Stress Tests (Part 28)", () => {
  it("20 iterations: two concurrent materializers for same plan produce exactly 1 delivery row", async () => {
    for (let i = 0; i < 20; i++) {
      const planId = uuid(1000 + i);
      await db.insert(schema.notificationPlans).values({
        id: planId,
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: createHash("sha256").update(`stress-mat-${i}`).digest("hex"),
      });

      const [r1, r2] = await Promise.all([
        deliveryService.materializeDuePlan({
          businessId: ids.business,
          planId,
          referenceNow: now,
        }),
        deliveryService.materializeDuePlan({
          businessId: ids.business,
          planId,
          referenceNow: now,
        }),
      ]);

      const outcomes = [r1.outcome, r2.outcome];
      assert.ok(outcomes.includes("MATERIALIZED"));
      assert.ok(outcomes.includes("ALREADY_MATERIALIZED") || outcomes.filter(o => o === "MATERIALIZED").length === 1);

      const rows = await db
        .select()
        .from(schema.notificationDeliveries)
        .where(orm.eq(schema.notificationDeliveries.planId, planId));
      assert.equal(rows.length, 1);
    }
  });

  it("20 iterations: two concurrent workers claiming and sending produce 0 duplicate claims", async () => {
    const testProvider = new TestSmsProvider();

    for (let i = 0; i < 20; i++) {
      const planId = uuid(2000 + i);
      await db.insert(schema.notificationPlans).values({
        id: planId,
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: createHash("sha256").update(`stress-claim-${i}`).digest("hex"),
      });

      await deliveryService.materializeDuePlan({
        businessId: ids.business,
        planId,
        referenceNow: now,
      });

      const [c1, c2] = await Promise.all([
        deliveryRepo.claimDueDeliveryBatch({
          workerId: `worker-stress-A-${i}`,
          batchSize: 1,
          referenceNow: now,
        }),
        deliveryRepo.claimDueDeliveryBatch({
          workerId: `worker-stress-B-${i}`,
          batchSize: 1,
          referenceNow: now,
        }),
      ]);

      const totalClaimed = c1.length + c2.length;
      assert.equal(totalClaimed, 1);

      const claimed = c1[0] ?? c2[0];
      const workerId = c1[0] ? `worker-stress-A-${i}` : `worker-stress-B-${i}`;

      const sendRes = await deliveryService.sendClaimedDelivery({
        delivery: claimed,
        workerId,
        referenceNow: now,
        provider: testProvider,
      });
      assert.equal(sendRes.outcome, "SENT");
    }
  });

  it("10 iterations: plan cancellation vs delivery materialization", async () => {
    for (let i = 0; i < 10; i++) {
      const planId = uuid(3000 + i);
      await db.insert(schema.notificationPlans).values({
        id: planId,
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: createHash("sha256").update(`stress-cancel-${i}`).digest("hex"),
      });

      // Race plan cancellation with materialization
      await Promise.all([
        db
          .update(schema.notificationPlans)
          .set({ status: "CANCELLED", cancelledAt: now })
          .where(orm.eq(schema.notificationPlans.id, planId)),
        deliveryService.materializeDuePlan({
          businessId: ids.business,
          planId,
          referenceNow: now,
        }),
      ]);

      // If a delivery row was created, check whether worker safely cancels it before send
      const [del] = await db
        .select()
        .from(schema.notificationDeliveries)
        .where(orm.eq(schema.notificationDeliveries.planId, planId));

      if (del && del.status === "PENDING") {
        const [claimed] = await deliveryRepo.claimDueDeliveryBatch({
          workerId: `worker-cancel-${i}`,
          batchSize: 1,
          referenceNow: now,
        });
        if (claimed) {
          const res = await deliveryService.sendClaimedDelivery({
            delivery: claimed,
            workerId: `worker-cancel-${i}`,
            referenceNow: now,
          });
          assert.equal(res.outcome, "CANCELLED");
        }
      }
    }
  });
});

describe("TASK 016C: Delivery Worker Batch Primitive", () => {
  it("runs processDueNotificationDeliveries end to end", async () => {
    const testProvider = new TestSmsProvider();

    // Create 3 due plans
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.notificationPlans).values({
        businessId: ids.business,
        appointmentId: ids.appointment,
        sourceOutboxId: ids.outbox,
        type: "APPOINTMENT_CREATED",
        scheduledFor: now,
        idempotencyKey: `batch-test-${i}`.padEnd(64, "0"),
      });
    }

    const batchSummary =
      await deliveryService.processDueNotificationDeliveries({
        workerId: "batch-worker-main",
        batchSize: 10,
        referenceNow: now,
        provider: testProvider,
      });

    assert.equal(batchSummary.materialized, 3);
    assert.equal(batchSummary.claimed, 3);
    assert.equal(batchSummary.sent, 3);
    assert.equal(batchSummary.failed, 0);
    assert.equal(batchSummary.cancelled, 0);

    const rows = await db
      .select()
      .from(schema.notificationDeliveries)
      .where(orm.eq(schema.notificationDeliveries.businessId, ids.business));
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.status, "SENT");
      assert.ok(r.sentAt);
      assert.equal(r.providerMessageId, "test-job-123");
    }
  });
});
