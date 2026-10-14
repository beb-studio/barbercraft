import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Route } from "playwright";

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
  if (!business) throw new Error("Run pnpm qa:bootstrap before visual QA.");

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

  const confirmation = await PublicBookingService.createPublicAppointment({
    slug: "qa-berber",
    serviceId: service.id,
    staffId: staff.id,
    startAt: selectedSlot.startAt,
    customerName: "Görsel İptal Müşterisi",
    customerPhone: `0557${Date.now().toString().slice(-7)}`,
  });
  if (!confirmation.managementPath.startsWith("/randevu#")) {
    throw new Error("Management capability path was not issued safely.");
  }

  const outputDir = path.resolve("docs/task-reports/artifacts/TASK_014B");
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
    await page.goto(new URL(confirmation.managementPath, baseUrl).toString());
    await page.getByRole("heading", { name: "Randevunuz" }).waitFor();
    const cancelButton = page.getByRole("button", {
      name: "Randevuyu İptal Et",
    });
    await cancelButton.waitFor();

    await screenshot("01-mobile-390-cancellable.png");
    await cancelButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    assertDialogFocus(await dialog.evaluate((element) => element.contains(document.activeElement)));
    await screenshot("02-mobile-390-confirmation.png");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("04-tablet-768-cancellable.png");
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot("05-desktop-1366-cancellable.png");
    await cancelButton.click();
    await dialog.waitFor();
    await screenshot("06-desktop-1366-confirmation.png");
    await page.getByRole("button", { name: "Vazgeç" }).click();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("08-wide-1920-cancellable.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await cancelButton.click();
    const delayedPost = async (route: Route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      await route.continue();
    };
    await page.route("**/randevu", delayedPost);
    await page
      .getByRole("button", { name: "Randevuyu İptal Et", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "İptal Ediliyor..." }).waitFor();
    await screenshot("03-mobile-390-pending.png");
    await page.getByText("Randevunuz iptal edildi.").waitFor();
    await page.unroute("**/randevu", delayedPost);

    await screenshot("09-mobile-390-cancelled.png");
    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("10-tablet-768-cancelled.png");
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot("07-desktop-1366-cancelled.png");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("11-wide-1920-cancelled.png");

    if (await cancelButton.isVisible()) {
      throw new Error("Cancellation control remained visible after success.");
    }
    await page.reload();
    await page
      .getByRole("heading", { name: "Randevu Bağlantısı Kullanılamıyor" })
      .waitFor();
    // Reload intentionally has no fragment after one-time capture. Revisit the
    // original capability to prove the retained token still renders cancelled.
    await page.goto(baseUrl);
    await page.goto(new URL(confirmation.managementPath, baseUrl).toString());
    await page.getByText("İptal Edildi").waitFor();

    await page.goto(baseUrl);
    await page.goto(`${baseUrl}/randevu#gecersiz`);
    await page
      .getByRole("heading", { name: "Randevu Bağlantısı Kullanılamıyor" })
      .waitFor();
    await screenshot("12-wide-1920-invalid-capability.png");
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`Public cancellation visual QA complete: ${outputDir}`);
}

function assertDialogFocus(hasFocus: boolean) {
  if (!hasFocus) throw new Error("Confirmation dialog did not receive focus.");
}

main().catch((error) => {
  console.error(`Public cancellation visual QA failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
