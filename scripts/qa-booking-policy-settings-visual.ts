import { createHash, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

async function main() {
if (typeof process.loadEnvFile === "function") {
  for (const envFile of [".env.qa.local", ".env.local", ".env"]) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // Optional local environment file.
    }
  }
}

const ownerEmail = process.env.QA_OWNER_EMAIL;
const ownerPassword = process.env.QA_OWNER_PASSWORD;
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:4380";

if (!ownerEmail || !ownerPassword) {
  throw new Error("QA owner credentials are required for policy visual QA.");
}

const { db } = await import("../src/db");
const {
  appointmentAccessTokens,
  appointments,
  businesses,
  customers,
  services,
  staffProfiles,
  staffServices,
} = await import("../src/db/schema");
const { and, eq } = await import("drizzle-orm");

const [business] = await db
  .select()
  .from(businesses)
  .where(eq(businesses.slug, "qa-berber"))
  .limit(1);
if (!business) throw new Error("Run pnpm qa:bootstrap before policy visual QA.");

const [assignment] = await db
  .select({
    staffId: staffServices.staffId,
    serviceId: staffServices.serviceId,
  })
  .from(staffServices)
  .innerJoin(
    staffProfiles,
    and(
      eq(staffProfiles.id, staffServices.staffId),
      eq(staffProfiles.businessId, business.id),
      eq(staffProfiles.active, true),
      eq(staffProfiles.publicBookingEnabled, true)
    )
  )
  .innerJoin(
    services,
    and(
      eq(services.id, staffServices.serviceId),
      eq(services.businessId, business.id),
      eq(services.active, true)
    )
  )
  .limit(1);
const [customer] = await db
  .select({ id: customers.id })
  .from(customers)
  .where(eq(customers.businessId, business.id))
  .limit(1);
if (!assignment || !customer) {
  throw new Error("QA public scheduling fixtures are incomplete.");
}

const [service] = await db
  .select()
  .from(services)
  .where(
    and(
      eq(services.businessId, business.id),
      eq(services.id, assignment.serviceId)
    )
  )
  .limit(1);
if (!service) throw new Error("QA service fixture is missing.");

const originalPolicy = {
  minimumBookingLeadMinutes: business.minimumBookingLeadMinutes,
  maximumAdvanceBookingDays: business.maximumAdvanceBookingDays,
  cancellationNoticeMinutes: business.cancellationNoticeMinutes,
  rescheduleNoticeMinutes: business.rescheduleNoticeMinutes,
};

await db
  .update(businesses)
  .set({
    minimumBookingLeadMinutes: 0,
    maximumAdvanceBookingDays: null,
    cancellationNoticeMinutes: 0,
    rescheduleNoticeMinutes: 0,
  })
  .where(eq(businesses.id, business.id));

const outputDir = path.resolve("docs/task-reports/artifacts/TASK_015B");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "tr-TR",
  timezoneId: "Europe/Istanbul",
});
const page = await context.newPage();
let visualAppointmentId: string | null = null;

async function screenshot(name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: true,
    animations: "disabled",
    caret: "initial",
  });
}

async function setConfiguredValues() {
  await page.getByLabel("En erken randevu miktarı").fill("2");
  await page.getByLabel("En erken randevu birimi").selectOption("HOUR");
  await page.getByLabel("Sınırsız").uncheck();
  await page.getByLabel("Gün sayısı").fill("30");
  await page.getByLabel("İptal için minimum süre miktarı").fill("4");
  await page.getByLabel("İptal için minimum süre birimi").selectOption("HOUR");
  await page.getByLabel("Değişiklik için minimum süre miktarı").fill("12");
  await page.getByLabel("Değişiklik için minimum süre birimi").selectOption("HOUR");
}

try {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("E-posta adresi").fill(ownerEmail);
  await page.getByLabel("Şifre").fill(ownerPassword);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto(`${baseUrl}/dashboard/settings/booking`);
  await page.getByRole("heading", { name: "Randevu Kuralları" }).waitFor();
  await screenshot("01-mobile-390-settings-default.png");

  await setConfiguredValues();
  await page.getByRole("button", { name: "Kuralları Kaydet" }).click();
  await page.getByText("Randevu kuralları güncellendi.").waitFor();
  await screenshot("02a-mobile-390-save-pending.png");
  await page.getByRole("button", { name: "Kuralları Kaydet" }).waitFor();
  await screenshot("02-mobile-390-settings-configured.png");

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByLabel("Sınırsız").check();
  await screenshot("03-tablet-768-unlimited-horizon.png");
  await page.getByLabel("Sınırsız").uncheck();
  await page.getByLabel("Gün sayısı").fill("30");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("En erken randevu miktarı").fill("-1");
  await page.getByRole("button", { name: "Kuralları Kaydet" }).click();
  await page.getByText("Girdiğiniz randevu kuralları geçerli değil.").waitFor();
  await screenshot("04-mobile-390-validation-error.png");

  await page.reload();
  await page.getByRole("heading", { name: "Randevu Kuralları" }).waitFor();
  await db
    .update(businesses)
    .set({ minimumBookingLeadMinutes: 60 })
    .where(eq(businesses.id, business.id));
  await page.getByRole("button", { name: "Kuralları Kaydet" }).click();
  await page
    .getByText(/Ayarlar başka bir kullanıcı tarafından güncellendi/)
    .waitFor();
  await screenshot("05-mobile-390-stale-settings.png");

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.reload();
  await page.getByText("Geçerli Kural Özeti").waitFor();
  await screenshot("06-desktop-1366-settings-and-summary.png");

  await page.goto(
    `${baseUrl}/book/${business.slug}/schedule?service=${assignment.serviceId}&staff=${assignment.staffId}`
  );
  await page.getByRole("heading", { name: "Tarih Seçimi" }).waitFor();
  await page.getByText(/Randevular en erken 1 saat sonrası/).waitFor();
  await screenshot("07-desktop-1366-public-booking-policy.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("08-mobile-390-public-booking-policy.png");

  const rawCapability = randomBytes(32).toString("base64url");
  const startsAt = new Date(Date.now() + 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const [appointment] = await db
    .insert(appointments)
    .values({
      businessId: business.id,
      customerId: customer.id,
      staffId: assignment.staffId,
      serviceId: service.id,
      startTime: startsAt,
      endTime: endsAt,
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: service.name,
      serviceDurationSnapshot: service.durationMinutes,
      servicePriceSnapshot: service.price,
    })
    .returning({ id: appointments.id });
  visualAppointmentId = appointment.id;
  await db.insert(appointmentAccessTokens).values({
    businessId: business.id,
    appointmentId: appointment.id,
    tokenHash: createHash("sha256").update(rawCapability).digest("hex"),
    expiresAt: new Date(endsAt.getTime() + 24 * 60 * 60_000),
  });

  await page.goto(`${baseUrl}/randevu#${rawCapability}`);
  await page.getByRole("heading", { name: "Randevunuz" }).waitFor();
  await page.getByText("Çevrim içi iptal süresi doldu.", { exact: false }).waitFor();
  await screenshot("09-mobile-390-management-policy-restricted.png");
  await page.setViewportSize({ width: 1366, height: 900 });
  await screenshot("10-desktop-1366-management-policy-restricted.png");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${baseUrl}/dashboard/settings/booking`);
  await page.getByText("Geçerli Kural Özeti").waitFor();
  await screenshot("11-wide-1920-settings.png");
} finally {
  if (visualAppointmentId) {
    await db
      .delete(appointments)
      .where(eq(appointments.id, visualAppointmentId));
  }
  await db
    .update(businesses)
    .set(originalPolicy)
    .where(eq(businesses.id, business.id));
  await context.close();
  await browser.close();
}

console.log(`Booking policy visual QA complete: ${outputDir}`);
}

main().catch((error) => {
  console.error(`Booking policy visual QA failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
