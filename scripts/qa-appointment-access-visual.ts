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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:4380";
  const { db } = await import("../src/db");
  const { businesses, services } = await import("../src/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { PublicBookingService } = await import(
    "../src/services/public-booking.service"
  );
  const { getBusinessLocalToday } = await import("../src/lib/timezone");

  const [business] = await db
    .select({ id: businesses.id, timezone: businesses.timezone })
    .from(businesses)
    .where(eq(businesses.slug, "qa-berber"))
    .limit(1);
  if (!business) {
    throw new Error("Run pnpm qa:bootstrap before appointment access visual QA.");
  }

  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.businessId, business.id), eq(services.active, true)))
    .limit(1);
  if (!service) throw new Error("QA business has no active service.");

  const eligibleStaff = await PublicBookingService.getEligibleStaffForService(
    "qa-berber",
    service.id
  );
  const staff = eligibleStaff[0];
  if (!staff) throw new Error("QA business has no publicly eligible staff.");

  const today = getBusinessLocalToday(business.timezone);
  const [year, month, day] = today.split("-").map(Number);
  let selectedSlot: { startAt: string } | null = null;
  for (let offset = 1; offset <= 30 && !selectedSlot; offset += 1) {
    const localDate = new Date(Date.UTC(year, month - 1, day + offset))
      .toISOString()
      .slice(0, 10);
    const availability = await PublicBookingService.getPublicAvailability({
      slug: "qa-berber",
      serviceId: service.id,
      staffId: staff.id,
      localDate,
    });
    selectedSlot = availability.slots[0] ?? null;
  }
  if (!selectedSlot) throw new Error("No QA appointment slot found in 30 days.");

  const confirmUrl = new URL(`/book/qa-berber/confirm`, baseUrl);
  confirmUrl.searchParams.set("service", service.id);
  confirmUrl.searchParams.set("staff", staff.id);
  confirmUrl.searchParams.set("start", selectedSlot.startAt);

  const outputDir = path.resolve("docs/task-reports/artifacts/TASK_014A");
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  const page = await context.newPage();

  async function screenshot(name: string) {
    await page.screenshot({
      path: path.join(outputDir, name),
      fullPage: true,
      animations: "disabled",
    });
  }

  try {
    await page.goto(confirmUrl.toString());
    await page.getByLabel("Ad Soyad").fill("Görsel Randevu Müşterisi");
    await page
      .getByLabel("Telefon Numarası")
      .fill(`0558${Date.now().toString().slice(-7)}`);
    await page.getByRole("button", { name: "Randevuyu Onayla" }).click();
    await page.getByRole("heading", { name: "Randevunuz Oluşturuldu" }).waitFor();

    const managementLink = page.getByRole("link", { name: "Randevuyu Yönet" });
    const managementPath = await managementLink.getAttribute("href");
    if (!managementPath?.startsWith("/randevu#")) {
      throw new Error("Management CTA did not receive a safe appointment path.");
    }

    await screenshot("01-mobile-390-confirmation.png");
    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("06-tablet-768-confirmation.png");
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot("04-desktop-1366-confirmation.png");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("09-wide-1920-confirmation.png");

    const managementResponse = await page.goto(new URL(managementPath, baseUrl).toString());
    if (!managementResponse) throw new Error("Management route did not respond.");
    const headers = managementResponse.headers();
    const cacheControl = headers["cache-control"] || "";
    const hasNonCacheablePolicy =
      cacheControl.includes("no-store") ||
      (cacheControl.includes("no-cache") &&
        cacheControl.includes("must-revalidate"));
    if (!hasNonCacheablePolicy) {
      throw new Error("Management response is missing non-cacheable protection.");
    }
    if (headers["referrer-policy"] !== "no-referrer") {
      throw new Error("Management response is missing no-referrer protection.");
    }
    await page.getByRole("heading", { name: "Randevunuz" }).waitFor();
    await screenshot("10-wide-1920-management.png");
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot("05-desktop-1366-management.png");
    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("07-tablet-768-management.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot("02-mobile-390-management.png");

    await page.goto(baseUrl);
    await page.goto(`${baseUrl}/randevu#gecersiz`);
    await page
      .getByRole("heading", { name: "Randevu Bağlantısı Kullanılamıyor" })
      .waitFor();
    await screenshot("03-mobile-390-invalid-token.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("08-tablet-768-invalid-token.png");
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot("12-desktop-1366-invalid-token.png");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("11-wide-1920-invalid-token.png");
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`Appointment access visual QA complete: ${outputDir}`);
}

main().catch((error) => {
  console.error(`Appointment access visual QA failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
