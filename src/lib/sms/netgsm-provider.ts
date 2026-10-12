import "server-only";

import type { SendSmsInput, SendSmsResult, SmsProvider } from "./sms-provider";

export interface NetgsmConfig {
  usercode?: string;
  password?: string;
  msgheader?: string;
  apiUrl?: string;
  timeoutMs?: number;
}

export function formatPhoneForNetgsm(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Turkish mobile: 905XXXXXXXXX (12 digits) -> 5XXXXXXXXX (10 digits)
  if (digits.length === 12 && digits.startsWith("905")) {
    return digits.slice(2);
  }
  // Turkish mobile: 05XXXXXXXXX (11 digits) -> 5XXXXXXXXX (10 digits)
  if (digits.length === 11 && digits.startsWith("05")) {
    return digits.slice(1);
  }
  // Turkish mobile: 5XXXXXXXXX (10 digits) -> 5XXXXXXXXX
  if (digits.length === 10 && digits.startsWith("5")) {
    return digits;
  }
  return digits;
}

export class NetgsmSmsProvider implements SmsProvider {
  public readonly name = "netgsm";

  private readonly config: NetgsmConfig;

  constructor(config: NetgsmConfig = {}) {
    this.config = config;
  }

  private getUsercode(): string | undefined {
    return this.config.usercode ?? process.env.NETGSM_USERCODE;
  }

  private getPassword(): string | undefined {
    return this.config.password ?? process.env.NETGSM_PASSWORD;
  }

  private getMsgheader(): string | undefined {
    return this.config.msgheader ?? process.env.NETGSM_MSGHEADER;
  }

  private getApiUrl(): string {
    return (
      this.config.apiUrl ??
      process.env.NETGSM_API_URL ??
      "https://api.netgsm.com.tr/sms/rest/v2/send"
    );
  }

  private getTimeoutMs(): number {
    return this.config.timeoutMs ?? 10_000;
  }

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const usercode = this.getUsercode();
    const password = this.getPassword();
    const msgheader = this.getMsgheader();

    if (!usercode || !password || !msgheader) {
      return {
        accepted: false,
        isRetryable: false,
        errorCode: "NETGSM_CONFIG_MISSING",
      };
    }

    const formattedRecipient = formatPhoneForNetgsm(input.to);
    if (!formattedRecipient || formattedRecipient.length < 7) {
      return {
        accepted: false,
        isRetryable: false,
        errorCode: "RECIPIENT_INVALID",
      };
    }

    const authHeader = `Basic ${Buffer.from(`${usercode}:${password}`).toString("base64")}`;
    const payload = {
      msgheader,
      messages: [
        {
          msg: input.message,
          no: formattedRecipient,
        },
      ],
      encoding: "TR",
      iysfilter: "0",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetch(this.getApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const isServerOrRate = response.status >= 500 || response.status === 429;
        return {
          accepted: false,
          isRetryable: isServerOrRate,
          errorCode: `HTTP_${response.status}`,
        };
      }

      let data: Record<string, unknown>;
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        return {
          accepted: false,
          isRetryable: false,
          errorCode: "MALFORMED_RESPONSE",
        };
      }

      const code = String(data.code ?? "");
      if (code === "00") {
        const providerMessageId =
          data.jobid != null
            ? String(data.jobid)
            : data.id != null
            ? String(data.id)
            : undefined;
        return {
          accepted: true,
          providerMessageId,
          isRetryable: false,
        };
      }

      // Netgsm codes 80 (volume limit) and 85 (rate limit: >20 attempts per min) are retryable
      const isRetryable = code === "80" || code === "85";
      return {
        accepted: false,
        isRetryable,
        errorCode: code ? `NETGSM_${code}` : "PROVIDER_ERROR",
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        return {
          accepted: false,
          isRetryable: true,
          errorCode: "TIMEOUT",
        };
      }

      return {
        accepted: false,
        isRetryable: true,
        errorCode: "NETWORK_ERROR",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
