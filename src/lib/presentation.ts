import type { AppointmentStatus, AppointmentSource } from "@/db/schema/appointments";
import type { BusinessMemberRole } from "@/types";
import type { TimeBlockType } from "@/db/schema/scheduling";
import type { PlatformAdminRole } from "@/db/schema/platform";

/**
 * Returns user-facing Turkish label for AppointmentStatus.
 */
export function getAppointmentStatusLabel(status: AppointmentStatus | string): string {
  switch (status) {
    case "PENDING":
      return "Bekliyor";
    case "CONFIRMED":
      return "Onaylandı";
    case "COMPLETED":
      return "Tamamlandı";
    case "NO_SHOW":
      return "Gelmedi";
    case "CANCELLED":
      return "İptal Edildi";
    default:
      return status;
  }
}

/**
 * Returns user-facing Turkish label for PlatformAdminRole.
 */
export function getPlatformRoleLabel(role: PlatformAdminRole | string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Süper Yönetici";
    case "ADMIN":
      return "Platform Yöneticisi";
    default:
      return role;
  }
}

/**
 * Returns user-facing Turkish label for BusinessMemberRole.
 */
export function getRoleLabel(role: BusinessMemberRole | string): string {
  switch (role) {
    case "OWNER":
      return "İşletme Sahibi";
    case "ADMIN":
      return "Yönetici";
    case "STAFF":
      return "Personel";
    default:
      return role;
  }
}

/**
 * Returns user-facing Turkish label for AppointmentSource.
 */
export function getAppointmentSourceLabel(source: AppointmentSource | string): string {
  switch (source) {
    case "PUBLIC_WEB":
      return "Online Randevu";
    case "MANUAL_ADMIN":
      return "İşletme Tarafından Oluşturuldu";
    case "MANUAL_STAFF":
      return "Personel Tarafından Oluşturuldu";
    default:
      return source;
  }
}

/**
 * Returns user-facing Turkish label for TimeBlockType.
 */
export function getTimeBlockTypeLabel(type: TimeBlockType | string): string {
  switch (type) {
    case "TIME_OFF":
      return "İzin";
    case "BREAK":
      return "Mola";
    case "BLOCKED":
      return "Kapalı Zaman";
    default:
      return type;
  }
}

/**
 * Returns user-facing Turkish label for TimeBlockStatus.
 */
export function getTimeBlockStatusLabel(status: "ACTIVE" | "UPCOMING" | "PAST" | string): string {
  switch (status) {
    case "ACTIVE":
      return "Aktif";
    case "UPCOMING":
      return "Yaklaşan";
    case "PAST":
      return "Geçmiş";
    default:
      return status;
  }
}

/**
 * Formats monetary amounts using Turkish conventions (e.g. 250 ₺, 50,50 €).
 */
export function formatCurrency(amount: number | string, currency: string = "TRY"): string {
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return `${amount} ${currency}`;

  const formattedNumber = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);

  if (currency === "TRY") {
    return `${formattedNumber} ₺`;
  }
  return `${formattedNumber} ${currency}`;
}

/**
 * Returns user-facing currency symbol or code (e.g. ₺ for TRY, or the code itself).
 */
export function getCurrencySymbol(currency: string = "TRY"): string {
  if (currency === "TRY") {
    return "₺";
  }
  return currency;
}

/**
 * Centralized mapping of Better Auth and network errors to clean Turkish messages.
 */
export function mapAuthError(error: unknown): string {
  if (!error) return "Beklenmeyen bir hata oluştu.";

  const errObj =
    typeof error === "object" && error !== null
      ? (error as { message?: string; code?: string })
      : null;

  const message =
    typeof error === "string"
      ? error
      : errObj?.message
        ? `${errObj.message} ${errObj.code || ""}`
        : errObj?.code || String(error);

  const lower = message.toLowerCase();

  if (
    lower.includes("invalid email or password") ||
    lower.includes("invalid credentials") ||
    lower.includes("invalid_credentials") ||
    lower.includes("invalid_email_or_password")
  ) {
    return "E-posta adresi veya şifre hatalı.";
  }

  if (
    lower.includes("user already exists") ||
    lower.includes("user_already_exists") ||
    lower.includes("already registered")
  ) {
    return "Bu e-posta adresiyle kayıtlı bir hesap zaten var.";
  }

  if (
    lower.includes("password too short") ||
    lower.includes("password_too_short") ||
    lower.includes("password must be at least")
  ) {
    return "Şifre gerekli koşulları sağlamıyor (en az 8 karakter olmalıdır).";
  }

  if (
    lower.includes("passwords do not match") ||
    lower.includes("password mismatch")
  ) {
    return "Şifreler birbiriyle eşleşmiyor.";
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("session expired") ||
    lower.includes("session_expired")
  ) {
    return "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.";
  }

  if (
    lower.includes("invalid email") ||
    lower.includes("invalid_email")
  ) {
    return "Geçerli bir e-posta adresi girin.";
  }

  return "İşlem başarısız oldu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.";
}
