import { spawn, ChildProcess } from "node:child_process";
import readline from "node:readline";

if (typeof process.loadEnvFile === "function") {
  for (const envFile of [".env.qa.local", ".env.local", ".env"]) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // Ignore if file does not exist
    }
  }
}

const processes: { name: string; proc: ChildProcess; color: string }[] = [];
let isShuttingDown = false;

function pipeWithPrefix(
  stream: NodeJS.ReadableStream | null,
  prefix: string,
  color: string,
  outStream: NodeJS.WritableStream
) {
  if (!stream) return;
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    outStream.write(`${color}[${prefix}]\x1b[0m ${line}\n`);
  });
}

function startProcess(
  name: string,
  command: string,
  args: string[],
  color: string
): ChildProcess {
  const proc = spawn(command, args, {
    env: { ...process.env, PORT: "4380" },
    stdio: ["inherit", "pipe", "pipe"],
  });

  pipeWithPrefix(proc.stdout, name, color, process.stdout);
  pipeWithPrefix(proc.stderr, name, color, process.stderr);

  proc.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      console.log(
        `${color}[${name}]\x1b[0m Süreç kapandı (kod: ${code}, sinyal: ${signal}). Diğer süreçler durduruluyor...`
      );
      shutdown();
    }
  });

  processes.push({ name, proc, color });
  return proc;
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n🛑 Tüm geliştirme servisleri kapatılıyor...");

  for (const { proc } of processes) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Ignore error if already dead
    }
  }

  // Force exit after 1.5 seconds if processes don't terminate gracefully
  setTimeout(() => {
    for (const { proc } of processes) {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Ignore
      }
    }
    process.exit(0);
  }, 1500);
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
process.on("SIGHUP", () => shutdown());
process.on("exit", () => shutdown());

console.log("==================================================");
console.log("🚀 BarberCraft Geliştirme Ortamı Başlatılıyor");
console.log("   - Web Sunucusu: http://localhost:4380");
console.log("   - Bildirim Çalışanı: scripts/worker.ts");
console.log("==================================================\n");

// 1. Web Sunucusu (Next.js - Port 4380)
startProcess("web", "npx", ["next", "dev", "-p", "4380"], "\x1b[36m");

// 2. Bildirim Çalışanı (Worker)
startProcess("worker", "npx", ["tsx", "--conditions", "react-server", "scripts/worker.ts"], "\x1b[35m");
