import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const poolMax = Math.max(1, parseInt(process.env.DB_POOL_MAX || "10", 10) || 10);
const idleTimeoutMillis = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || "30000", 10) || 30000;
const connectionTimeoutMillis = parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || "5000", 10) || 5000;

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolMax,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;

/**
 * Checks database readiness with a strict bounded timeout.
 * Used by readiness probe /api/ready.
 */
export async function checkDatabaseHealth(timeoutMs: number = 3000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, error: "Database query timed out" });
    }, timeoutMs);
  });

  const queryPromise = (async (): Promise<{ ok: true; latencyMs: number }> => {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  })();

  try {
    const result = await Promise.race([queryPromise, timeoutPromise]);
    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Database connection failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Gracefully terminates all active connections in the database pool.
 * Used during process shutdown (SIGTERM / SIGINT).
 */
export async function closeDatabasePool(): Promise<void> {
  try {
    await pool.end();
  } catch (err) {
    console.error("Error closing database pool:", err instanceof Error ? err.message : String(err));
  }
}
