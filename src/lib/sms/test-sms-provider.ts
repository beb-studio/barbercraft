import "server-only";

import type { SendSmsInput, SendSmsResult, SmsProvider } from "./sms-provider";

export type TestProviderMode =
  | { mode: "SUCCESS"; jobId?: string }
  | { mode: "RETRYABLE_ERROR"; code?: string }
  | { mode: "PERMANENT_ERROR"; code?: string }
  | { mode: "TIMEOUT" };

export interface RecordedSmsCall {
  to: string;
  message: string;
  idempotencyContext?: {
    businessId: string;
    deliveryId: string;
    planId: string;
  };
  timestamp: Date;
}

export class TestSmsProvider implements SmsProvider {
  public readonly name = "test";

  private currentMode: TestProviderMode = { mode: "SUCCESS" };

  public readonly recordedCalls: RecordedSmsCall[] = [];

  forceSuccess(jobId: string = "test-job-123"): void {
    this.currentMode = { mode: "SUCCESS", jobId };
  }

  forceRetryableError(code: string = "NETWORK_ERROR"): void {
    this.currentMode = { mode: "RETRYABLE_ERROR", code };
  }

  forcePermanentError(code: string = "RECIPIENT_INVALID"): void {
    this.currentMode = { mode: "PERMANENT_ERROR", code };
  }

  forceTimeout(): void {
    this.currentMode = { mode: "TIMEOUT" };
  }

  reset(): void {
    this.recordedCalls.length = 0;
    this.currentMode = { mode: "SUCCESS" };
  }

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    this.recordedCalls.push({
      to: input.to,
      message: input.message,
      idempotencyContext: input.idempotencyContext,
      timestamp: new Date(),
    });

    switch (this.currentMode.mode) {
      case "SUCCESS":
        return {
          accepted: true,
          providerMessageId: this.currentMode.jobId ?? "test-job-123",
          isRetryable: false,
        };
      case "RETRYABLE_ERROR":
        return {
          accepted: false,
          isRetryable: true,
          errorCode: this.currentMode.code ?? "TEST_RETRYABLE",
        };
      case "PERMANENT_ERROR":
        return {
          accepted: false,
          isRetryable: false,
          errorCode: this.currentMode.code ?? "TEST_PERMANENT",
        };
      case "TIMEOUT":
        return {
          accepted: false,
          isRetryable: true,
          errorCode: "TIMEOUT",
        };
    }
  }
}
