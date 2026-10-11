// Starts a throwaway real PostgreSQL server (embedded-postgres), and applies
// every Drizzle migration in drizzle/migrations in order, from scratch.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
export const migrationsDir = path.resolve(here, "../../drizzle/migrations");

export async function applyMigrationFile(pool, file) {
  const sqlContent = fs.readFileSync(file, "utf8");
  const statements = sqlContent
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      const port = typeof address === "object" && address ? address.port : null;
      socket.close((error) => {
        if (error) reject(error);
        else if (port === null) reject(new Error("Could not allocate a PostgreSQL test port."));
        else resolve(port);
      });
    });
  });
}

export async function startDatabase({ port, throughMigration } = {}) {
  const databasePort = port ?? (await getAvailablePort());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "barber-pg-"));
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: databasePort,
    persistent: false,
  });
  await server.initialise();
  await server.start();
  await server.createDatabase("app");

  const connectionString = `postgresql://postgres:postgres@localhost:${databasePort}/app`;
  const pool = new pg.Pool({ connectionString, max: 4 });

  const allFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(migrationsDir, f));
  const files = throughMigration
    ? allFiles.filter((file) => path.basename(file) <= throughMigration)
    : allFiles;

  for (const file of files) {
    try {
      await applyMigrationFile(pool, file);
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
    allMigrationFiles: allFiles,
    async stop() {
      await pool.end();
      await server.stop();
    },
  };
}
