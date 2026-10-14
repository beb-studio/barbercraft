import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db";
import { validateEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Readiness Probe: GET /api/ready
 * Verifies that the application is fully configured and ready to accept traffic.
 * Validates:
 * 1. Environment configuration
 * 2. Database connectivity via bounded SELECT 1 query
 *
 * Exposes zero internal database credentials, stack traces, or tenant data.
 */
export async function GET() {
  // 1. Validate environment configuration
  const envValidation = validateEnvironment();
  if (!envValidation.isValid) {
    return NextResponse.json(
      {
        status: "not_ready",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 2. Validate database connectivity with bounded timeout (max 3000ms)
  const dbHealth = await checkDatabaseHealth(3000);
  if (!dbHealth.ok) {
    return NextResponse.json(
      {
        status: "not_ready",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Content-Type": "application/json",
        },
      }
    );
  }

  return NextResponse.json(
    {
      status: "ready",
      latencyMs: dbHealth.latencyMs,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Content-Type": "application/json",
      },
    }
  );
}
