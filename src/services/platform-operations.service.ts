import "server-only";

import { requirePlatformAdmin, type PlatformAdminContext } from "@/lib/auth/guards";
import { PlatformOperationsRepository } from "@/repositories/platform-operations.repository";
import {
  PlatformBusinessListParams,
  PlatformOperationsError,
} from "@/types/platform-operations";

export class PlatformOperationsService {
  /**
   * Fetches global platform operational summary.
   * Requires active platform admin authorization.
   */
  static async getPlatformSummary(referenceNow = new Date()) {
    await requirePlatformAdmin();
    return PlatformOperationsRepository.getPlatformSummary(referenceNow);
  }

  /**
   * Lists businesses with aggregate operational health.
   * Strictly bounded pagination and zero N+1 queries.
   */
  static async listBusinessOperations(
    params: PlatformBusinessListParams = {},
    referenceNow = new Date()
  ) {
    await requirePlatformAdmin();
    return PlatformOperationsRepository.listBusinessOperations(params, referenceNow);
  }

  /**
   * Fetches full operational detail for a single business.
   */
  static async getBusinessDetail(businessId: string, referenceNow = new Date()) {
    await requirePlatformAdmin();
    if (!businessId || typeof businessId !== "string") {
      throw new PlatformOperationsError("Geçersiz işletme kimliği");
    }
    return PlatformOperationsRepository.getBusinessDetail(businessId, referenceNow);
  }

  /**
   * Safe platform action to suspend a business.
   * Rejects empty reason; logs append-only audit evidence.
   */
  static async suspendBusiness(
    businessId: string,
    reason: string,
    callerAdmin?: PlatformAdminContext
  ) {
    const admin = callerAdmin ?? (await requirePlatformAdmin());
    if (!reason || reason.trim().length < 5) {
      throw new PlatformOperationsError("İşletmeyi askıya almak için geçerli bir gerekçe belirtilmelidir (en az 5 karakter).");
    }
    return PlatformOperationsRepository.setBusinessActiveState(
      businessId,
      false,
      reason.trim(),
      admin
    );
  }

  /**
   * Safe platform action to reactivate a suspended business.
   * Rejects empty or short reason; logs append-only audit evidence.
   */
  static async reactivateBusiness(
    businessId: string,
    reason: string,
    callerAdmin?: PlatformAdminContext
  ) {
    const admin = callerAdmin ?? (await requirePlatformAdmin());
    if (!reason || reason.trim().length < 5) {
      throw new PlatformOperationsError("İşletmeyi yeniden etkinleştirmek için geçerli bir gerekçe belirtilmelidir (en az 5 karakter).");
    }
    return PlatformOperationsRepository.setBusinessActiveState(
      businessId,
      true,
      reason.trim(),
      admin
    );
  }

  /**
   * Controlled operator requeue for a terminal failed outbox event.
   */
  static async requeueTerminalOutbox(
    eventId: string,
    callerAdmin?: PlatformAdminContext
  ) {
    const admin = callerAdmin ?? (await requirePlatformAdmin());
    if (!eventId || typeof eventId !== "string") {
      throw new PlatformOperationsError("Geçersiz outbox kayıt kimliği");
    }
    return PlatformOperationsRepository.requeueTerminalOutboxEvent(eventId, admin);
  }

  /**
   * Controlled operator requeue for a terminal failed delivery.
   */
  static async requeueTerminalDelivery(
    deliveryId: string,
    callerAdmin?: PlatformAdminContext
  ) {
    const admin = callerAdmin ?? (await requirePlatformAdmin());
    if (!deliveryId || typeof deliveryId !== "string") {
      throw new PlatformOperationsError("Geçersiz teslimat kayıt kimliği");
    }
    return PlatformOperationsRepository.requeueTerminalDelivery(deliveryId, admin);
  }
}
