import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness Probe: GET /api/health
 * Verifies that the application HTTP server process is running and responding.
 * Exposes zero sensitive details, database credentials, or tenant statistics.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
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
