/**
 * Centralized Production Environment Validation
 * Ensures all required environment variables are set, formatted correctly,
 * non-placeholder, and that server secrets are never leaked to public variables.
 */

const KNOWN_PLACEHOLDER_SECRETS = new Set([
  "changeme",
  "secret",
  "placeholder",
  "password",
  "test-secret",
  "development-secret",
  "your-secret-here",
  "12345678901234567890123456789012",
  "default_secret_placeholder_replace",
]);

export interface EnvironmentValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateEnvironment(
  env: Record<string, string | undefined> = process.env
): EnvironmentValidationResult {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  // 1. Leak Checks (Server secrets must never be prefixed with NEXT_PUBLIC_)
  const forbiddenPublicKeys = [
    "NEXT_PUBLIC_DATABASE_URL",
    "NEXT_PUBLIC_BETTER_AUTH_SECRET",
    "NEXT_PUBLIC_NETGSM_PASSWORD",
    "NEXT_PUBLIC_NETGSM_USERCODE",
  ];

  for (const key of forbiddenPublicKeys) {
    if (env[key]) {
      errors.push(`Critical security leak: ${key} is exposed to the client bundle`);
    }
  }

  // 2. Production-specific strict requirements
  if (isProduction) {
    // DATABASE_URL
    const dbUrl = env.DATABASE_URL?.trim();
    if (!dbUrl) {
      errors.push("DATABASE_URL is required in production");
    } else {
      if (!dbUrl.startsWith("postgres://") && !dbUrl.startsWith("postgresql://")) {
        errors.push("DATABASE_URL must be a valid PostgreSQL connection string");
      }
      try {
        new URL(dbUrl);
      } catch {
        errors.push("DATABASE_URL is not a valid URI");
      }
    }

    // BETTER_AUTH_SECRET
    const authSecret = env.BETTER_AUTH_SECRET?.trim();
    if (!authSecret) {
      errors.push("BETTER_AUTH_SECRET is required in production");
    } else {
      if (authSecret.length < 32) {
        errors.push("BETTER_AUTH_SECRET must be at least 32 characters in production");
      }
      if (KNOWN_PLACEHOLDER_SECRETS.has(authSecret.toLowerCase())) {
        errors.push("BETTER_AUTH_SECRET must not use a known default or placeholder value");
      }
    }

    // BASE URL (APP_BASE_URL, NEXT_PUBLIC_APP_URL, or BETTER_AUTH_URL)
    const baseUrl = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL;
    if (!baseUrl) {
      errors.push("At least one base URL (APP_BASE_URL, NEXT_PUBLIC_APP_URL, or BETTER_AUTH_URL) is required in production");
    } else {
      try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errors.push("Configured base URL must use HTTP or HTTPS protocol");
        }
      } catch {
        errors.push("Configured base URL is not a valid URL");
      }
    }

    // Outbound SMS Provider (Netgsm) — Conditional requirements
    const hasNetgsmUsercode = Boolean(env.NETGSM_USERCODE?.trim());
    const hasNetgsmPassword = Boolean(env.NETGSM_PASSWORD?.trim());
    const hasNetgsmHeader = Boolean(env.NETGSM_MSGHEADER?.trim());

    if (hasNetgsmUsercode || hasNetgsmPassword || hasNetgsmHeader) {
      if (!hasNetgsmUsercode) {
        errors.push("NETGSM_USERCODE is required when Netgsm provider is configured");
      }
      if (!hasNetgsmPassword) {
        errors.push("NETGSM_PASSWORD is required when Netgsm provider is configured");
      } else if (KNOWN_PLACEHOLDER_SECRETS.has(env.NETGSM_PASSWORD!.trim().toLowerCase())) {
        errors.push("NETGSM_PASSWORD must not use a known placeholder value in production");
      }
      if (!hasNetgsmHeader) {
        errors.push("NETGSM_MSGHEADER is required when Netgsm provider is configured");
      }
    }

    if (env.NETGSM_API_URL) {
      try {
        new URL(env.NETGSM_API_URL);
      } catch {
        errors.push("NETGSM_API_URL is not a valid URL");
      }
    }

    if (env.NETGSM_TIMEOUT_MS) {
      const timeout = Number(env.NETGSM_TIMEOUT_MS);
      if (isNaN(timeout) || timeout <= 0) {
        errors.push("NETGSM_TIMEOUT_MS must be a positive integer");
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Asserts production environment validity. Fails fast during production startup.
 */
export function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    const { isValid, errors } = validateEnvironment();
    if (!isValid) {
      throw new Error(`Production environment validation failed:\n - ${errors.join("\n - ")}`);
    }
  }
}

/**
 * Safely resolves the application base URL with fallbacks for development.
 */
export function getAppBaseUrl(): string {
  const url =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL;

  if (url) {
    try {
      return new URL(url).origin;
    } catch {
      // Fallback if URL is malformed in dev
    }
  }

  return "http://localhost:3000";
}
