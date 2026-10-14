import { Pool } from "pg";

if (typeof process.loadEnvFile === "function") {
  for (const envFile of [".env.qa.local", ".env.local", ".env"]) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // Ignore if file does not exist
    }
  }
}

/**
 * Authoritative Allowlist of BarberCraft Application Data Tables.
 * Truncation is STRICTLY limited to these tables.
 * Migration history (__drizzle_migrations) and arbitrary external tables are never touched.
 */
export const BARBERCRAFT_APP_TABLES = [
  "accounts",
  "appointment_access_tokens",
  "appointments",
  "business_members",
  "business_notification_reminder_rules",
  "business_notification_settings",
  "business_working_hours",
  "businesses",
  "customer_notes",
  "customers",
  "notification_deliveries",
  "notification_outbox",
  "notification_plans",
  "platform_admin_audit_logs",
  "platform_admins",
  "rate_limits",
  "services",
  "sessions",
  "staff_invitations",
  "staff_profiles",
  "staff_services",
  "staff_working_hours",
  "time_blocks",
  "users",
  "verifications",
] as const;

export interface ResetSafetyCheckResult {
  isSafe: boolean;
  error?: string;
  database?: string;
  user?: string;
  host?: string;
  port?: string;
}

/**
 * Validates connection parameters prior to destructive reset operations.
 * Enforces strict fail-closed safety invariants without leaking passwords.
 */
export function validateQaResetTarget(
  dbUrl: string,
  env: Record<string, string | undefined> = process.env
): ResetSafetyCheckResult {
  if (env.NODE_ENV === "production") {
    return {
      isSafe: false,
      error: "qa:reset cannot be executed in production environment (NODE_ENV=production).",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    return {
      isSafe: false,
      error: "DATABASE_URL is not a valid connection URL.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  const database = parsed.pathname.replace(/^\//, "");
  const user = decodeURIComponent(parsed.username);

  // Invariant 1: Host must be recognized local loopback / local dev container
  const recognizedHosts = new Set(["localhost", "127.0.0.1", "::1", "barbercraft_dev_db"]);
  if (!recognizedHosts.has(host)) {
    return {
      isSafe: false,
      error: `Security violation: Database host '${host}' is not a recognized local development host.`,
      host,
      database,
      user,
      port,
    };
  }

  // Invariant 2: Database name must strictly be 'barbercraft_dev'
  if (database !== "barbercraft_dev") {
    return {
      isSafe: false,
      error: `Target violation: Expected database 'barbercraft_dev', but DATABASE_URL points to '${database}'.`,
      host,
      database,
      user,
      port,
    };
  }

  // Invariant 3: Database user must strictly be 'barbercraft_user'
  if (user !== "barbercraft_user") {
    return {
      isSafe: false,
      error: `Identity violation: Expected database user 'barbercraft_user', but DATABASE_URL specifies '${user}'.`,
      host,
      database,
      user,
      port,
    };
  }

  return {
    isSafe: true,
    host,
    database,
    user,
    port,
  };
}

async function main() {
  console.log("==================================================");
  console.log("BarberCraft QA Veritabanı Sıfırlama (qa:reset)");
  console.log("==================================================\n");

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error("❌ Hata: DATABASE_URL tanımlı değil!");
    process.exit(1);
  }

  // 1. Statik URL ve Ortam Doğrulama Koruması
  const preCheck = validateQaResetTarget(dbUrl, process.env);
  if (!preCheck.isSafe) {
    console.error(`❌ Güvenlik Doğrulaması Başarısız: ${preCheck.error}`);
    process.exit(1);
  }

  console.log(`Hedef Veritabanı: ${preCheck.database} (${preCheck.host}:${preCheck.port}, kullanıcı: ${preCheck.user})`);
  console.log("Bağlantı kuruluyor...");

  const pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();

    // 2. Canlı Veritabanı Metadata Doğrulaması (Runtime Verification)
    const metaRes = await client.query<{ current_database: string; current_user: string }>(
      "SELECT current_database(), current_user;"
    );
    const activeDb = metaRes.rows[0]?.current_database;
    const activeUser = metaRes.rows[0]?.current_user;

    if (activeDb !== "barbercraft_dev") {
      client.release();
      await pool.end();
      console.error(
        `❌ Güvenlik Hatası: Aktif veritabanı '${activeDb}' beklenen 'barbercraft_dev' ile eşleşmiyor. Sıfırlama durduruldu.`
      );
      process.exit(1);
    }

    if (activeUser !== "barbercraft_user") {
      client.release();
      await pool.end();
      console.error(
        `❌ Güvenlik Hatası: Aktif oturum kullanıcısı '${activeUser}' beklenen 'barbercraft_user' ile eşleşmiyor. Sıfırlama durduruldu.`
      );
      process.exit(1);
    }

    console.log("✔ Veritabanı güvenliği doğrulandı.");

    // 3. Mevcut Tabloları Tara ve Yalnızca İzin Verilen (Allowlist) Tabloları Filtrele
    const tableRes = await client.query<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    const existingTables = new Set(tableRes.rows.map((r) => r.tablename));
    const tablesToTruncate = BARBERCRAFT_APP_TABLES.filter((t) => existingTables.has(t));

    if (tablesToTruncate.length > 0) {
      console.log(`${tablesToTruncate.length} BarberCraft uygulama tablosu sıfırlanıyor (TRUNCATE CASCADE)...`);
      const tableListSql = tablesToTruncate.map((t) => `"${t}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${tableListSql} CASCADE;`);
      console.log("✔ Uygulama tabloları başarıyla temizlendi (migrasyon geçmişi korundu).");
    } else {
      console.log("Temizlenecek uygulama tablosu bulunamadı.");
    }

    client.release();
    await pool.end();

    // 4. Kanonik QA Verilerini Yeniden Tohumla
    console.log("\nKanonik QA test verileri yeniden oluşturuluyor (bootstrapQA)...");
    const { bootstrapQA } = await import("../src/services/qa-bootstrap.service");
    await bootstrapQA({});

    console.log("\n==================================================");
    console.log("✔ QA ORTAMI BAŞARIYLA SIFIRLANDI VE TOHUMLANDI");
    console.log("==================================================");
    console.log("Tüm QA hesapları 'BarberCraft-QA-4380!' şifresi ile hazır.");
    console.log("Web: http://localhost:4380\n");

    process.exit(0);
  } catch (err) {
    console.error("❌ Hata sırasında bir problem oluştu:", (err as Error).message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("qa-reset.ts")) {
  main().catch((err) => {
    console.error("Beklenmeyen hata:", err);
    process.exit(1);
  });
}
