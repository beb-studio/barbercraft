import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Anonymizes an identifier (such as a client IP or capability token)
 * so raw client IP addresses are never persisted in the database.
 */
export function hashIdentifier(id: string, salt: string = "rate-limit"): string {
  return crypto.createHash("sha256").update(`${salt}:${id}`).digest("hex");
}

function isValidIpFormat(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Extracts client IP address safely according to the trusted reverse proxy contract.
 *
 * TRUSTED PROXY CONTRACT:
 * In production, BarberCraft runs in a private internal container network behind
 * a reference reverse proxy (Caddy / Nginx). The reverse proxy terminates TLS,
 * overwrites `X-Real-IP` with the direct peer remote IP ($remote_addr), and strips
 * or normalizes `X-Forwarded-For`.
 * The application prioritizes `X-Real-IP` (which cannot be forged if the reverse proxy overwrites it)
 * followed by the client entry of `X-Forwarded-For`.
 */
export async function getClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();

    // 1. Prefer X-Real-IP set/overwritten by trusted reverse proxy
    const realIp = headerList.get("x-real-ip");
    if (realIp && isValidIpFormat(realIp.trim())) {
      return realIp.trim();
    }

    // 2. Fall back to X-Forwarded-For client entry
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      const clientIp = forwardedFor.split(",")[0].trim();
      if (isValidIpFormat(clientIp)) {
        return clientIp;
      }
    }
  } catch {
    // Request scope unavailable (e.g. tests or direct service invocation)
  }
  return "127.0.0.1";
}

/**
 * Cleans up expired rate limiting windows from the database.
 * Executed periodically by background housekeeping.
 */
export async function cleanupExpiredRateLimits(referenceNow: Date = new Date()): Promise<number> {
  try {
    const result = await db.execute<{ count: string }>(sql`
      WITH deleted AS (
        DELETE FROM rate_limits
        WHERE expires_at < ${referenceNow}
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted;
    `);
    const count = parseInt(result.rows[0]?.count || "0", 10);
    return isNaN(count) ? 0 : count;
  } catch (err) {
    console.error("Failed to clean up expired rate limits:", err instanceof Error ? err.message : String(err));
    return 0;
  }
}


/**
 * Multi-process database-backed rate limiter.
 * Uses atomic PostgreSQL upsert to manage window sliding and counts
 * without race conditions across multiple Node processes.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;

  try {
    const result = await db.execute<{
      count: number;
      remaining_seconds: number;
    }>(sql`
      INSERT INTO rate_limits (key, count, expires_at, created_at, updated_at)
      VALUES (${key}, 1, now() + (${windowSeconds} * interval '1 second'), now(), now())
      ON CONFLICT (key) DO UPDATE
      SET count = CASE
          WHEN rate_limits.expires_at < now() THEN 1
          ELSE rate_limits.count + 1
        END,
        expires_at = CASE
          WHEN rate_limits.expires_at < now() THEN now() + (${windowSeconds} * interval '1 second')
          ELSE rate_limits.expires_at
        END,
        updated_at = now()
      RETURNING count, GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now()))::integer) AS remaining_seconds;
    `);

    const row = result.rows[0];
    const currentCount = Number(row?.count ?? 1);
    const resetSeconds = Number(row?.remaining_seconds ?? windowSeconds);

    if (currentCount > limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        resetSeconds,
      };
    }

    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - currentCount),
      resetSeconds,
    };
  } catch (err) {
    // If rate limit table is temporarily inaccessible, log error without leaking secrets and fail open or closed
    console.error("Rate limiter database error:", err instanceof Error ? err.message : String(err));
    // Fail-open for operational availability while logging the issue
    return {
      success: true,
      limit,
      remaining: 1,
      resetSeconds: 0,
    };
  }
}
