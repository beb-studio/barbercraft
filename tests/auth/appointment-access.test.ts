/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
  canonical: uuid(50),
  alias: uuid(51),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let PublicBookingService: any;
let AppointmentService: any;
let AppointmentAccessService: any;
let calculateAppointmentAccessExpiry: (endTime: Date) => Date;

function rawTokenFromPath(pathname: string): string {
  const token = pathname.split("#").at(-1);
  assert.ok(token, "management path must contain a token");
  return decodeURIComponent(token);
}

async function tokenRow(rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const [row] = await db
    .select()
    .from(schema.appointmentAccessTokens)
    .where(orm.eq(schema.appointmentAccessTokens.tokenHash, tokenHash));
  return row;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  ({ PublicBookingService } = await import(
    "../../src/services/public-booking.service"
  ));
  ({ AppointmentService } = await import("../../src/services/appointment.service"));
  ({ AppointmentAccessService, calculateAppointmentAccessExpiry } = await import(
    "../../src/services/appointment-access.service"
  ));

  await db.insert(schema.users).values([
    {
      id: ids.ownerA,
      name: "Token Owner A",
      email: "token-owner-a@auth.test",
      emailVerified: true,
    },
    {
      id: ids.ownerB,
      name: "Token Owner B",
      email: "token-owner-b@auth.test",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "Güvenli Berber",
      slug: "guvenli-berber",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      active: true,
      onboardingCompletedAt: new Date(),
    },
    {
      id: ids.businessB,
      name: "Başka İşletme",
      slug: "baska-isletme-token",
      timezone: "Europe/Istanbul",
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
      firstName: "Yabancı",
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
      name: "Yabancı Hizmet",
      durationMinutes: 30,
      price: "999.00",
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
        startTime: "09:00:00",
        endTime: "18:00:00",
      }))
    )
  );
  await db.insert(schema.customers).values([
    {
      id: ids.canonical,
      businessId: ids.businessA,
      firstName: "Birincil",
      lastName: "Müşteri",
      phone: "+905551111111",
      normalizedPhone: "+905551111111",
    },
    {
      id: ids.alias,
      businessId: ids.businessA,
      firstName: "Eski",
      lastName: "Müşteri",
      phone: "0555 111 11 11",
      normalizedPhone: "05551111111",
      mergedIntoCustomerId: ids.canonical,
      mergedAt: new Date("2029-01-01T10:00:00Z"),
      mergedByBusinessMemberId: ids.memberA,
    },
  ]);
});

after(async () => {
  await pgServer?.stop();
});

describe("Appointment access token service", { concurrency: false }, () => {
  let specificConfirmation: any;
  let specificRawToken: string;
  let specificAppointment: any;

  it("issues management access atomically for a specific-staff public booking", async () => {
    specificConfirmation = await PublicBookingService.createPublicAppointment({
      slug: "guvenli-berber",
      serviceId: ids.serviceA,
      staffId: ids.staffA,
      startAt: "2030-01-08T07:00:00.000Z",
      customerName: "Eski Müşteri",
      customerPhone: "05551111111",
    });

    assert.match(specificConfirmation.managementPath, /^\/randevu#[A-Za-z0-9_-]{43}$/);
    specificRawToken = rawTokenFromPath(specificConfirmation.managementPath);
    assert.equal(Buffer.from(specificRawToken, "base64url").byteLength, 32);

    const rows = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.startTime, new Date("2030-01-08T07:00:00Z")));
    assert.equal(rows.length, 1);
    specificAppointment = rows[0];
    assert.equal(specificAppointment.customerId, ids.canonical);

    const stored = await tokenRow(specificRawToken);
    assert.ok(stored);
    assert.notEqual(stored.tokenHash, specificRawToken);
    assert.equal(stored.tokenHash.length, 64);
    assert.equal(stored.appointmentId, specificAppointment.id);
    assert.equal(
      stored.expiresAt.toISOString(),
      calculateAppointmentAccessExpiry(specificAppointment.endTime).toISOString()
    );
  });

  it("resolves a valid token to the minimal snapshot-aware public DTO", async () => {
    await db
      .update(schema.appointments)
      .set({ notes: "Gizli randevu notu" })
      .where(orm.eq(schema.appointments.id, specificAppointment.id));
    await db.insert(schema.customerNotes).values({
      businessId: ids.businessA,
      customerId: ids.canonical,
      content: "Gizli CRM notu",
      createdByBusinessMemberId: ids.memberA,
    });

    const resolved = await AppointmentAccessService.resolve(
      specificRawToken,
      new Date("2030-01-08T07:15:00Z")
    );
    assert.deepEqual(Object.keys(resolved).sort(), [
      "businessName",
      "canCancel",
      "currency",
      "dateLabel",
      "durationMinutes",
      "localEndTime",
      "localStartTime",
      "price",
      "serviceName",
      "staffDisplayName",
      "status",
    ]);
    assert.equal(resolved.businessName, "Güvenli Berber");
    assert.equal(resolved.serviceName, "Güvenli Kesim");
    assert.equal(resolved.staffDisplayName, "Ayşe Usta");
    assert.equal(resolved.status, "CONFIRMED");
    assert.equal(resolved.canCancel, false);
    assert.equal(resolved.notes, undefined);
    assert.equal(resolved.customerId, undefined);
    assert.equal(resolved.appointmentId, undefined);
    assert.equal(resolved.mergedIntoCustomerId, undefined);
    assert.doesNotMatch(JSON.stringify(resolved), /Gizli|80000000-/);
  });

  it("fails malformed, unknown, and expired tokens with the same null outcome", async () => {
    assert.equal(await AppointmentAccessService.resolve("short"), null);
    assert.equal(await AppointmentAccessService.resolve("x".repeat(43)), null);

    const stored = await tokenRow(specificRawToken);
    assert.equal(
      await AppointmentAccessService.resolve(
        specificRawToken,
        new Date(stored.expiresAt.getTime() + 1)
      ),
      null
    );
  });

  it("supports fresh parallel-valid issuance and explicit revocation", async () => {
    const replacement = await AppointmentAccessService.issue({
      businessId: ids.businessA,
      appointmentId: specificAppointment.id,
    });
    assert.notEqual(replacement.rawToken, specificRawToken);
    assert.ok(await AppointmentAccessService.resolve(replacement.rawToken));
    assert.ok(await AppointmentAccessService.resolve(specificRawToken));

    assert.equal(await AppointmentAccessService.revoke(replacement.rawToken), true);
    assert.equal(await AppointmentAccessService.resolve(replacement.rawToken), null);
    assert.ok(await AppointmentAccessService.resolve(specificRawToken));
    assert.equal(await AppointmentAccessService.revoke("malformed"), false);
  });

  it("issues management access for Fark Etmez without duplicate customer or appointment", async () => {
    const beforeCustomers = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.customers);
    const beforeAppointments = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.appointments);

    const confirmation = await PublicBookingService.createPublicAppointment({
      slug: "guvenli-berber",
      serviceId: ids.serviceA,
      staffId: "any",
      startAt: "2030-01-08T08:00:00.000Z",
      customerName: "Eski Müşteri",
      customerPhone: "05551111111",
    });
    const token = rawTokenFromPath(confirmation.managementPath);
    assert.ok(await AppointmentAccessService.resolve(token));

    const afterCustomers = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.customers);
    const afterAppointments = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.appointments);
    assert.equal(afterCustomers[0].count, beforeCustomers[0].count);
    assert.equal(afterAppointments[0].count, beforeAppointments[0].count + 1);
  });

  it("does not auto-issue for manual appointments and can issue later", async () => {
    const appointment = await AppointmentService.createAppointment({
      businessId: ids.businessA,
      staffId: ids.staffA,
      serviceId: ids.serviceA,
      startAt: "2030-01-08T09:00:00.000Z",
      customerId: ids.canonical,
      context: "INTERNAL",
      source: "MANUAL_ADMIN",
    });
    const initialTokens = await db
      .select()
      .from(schema.appointmentAccessTokens)
      .where(orm.eq(schema.appointmentAccessTokens.appointmentId, appointment.id));
    assert.equal(initialTokens.length, 0);

    const issued = await AppointmentAccessService.issue({
      businessId: ids.businessA,
      appointmentId: appointment.id,
    });
    assert.ok(await AppointmentAccessService.resolve(issued.rawToken));

    const rescheduledEnd = new Date("2030-01-08T12:00:00.000Z");
    await AppointmentAccessService.refreshExpirationAfterReschedule(db, {
      businessId: ids.businessA,
      appointmentId: appointment.id,
      appointmentEndTime: rescheduledEnd,
    });
    const refreshed = await tokenRow(issued.rawToken);
    assert.equal(
      refreshed.expiresAt.toISOString(),
      calculateAppointmentAccessExpiry(rescheduledEnd).toISOString()
    );
  });

  it("rolls back appointment, customer, and token if token persistence fails", async () => {
    const beforeAppointments = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.appointments);
    const beforeCustomers = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.customers);
    const beforeTokens = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.appointmentAccessTokens);

    await db.execute(`
      CREATE FUNCTION reject_appointment_access_token_for_test()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'test token persistence failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_appointment_access_token_for_test_trigger
      BEFORE INSERT ON appointment_access_tokens
      FOR EACH ROW EXECUTE FUNCTION reject_appointment_access_token_for_test();
    `);

    try {
      await assert.rejects(
        PublicBookingService.createPublicAppointment({
          slug: "guvenli-berber",
          serviceId: ids.serviceA,
          staffId: ids.staffA,
          startAt: "2030-01-08T10:00:00.000Z",
          customerName: "Rollback Müşteri",
          customerPhone: "+905559999999",
        })
      );
    } finally {
      await db.execute(`
        DROP TRIGGER reject_appointment_access_token_for_test_trigger
          ON appointment_access_tokens;
        DROP FUNCTION reject_appointment_access_token_for_test();
      `);
    }

    const afterAppointments = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.appointments);
    const afterCustomers = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.customers);
    const afterTokens = await db
      .select({ count: orm.sql<number>`count(*)::int` })
      .from(schema.appointmentAccessTokens);
    assert.deepEqual(afterAppointments, beforeAppointments);
    assert.deepEqual(afterCustomers, beforeCustomers);
    assert.deepEqual(afterTokens, beforeTokens);
  });

  it("keeps tenant data isolated and exposes only Turkish status presentation", async () => {
    const resolved = await AppointmentAccessService.resolve(specificRawToken);
    assert.ok(resolved);
    assert.equal(resolved.businessName, "Güvenli Berber");
    assert.notEqual(resolved.businessName, "Başka İşletme");

    const { getAppointmentStatusLabel } = await import("../../src/lib/presentation");
    assert.deepEqual(
      ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"].map(
        getAppointmentStatusLabel
      ),
      ["Bekliyor", "Onaylandı", "Tamamlandı", "Gelmedi", "İptal Edildi"]
    );
  });
});

describe("Public management route security contract", () => {
  it("uses one generic invalid-link message and exposes no reschedule or internal identifiers", async () => {
    const routeSource = await readFile(
      path.resolve("src/app/(public)/randevu/page.tsx"),
      "utf8"
    );
    const clientSource = await readFile(
      path.resolve(
        "src/app/(public)/randevu/appointment-management-client.tsx"
      ),
      "utf8"
    );
    const invalidSource = await readFile(
      path.resolve("src/components/public/invalid-appointment-link.tsx"),
      "utf8"
    );
    assert.match(invalidSource, /geçersiz veya artık kullanılamıyor/);
    assert.doesNotMatch(invalidSource, /süresi doldu|iptal edildi|bulunamadı/i);
    assert.match(clientSource, /Randevuyu İptal Et/);
    assert.doesNotMatch(clientSource, /Yeniden Planla|customerId|appointmentId|cancellationReason/);
    assert.match(routeSource, /AppointmentManagementClient/);
    assert.match(clientSource, /resolveAppointmentAccessAction/);
    assert.match(clientSource, /window\.history\.replaceState/);
  });

  it("marks the route no-store, noindex, and no-referrer", async () => {
    const nextConfig = (await import("../../next.config")).default;
    const configuredHeaders = await nextConfig.headers?.();
    const managementHeaders = configuredHeaders?.find(
      (entry: any) => entry.source === "/randevu/:path*"
    );
    assert.ok(managementHeaders);
    const headerMap = Object.fromEntries(
      managementHeaders.headers.map((header: any) => [header.key, header.value])
    );
    assert.match(headerMap["Cache-Control"], /private/);
    assert.match(headerMap["Cache-Control"], /no-store/);
    assert.equal(headerMap["Referrer-Policy"], "no-referrer");
    assert.match(headerMap["X-Robots-Tag"], /noindex/);

    const layoutSource = await readFile(
      path.resolve("src/app/(public)/randevu/layout.tsx"),
      "utf8"
    );
    const middlewareSource = await readFile(
      path.resolve("src/middleware.ts"),
      "utf8"
    );
    assert.match(layoutSource, /index: false/);
    assert.match(layoutSource, /follow: false/);
    assert.match(middlewareSource, /private, no-store/);
    assert.match(middlewareSource, /pathname === "\/randevu"/);
    const logging = nextConfig.logging as
      | { serverFunctions?: boolean; incomingRequests?: unknown }
      | undefined;
    assert.equal(logging?.serverFunctions, false);
    assert.ok(logging?.incomingRequests);
  });

  it("returns the management secret only inside the expected one-time success path", async () => {
    const actionSource = await readFile(
      path.resolve("src/actions/public-booking.actions.ts"),
      "utf8"
    );
    const formSource = await readFile(
      path.resolve("src/app/book/[slug]/confirm/booking-form.tsx"),
      "utf8"
    );
    assert.match(actionSource, /managementPath: string/);
    assert.match(actionSource, /category:/);
    assert.doesNotMatch(actionSource, /console\.error\([^\n]*, e\)/);
    assert.match(formSource, /Randevuyu Yönet/);
    assert.match(formSource, /href=\{successData\.managementPath\}/);
    assert.doesNotMatch(formSource, /<(code|pre)[^>]*>[^<]*managementPath/);
  });
});
