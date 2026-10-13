/**
 * Centralized Sensitive Data Redaction Utility
 * Prevents credentials, database connection strings, capability tokens,
 * passwords, and session cookies from being emitted to server logs or traces.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /auth/i,
  /cookie/i,
  /credential/i,
  /private/i,
  /database_?url/i,
  /usercode/i,
  /msgheader/i,
];

const URI_CREDENTIALS_REGEX = /:\/\/([^:]+):([^@]+)@/g;

/**
 * Redacts passwords/credentials embedded in URLs (e.g. postgres://user:pass@host).
 */
export function redactUrlCredentials(str: string): string {
  if (typeof str !== "string") return str;
  return str.replace(URI_CREDENTIALS_REGEX, "://$1:[REDACTED]@");
}

/**
 * Deeply redacts sensitive fields from objects, arrays, or strings before logging.
 */
export function redactSensitiveData(data: unknown, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_LIMIT]";
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    return redactUrlCredentials(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return result;
  }

  return data;
}

/**
 * Sanitizes server exceptions to ensure no internal implementation details,
 * database connection strings, credentials, SQL queries, or stack traces leak to clients.
 */
export function sanitizeClientError(error: unknown, fallbackMessage = "İşlem sırasında bir hata oluştu."): string {
  if (!error) return fallbackMessage;

  const message = error instanceof Error ? error.message : String(error);

  const lower = message.toLowerCase();
  if (
    lower.includes("postgres") ||
    lower.includes("drizzle") ||
    lower.includes("syntax error") ||
    lower.includes("violates foreign key") ||
    lower.includes("violates unique constraint") ||
    lower.includes("violates check constraint") ||
    lower.includes("connection refused") ||
    lower.includes("password authentication failed") ||
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("credential") ||
    lower.includes("api_key") ||
    lower.includes("apikey") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("table") ||
    lower.includes("select ") ||
    lower.includes("insert into") ||
    lower.includes("update ") ||
    lower.includes("delete from") ||
    lower.includes("stack trace") ||
    lower.includes("fatal:")
  ) {
    return fallbackMessage;
  }

  if (message.length <= 200 && !message.includes("://") && !message.includes("\n")) {
    return message;
  }

  return fallbackMessage;
}
