if (typeof process.loadEnvFile === "function") {
  // Precedence order: Environment/CLI (highest) -> .env.qa.local -> .env.local -> .env (lowest)
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
  const defaultPassword = "BarberCraft-QA-4380!";

  const superAdminEmail = options["super-admin-email"] || process.env.QA_SUPER_ADMIN_EMAIL || "qa.superadmin@local.test";
  const superAdminPassword = options["super-admin-password"] || process.env.QA_SUPER_ADMIN_PASSWORD || defaultPassword;

  const platformAdminEmail = options["platform-admin-email"] || process.env.QA_PLATFORM_ADMIN_EMAIL || "qa.platformadmin@local.test";
  const platformAdminPassword = options["platform-admin-password"] || process.env.QA_PLATFORM_ADMIN_PASSWORD || defaultPassword;

  const ownerEmail = options["owner-email"] || process.env.QA_OWNER_EMAIL || "qa.owner@local.test";
  const ownerPassword = options["owner-password"] || process.env.QA_OWNER_PASSWORD || defaultPassword;

  const managerEmail = options["manager-email"] || process.env.QA_MANAGER_EMAIL || options["admin-email"] || process.env.QA_ADMIN_EMAIL || "qa.manager@local.test";
  const managerPassword = options["manager-password"] || process.env.QA_MANAGER_PASSWORD || options["admin-password"] || process.env.QA_ADMIN_PASSWORD || defaultPassword;

  const staffEmail = options["staff-email"] || process.env.QA_STAFF_EMAIL || "qa.staff@local.test";
  const staffPassword = options["staff-password"] || process.env.QA_STAFF_PASSWORD || defaultPassword;

  const staff2Email = options["staff2-email"] || process.env.QA_STAFF2_EMAIL || "qa.staff2@local.test";
  const staff2Password = options["staff2-password"] || process.env.QA_STAFF2_PASSWORD || defaultPassword;

  const owner2Email = options["owner2-email"] || process.env.QA_OWNER2_EMAIL || "qa.owner2@local.test";
  const owner2Password = options["owner2-password"] || process.env.QA_OWNER2_PASSWORD || defaultPassword;

  const staff3Email = options["staff3-email"] || process.env.QA_STAFF3_EMAIL || "qa.staff3@local.test";
  const staff3Password = options["staff3-password"] || process.env.QA_STAFF3_PASSWORD || defaultPassword;

  const { bootstrapQA } = await import("../src/services/qa-bootstrap.service");

  try {
    const result = await bootstrapQA({
      superAdminEmail,
      superAdminPassword,
      platformAdminEmail,
      platformAdminPassword,
      ownerEmail,
      ownerPassword,
      managerEmail,
      managerPassword,
      staffEmail,
      staffPassword,
      staff2Email,
      staff2Password,
      owner2Email,
      owner2Password,
      staff3Email,
      staff3Password,
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
    console.log("Configured QA Accounts (Unambiguous Role Taxonomy):");
    console.log("- Platform:");
    console.log(`  - SUPER_ADMIN:    ${result.users.superAdmin.email}`);
    console.log(`  - PLATFORM_ADMIN: ${result.users.platformAdmin.email}`);
    console.log("- Primary Tenant (QA Berber):");
    console.log(`  - OWNER:          ${result.users.owner.email}`);
    console.log(`  - MANAGER:        ${result.users.manager.email}`);
    console.log(`  - STAFF:          ${result.users.staff.email}`);
    console.log(`  - STAFF 2:        ${result.users.staff2.email}`);
    console.log("- Second Tenant (QA Berber 2):");
    console.log(`  - OWNER:          ${result.users.owner2.email}`);
    console.log(`  - STAFF:          ${result.users.staff3.email}`);

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
