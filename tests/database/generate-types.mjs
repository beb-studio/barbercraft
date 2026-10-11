// Regenerates src/types/database.types.ts from the REAL schema produced by the
// migrations (fresh throwaway PostgreSQL -> official Supabase CLI generator).
// Run: pnpm db:types      (needs network the first time to fetch the CLI)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDatabase } from "./db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../../src/types/database.types.ts");
const db = await startDatabase();
try {
  const url = `${db.connectionString}?sslmode=disable`;
  const generated = execFileSync(
    "pnpm",
    ["dlx", "supabase@2.119.0", "gen", "types", "typescript", "--db-url", url, "--schema", "public"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  const header =
    "// GENERATED FILE - DO NOT EDIT BY HAND.\n" +
    "// Source of truth: supabase/migrations. Regenerate with `pnpm db:types`.\n";
  fs.writeFileSync(target, header + generated.trimStart());
  execFileSync("pnpm", ["dlx", "oxfmt", target], { stdio: "ignore" });
  console.log(`Wrote ${path.relative(process.cwd(), target)}`);
} finally {
  await db.stop();
}
