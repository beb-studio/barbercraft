"use server";

import { requireSession, requireManagerOrOwner } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { CustomerRepository } from "@/repositories/customer.repository";
import { CustomerMergeService } from "@/services/customer-merge.service";
import { isCustomerDomainError, type CustomerDomainErrorCode } from "@/lib/customer-domain-errors";

function safeCustomerActionMessage(error: unknown, fallback: string): string {
  if (isCustomerDomainError(error)) {
    return "Müşteri kaydı güvenli biçimde çözümlenemedi.";
  }
  const value = error as {
    message?: string;
    code?: string;
    cause?: { code?: string };
  };
  if (value?.code || value?.cause?.code) return fallback;
  return value?.message || fallback;
}

export async function getCustomerDirectoryAction(
  businessIdParam?: string,
  search?: string,
  page: number = 1
) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    
    if (memberships.length === 0) {
      throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
    }
    
    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    // Role check
    await requireManagerOrOwner(targetBusinessId);

    const result = await CustomerRepository.getCustomerDirectory({
      businessId: targetBusinessId,
      search,
      page,
      limit: 20,
    });

    return { success: true as const, ...result };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Müşteriler yüklenemedi.") };
  }
}

export async function getCustomerDetailAction(customerId: string, businessIdParam?: string) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    
    if (memberships.length === 0) {
      throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
    }
    
    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    // Role check
    await requireManagerOrOwner(targetBusinessId);

    const detail = await CustomerRepository.getCustomerDetail(targetBusinessId, customerId);
    if (!detail) {
      return { success: false as const, error: "Müşteri bulunamadı." };
    }
    
    const [history, lineage] = await Promise.all([
      CustomerRepository.getCustomerAppointmentHistory(targetBusinessId, detail.customer.id),
      CustomerRepository.getCustomerLineage(targetBusinessId, detail.customer.id),
    ]);

    return {
      success: true as const,
      customer: detail.customer,
      stats: detail.stats,
      history,
      lineage,
    };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Müşteri bilgileri yüklenemedi.") };
  }
}

import { revalidatePath } from "next/cache";
import { normalizePhone } from "@/lib/phone";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // In standalone test environments, Next.js static generation store is not initialized
  }
}

export async function updateCustomerProfileAction(
  customerId: string,
  data: { firstName: string; lastName: string | null; phone: string },
  businessIdParam?: string
) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    
    if (memberships.length === 0) {
      throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
    }
    
    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    await requireManagerOrOwner(targetBusinessId);

    const normalizedPhone = normalizePhone(data.phone);

    const updated = await CustomerRepository.updateProfile(targetBusinessId, customerId, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      normalizedPhone,
    });

    if (!updated) {
      return { success: false as const, error: "Müşteri bulunamadı." };
    }

    safeRevalidatePath("/dashboard/customers");
    safeRevalidatePath(`/dashboard/customers/${customerId}`);
    
    return { success: true as const, customer: updated };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    if ((error as Error).message === "CUSTOMER_PHONE_CONFLICT") {
      return { success: false as const, error: "Bu telefon numarası başka bir müşteriye ait." };
    }
    if (isCustomerDomainError(error) && error.code === "CUSTOMER_ALIAS_MUTATION_FORBIDDEN") {
      return { success: false as const, error: "Birleştirilmiş müşteri kaydı doğrudan düzenlenemez." };
    }
    if (isCustomerDomainError(error) && error.code === "CUSTOMER_PHONE_AMBIGUOUS") {
      return {
        success: false as const,
        error: "Bu telefon biçimi başka bir bağımsız müşteri ailesiyle eşleşiyor.",
      };
    }
    if (isCustomerDomainError(error) && error.code === "CUSTOMER_PHONE_INVALID") {
      return { success: false as const, error: "Lütfen geçerli bir telefon numarası girin." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Müşteri güncellenemedi.") };
  }
}

export async function getCustomerNotesAction(customerId: string, businessIdParam?: string) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    if (memberships.length === 0) throw new Error("İşletme bulunamadı.");
    
    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    await requireManagerOrOwner(targetBusinessId);

    const notes = await CustomerRepository.getNotes(targetBusinessId, customerId);
    return { success: true as const, notes };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Notlar yüklenemedi.") };
  }
}

export async function addCustomerNoteAction(customerId: string, content: string, businessIdParam?: string) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    if (memberships.length === 0) throw new Error("İşletme bulunamadı.");
    
    let targetBusinessId = memberships[0].business_id;
    let targetMember = memberships[0];
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
      targetMember = matched;
    }

    await requireManagerOrOwner(targetBusinessId);

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return { success: false as const, error: "Not boş olamaz." };
    }
    if (trimmedContent.length > 2000) {
      return { success: false as const, error: "Not çok uzun (Maksimum 2000 karakter)." };
    }

    const note = await CustomerRepository.addNote(targetBusinessId, customerId, trimmedContent, targetMember.id);
    if (!note) {
      return { success: false as const, error: "Müşteri bulunamadı." };
    }
    
    safeRevalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true as const, note };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Not kaydedilemedi.") };
  }
}

export async function deleteCustomerNoteAction(customerId: string, noteId: string, businessIdParam?: string) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    if (memberships.length === 0) throw new Error("İşletme bulunamadı.");
    
    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    await requireManagerOrOwner(targetBusinessId);

    const deleted = await CustomerRepository.deleteNote(targetBusinessId, customerId, noteId);
    if (!deleted) {
      return { success: false as const, error: "Not bulunamadı." };
    }
    
    safeRevalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true as const };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Not silinemedi.") };
  }
}

export async function updateCustomerNoteAction(customerId: string, noteId: string, content: string, businessIdParam?: string) {
  try {
    await requireSession();
    const memberships = await getMemberships();
    if (memberships.length === 0) throw new Error("İşletme bulunamadı.");
    
    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    await requireManagerOrOwner(targetBusinessId);

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return { success: false as const, error: "Not boş olamaz." };
    }
    if (trimmedContent.length > 2000) {
      return { success: false as const, error: "Not çok uzun (Maksimum 2000 karakter)." };
    }

    const note = await CustomerRepository.updateNote(targetBusinessId, customerId, noteId, trimmedContent);
    if (!note) {
      return { success: false as const, error: "Not bulunamadı." };
    }
    
    safeRevalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true as const, note };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Not güncellenemedi.") };
  }
}

export async function searchCustomersForBookingAction(
  query?: string,
  businessIdParam?: string
) {
  try {
    await requireSession();
    const memberships = await getMemberships();

    if (memberships.length === 0) {
      throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
    }

    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    // Purpose-limited lookup: OWNER, MANAGER, and STAFF of this business are allowed
    const membership = memberships.find((m) => m.business_id === targetBusinessId);
    if (!membership || !["OWNER", "MANAGER", "STAFF"].includes(membership.role)) {
      return { success: false as const, error: "Yetkisiz işlem." };
    }

    const customers = await CustomerRepository.searchCustomersForBooking(
      targetBusinessId,
      query,
      10
    );

    return { success: true as const, data: customers };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Müşteri araması tamamlanamadı.") };
  }
}

export async function getDuplicateCandidatesAction(businessIdParam?: string) {
  try {
    await requireSession();
    const memberships = await getMemberships();

    if (memberships.length === 0) {
      throw new Error("İşletme bulunamadı veya aktif üyeliğiniz bulunmuyor.");
    }

    let targetBusinessId = memberships[0].business_id;
    if (businessIdParam) {
      const matched = memberships.find((m) => m.business_id === businessIdParam);
      if (!matched) {
        throw new Error("Belirtilen işletmeye erişim izniniz bulunmuyor.");
      }
      targetBusinessId = matched.business_id;
    }

    // Strictly OWNER and ADMIN only
    await requireManagerOrOwner(targetBusinessId);

    const candidates = await CustomerRepository.getDuplicateCandidates(targetBusinessId);

    return { success: true as const, data: candidates };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: safeCustomerActionMessage(error, "Olası tekrarlar yüklenemedi.") };
  }
}

const CUSTOMER_MERGE_MESSAGES: Record<CustomerDomainErrorCode, string> = {
  CUSTOMER_MERGE_NOT_ELIGIBLE: "Seçilen müşteriler birleştirme koşullarını karşılamıyor.",
  CUSTOMER_MERGE_STALE: "Müşteri kayıtları değişti. Güncel kayıtları yeniden kontrol edin.",
  CUSTOMER_MERGE_CONFLICT: "Müşteriler güvenli biçimde birleştirilemedi. Lütfen tekrar deneyin.",
  CUSTOMER_NOT_FOUND: "Müşteri bulunamadı veya bu işlem için yetkiniz yok.",
  CUSTOMER_ALIAS_MUTATION_FORBIDDEN: "Birleştirilmiş müşteri kaydı doğrudan düzenlenemez.",
  CUSTOMER_IDENTITY_AMBIGUOUS: "Müşteri kimliği birden fazla kayıtla eşleşiyor.",
  CUSTOMER_PHONE_AMBIGUOUS: "Telefon biçimi başka bir müşteri ailesiyle eşleşiyor.",
  CUSTOMER_PHONE_INVALID: "Telefon numarası geçerli değil.",
  CUSTOMER_LINEAGE_CONFLICT: "Müşteri kaydı güvenli biçimde çözümlenemedi.",
  FORBIDDEN: "Bu işlem için yetkiniz yok.",
};

/**
 * Server-only foundation for an explicit logical merge. No browser-supplied
 * business ID is accepted; tenant authority is derived from the canonical
 * customer and the authenticated user's active membership inside the service.
 */
export async function mergeCustomersAction(
  canonicalCustomerId: string,
  selectedCustomerIds: string[]
) {
  try {
    const user = await requireSession();
    const result = await CustomerMergeService.mergeCustomers({
      actorUserId: user.id,
      canonicalCustomerId,
      selectedCustomerIds,
    });

    safeRevalidatePath("/dashboard/customers");
    safeRevalidatePath("/dashboard/customers/duplicates");
    safeRevalidatePath(`/dashboard/customers/${result.canonicalCustomerId}`);

    // Keep the browser-facing DTO deliberately small. The service result still
    // contains the full internal audit data for trusted server-side callers.
    return {
      success: true as const,
      data: { canonicalCustomerId: result.canonicalCustomerId },
    };
  } catch (error: unknown) {
    const value = error as { name?: string };
    if (value?.name === "UnauthorizedError") {
      return {
        success: false as const,
        code: "FORBIDDEN" as const,
        error: CUSTOMER_MERGE_MESSAGES.FORBIDDEN,
      };
    }
    if (isCustomerDomainError(error)) {
      return {
        success: false as const,
        code: error.code,
        error: CUSTOMER_MERGE_MESSAGES[error.code],
      };
    }

    return {
      success: false as const,
      code: "CUSTOMER_MERGE_CONFLICT" as const,
      error: CUSTOMER_MERGE_MESSAGES.CUSTOMER_MERGE_CONFLICT,
    };
  }
}
