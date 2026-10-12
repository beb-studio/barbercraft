import "server-only";

export interface SendSmsInput {
  to: string;
  message: string;
  idempotencyContext?: {
    businessId: string;
    deliveryId: string;
    planId: string;
  };
}

export interface SendSmsResult {
  accepted: boolean;
  providerMessageId?: string;
  errorCode?: string;
  isRetryable: boolean;
}

export interface SmsProvider {
  readonly name: string;
  send(input: SendSmsInput): Promise<SendSmsResult>;
}
