import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../src/lib/logger";
import { redactUrlCredentials } from "../src/lib/redact";

async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    logger.error("Migration failed: DATABASE_URL is not set", undefined, undefined, "migrator");
    process.exit(1);
  }

  logger.info("Initializing migration client", { dbUrl: redactUrlCredentials(dbUrl) }, "migrator");

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  try {
    const db = drizzle(pool);
    const migrationsFolder = path.resolve(process.cwd(), "drizzle/migrations");

    logger.info("Applying pending migrations...", { migrationsFolder }, "migrator");
    await migrate(db, { migrationsFolder });
    logger.info("All database migrations applied successfully", undefined, "migrator");

    await pool.end();
    process.exit(0);
  } catch (err) {
    logger.error("Migration failed with error", err, undefined, "migrator");
    try {
      await pool.end();
    } catch {
      // Ignore pool close error on fatal failure
    }
    process.exit(1);
  }
}

runMigrations();
