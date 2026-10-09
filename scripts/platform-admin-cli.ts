if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    try {
      process.loadEnvFile(".env");
    } catch {
      // Ignore if files do not exist
    }
  }
}
import type { PlatformAdminRole } from "../src/db/schema";

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  let command = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "grant" || arg === "list") {
      command = arg;
    } else if (arg.startsWith("--")) {
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

  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command) {
    console.error("Usage:");
    console.error("  pnpm platform-admin:grant --email <email> --role <SUPER_ADMIN|ADMIN>");
    console.error("  pnpm platform-admin:list");
    process.exit(1);
  }

  const { PlatformAdminService } = await import("../src/services/platform-admin.service");

  if (command === "grant") {
    const email = options.email;
    const role = (options.role ?? "SUPER_ADMIN") as PlatformAdminRole;

    if (!email) {
      console.error("Error: --email is required.");
      process.exit(1);
    }

    try {
      const res = await PlatformAdminService.grantPlatformAdmin({ email, role });
      console.log("=== Platform Admin Granted Successfully ===");
      console.log(`Admin ID : ${res.adminId}`);
      console.log(`User ID  : ${res.userId}`);
      console.log(`Name     : ${res.name}`);
      console.log(`Email    : ${res.email}`);
      console.log(`Role     : ${res.role}`);
      console.log(`Active   : ${res.active ? "Yes" : "No"}`);
      process.exit(0);
    } catch (err) {
      console.error(`Grant failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  if (command === "list") {
    try {
      const admins = await PlatformAdminService.listPlatformAdmins();
      console.log("=== Platform Administrators ===");
      if (admins.length === 0) {
        console.log("No platform administrators found.");
      } else {
        console.table(
          admins.map((a) => ({
            "Admin ID": a.id,
            "User ID": a.userId,
            Name: a.userName,
            Email: a.userEmail,
            Role: a.role,
            Active: a.active,
            "Created At": a.createdAt.toISOString(),
          }))
        );
      }
      process.exit(0);
    } catch (err) {
      console.error(`List failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
