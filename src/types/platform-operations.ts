export type BusinessHealthStatus = "HEALTHY" | "ATTENTION" | "SUSPENDED";

export type BusinessHealthReasonCode =
  | "BUSINESS_SUSPENDED"
  | "NO_ACTIVE_OWNER"
  | "ONBOARDING_INCOMPLETE"
  | "TERMINAL_OUTBOX_FAILURES"
  | "TERMINAL_DELIVERY_FAILURES";

export const BUSINESS_HEALTH_REASON_LABELS: Record<BusinessHealthReasonCode, string> = {
  BUSINESS_SUSPENDED: "İşletme askıya alınmış",
  NO_ACTIVE_OWNER: "Aktif işletme sahibi bulunmuyor",
  ONBOARDING_INCOMPLETE: "İlk kurulum tamamlanmamış",
  TERMINAL_OUTBOX_FAILURES: "Kalıcı başarısız bildirim kuyruğu kaydı var",
  TERMINAL_DELIVERY_FAILURES: "Kalıcı başarısız SMS teslimat kaydı var",
};

export interface PlatformMemberCounts {
  owner: number;
  admin: number;
  staff: number;
  totalActive: number;
}

export interface PlatformStaffCounts {
  total: number;
  active: number;
  bookable: number;
}

export interface PlatformAppointmentHealth {
  appointmentsToday: number;
  futureOperationalAppointments: number;
  appointmentsLast7Days: number;
  lastAppointmentAt: string | null;
}

export interface PlatformNotificationHealth {
  pendingOutbox: number;
  retryableOutboxFailures: number;
  terminalOutboxFailures: number;
  pendingPlans: number;
  pendingDeliveries: number;
  retryableDeliveryFailures: number;
  terminalDeliveryFailures: number;
  lastSuccessfulDeliveryAt: string | null;
}


export interface PlatformBusinessActivity {
  lastOperationalActivityAt: string | null;
}

export interface PlatformBusinessHealth {
  status: BusinessHealthStatus;
  reasons: string[];
}

export interface PlatformBusinessOperationsSummary {
  businessId: string;
  businessName: string;
  slug: string;
  active: boolean;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  timezone: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  memberCounts: PlatformMemberCounts;
  staffCounts: PlatformStaffCounts;
  appointmentHealth: PlatformAppointmentHealth;
  notificationHealth: PlatformNotificationHealth;
  activity: PlatformBusinessActivity;
  health: PlatformBusinessHealth;
}

export interface PlatformOperationsSummary {
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  onboardingIncompleteBusinesses: number;
  activeTenantMembers: number;
  activeStaffProfiles: number;
  appointmentsToday: number;
  appointmentsLast7Days: number;
  notificationOutboxBacklog: number;
  retryableOutboxFailures: number;
  terminalOutboxFailures: number;
  deliveryBacklog: number;
  retryableDeliveryFailures: number;
  terminalDeliveryFailures: number;
}


export interface PlatformTerminalFailureDetail {
  id: string;
  type: "OUTBOX" | "DELIVERY";
  businessId: string;
  appointmentId: string | null;
  eventType?: string;
  channel?: string;
  provider?: string;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  failedAt: string | null;
}

export interface PlatformBusinessOperationsDetail {
  summary: PlatformBusinessOperationsSummary;
  owners: Array<{
    id: string;
    name: string | null;
    email: string;
    active: boolean;
  }>;
  staff: Array<{
    id: string;
    name: string;
    title: string | null;
    active: boolean;
    bookable: boolean;
    serviceCount: number;
  }>;
  notificationBreakdown: {
    outbox: {
      pending: number;
      processing: number;
      processed: number;
      retryableFailed: number;
      terminalFailed: number;
    };
    plans: {
      pending: number;
      cancelled: number;
    };
    deliveries: {
      pending: number;
      processing: number;
      sent: number;
      retryableFailed: number;
      terminalFailed: number;
      cancelled: number;
    };
    lastSuccessfulDeliveryAt: string | null;
  };
  recentAuditLogs: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    adminName: string | null;
    adminEmail: string | null;
  }>;
  recentFailures: PlatformTerminalFailureDetail[];
}

export interface PlatformBusinessListParams {
  page?: number;
  limit?: number;
  search?: string;
  filterActive?: boolean;
  healthStatus?: BusinessHealthStatus;
}

export interface PaginatedPlatformBusinessOperations {
  items: PlatformBusinessOperationsSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class PlatformOperationsError extends Error {
  constructor(message: string, public readonly code: string = "PLATFORM_OPERATIONS_ERROR") {
    super(message);
    this.name = "PlatformOperationsError";
  }
}

export class PlatformNotFoundError extends PlatformOperationsError {
  constructor(message = "Kayıt bulunamadı") {
    super(message, "NOT_FOUND");
    this.name = "PlatformNotFoundError";
  }
}

export class CannotRequeueSentDeliveryError extends PlatformOperationsError {
  constructor(message = "Gönderilmiş bir bildirim teslimatı yeniden sıraya alınamaz") {
    super(message, "CANNOT_REQUEUE_SENT_DELIVERY");
    this.name = "CannotRequeueSentDeliveryError";
  }
}

export class NotEligibleForRequeueError extends PlatformOperationsError {
  constructor(message = "Bu bildirim kaydı yeniden sıraya alınmaya uygun değil; yalnızca kalıcı başarısız olmuş kayıtlar yeniden sıraya alınabilir") {
    super(message, "NOT_ELIGIBLE_FOR_REQUEUE");
    this.name = "NotEligibleForRequeueError";
  }
}

