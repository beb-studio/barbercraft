import { assertWorkerEnvironment } from "../src/lib/env";
import { NotificationWorker } from "../src/worker/notification-worker";
import { logger } from "../src/lib/logger";

async function main(): Promise<void> {
  // 1. Fail fast on invalid production configuration
  try {
    assertWorkerEnvironment();
  } catch (err) {
    logger.error("Worker startup failed: Invalid environment configuration", err, undefined, "worker");
    process.exit(1);
  }

  const worker = new NotificationWorker();

  // 2. Set up graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`, undefined, "worker");
    try {
      await worker.stop();
      process.exit(0);
    } catch (err) {
      logger.error("Error during graceful worker shutdown", err, undefined, "worker");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // 3. Start continuous polling loop
  await worker.start();
}

main().catch((err) => {
  logger.error("Fatal error starting notification worker", err, undefined, "worker");
  process.exit(1);
});
