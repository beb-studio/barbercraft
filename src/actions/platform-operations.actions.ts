"use server";

import { revalidatePath } from "next/cache";
import { PlatformOperationsService } from "@/services/platform-operations.service";
import type { PlatformBusinessListParams } from "@/types/platform-operations";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // In standalone test environments, Next.js static generation store is not initialized
  }
}

export async function getPlatformSummaryAction() {
  try {
    const summary = await PlatformOperationsService.getPlatformSummary();
    return { success: true, data: summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Platform özeti yüklenemedi";
    return { success: false, error: message };
  }
}

export async function listBusinessOperationsAction(params: PlatformBusinessListParams = {}) {
  try {
    const result = await PlatformOperationsService.listBusinessOperations(params);
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "İşletme listesi yüklenemedi";
    return { success: false, error: message };
  }
}

export async function getBusinessOperationsDetailAction(businessId: string) {
  try {
    const detail = await PlatformOperationsService.getBusinessDetail(businessId);
    if (!detail) {
      return { success: false, error: "İşletme bulunamadı" };
    }
    return { success: true, data: detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "İşletme detayı yüklenemedi";
    return { success: false, error: message };
  }
}

export async function suspendBusinessAction(businessId: string, reason: string) {
  try {
    const updated = await PlatformOperationsService.suspendBusiness(businessId, reason);
    safeRevalidatePath("/platform");
    safeRevalidatePath("/platform/businesses");
    safeRevalidatePath(`/platform/businesses/${businessId}`);
    return { success: true, data: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "İşletme askıya alınamadı";
    return { success: false, error: message };
  }
}

export async function reactivateBusinessAction(businessId: string, reason: string) {
  try {
    const updated = await PlatformOperationsService.reactivateBusiness(businessId, reason);
    safeRevalidatePath("/platform");
    safeRevalidatePath("/platform/businesses");
    safeRevalidatePath(`/platform/businesses/${businessId}`);
    return { success: true, data: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "İşletme etkinleştirilemedi";
    return { success: false, error: message };
  }
}

export async function requeueTerminalOutboxAction(eventId: string) {
  try {
    const updated = await PlatformOperationsService.requeueTerminalOutbox(eventId);
    safeRevalidatePath("/platform");
    safeRevalidatePath("/platform/businesses");
    if (updated?.businessId) {
      safeRevalidatePath(`/platform/businesses/${updated.businessId}`);
    }
    return { success: true, data: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outbox kaydı yeniden sıraya alınamadı";
    return { success: false, error: message };
  }
}

export async function requeueTerminalDeliveryAction(deliveryId: string) {
  try {
    const updated = await PlatformOperationsService.requeueTerminalDelivery(deliveryId);
    safeRevalidatePath("/platform");
    safeRevalidatePath("/platform/businesses");
    if (updated?.businessId) {
      safeRevalidatePath(`/platform/businesses/${updated.businessId}`);
    }
    return { success: true, data: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teslimat kaydı yeniden sıraya alınamadı";
    return { success: false, error: message };
  }
}
