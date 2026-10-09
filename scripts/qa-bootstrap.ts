if (typeof process.loadEnvFile === "function") {
  // Precedence order: Environment/CLI (highest) -> .env.qa.local -> .env.local -> .env (lowest)
  // Since process.loadEnvFile does not overwrite already set variables in process.env,
  // loading in this order ensures higher precedence files set variables first.
  for (const envFile of [".env.qa.local", ".env.local", ".env"]) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // Ignore if file does not exist
    }
  }
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = "true";
      }
    }
  }
  return options;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Error: qa:bootstrap cannot be executed in production environment (NODE_ENV=production).");
    process.exit(1);
  }

  const options = parseArgs(process.argv.slice(2));

  const superAdminEmail = options["super-admin-email"] || process.env.QA_SUPER_ADMIN_EMAIL;
  const superAdminPassword = options["super-admin-password"] || process.env.QA_SUPER_ADMIN_PASSWORD;
  const ownerEmail = options["owner-email"] || process.env.QA_OWNER_EMAIL;
  const ownerPassword = options["owner-password"] || process.env.QA_OWNER_PASSWORD;
  const adminEmail = options["admin-email"] || process.env.QA_ADMIN_EMAIL;
  const adminPassword = options["admin-password"] || process.env.QA_ADMIN_PASSWORD;
  const staffEmail = options["staff-email"] || process.env.QA_STAFF_EMAIL;
  const staffPassword = options["staff-password"] || process.env.QA_STAFF_PASSWORD;

  const missing: string[] = [];
  if (!superAdminEmail) missing.push("QA_SUPER_ADMIN_EMAIL (or --super-admin-email)");
  if (!superAdminPassword) missing.push("QA_SUPER_ADMIN_PASSWORD (or --super-admin-password)");
  if (!ownerEmail) missing.push("QA_OWNER_EMAIL (or --owner-email)");
  if (!ownerPassword) missing.push("QA_OWNER_PASSWORD (or --owner-password)");
  if (!adminEmail) missing.push("QA_ADMIN_EMAIL (or --admin-email)");
  if (!adminPassword) missing.push("QA_ADMIN_PASSWORD (or --admin-password)");
  if (!staffEmail) missing.push("QA_STAFF_EMAIL (or --staff-email)");
  if (!staffPassword) missing.push("QA_STAFF_PASSWORD (or --staff-password)");

  if (missing.length > 0) {
    console.error("Error: Missing required QA credentials.");
    console.error("Please provide .env.qa.local or environment variables or CLI arguments:");
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    process.exit(1);
  }

  const { bootstrapQA } = await import("../src/services/qa-bootstrap.service");

  try {
    const result = await bootstrapQA({
      superAdminEmail: superAdminEmail!,
      superAdminPassword: superAdminPassword!,
      ownerEmail: ownerEmail!,
      ownerPassword: ownerPassword!,
      adminEmail: adminEmail!,
      adminPassword: adminPassword!,
      staffEmail: staffEmail!,
      staffPassword: staffPassword!,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    console.log("QA bootstrap complete.\n");
    console.log("Credentials file:");
    console.log("  .env.qa.local (inspect this local-only file directly for passwords; never commit or log)\n");
    console.log("Access URLs:");
    console.log(`- Platform Admin:   ${baseUrl}/platform`);
    console.log(`- Business Agendas: ${baseUrl}/dashboard`);
    console.log(`- Public Booking:   ${baseUrl}/book/${result.business.slug}`);
    console.log(`- Login:            ${baseUrl}/login\n`);
    console.log("Configured QA Accounts:");
    console.log(`- SUPER_ADMIN: ${result.users.superAdmin.email}`);
    console.log(`- OWNER:       ${result.users.owner.email}`);
    console.log(`- ADMIN:       ${result.users.admin.email}`);
    console.log(`- STAFF:       ${result.users.staff.email}`);

    process.exit(0);
  } catch (err) {
    console.error(`QA bootstrap failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error during QA bootstrap:", err);
  process.exit(1);
});
