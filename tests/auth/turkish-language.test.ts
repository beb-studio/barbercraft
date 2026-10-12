import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getAppointmentStatusLabel,
  getRoleLabel,
  getPlatformRoleLabel,
  getAppointmentSourceLabel,
  getTimeBlockTypeLabel,
  getTimeBlockStatusLabel,
  formatCurrency,
  getCurrencySymbol,
  formatPercentage,
  getAnalyticsRangePresetLabel,
  mapAuthError,
} from "@/lib/presentation";

describe("TASK 009B: Turkish Language & Presentation Standardization", () => {
  describe("1. Appointment Status Presentation", () => {
    it("maps all appointment statuses to exact Turkish labels", () => {
      assert.equal(getAppointmentStatusLabel("PENDING"), "Bekliyor");
      assert.equal(getAppointmentStatusLabel("CONFIRMED"), "Onaylandı");
      assert.equal(getAppointmentStatusLabel("COMPLETED"), "Tamamlandı");
      assert.equal(getAppointmentStatusLabel("NO_SHOW"), "Gelmedi");
      assert.equal(getAppointmentStatusLabel("CANCELLED"), "İptal Edildi");
    });
  });

  describe("2. Role Presentation", () => {
    it("maps all business roles to Turkish labels", () => {
      assert.equal(getRoleLabel("OWNER"), "İşletme Sahibi");
      assert.equal(getRoleLabel("ADMIN"), "Yönetici");
      assert.equal(getRoleLabel("STAFF"), "Personel");
    });

    it("maps platform admin roles to Turkish labels", () => {
      assert.equal(getPlatformRoleLabel("SUPER_ADMIN"), "Süper Yönetici");
      assert.equal(getPlatformRoleLabel("ADMIN"), "Platform Yöneticisi");
    });
  });

  describe("3. Appointment Source Presentation", () => {
    it("maps appointment creation sources to Turkish labels", () => {
      assert.equal(getAppointmentSourceLabel("PUBLIC_WEB"), "Online Randevu");
      assert.equal(getAppointmentSourceLabel("MANUAL_ADMIN"), "İşletme Tarafından Oluşturuldu");
      assert.equal(getAppointmentSourceLabel("MANUAL_STAFF"), "Personel Tarafından Oluşturuldu");
    });
  });

  describe("4. Time Block Presentation", () => {
    it("maps time block types to Turkish labels", () => {
      assert.equal(getTimeBlockTypeLabel("TIME_OFF"), "İzin");
      assert.equal(getTimeBlockTypeLabel("BREAK"), "Mola");
      assert.equal(getTimeBlockTypeLabel("BLOCKED"), "Kapalı Zaman");
    });

    it("maps time block statuses to Turkish labels", () => {
      assert.equal(getTimeBlockStatusLabel("ACTIVE"), "Aktif");
      assert.equal(getTimeBlockStatusLabel("UPCOMING"), "Yaklaşan");
      assert.equal(getTimeBlockStatusLabel("PAST"), "Geçmiş");
    });
  });

  describe("5. Currency Presentation", () => {
    it("formats Turkish lira correctly", () => {
      const formatted = formatCurrency(250);
      assert.equal(formatted.includes("250"), true);
      assert.equal(formatted.includes("₺"), true);
    });

    it("formats string amounts and decimal prices using Turkish locale", () => {
      assert.equal(formatCurrency("500.00", "TRY"), "500 ₺");
      assert.equal(formatCurrency("250.50", "TRY"), "250,5 ₺");
    });

    it("formats foreign currencies preserving currency code with Turkish locale", () => {
      assert.equal(formatCurrency(100, "EUR"), "100 EUR");
      assert.equal(formatCurrency("150.00", "USD"), "150 USD");
    });

    it("returns correct currency symbol for TRY and other currencies", () => {
      assert.equal(getCurrencySymbol("TRY"), "₺");
      assert.equal(getCurrencySymbol("EUR"), "EUR");
      assert.equal(getCurrencySymbol("USD"), "USD");
    });

    it("formats percentage rates correctly and handles null safely", () => {
      assert.equal(formatPercentage(0.125), "%12,5");
      assert.equal(formatPercentage(0.5), "%50");
      assert.equal(formatPercentage(0), "%0");
      assert.equal(formatPercentage(null), "—");
      assert.equal(formatPercentage(undefined), "—");
      assert.equal(formatPercentage(NaN), "—");
    });

    it("returns Turkish labels for analytics range presets", () => {
      assert.equal(getAnalyticsRangePresetLabel("TODAY"), "Bugün");
      assert.equal(getAnalyticsRangePresetLabel("LAST_7_DAYS"), "Son 7 Gün");
      assert.equal(getAnalyticsRangePresetLabel("LAST_30_DAYS"), "Son 30 Gün");
    });
  });

  describe("6. Authentication Error Mapping", () => {
    it("maps credential and login errors to Turkish", () => {
      const invalidCreds = mapAuthError("Invalid email or password");
      assert.equal(invalidCreds, "E-posta adresi veya şifre hatalı.");

      const alreadyExists = mapAuthError("User already exists");
      assert.equal(alreadyExists, "Bu e-posta adresiyle kayıtlı bir hesap zaten var.");

      const unauthorized = mapAuthError("UNAUTHORIZED");
      assert.equal(unauthorized, "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");

      const fallback = mapAuthError("Some random internal error");
      assert.equal(fallback, "İşlem başarısız oldu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.");
    });
  });

  describe("7. Application Layout & HTML Language", () => {
    it("has html lang='tr' configured in root layout", () => {
      const layoutPath = path.join(process.cwd(), "src/app/layout.tsx");
      const content = fs.readFileSync(layoutPath, "utf-8");
      assert.equal(content.includes('lang="tr"'), true);
      assert.equal(content.includes("Randevu"), true);
    });

    it("has Turkish 404 not found page", () => {
      const notFoundPath = path.join(process.cwd(), "src/app/not-found.tsx");
      const content = fs.readFileSync(notFoundPath, "utf-8");
      assert.equal(content.includes("Sayfa Bulunamadı"), true);
      assert.equal(content.includes("Ana Sayfaya Dön"), true);
    });

    it("has Turkish error boundary page", () => {
      const errorPath = path.join(process.cwd(), "src/app/error.tsx");
      const content = fs.readFileSync(errorPath, "utf-8");
      assert.equal(content.includes("Bir Hata Oluştu"), true);
      assert.equal(content.includes("Tekrar Dene"), true);
    });
  });
});
