import crypto from "node:crypto";
import { redactSensitiveData } from "@/lib/redact";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContext {
  correlationId?: string;
  subsystem?: string;
  jobId?: string;
  workerId?: string;
  businessId?: string;
  appointmentId?: string;
  [key: string]: unknown;
}

/**
 * Creates a unique correlation ID for tracking request/job lifecycles.
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Structured Production Logger
 * Emits JSON-formatted logs to stdout/stderr with automatic credential/secret redaction.
 */
class StructuredLogger {
  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
    subsystem: string = "app"
  ): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      subsystem: context?.subsystem || subsystem,
      message,
      ...(context ? (redactSensitiveData(context) as Record<string, unknown>) : {}),
    };
    return JSON.stringify(entry);
  }

  debug(message: string, context?: LogContext, subsystem?: string): void {
    if (process.env.NODE_ENV !== "production" || process.env.LOG_LEVEL === "DEBUG") {
      console.debug(this.formatMessage("DEBUG", message, context, subsystem));
    }
  }

  info(message: string, context?: LogContext, subsystem?: string): void {
    console.log(this.formatMessage("INFO", message, context, subsystem));
  }

  warn(message: string, context?: LogContext, subsystem?: string): void {
    console.warn(this.formatMessage("WARN", message, context, subsystem));
  }

  error(message: string, error?: unknown, context?: LogContext, subsystem?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error || "");
    const errorStack =
      process.env.NODE_ENV !== "production" && error instanceof Error ? error.stack : undefined;

    const mergedContext = {
      ...context,
      errorDetails: errorMessage || undefined,
      stack: errorStack,
    };

    console.error(this.formatMessage("ERROR", message, mergedContext, subsystem));
  }
}

export const logger = new StructuredLogger();
