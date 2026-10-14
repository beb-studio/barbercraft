import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { customerPhoneComparisonKey } from "../src/lib/phone";

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
  throw new Error("QA owner credentials are required for merge visual QA.");
}

const { db } = await import("../src/db");
const { businesses, customers } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");

const [business] = await db
  .select({ id: businesses.id })
  .from(businesses)
  .where(eq(businesses.slug, "qa-berber"))
  .limit(1);

if (!business) {
  throw new Error("Run pnpm qa:bootstrap before merge visual QA.");
}

const stamp = Date.now().toString().slice(-7);
const nationalPhone = `559${stamp}`;
const names = ["Görsel Eski", "Görsel Birincil", "Görsel Diğer"];
const phones = [`+90${nationalPhone}`, `0${nationalPhone}`, nationalPhone];

await db.insert(customers).values(
  names.map((firstName, index) => ({
    businessId: business.id,
    firstName,
    lastName: stamp,
    phone: phones[index],
    normalizedPhone: phones[index],
    phoneComparisonKey: customerPhoneComparisonKey(phones[index]),
    createdAt: new Date(Date.now() - [3, 1, 2][index] * 24 * 60 * 60 * 1000),
  }))
);

const outputDir = path.resolve(
  "docs/task-reports/artifacts/TASK_013C.2C"
);
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

async function openGroup() {
  await page.goto(`${baseUrl}/dashboard/customers/duplicates`);
  const group = page
    .getByTestId(/^duplicate-group-/)
    .filter({ hasText: `Görsel Birincil ${stamp}` });
  await group.waitFor();
  return group;
}

try {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("E-posta adresi").fill(ownerEmail);
  await page.getByLabel("Şifre").fill(ownerPassword);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/dashboard/);

  let group = await openGroup();
  await group.scrollIntoViewIfNeeded();
  await screenshot("01-mobile-390-duplicate-group.png");
  await group.getByRole("button", { name: "Kayıtları Birleştir" }).click();
  const mobileCanonicalRadio = group.getByRole("radio", {
    name: new RegExp(`Görsel Birincil ${stamp}`),
  });
  await mobileCanonicalRadio.focus();
  await page.keyboard.press("Space");
  if (!(await mobileCanonicalRadio.isChecked())) {
    throw new Error("Canonical radio could not be selected from the keyboard.");
  }
  await screenshot("02-mobile-390-canonical-selection.png");
  await group.getByRole("button", { name: "Birleştirmeyi Gözden Geçir" }).click();
  const mobileDialog = page.getByTestId("merge-confirmation");
  await mobileDialog.waitFor();
  const focusIsInsideDialog = await mobileDialog.evaluate((dialog) =>
    dialog.contains(document.activeElement)
  );
  if (!focusIsInsideDialog) {
    throw new Error("Merge confirmation did not manage focus inside the dialog.");
  }
  await screenshot("03-mobile-390-confirmation-dialog.png");
  await page.keyboard.press("Escape");
  await mobileDialog.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 768, height: 1024 });
  group = await openGroup();
  await group.scrollIntoViewIfNeeded();
  await screenshot("09-tablet-768-duplicate-group.png");

  await page.setViewportSize({ width: 1920, height: 1080 });
  group = await openGroup();
  await group.scrollIntoViewIfNeeded();
  await screenshot("10-wide-1920-duplicate-group.png");

  await page.setViewportSize({ width: 1366, height: 900 });
  group = await openGroup();
  await group.scrollIntoViewIfNeeded();
  await screenshot("05-desktop-1366-duplicate-group.png");
  await group.getByRole("button", { name: "Kayıtları Birleştir" }).click();
  await group
    .getByRole("radio", { name: new RegExp(`Görsel Birincil ${stamp}`) })
    .check({ force: true });
  await screenshot("06-desktop-1366-canonical-selection.png");
  await group.getByRole("button", { name: "Birleştirmeyi Gözden Geçir" }).click();
  await page.getByTestId("merge-confirmation").waitFor();
  await screenshot("07-desktop-1366-confirmation-dialog.png");
  await page.getByRole("button", { name: "Müşterileri Birleştir" }).click();
  await page.waitForURL(/\/dashboard\/customers\/[0-9a-f-]+\?merged=1/);
  await page.getByText("Müşteri kayıtları birleştirildi.").waitFor();
  await page.getByText("Birleştirilen Kayıtlar").waitFor();
  await screenshot("08-desktop-1366-canonical-detail.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("04-mobile-390-canonical-detail.png");
} finally {
  await context.close();
  await browser.close();
}

console.log(`Customer merge visual QA complete: ${outputDir}`);
}

main().catch((error) => {
  console.error(`Customer merge visual QA failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
