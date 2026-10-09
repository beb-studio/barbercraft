"use server";

import { requireSession, requireAdminOrOwner } from "@/lib/auth/guards";
import { getMemberships } from "@/lib/auth/session";
import { CustomerRepository } from "@/repositories/customer.repository";

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
    await requireAdminOrOwner(targetBusinessId);

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
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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
    await requireAdminOrOwner(targetBusinessId);

    const detail = await CustomerRepository.getCustomerDetail(targetBusinessId, customerId);
    if (!detail) {
      return { success: false as const, error: "Müşteri bulunamadı." };
    }
    
    const history = await CustomerRepository.getCustomerAppointmentHistory(targetBusinessId, customerId);

    return { success: true as const, customer: detail.customer, stats: detail.stats, history };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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

    await requireAdminOrOwner(targetBusinessId);

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
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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

    await requireAdminOrOwner(targetBusinessId);

    const notes = await CustomerRepository.getNotes(targetBusinessId, customerId);
    return { success: true as const, notes };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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

    await requireAdminOrOwner(targetBusinessId);

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return { success: false as const, error: "Not boş olamaz." };
    }
    if (trimmedContent.length > 2000) {
      return { success: false as const, error: "Not çok uzun (Maksimum 2000 karakter)." };
    }

    const note = await CustomerRepository.addNote(targetBusinessId, customerId, trimmedContent, targetMember.id);
    
    safeRevalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true as const, note };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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

    await requireAdminOrOwner(targetBusinessId);

    await CustomerRepository.deleteNote(targetBusinessId, customerId, noteId);
    
    safeRevalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true as const };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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

    await requireAdminOrOwner(targetBusinessId);

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
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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

    // Purpose-limited lookup: OWNER, ADMIN, and STAFF of this business are allowed
    const membership = memberships.find((m) => m.business_id === targetBusinessId);
    if (!membership || !["OWNER", "ADMIN", "STAFF"].includes(membership.role)) {
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
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
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
    await requireAdminOrOwner(targetBusinessId);

    const candidates = await CustomerRepository.getDuplicateCandidates(targetBusinessId);

    return { success: true as const, data: candidates };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err?.name === "UnauthorizedError" || err?.name === "ForbiddenError") {
      return { success: false as const, error: "Yetkisiz işlem." };
    }
    return { success: false as const, error: (error as Error).message || "Beklenmeyen hata" };
  }
}
