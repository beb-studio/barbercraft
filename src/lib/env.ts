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
    const baseUrls = [
      { name: "APP_BASE_URL", val: env.APP_BASE_URL },
      { name: "BETTER_AUTH_URL", val: env.BETTER_AUTH_URL },
      { name: "NEXT_PUBLIC_APP_URL", val: env.NEXT_PUBLIC_APP_URL },
    ].filter((b) => Boolean(b.val?.trim()));

    if (baseUrls.length === 0) {
      errors.push("At least one base URL (APP_BASE_URL, NEXT_PUBLIC_APP_URL, or BETTER_AUTH_URL) is required in production");
    } else {
      const allowLocalhost = env.ALLOW_HTTP_LOCALHOST === "true";
      const origins: { name: string; origin: string }[] = [];
      for (const { name, val } of baseUrls) {
        try {
          const parsed = new URL(val!);
          if (!allowLocalhost && parsed.protocol !== "https:") {
            errors.push(`${name} must use HTTPS in production (got ${parsed.protocol})`);
          }
          const hostname = parsed.hostname.toLowerCase();
          if (!allowLocalhost && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1")) {
            errors.push(`${name} must not use localhost/loopback address in production`);
          }
          origins.push({ name, origin: parsed.origin });
        } catch {
          errors.push(`${name} is not a valid URL`);
        }
      }


      // Consistency check: all provided base URLs must match origins
      if (origins.length > 1) {
        const firstOrigin = origins[0].origin;
        for (let i = 1; i < origins.length; i++) {
          if (origins[i].origin !== firstOrigin) {
            errors.push(
              `Base URL origin mismatch: ${origins[0].name} (${firstOrigin}) does not match ${origins[i].name} (${origins[i].origin})`
            );
          }
        }
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
 * Validates environment variables specific to the notification worker process.
 * Independent of web authentication secrets (BETTER_AUTH_SECRET not required).
 */
export function validateWorkerEnvironment(
  env: Record<string, string | undefined> = process.env
): EnvironmentValidationResult {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  if (isProduction) {
    // DATABASE_URL is strictly required for worker
    const dbUrl = env.DATABASE_URL?.trim();
    if (!dbUrl) {
      errors.push("DATABASE_URL is required for worker in production");
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

    // Base URL is required to generate transactional SMS capability links (/randevu#<token>)
    const baseUrl = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL;
    if (!baseUrl) {
      errors.push("APP_BASE_URL is required for worker to generate appointment capability links");
    } else {
      const allowLocalhost = env.ALLOW_HTTP_LOCALHOST === "true";
      try {
        const parsed = new URL(baseUrl);
        if (!allowLocalhost && parsed.protocol !== "https:") {
          errors.push("APP_BASE_URL must use HTTPS in production");
        }
        const hostname = parsed.hostname.toLowerCase();
        if (!allowLocalhost && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1")) {
          errors.push("APP_BASE_URL must not use localhost/loopback address in production");
        }
      } catch {
        errors.push("APP_BASE_URL is not a valid URL");
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
 * Asserts worker production environment validity. Fails fast during worker startup.
 */
export function assertWorkerEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    const { isValid, errors } = validateWorkerEnvironment();
    if (!isValid) {
      throw new Error(`Worker production environment validation failed:\n - ${errors.join("\n - ")}`);
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

  return "http://localhost:4380";
}
