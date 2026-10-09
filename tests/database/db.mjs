// Starts a throwaway real PostgreSQL server (embedded-postgres), and applies
// every Drizzle migration in drizzle/migrations in order, from scratch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
export const migrationsDir = path.resolve(here, "../../drizzle/migrations");

export async function startDatabase({ port = Math.floor(Math.random() * 10000) + 40000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "barber-pg-"));
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
  });
  await server.initialise();
  await server.start();
  await server.createDatabase("app");

  const connectionString = `postgresql://postgres:postgres@localhost:${port}/app`;
  const pool = new pg.Pool({ connectionString, max: 4 });

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(migrationsDir, f));

  for (const file of files) {
    try {
      const sqlContent = fs.readFileSync(file, "utf8");
      // Drizzle splits statements with --> statement-breakpoint
      const statements = sqlContent
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        await pool.query(stmt);
      }
    } catch (err) {
      await pool.end();
      await server.stop();
      throw new Error(`Failed applying ${path.basename(file)}: ${err.message}`);
    }
  }

  return {
    pool,
    connectionString,
    migrationFiles: files.map((f) => path.basename(f)),
    async stop() {
      await pool.end();
      await server.stop();
    },
  };
}
