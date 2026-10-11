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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3001";
  const { db } = await import("../src/db");
  const { businesses } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { PublicBookingService } = await import(
    "../src/services/public-booking.service"
  );
  const { AppointmentAccessService } = await import(
    "../src/services/appointment-access.service"
  );
  const { getBusinessLocalToday } = await import("../src/lib/timezone");

  const [business] = await db
    .select({ id: businesses.id, timezone: businesses.timezone })
    .from(businesses)
    .where(eq(businesses.slug, "qa-berber"))
    .limit(1);
  if (!business) throw new Error("Run pnpm qa:bootstrap before visual QA.");

  const publicServices = await PublicBookingService.getPublicServices("qa-berber");
  let service: (typeof publicServices)[number] | undefined;
  let staff:
    | Awaited<
        ReturnType<typeof PublicBookingService.getEligibleStaffForService>
      >[number]
    | undefined;
  for (const candidateService of publicServices) {
    const eligibleStaff =
      await PublicBookingService.getEligibleStaffForService(
        "qa-berber",
        candidateService.id
      );
    if (eligibleStaff[0]) {
      service = candidateService;
      staff = eligibleStaff[0];
      break;
    }
  }
  if (!service || !staff) {
    throw new Error("QA business has no publicly eligible service/staff pair.");
  }

  const today = getBusinessLocalToday(business.timezone);
  const [year, month, day] = today.split("-").map(Number);
  let selectedDate = "";
  let bookingSlots: Array<{ startAt: string }> = [];
  for (let offset = 1; offset <= 30 && bookingSlots.length < 4; offset += 1) {
    const localDate = new Date(Date.UTC(year, month - 1, day + offset))
      .toISOString()
      .slice(0, 10);
    const availability = await PublicBookingService.getPublicAvailability({
      slug: "qa-berber",
      serviceId: service.id,
      staffId: staff.id,
      localDate,
    });
    if (availability.slots.length >= 4) {
      selectedDate = localDate;
      bookingSlots = availability.slots;
    }
  }
  if (!selectedDate || bookingSlots.length < 4) {
    throw new Error("No QA date with enough reschedule slots found in 30 days.");
  }

  const confirmation = await PublicBookingService.createPublicAppointment({
    slug: "qa-berber",
    serviceId: service.id,
    staffId: staff.id,
    startAt: bookingSlots[0].startAt,
    customerName: "Görsel Değişiklik Müşterisi",
    customerPhone: `0558${Date.now().toString().slice(-7)}`,
  });
  if (!confirmation.managementPath.startsWith("/randevu#")) {
    throw new Error("Management capability path was not issued safely.");
  }
  const rawToken = confirmation.managementPath.slice("/randevu#".length);
  const initialAvailability =
    await AppointmentAccessService.getRescheduleAvailability(
      rawToken,
      selectedDate
    );
  if (initialAvailability.outcome !== "AVAILABLE" || initialAvailability.slots.length < 2) {
    throw new Error("Issued appointment has insufficient reschedule availability.");
  }
  const originalEnd =
    new Date(bookingSlots[0].startAt).getTime() + service.durationMinutes * 60_000;
  const staleTarget = initialAvailability.slots.find(
    (slot) => new Date(slot.startAt).getTime() >= originalEnd
  );
  if (!staleTarget) {
    throw new Error("No non-overlapping slot remained for stale-slot QA.");
  }

  const outputDir = path.resolve("docs/task-reports/artifacts/TASK_014C");
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
    const entry = page.getByRole("button", {
      name: "Randevu Saatini Değiştir",
    });
    await entry.waitFor();
    await screenshot("01-mobile-390-entry.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("02-tablet-768-entry.png");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("03-wide-1920-entry.png");
    await page.setViewportSize({ width: 390, height: 844 });

    await entry.click();
    await page
      .getByRole("button", { name: staleTarget.localStartTime, exact: true })
      .waitFor();
    await screenshot("04-mobile-390-slot-selection.png");
    await page
      .getByRole("button", { name: staleTarget.localStartTime, exact: true })
      .click();
    await page.getByRole("button", { name: "Değişikliği Gözden Geçir" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    assertDialogFocus(
      await dialog.evaluate((element) => element.contains(document.activeElement))
    );
    await screenshot("05-mobile-390-review-confirmation.png");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    await PublicBookingService.createPublicAppointment({
      slug: "qa-berber",
      serviceId: service.id,
      staffId: staff.id,
      startAt: staleTarget.startAt,
      customerName: "Görsel Rakip Müşteri",
      customerPhone: `0559${Date.now().toString().slice(-7)}`,
    });
    await page.getByRole("button", { name: "Değişikliği Gözden Geçir" }).click();
    await page
      .getByRole("button", { name: "Randevuyu Değiştir", exact: true })
      .click();
    await page
      .getByText("Seçtiğiniz saat artık uygun değil. Lütfen başka bir saat seçin.")
      .waitFor();
    await screenshot("06-mobile-390-stale-slot.png");

    const refreshedAvailability =
      await AppointmentAccessService.getRescheduleAvailability(
        rawToken,
        selectedDate
      );
    if (
      refreshedAvailability.outcome !== "AVAILABLE" ||
      refreshedAvailability.slots.length === 0
    ) {
      throw new Error("No replacement slot remained after stale-slot QA.");
    }
    const successfulTarget = refreshedAvailability.slots[0];

    await page.goto(baseUrl);
    await page.goto(new URL(confirmation.managementPath, baseUrl).toString());
    await page.getByRole("heading", { name: "Randevunuz" }).waitFor();
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot("07-desktop-1366-entry.png");
    await page
      .getByRole("button", { name: "Randevu Saatini Değiştir" })
      .click();
    await page
      .getByRole("button", { name: successfulTarget.localStartTime, exact: true })
      .waitFor();
    await screenshot("08-desktop-1366-slot-selection.png");
    await page
      .getByRole("button", { name: successfulTarget.localStartTime, exact: true })
      .click();
    await page.getByRole("button", { name: "Değişikliği Gözden Geçir" }).click();
    await dialog.waitFor();
    await screenshot("09-desktop-1366-review-confirmation.png");

    const delayedPost = async (route: Route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      await route.continue();
    };
    await page.route("**/randevu", delayedPost);
    await page
      .getByRole("button", { name: "Randevuyu Değiştir", exact: true })
      .click();
    await page.getByRole("button", { name: "Randevu Değiştiriliyor..." }).waitFor();
    await screenshot("10-desktop-1366-pending.png");
    await page.getByText("Randevunuz güncellendi.").waitFor();
    await page.unroute("**/randevu", delayedPost);
    await screenshot("11-desktop-1366-success.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot("12-mobile-390-success.png");
    await page.setViewportSize({ width: 768, height: 1024 });
    await screenshot("13-tablet-768-success.png");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await screenshot("14-wide-1920-success.png");

    const parallelView = await AppointmentAccessService.resolve(rawToken);
    if (
      !parallelView ||
      parallelView.localStartTime !== successfulTarget.localStartTime
    ) {
      throw new Error("Capability did not resolve the refreshed schedule.");
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`Public reschedule visual QA complete: ${outputDir}`);
}

function assertDialogFocus(hasFocus: boolean) {
  if (!hasFocus) throw new Error("Reschedule dialog did not receive focus.");
}

main().catch((error) => {
  console.error(`Public reschedule visual QA failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
