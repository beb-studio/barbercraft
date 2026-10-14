import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { Pool } from "pg";

const rootDir = process.cwd();
const envLocalPath = path.resolve(rootDir, ".env.local");

export interface DevSetupValidationResult {
  isValid: boolean;
  error?: string;
  host?: string;
  port?: string;
  database?: string;
  user?: string;
}

/**
 * Validates that DATABASE_URL matches the canonical BarberCraft development specification.
 */
export function validateDevSetupConfig(dbUrl: string): DevSetupValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    return {
      isValid: false,
      error: "DATABASE_URL geçerli bir URI formatında değil.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  const database = parsed.pathname.replace(/^\//, "");
  const user = decodeURIComponent(parsed.username);

  const recognizedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!recognizedHosts.has(host)) {
    return {
      isValid: false,
      error: `Geçersiz veritabanı sunucusu: '${host}'. Geliştirme veritabanı yerel döngüde (127.0.0.1 veya localhost) olmalıdır.`,
      host,
      port,
      database,
      user,
    };
  }

  if (port !== "55432") {
    return {
      isValid: false,
      error: `Geçersiz veritabanı portu: '${port}'. BarberCraft geliştirme veritabanı için kanonik port 55432'dir.`,
      host,
      port,
      database,
      user,
    };
  }

  if (database !== "barbercraft_dev") {
    return {
      isValid: false,
      error: `Geçersiz veritabanı adı: '${database}'. Beklenen: 'barbercraft_dev'.`,
      host,
      port,
      database,
      user,
    };
  }

  if (user !== "barbercraft_user") {
    return {
      isValid: false,
      error: `Geçersiz veritabanı kullanıcısı: '${user}'. Beklenen: 'barbercraft_user'.`,
      host,
      port,
      database,
      user,
    };
  }

  return {
    isValid: true,
    host,
    port,
    database,
    user,
  };
}

async function main() {
  console.log("==================================================");
  console.log("BarberCraft Geliştirme Ortamı Kurulumu (dev:setup)");
  console.log("==================================================\n");

  // 1. .env.local Doğrulaması (README sözleşmesi: önce kopyalanmış olmalı)
  if (!fs.existsSync(envLocalPath)) {
    console.error("❌ Hata: .env.local dosyası bulunamadı!");
    console.error("Lütfen önce şablonu kopyalayın:");
    console.error("   cp .env.local.example .env.local\n");
    process.exit(1);
  }
  console.log("✔ .env.local dosyası mevcut.");

  // Ortam değişkenlerini yükle
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envLocalPath);
    } catch {
      // Yükleme hatasını yoksay
    }
  }

  // 2. DATABASE_URL ve Geliştirme Sözleşmesi Doğrulaması
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error("❌ Hata: .env.local içerisinde DATABASE_URL tanımlı değil!");
    process.exit(1);
  }

  const contract = validateDevSetupConfig(dbUrl);
  if (!contract.isValid) {
    console.error(`❌ Hata: ${contract.error}`);
    console.error("Lütfen .env.local dosyanızdaki DATABASE_URL değerini kontrol edin.");
    console.error("Kanonik Değer: postgresql://barbercraft_user:barbercraft_password@127.0.0.1:55432/barbercraft_dev\n");
    process.exit(1);
  }
  console.log(`✔ Veritabanı sözleşmesi doğrulandı (127.0.0.1:${contract.port}/${contract.database}).\n`);

  // 3. Docker ve Docker Compose Kontrolü
  console.log("Docker araçları kontrol ediliyor...");
  try {
    const dockerVer = execSync("docker --version", { encoding: "utf8" }).trim();
    const composeVer = execSync("docker compose version", { encoding: "utf8" }).trim();
    console.log(`✔ ${dockerVer}`);
    console.log(`✔ ${composeVer}\n`);
  } catch {
    console.error("❌ Hata: Docker veya Docker Compose bulunamadı veya çalışmıyor!");
    console.error("Lütfen Docker Engine veya Docker Desktop'ın kurulu ve çalışır durumda olduğundan emin olun.");
    process.exit(1);
  }

  // 4. PostgreSQL Docker Konteynerini Başlat
  console.log("Yerel geliştirme veritabanı konteyneri (PostgreSQL 16) başlatılıyor...");
  try {
    execSync("docker compose -f docker-compose.dev.yml up -d db", {
      stdio: "inherit",
    });
  } catch {
    console.error("\n❌ Hata: PostgreSQL Docker konteyneri başlatılamadı.");
    console.error("Olası nedenler:");
    console.error("1. Docker servisi çalışmıyor olabilir (systemctl start docker).");
    console.error("2. Kullanıcınızın docker soketine erişim izni olmayabilir: 'sudo usermod -aG docker $USER'\n");
    process.exit(1);
  }

  // 5. Veritabanının Sağlık ve Kimlik Doğrulamasını Bekle
  console.log("\nVeritabanı bağlantısı doğrulanıyor (127.0.0.1:55432)...");
  const maxAttempts = 30;
  let verified = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 1500,
    });

    try {
      const client = await pool.connect();
      const metaRes = await client.query<{ current_database: string; current_user: string }>(
        "SELECT current_database(), current_user;"
      );
      client.release();
      await pool.end();

      const activeDb = metaRes.rows[0]?.current_database;
      const activeUser = metaRes.rows[0]?.current_user;

      if (activeDb !== "barbercraft_dev" || activeUser !== "barbercraft_user") {
        console.error(
          `\n❌ Hata: 55432 portundaki veritabanı uyumsuz (bulunan: ${activeDb}/${activeUser}, beklenen: barbercraft_dev/barbercraft_user)!`
        );
        process.exit(1);
      }

      verified = true;
      console.log("✔ PostgreSQL bağlantısı ve kimliği başarıyla doğrulandı.\n");
      break;
    } catch {
      await pool.end().catch(() => {});
      process.stdout.write(`Bekleniyor... (${attempt}/${maxAttempts})\r`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (!verified) {
    console.error("\n❌ Hata: Veritabanına 30 saniye içinde bağlanılamadı.");
    console.error("Lütfen 'docker compose -f docker-compose.dev.yml logs db' komutu ile logları inceleyin.");
    process.exit(1);
  }

  // 6. Veritabanı Şema Migrasyonlarını Uygula
  console.log("Veritabanı migrasyonları uygulanıyor...");
  const migrateResult = spawnSync("npx", ["tsx", "scripts/migrate.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  if (migrateResult.status !== 0) {
    console.error("❌ Hata: Migrasyonlar uygulanamadı.");
    process.exit(1);
  }
  console.log("✔ Migrasyonlar tamamlandı.\n");

  // 7. Kanonik QA Verilerini Yükle
  console.log("Kanonik test kullanıcıları ve işletme verileri oluşturuluyor (qa:bootstrap)...");
  const bootstrapResult = spawnSync(
    "npx",
    ["tsx", "--conditions", "react-server", "scripts/qa-bootstrap.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: dbUrl },
    }
  );

  if (bootstrapResult.status !== 0) {
    console.error("❌ Hata: QA bootstrap tamamlanamadı.");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("🎉 GELİŞTİRME ORTAMI HAZIR!");
  console.log("==================================================");
  console.log("Uygulamayı ve arka plan çalışanını başlatmak için:\n");
  console.log("   pnpm dev:all\n");
  console.log("Uygulama Adresi: http://localhost:4380");
  console.log("Veritabanı Portu: 127.0.0.1:55432");
  console.log("Tüm QA Hesapları Şifresi: BarberCraft-QA-4380!\n");
}

if (process.argv[1]?.endsWith("dev-setup.ts")) {
  main().catch((err) => {
    console.error("Beklenmeyen hata:", err);
    process.exit(1);
  });
}
