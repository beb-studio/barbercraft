import { PublicBookingRepository } from "@/repositories/public-booking.repository";
import { getStaffAvailability, getAnyStaffAvailability } from "@/services/availability.service";
import {
  DATE_REGEX,
  formatInstantInBusinessTimezone,
  getBusinessLocalToday,
} from "@/lib/timezone";
import { isCustomerDomainError } from "@/lib/customer-domain-errors";

export interface PublicBusiness {
  slug: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  currency: string;
}

export interface PublicService {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string;
}

export interface PublicStaff {
  id: string;
  displayName: string;
  profileImageUrl?: string | null;
}

export interface PublicBookingSelectionValidation {
  valid: boolean;
  business?: PublicBusiness;
  service?: PublicService;
  staff?: PublicStaff;
  error?: string;
}

export interface PublicAvailabilitySlot {
  startAt: string; // ISO string
  endAt: string; // ISO string
  localStartTime: string; // HH:mm
  localEndTime: string; // HH:mm
}

export interface PublicAvailabilityResult {
  success: boolean;
  localDate: string;
  slots: PublicAvailabilitySlot[];
  reason?: string;
  error?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicStaffSelection =
  | {
      kind: "ANY";
    }
  | {
      kind: "SPECIFIC";
      staffId: string;
    };

export function parsePublicStaffSelection(
  param: string | null | undefined
): PublicStaffSelection | null {
  if (!param || typeof param !== "string") {
    return null;
  }
  const normalized = param.trim();
  if (normalized.toLowerCase() === "any") {
    return { kind: "ANY" };
  }
  if (UUID_REGEX.test(normalized)) {
    return { kind: "SPECIFIC", staffId: normalized };
  }
  return null;
}

export const PublicBookingService = {
  /**
   * Retrieves public business information by slug.
   * Returns null if business does not exist, is inactive, or onboarding is incomplete.
   * Exposes only safe public DTO fields.
   */
  async getPublicBusiness(slug: string): Promise<PublicBusiness | null> {
    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return null;
    }

    return {
      slug: biz.slug,
      name: biz.name,
      address: biz.address ?? null,
      phone: biz.phone ?? null,
      currency: biz.currency,
    };
  },

  /**
   * Retrieves active public services for a business by slug.
   * Returns empty array if business is not found or not bookable.
   */
  async getPublicServices(slug: string): Promise<PublicService[]> {
    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return [];
    }

    const services = await PublicBookingRepository.getActiveServicesByBusinessId(biz.id);
    return services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      durationMinutes: s.durationMinutes,
      price: s.price,
    }));
  },

  /**
   * Retrieves eligible staff members capable of performing a specific active service.
   * Enforces tenant boundary, active statuses, service assignment, and effective schedule completeness.
   */
  async getEligibleStaffForService(
    slug: string,
    serviceId: string
  ): Promise<PublicStaff[]> {
    if (!UUID_REGEX.test(serviceId)) {
      return [];
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return [];
    }

    const eligible = await PublicBookingRepository.getEligibleStaffForService(
      biz.id,
      serviceId
    );

    return eligible.map((staff) => ({
      id: staff.id,
      displayName: `${staff.firstName} ${staff.lastName}`.trim(),
      profileImageUrl: staff.profileImageUrl ?? null,
    }));
  },

  /**
   * Validates service and staff selection for the public booking funnel before progressing.
   * Ensures neither service nor staff ID have been tampered with or belong to another business.
   */
  async validatePublicSelection(
    slug: string,
    serviceId: string,
    staffId: string
  ): Promise<PublicBookingSelectionValidation> {
    if (!UUID_REGEX.test(serviceId) || !UUID_REGEX.test(staffId)) {
      return { valid: false, error: "Geçersiz hizmet veya personel parametresi." };
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return { valid: false, error: "İşletme bulunamadı veya rezervasyona açık değil." };
    }

    const service = await PublicBookingRepository.getActiveServiceById(biz.id, serviceId);
    if (!service) {
      return { valid: false, error: "Seçilen hizmet bulunamadı veya aktif değil." };
    }

    const eligibleStaffList = await PublicBookingRepository.getEligibleStaffForService(
      biz.id,
      serviceId
    );
    const chosenStaff = eligibleStaffList.find((s) => s.id === staffId);
    if (!chosenStaff) {
      return {
        valid: false,
        error: "Seçilen personel bu hizmet için uygun değil veya aktif değil.",
      };
    }

    return {
      valid: true,
      business: {
        slug: biz.slug,
        name: biz.name,
        address: biz.address ?? null,
        phone: biz.phone ?? null,
        currency: biz.currency,
      },
      service: {
        id: service.id,
        name: service.name,
        description: service.description ?? null,
        durationMinutes: service.durationMinutes,
        price: service.price,
      },
      staff: {
        id: chosenStaff.id,
        displayName: `${chosenStaff.firstName} ${chosenStaff.lastName}`.trim(),
        profileImageUrl: chosenStaff.profileImageUrl ?? null,
      },
    };
  },

  /**
   * Validates service and Any Staff selection for the public booking funnel before progressing.
   * Ensures business is active, service belongs to business and is active,
   * and at least one publicly eligible staff member exists.
   */
  async validatePublicAnyStaffSelection(
    slug: string,
    serviceId: string
  ): Promise<PublicBookingSelectionValidation> {
    if (!UUID_REGEX.test(serviceId)) {
      return { valid: false, error: "Geçersiz hizmet parametresi." };
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return { valid: false, error: "İşletme bulunamadı veya rezervasyona açık değil." };
    }

    const service = await PublicBookingRepository.getActiveServiceById(biz.id, serviceId);
    if (!service) {
      return { valid: false, error: "Seçilen hizmet bulunamadı veya aktif değil." };
    }

    const eligibleStaffList = await PublicBookingRepository.getEligibleStaffForService(
      biz.id,
      serviceId
    );
    if (eligibleStaffList.length === 0) {
      return {
        valid: false,
        error: "Bu hizmet için uygun personel bulunmuyor.",
      };
    }

    return {
      valid: true,
      business: {
        slug: biz.slug,
        name: biz.name,
        address: biz.address ?? null,
        phone: biz.phone ?? null,
        currency: biz.currency,
      },
      service: {
        id: service.id,
        name: service.name,
        description: service.description ?? null,
        durationMinutes: service.durationMinutes,
        price: service.price,
      },
      staff: {
        id: "any",
        displayName: "Fark Etmez",
        profileImageUrl: null,
      },
    };
  },

  /**
   * Retrieves available appointment slots for a specific staff member, service, and local date.
   * Consumes the hardened Availability Engine.
   * Internal referenceNow parameter is supported for deterministic automated testing.
   */
  async getPublicAvailability({
    slug,
    serviceId,
    staffId,
    localDate,
    referenceNow,
  }: {
    slug: string;
    serviceId: string;
    staffId: string;
    localDate: string; // YYYY-MM-DD
    referenceNow?: Date;
  }): Promise<PublicAvailabilityResult> {
    if (!DATE_REGEX.test(localDate)) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Geçersiz tarih formatı (YYYY-MM-DD bekleniyor).",
      };
    }

    if (!UUID_REGEX.test(serviceId) || !UUID_REGEX.test(staffId)) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Geçersiz hizmet veya personel parametresi.",
      };
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "İşletme bulunamadı veya rezervasyona açık değil.",
      };
    }

    const service = await PublicBookingRepository.getActiveServiceById(biz.id, serviceId);
    if (!service) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Seçilen hizmet bulunamadı veya aktif değil.",
      };
    }

    const eligibleStaffList = await PublicBookingRepository.getEligibleStaffForService(
      biz.id,
      serviceId
    );
    const chosenStaff = eligibleStaffList.find((s) => s.id === staffId);
    if (!chosenStaff) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Seçilen personel bu hizmet için uygun değil veya aktif değil.",
      };
    }

    // Validate date is not in the past relative to business-local today
    const now = referenceNow ?? new Date();
    const today = getBusinessLocalToday(biz.timezone, now);
    if (localDate < today) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Geçmiş bir tarih için randevu alınamaz.",
      };
    }

    const engineResult = await getStaffAvailability({
      businessId: biz.id,
      staffId: chosenStaff.id,
      serviceId: service.id,
      localDate,
      referenceNow: now,
    });

    const publicSlots: PublicAvailabilitySlot[] = engineResult.slots.map((s) => ({
      startAt: s.startAt,
      endAt: s.endAt,
      localStartTime: s.localStartTime,
      localEndTime: s.localEndTime,
    }));

    return {
      success: true,
      localDate,
      slots: publicSlots,
      reason: engineResult.reason,
    };
  },

  /**
   * Revalidates an exact chosen slot (startAt) before rendering the confirmation step.
   * Derives local calendar date using the business's authoritative timezone.
   * Confirms the exact instant exists in the current available slot set.
   */
  async validatePublicSlotSelection({
    slug,
    serviceId,
    staffId,
    startAt,
    referenceNow,
  }: {
    slug: string;
    serviceId: string;
    staffId: string;
    startAt: string; // UTC ISO string
    referenceNow?: Date;
  }): Promise<{
    valid: boolean;
    business?: PublicBusiness;
    service?: PublicService;
    staff?: PublicStaff;
    slot?: PublicAvailabilitySlot;
    localDate?: string;
    error?: string;
  }> {
    if (!startAt || typeof startAt !== "string") {
      return { valid: false, error: "Geçersiz saat parametresi." };
    }

    const startInstant = new Date(startAt);
    if (isNaN(startInstant.getTime())) {
      return { valid: false, error: "Geçersiz saat formatı." };
    }

    const selectionValidation = await this.validatePublicSelection(
      slug,
      serviceId,
      staffId
    );
    if (
      !selectionValidation.valid ||
      !selectionValidation.business ||
      !selectionValidation.service ||
      !selectionValidation.staff
    ) {
      return { valid: false, error: selectionValidation.error };
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return { valid: false, error: "İşletme bulunamadı veya rezervasyona açık değil." };
    }

    // Convert startAt to business-local date string using the business's authoritative timezone
    const localDate = formatInstantInBusinessTimezone(startInstant, biz.timezone).dateStr;

    // Check availability for this date
    const availResult = await this.getPublicAvailability({
      slug,
      serviceId,
      staffId,
      localDate,
      referenceNow,
    });

    if (!availResult.success) {
      return { valid: false, error: availResult.error };
    }

    const matchedSlot = availResult.slots.find((s) => s.startAt === startAt);
    if (!matchedSlot) {
      return {
        valid: false,
        error: "Seçilen randevu saati artık uygun değil veya süresi doldu.",
      };
    }

    return {
      valid: true,
      business: selectionValidation.business,
      service: selectionValidation.service,
      staff: selectionValidation.staff,
      slot: matchedSlot,
      localDate,
    };
  },

  /**
   * Revalidates an exact chosen slot (startAt) for Any Staff mode before rendering the confirmation step.
   * Derives local calendar date using the business's authoritative timezone.
   * Confirms the exact instant exists in the current Any Staff union available slot set.
   */
  async validatePublicAnyStaffSlotSelection({
    slug,
    serviceId,
    startAt,
    referenceNow,
  }: {
    slug: string;
    serviceId: string;
    startAt: string; // UTC ISO string
    referenceNow?: Date;
  }): Promise<{
    valid: boolean;
    business?: PublicBusiness;
    service?: PublicService;
    staff?: PublicStaff;
    slot?: PublicAvailabilitySlot;
    localDate?: string;
    error?: string;
  }> {
    if (!startAt || typeof startAt !== "string") {
      return { valid: false, error: "Geçersiz saat parametresi." };
    }

    const startInstant = new Date(startAt);
    if (isNaN(startInstant.getTime())) {
      return { valid: false, error: "Geçersiz saat formatı." };
    }

    const selectionValidation = await this.validatePublicAnyStaffSelection(
      slug,
      serviceId
    );
    if (
      !selectionValidation.valid ||
      !selectionValidation.business ||
      !selectionValidation.service ||
      !selectionValidation.staff
    ) {
      return { valid: false, error: selectionValidation.error };
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return { valid: false, error: "İşletme bulunamadı veya rezervasyona açık değil." };
    }

    // Convert startAt to business-local date string using the business's authoritative timezone
    const localDate = formatInstantInBusinessTimezone(startInstant, biz.timezone).dateStr;

    // Check past day boundary
    const businessLocalToday = getBusinessLocalToday(biz.timezone, referenceNow);
    if (localDate < businessLocalToday) {
      return {
        valid: false,
        error: "Seçilen randevu saati artık uygun değil veya süresi doldu.",
      };
    }

    const availResult = await getAnyStaffAvailability({
      businessId: biz.id,
      serviceId,
      localDate,
      referenceNow,
    });

    const matchedSlot = availResult.slots.find((s) => s.startAt === startAt);
    if (!matchedSlot) {
      return {
        valid: false,
        error: "Seçilen randevu saati artık uygun değil veya süresi doldu.",
      };
    }

    return {
      valid: true,
      business: selectionValidation.business,
      service: selectionValidation.service,
      staff: selectionValidation.staff,
      slot: {
        startAt: matchedSlot.startAt,
        endAt: matchedSlot.endAt,
        localStartTime: matchedSlot.localStartTime,
        localEndTime: matchedSlot.localEndTime,
      },
      localDate,
    };
  },

  /**
   * Finalizes a public booking transaction securely.
   * Resolves tenant context, delegates to authoritative transactional appointment creation,
   * and translates errors to safe UI messages.
   */
  async createPublicAppointment({
    slug,
    serviceId,
    staffId,
    startAt,
    customerName,
    customerPhone,
  }: {
    slug: string;
    serviceId: string;
    staffId: string;
    startAt: string;
    customerName: string;
    customerPhone: string;
  }) {
    if (!UUID_REGEX.test(serviceId) || (staffId !== "any" && !UUID_REGEX.test(staffId))) {
      throw new Error("VALIDATION_ERROR: Geçersiz parametreler.");
    }
    const startInstant = new Date(startAt);
    if (isNaN(startInstant.getTime())) {
      throw new Error("VALIDATION_ERROR: Geçersiz randevu saati.");
    }

    const trimmedName = customerName.trim();
    if (!trimmedName || trimmedName.length > 100) {
      throw new Error("VALIDATION_ERROR: Lütfen geçerli bir ad soyad giriniz.");
    }

    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 20) {
      throw new Error("VALIDATION_ERROR: Lütfen geçerli bir telefon numarası giriniz.");
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      throw new Error("NOT_FOUND: İşletme bulunamadı.");
    }

    const nameParts = trimmedName.split(" ");
    let firstName = trimmedName;
    let lastName: string | undefined;

    if (nameParts.length > 1) {
      lastName = nameParts.pop();
      firstName = nameParts.join(" ");
    }

    const { AppointmentService } = await import("@/services/appointment.service");

    try {
      let appointment;
      let assignedStaffId = staffId;
      let managementToken: string | undefined;
      
      const staffList = await PublicBookingRepository.getEligibleStaffForService(biz.id, serviceId);
      
      if (staffId === "any") {
        if (staffList.length === 0) {
           throw new Error("SLOT_UNAVAILABLE: Uygun personel bulunamadı.");
        }
        const candidateStaffIds = staffList.map(s => s.id);
        const result = await AppointmentService.createAnyStaffAppointment({
          businessId: biz.id,
          candidateStaffIds,
          serviceId,
          startAt,
          customer: {
            firstName,
            lastName,
            phone: customerPhone,
          },
          issueManagementAccess: true,
        });
        appointment = result.appointment;
        assignedStaffId = result.assignedStaffId;
        managementToken = result.managementToken;
      } else {
        const result = await AppointmentService.createAppointment({
          businessId: biz.id,
          staffId,
          serviceId,
          startAt,
          customer: {
            firstName,
            lastName,
            phone: customerPhone,
          },
          issueManagementAccess: true,
        });
        appointment = result;
        managementToken = result.managementToken;
      }

      if (!managementToken) {
        throw new Error("APPOINTMENT_ACCESS_ISSUANCE_FAILED");
      }

      // Fetch the staff display name
      const staff = staffList.find(s => s.id === assignedStaffId);

      // Create local time strings for the success response
      const localStart = formatInstantInBusinessTimezone(appointment.startTime, biz.timezone);
      const localEnd = formatInstantInBusinessTimezone(appointment.endTime, biz.timezone);

      return {
        businessName: biz.name,
        serviceName: appointment.serviceNameSnapshot,
        staffDisplayName: staff ? `${staff.firstName} ${staff.lastName}`.trim() : "",
        localDate: localStart.dateStr,
        localStartTime: localStart.timeStr,
        localEndTime: localEnd.timeStr,
        durationMinutes: appointment.serviceDurationSnapshot,
        formattedPrice: appointment.servicePriceSnapshot, // Might need proper i18n formatting based on currency, but snapshot is a numeric string
        managementPath: `/randevu#${managementToken}`,
      };
    } catch (error) {
      if (isCustomerDomainError(error)) {
        if (error.code === "CUSTOMER_IDENTITY_AMBIGUOUS") {
          throw new Error(
            "VALIDATION_ERROR: Bu telefon numarasıyla birden fazla müşteri kaydı bulundu. Lütfen işletmeyle iletişime geçin."
          );
        }
        if (error.code === "CUSTOMER_PHONE_INVALID") {
          throw new Error("VALIDATION_ERROR: Lütfen geçerli bir telefon numarası giriniz.");
        }
        throw new Error(
          "VALIDATION_ERROR: Müşteri kaydı güvenli biçimde çözümlenemedi. Lütfen işletmeyle iletişime geçin."
        );
      }
      const e = error as Error;
      if (
        e.message === "Time slot not available (staff closed or not bookable)" ||
        e.message === "Time slot not available or overlaps with another booking" ||
        e.message === "Staff is not bookable" ||
        e.message === "Service is not bookable or not assigned to staff"
      ) {
        throw new Error("SLOT_UNAVAILABLE: Seçilen saat artık uygun değil.");
      }
      throw e;
    }
  },

  /**
   * Retrieves any staff available appointment slots for a specific service and local date.
   * Untrusted inputs: slug, serviceId, localDate.
   */
  async getPublicAnyStaffAvailability({
    slug,
    serviceId,
    localDate,
  }: {
    slug: string;
    serviceId: string;
    localDate: string; // YYYY-MM-DD
  }): Promise<PublicAvailabilityResult> {
    if (!DATE_REGEX.test(localDate)) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Geçersiz tarih formatı (YYYY-MM-DD bekleniyor).",
      };
    }

    if (!UUID_REGEX.test(serviceId)) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Geçersiz hizmet parametresi.",
      };
    }

    const biz = await PublicBookingRepository.findPublicBusinessBySlug(slug);
    if (!biz) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "İşletme bulunamadı veya rezervasyona açık değil.",
      };
    }

    const service = await PublicBookingRepository.getActiveServiceById(biz.id, serviceId);
    if (!service) {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Seçilen hizmet bulunamadı veya aktif değil.",
      };
    }

    // Must prevent looking at past days locally
    const businessLocalToday = getBusinessLocalToday(biz.timezone);
    if (localDate < businessLocalToday) {
      return {
        success: false,
        localDate,
        slots: [],
      };
    }

    try {
      const result = await getAnyStaffAvailability({
        businessId: biz.id,
        serviceId: serviceId,
        localDate,
      });

      return {
        success: true,
        localDate,
        slots: result.slots.map((s) => ({
          startAt: s.startAt,
          endAt: s.endAt,
          localStartTime: s.localStartTime,
          localEndTime: s.localEndTime,
        })),
      };
    } catch {
      return {
        success: false,
        localDate,
        slots: [],
        error: "Müsaitlik durumu hesaplanırken bir hata oluştu.",
      };
    }
  },
};
