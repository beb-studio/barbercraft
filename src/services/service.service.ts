import {
  createService as createServiceRepo,
  countServicesByBusiness,
  getServicesByBusiness,
  getServiceById as getServiceByIdRepo,
  updateService as updateServiceRepo,
  toggleServiceActive as toggleServiceActiveRepo,
} from "@/repositories/service.repository";
import { autoDisablePublicBookingForStaffWithNoActiveServices } from "@/repositories/staff.repository";

export interface FirstServiceInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string | number;
}

export interface DashboardServiceInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string | number;
  active?: boolean;
}

export interface UpdateServiceInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string | number;
}

export function validateServiceName(name: unknown): string {
  if (typeof name !== "string") {
    throw new Error("Hizmet adı gereklidir.");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Hizmet adı boş bırakılamaz.");
  }
  if (trimmed.length > 100) {
    throw new Error("Hizmet adı en fazla 100 karakter olabilir.");
  }
  return trimmed;
}

export function validateServiceDescription(desc: unknown): string | null {
  if (desc === undefined || desc === null) return null;
  if (typeof desc !== "string") return null;
  const trimmed = desc.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 500) {
    throw new Error("Açıklama en fazla 500 karakter olabilir.");
  }
  return trimmed;
}

export function validateServiceDuration(duration: unknown): number {
  const num = typeof duration === "number" ? duration : Number(duration);

  if (isNaN(num) || !Number.isInteger(num)) {
    throw new Error("Süre geçerli bir tam sayı olmalıdır.");
  }
  if (num <= 0) {
    throw new Error("Süre 0'dan büyük olmalıdır.");
  }
  if (num > 1440) {
    throw new Error("Süre en fazla 1440 dakika (24 saat) olabilir.");
  }
  return num;
}

export function validateServicePrice(priceInput: unknown): string {
  if (priceInput === undefined || priceInput === null || priceInput === "") {
    throw new Error("Fiyat alanı zorunludur.");
  }

  const priceStr = String(priceInput).trim();
  // Validates standard decimal format (e.g. 100, 100.5, 100.50)
  const priceRegex = /^\d+(\.\d{1,2})?$/;
  if (!priceRegex.test(priceStr)) {
    throw new Error("Geçerli bir fiyat giriniz (Örn: 250 veya 250.50).");
  }

  const num = Number(priceStr);
  if (isNaN(num) || num < 0) {
    throw new Error("Fiyat negatif olamaz.");
  }
  if (num > 99999999.99) {
    throw new Error("Fiyat çok yüksek.");
  }

  // Normalize to 2 decimal places string
  const parts = priceStr.split(".");
  const intPart = parts[0];
  const decPart = (parts[1] || "").padEnd(2, "0").slice(0, 2);
  return `${intPart}.${decPart}`;
}

export async function createFirstService(
  businessId: string,
  input: FirstServiceInput
) {
  const name = validateServiceName(input.name);
  const description = validateServiceDescription(input.description);
  const durationMinutes = validateServiceDuration(input.durationMinutes);
  const price = validateServicePrice(input.price);

  return await createServiceRepo({
    businessId,
    name,
    description,
    durationMinutes,
    price,
    active: true, // First service created during onboarding is always active
  });
}

export async function createDashboardService(
  businessId: string,
  input: DashboardServiceInput
) {
  const name = validateServiceName(input.name);
  const description = validateServiceDescription(input.description);
  const durationMinutes = validateServiceDuration(input.durationMinutes);
  const price = validateServicePrice(input.price);
  const active = input.active !== undefined ? Boolean(input.active) : true;

  return await createServiceRepo({
    businessId,
    name,
    description,
    durationMinutes,
    price,
    active,
  });
}

export async function updateService(
  businessId: string,
  serviceId: string,
  input: UpdateServiceInput
) {
  const name = validateServiceName(input.name);
  const description = validateServiceDescription(input.description);
  const durationMinutes = validateServiceDuration(input.durationMinutes);
  const price = validateServicePrice(input.price);

  const updated = await updateServiceRepo(businessId, serviceId, {
    name,
    description,
    durationMinutes,
    price,
  });

  if (!updated) {
    throw new Error("Hizmet bulunamadı.");
  }

  return updated;
}

export async function setServiceActive(
  businessId: string,
  serviceId: string,
  active: boolean
) {
  const updated = await toggleServiceActiveRepo(businessId, serviceId, Boolean(active));

  if (!updated) {
    throw new Error("Hizmet bulunamadı.");
  }

  // Clarification 4: When a service is deactivated, existing staff_services mappings
  // remain stored, but if a staff profile now has zero remaining ACTIVE assigned services,
  // public_booking_enabled must be set to false.
  if (!active) {
    await autoDisablePublicBookingForStaffWithNoActiveServices(businessId, serviceId);
  }

  return updated;
}

export async function getService(businessId: string, serviceId: string) {
  return await getServiceByIdRepo(businessId, serviceId);
}

export async function countServices(businessId: string): Promise<number> {
  return await countServicesByBusiness(businessId);
}

export async function getServices(businessId: string) {
  return await getServicesByBusiness(businessId);
}
