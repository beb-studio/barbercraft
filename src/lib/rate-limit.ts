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

/**
 * Extracts client IP address safely from Next.js request headers.
 * Falls back safely if executed outside request scope (e.g. tests, CLI).
 */
export async function getClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
  } catch {
    // Request scope unavailable (e.g. tests or direct service invocation)
  }
  return "127.0.0.1";
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
