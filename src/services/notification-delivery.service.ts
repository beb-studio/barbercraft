import "server-only";

import { db } from "@/db";
import {
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
  NOTIFICATION_DELIVERY_MAX_BATCH_SIZE,
  getNotificationDeliveryRetryDelayMs,
  getPublicApplicationBaseUrl,
  isValidNotificationDeliveryWorkerId,
  renderNotificationMessage,
  sanitizeDeliveryErrorCode,
  type ClaimedNotificationDelivery,
} from "@/lib/notification-delivery";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";
import { normalizePhone } from "@/lib/phone";
import { NetgsmSmsProvider, type SmsProvider } from "@/lib/sms";
import { NotificationDeliveryRepository } from "@/repositories/notification-delivery.repository";
import { NotificationPlanningRepository } from "@/repositories/notification-planning.repository";
import { AppointmentAccessService } from "@/services/appointment-access.service";
import { resolveCanonicalCustomer } from "@/services/customer-resolution.service";

export class NotificationDeliveryError extends Error {
  constructor(
    public readonly code:
      | "DELIVERY_INVALID_WORKER"
      | "DELIVERY_CLAIM_NOT_OWNED"
      | "DELIVERY_PERSISTENCE_FAILED"
  ) {
    super(code);
    this.name = "NotificationDeliveryError";
  }
}

const defaultSmsProvider = new NetgsmSmsProvider();

export const NotificationDeliveryService = {
  async materializeDuePlan(input: {
    businessId: string;
    planId: string;
    referenceNow?: Date;
    providerName?: string;
  }): Promise<{
    outcome:
      | "MATERIALIZED"
      | "ALREADY_MATERIALIZED"
      | "SKIPPED_NOT_DUE"
      | "SKIPPED_PLAN_INACTIVE"
      | "SKIPPED_STALE_STATE"
      | "FAILED_RECIPIENT_UNAVAILABLE";
    deliveryId?: string;
  }> {
    const referenceNow = input.referenceNow ?? new Date();
    const providerName = input.providerName ?? defaultSmsProvider.name;

    return db.transaction(async (tx) => {
      const plan = await NotificationDeliveryRepository.lockPlanForMaterialization(
        tx,
        input.businessId,
        input.planId
      );

      if (!plan || plan.status !== "PENDING") {
        return { outcome: "SKIPPED_PLAN_INACTIVE" };
      }

      if (plan.scheduledFor > referenceNow) {
        return { outcome: "SKIPPED_NOT_DUE" };
      }

      // Check for existing delivery
      const existing = await NotificationDeliveryRepository.findDeliveryByPlanAndChannel(
        tx,
        plan.id,
        "SMS"
      );
      if (existing) {
        return {
          outcome: "ALREADY_MATERIALIZED",
          deliveryId: existing.id,
        };
      }

      // Lock current appointment
      const appointment = await NotificationDeliveryRepository.lockAppointmentForDelivery(
        tx,
        plan.businessId,
        plan.appointmentId
      );
      if (!appointment) {
        return { outcome: "SKIPPED_STALE_STATE" };
      }

      // Pre-send current-state revalidation
      if (plan.type === "APPOINTMENT_REMINDER") {
        const isOperational =
          appointment.status === "PENDING" ||
          appointment.status === "CONFIRMED";
        const isFuture = appointment.startTime > referenceNow;
        if (!isOperational || !isFuture) {
          await NotificationPlanningRepository.cancelPendingPlansForAppointment(
            tx,
            {
              businessId: plan.businessId,
              appointmentId: plan.appointmentId,
              types: ["APPOINTMENT_REMINDER"],
              referenceNow,
            }
          );
          return { outcome: "SKIPPED_STALE_STATE" };
        }
      } else if (
        plan.type === "APPOINTMENT_CREATED" ||
        plan.type === "APPOINTMENT_RESCHEDULED"
      ) {
        const isOperational =
          appointment.status === "PENDING" ||
          appointment.status === "CONFIRMED";
        if (!isOperational) {
          await NotificationPlanningRepository.cancelPendingPlansForAppointment(
            tx,
            {
              businessId: plan.businessId,
              appointmentId: plan.appointmentId,
              types: [plan.type],
              referenceNow,
            }
          );
          return { outcome: "SKIPPED_STALE_STATE" };
        }
      } else if (plan.type === "APPOINTMENT_CANCELLED") {
        if (appointment.status !== "CANCELLED") {
          await NotificationPlanningRepository.cancelPendingPlansForAppointment(
            tx,
            {
              businessId: plan.businessId,
              appointmentId: plan.appointmentId,
              types: ["APPOINTMENT_CANCELLED"],
              referenceNow,
            }
          );
          return { outcome: "SKIPPED_STALE_STATE" };
        }
      }

      // Check current business notification settings
      const settings = await NotificationPlanningRepository.findSettings(
        tx,
        plan.businessId
      );
      if (!settings || !settings.customerNotificationsEnabled) {
        return { outcome: "SKIPPED_STALE_STATE" };
      }
      if (
        plan.type === "APPOINTMENT_CREATED" &&
        !settings.appointmentCreatedEnabled
      ) {
        return { outcome: "SKIPPED_STALE_STATE" };
      }
      if (
        plan.type === "APPOINTMENT_RESCHEDULED" &&
        !settings.appointmentRescheduledEnabled
      ) {
        return { outcome: "SKIPPED_STALE_STATE" };
      }
      if (
        plan.type === "APPOINTMENT_CANCELLED" &&
        !settings.appointmentCancelledEnabled
      ) {
        return { outcome: "SKIPPED_STALE_STATE" };
      }

      // Resolve canonical customer
      const canonicalCustomer = await resolveCanonicalCustomer(
        tx,
        plan.businessId,
        appointment.customerId
      );

      const rawPhone =
        canonicalCustomer?.normalizedPhone || canonicalCustomer?.phone;
      const normalized = rawPhone ? normalizePhone(rawPhone) : "";
      const digitsOnly = normalized.replace(/\D/g, "");

      if (!canonicalCustomer || digitsOnly.length < 10) {
        // Materialize permanent sanitized failure row
        const insertedFailed = await NotificationDeliveryRepository.insertDelivery(
          tx,
          {
            businessId: plan.businessId,
            planId: plan.id,
            channel: "SMS",
            status: "FAILED",
            recipient: normalized && normalized.length >= 3 ? normalized : "UNAVAILABLE",
            provider: providerName,
            attemptCount: 1,
            availableAt: referenceNow,
            failedAt: referenceNow,
            lastErrorCode: "RECIPIENT_UNAVAILABLE",
          }
        );

        return {
          outcome: "FAILED_RECIPIENT_UNAVAILABLE",
          deliveryId: insertedFailed?.id,
        };
      }

      // Insert idempotent pending delivery
      const inserted = await NotificationDeliveryRepository.insertDelivery(tx, {
        businessId: plan.businessId,
        planId: plan.id,
        channel: "SMS",
        status: "PENDING",
        recipient: normalized,
        provider: providerName,
        availableAt: referenceNow,
      });

      return {
        outcome: inserted ? "MATERIALIZED" : "ALREADY_MATERIALIZED",
        deliveryId: inserted?.id,
      };
    });
  },

  async materializeDuePlansBatch(input: {
    batchSize?: number;
    referenceNow?: Date;
    providerName?: string;
  }): Promise<{ materialized: number; skipped: number; failedRecipient: number }> {
    const batchSize = input.batchSize ?? 25;
    const referenceNow = input.referenceNow ?? new Date();
    const providerName = input.providerName ?? defaultSmsProvider.name;

    const duePlans = await NotificationDeliveryRepository.findDuePendingPlans(
      db,
      {
        referenceNow,
        channel: "SMS",
        limit: batchSize,
      }
    );

    let materialized = 0;
    let skipped = 0;
    let failedRecipient = 0;

    for (const plan of duePlans) {
      const result = await NotificationDeliveryService.materializeDuePlan({
        businessId: plan.businessId,
        planId: plan.id,
        referenceNow,
        providerName,
      });

      if (result.outcome === "MATERIALIZED") {
        materialized += 1;
      } else if (result.outcome === "FAILED_RECIPIENT_UNAVAILABLE") {
        failedRecipient += 1;
      } else {
        skipped += 1;
      }
    }

    return { materialized, skipped, failedRecipient };
  },

  async sendClaimedDelivery(input: {
    delivery: ClaimedNotificationDelivery;
    workerId: string;
    referenceNow?: Date;
    provider?: SmsProvider;
  }): Promise<{
    outcome: "SENT" | "FAILED" | "CANCELLED";
    providerMessageId?: string;
    errorCode?: string;
    isPermanent?: boolean;
  }> {
    const referenceNow = input.referenceNow ?? new Date();
    const provider = input.provider ?? defaultSmsProvider;

    const context = await NotificationDeliveryRepository.findDeliveryContext(
      db,
      input.delivery.id
    );

    if (!context) {
      return {
        outcome: "FAILED",
        errorCode: "DELIVERY_CONTEXT_NOT_FOUND",
        isPermanent: true,
      };
    }

    // 1. Revalidate plan status
    if (context.plan.status !== "PENDING") {
      await NotificationDeliveryRepository.markCancelled({
        deliveryId: input.delivery.id,
        workerId: input.workerId,
        referenceNow,
      });
      return { outcome: "CANCELLED" };
    }

    // 2. Pre-send current-state revalidation
    if (context.plan.type === "APPOINTMENT_REMINDER") {
      const isOperational =
        context.appointment.status === "PENDING" ||
        context.appointment.status === "CONFIRMED";
      const isFuture = context.appointment.startTime > referenceNow;
      if (!isOperational || !isFuture) {
        await NotificationDeliveryRepository.markCancelled({
          deliveryId: input.delivery.id,
          workerId: input.workerId,
          referenceNow,
        });
        return { outcome: "CANCELLED" };
      }
    } else if (
      context.plan.type === "APPOINTMENT_CREATED" ||
      context.plan.type === "APPOINTMENT_RESCHEDULED"
    ) {
      const isOperational =
        context.appointment.status === "PENDING" ||
        context.appointment.status === "CONFIRMED";
      if (!isOperational) {
        await NotificationDeliveryRepository.markCancelled({
          deliveryId: input.delivery.id,
          workerId: input.workerId,
          referenceNow,
        });
        return { outcome: "CANCELLED" };
      }
    } else if (context.plan.type === "APPOINTMENT_CANCELLED") {
      if (context.appointment.status !== "CANCELLED") {
        await NotificationDeliveryRepository.markCancelled({
          deliveryId: input.delivery.id,
          workerId: input.workerId,
          referenceNow,
        });
        return { outcome: "CANCELLED" };
      }
    }

    // 3. Revalidate business notification settings
    const settings = await NotificationPlanningRepository.findSettings(
      db,
      input.delivery.businessId
    );
    if (!settings || !settings.customerNotificationsEnabled) {
      await NotificationDeliveryRepository.markCancelled({
        deliveryId: input.delivery.id,
        workerId: input.workerId,
        referenceNow,
      });
      return { outcome: "CANCELLED" };
    }
    if (
      context.plan.type === "APPOINTMENT_CREATED" &&
      !settings.appointmentCreatedEnabled
    ) {
      await NotificationDeliveryRepository.markCancelled({
        deliveryId: input.delivery.id,
        workerId: input.workerId,
        referenceNow,
      });
      return { outcome: "CANCELLED" };
    }
    if (
      context.plan.type === "APPOINTMENT_RESCHEDULED" &&
      !settings.appointmentRescheduledEnabled
    ) {
      await NotificationDeliveryRepository.markCancelled({
        deliveryId: input.delivery.id,
        workerId: input.workerId,
        referenceNow,
      });
      return { outcome: "CANCELLED" };
    }
    if (
      context.plan.type === "APPOINTMENT_CANCELLED" &&
      !settings.appointmentCancelledEnabled
    ) {
      await NotificationDeliveryRepository.markCancelled({
        deliveryId: input.delivery.id,
        workerId: input.workerId,
        referenceNow,
      });
      return { outcome: "CANCELLED" };
    }

    // 4. Format appointment presentation in business timezone
    const localTime = formatInstantInBusinessTimezone(
      context.appointment.startTime,
      context.business.timezone
    );

    // 5. Issue fresh management capability link immediately before send
    let managementUrl: string | undefined;
    if (context.plan.type !== "APPOINTMENT_CANCELLED") {
      try {
        const { rawToken } = await AppointmentAccessService.issue(
          {
            businessId: input.delivery.businessId,
            appointmentId: context.appointment.id,
          },
          db
        );
        const baseUrl = getPublicApplicationBaseUrl();
        managementUrl = `${baseUrl}/randevu#${rawToken}`;
      } catch {
        managementUrl = undefined;
      }
    }

    // 6. Render application-owned Turkish transactional template
    const message = renderNotificationMessage({
      type: context.plan.type,
      businessName: context.business.name,
      serviceName: context.appointment.serviceNameSnapshot,
      dateTimeDisplay: localTime.displayStr,
      managementUrl,
    });

    // 7. Provider submission
    const sendResult = await provider.send({
      to: input.delivery.recipient,
      message,
      idempotencyContext: {
        businessId: input.delivery.businessId,
        deliveryId: input.delivery.id,
        planId: input.delivery.planId,
      },
    });

    if (sendResult.accepted) {
      await NotificationDeliveryRepository.markSent({
        deliveryId: input.delivery.id,
        workerId: input.workerId,
        providerMessageId: sendResult.providerMessageId,
        referenceNow,
      });

      return {
        outcome: "SENT",
        providerMessageId: sendResult.providerMessageId,
      };
    }

    // Handle failure with bounded backoff
    const isPermanent =
      !sendResult.isRetryable ||
      input.delivery.attemptCount >= NOTIFICATION_DELIVERY_MAX_ATTEMPTS;

    const delayMs = getNotificationDeliveryRetryDelayMs(
      input.delivery.attemptCount
    );
    const availableAt = new Date(referenceNow.getTime() + delayMs);
    const errorCode = sanitizeDeliveryErrorCode(
      sendResult.errorCode ?? "DELIVERY_ERROR"
    );

    await NotificationDeliveryRepository.markFailed({
      deliveryId: input.delivery.id,
      workerId: input.workerId,
      errorCode,
      isPermanent,
      availableAt,
      referenceNow,
    });

    return {
      outcome: "FAILED",
      isPermanent,
      errorCode,
    };
  },

  async processDueNotificationDeliveries(input: {
    workerId: unknown;
    batchSize?: number;
    referenceNow?: Date;
    provider?: SmsProvider;
  }): Promise<{
    materialized: number;
    claimed: number;
    sent: number;
    failed: number;
    cancelled: number;
  }> {
    if (!isValidNotificationDeliveryWorkerId(input.workerId)) {
      throw new NotificationDeliveryError("DELIVERY_INVALID_WORKER");
    }

    const batchSize = input.batchSize ?? 25;
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > NOTIFICATION_DELIVERY_MAX_BATCH_SIZE
    ) {
      throw new NotificationDeliveryError("DELIVERY_INVALID_WORKER");
    }

    const referenceNow = input.referenceNow ?? new Date();
    const provider = input.provider ?? defaultSmsProvider;

    // 1. Reconcile/materialize due plans
    const { materialized } = await NotificationDeliveryService.materializeDuePlansBatch(
      {
        batchSize,
        referenceNow,
        providerName: provider.name,
      }
    );

    // 2. Claim due deliveries batch
    const claimedDeliveries = await NotificationDeliveryRepository.claimDueDeliveryBatch(
      {
        workerId: input.workerId,
        batchSize,
        referenceNow,
      }
    );

    // 3. Send through provider
    let sent = 0;
    let failed = 0;
    let cancelled = 0;

    for (const delivery of claimedDeliveries) {
      try {
        const result = await NotificationDeliveryService.sendClaimedDelivery({
          delivery,
          workerId: input.workerId,
          referenceNow,
          provider,
        });

        if (result.outcome === "SENT") {
          sent += 1;
        } else if (result.outcome === "CANCELLED") {
          cancelled += 1;
        } else {
          failed += 1;
        }
      } catch {
        // Safe fallback on unexpected execution error
        try {
          const delayMs = getNotificationDeliveryRetryDelayMs(
            delivery.attemptCount
          );
          await NotificationDeliveryRepository.markFailed({
            deliveryId: delivery.id,
            workerId: input.workerId,
            errorCode: "DELIVERY_ERROR",
            isPermanent:
              delivery.attemptCount >= NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
            availableAt: new Date(referenceNow.getTime() + delayMs),
            referenceNow,
          });
          failed += 1;
        } catch {
          // Worker continues
        }
      }
    }

    return {
      materialized,
      claimed: claimedDeliveries.length,
      sent,
      failed,
      cancelled,
    };
  },
};
