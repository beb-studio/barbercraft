import crypto from "node:crypto";
import { NotificationPlannerService } from "@/services/notification-planner.service";
import { NotificationDeliveryService, resolveSmsProvider } from "@/services/notification-delivery.service";
import { cleanupExpiredRateLimits } from "@/lib/rate-limit";
import { closeDatabasePool } from "@/db";
import { logger } from "@/lib/logger";
import type { SmsProvider } from "@/lib/sms";

export interface NotificationWorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  housekeepingIntervalMs?: number;
  provider?: SmsProvider;
}

export interface WorkerCycleResult {
  planned: {
    claimed: number;
    processed: number;
    failed: number;
  };
  delivered: {
    materialized: number;
    claimed: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  cleanedRateLimits: number;
}

export class NotificationWorker {
  public readonly workerId: string;
  public readonly pollIntervalMs: number;
  public readonly batchSize: number;
  public readonly housekeepingIntervalMs: number;
  private readonly provider?: SmsProvider;

  private isRunning: boolean = false;
  private isStopping: boolean = false;
  private cycleTimeout?: NodeJS.Timeout;
  private lastHousekeepingAt: number = 0;

  constructor(options: NotificationWorkerOptions = {}) {
    this.workerId = options.workerId || process.env.WORKER_ID || `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options.pollIntervalMs ?? parseInt(process.env.NOTIFICATION_WORKER_POLL_INTERVAL_MS || "5000", 10);
    this.batchSize = options.batchSize ?? parseInt(process.env.NOTIFICATION_WORKER_BATCH_SIZE || "25", 10);
    this.housekeepingIntervalMs = options.housekeepingIntervalMs ?? 60_000;
    this.provider = options.provider ?? resolveSmsProvider();
  }

  /**
   * Executes a single processing cycle:
   * 1. Outbox planning (claims pending outbox events, creates plans)
   * 2. Delivery execution (materializes due plans, claims deliveries, sends SMS)
   * 3. Periodic housekeeping (purges expired rate limit windows)
   */
  public async runOnce(referenceNow: Date = new Date()): Promise<WorkerCycleResult> {
    const cycleId = crypto.randomUUID().slice(0, 8);

    // Stage 1: Plan pending outbox events
    let plannedResult = { claimed: 0, processed: 0, failed: 0 };
    try {
      plannedResult = await NotificationPlannerService.processPendingBatch({
        workerId: this.workerId,
        batchSize: this.batchSize,
        referenceNow,
      });
      if (plannedResult.claimed > 0) {
        logger.info(
          "Outbox planning cycle processed batch",
          { cycleId, ...plannedResult },
          "worker"
        );
      }
    } catch (err) {
      logger.error("Outbox planning cycle encountered error", err, { cycleId }, "worker");
    }

    // Stage 2: Deliver due notification plans
    let deliveredResult = { materialized: 0, claimed: 0, sent: 0, failed: 0, cancelled: 0 };
    try {
      deliveredResult = await NotificationDeliveryService.processDueNotificationDeliveries({
        workerId: this.workerId,
        batchSize: this.batchSize,
        referenceNow,
        provider: this.provider,
      });
      if (deliveredResult.claimed > 0 || deliveredResult.materialized > 0) {
        logger.info(
          "Delivery execution cycle processed batch",
          { cycleId, ...deliveredResult },
          "worker"
        );
      }
    } catch (err) {
      logger.error("Delivery execution cycle encountered error", err, { cycleId }, "worker");
    }

    // Stage 3: Periodic housekeeping (Rate limit expired windows cleanup)
    let cleanedRateLimits = 0;
    const now = referenceNow.getTime();
    if (now - this.lastHousekeepingAt >= this.housekeepingIntervalMs) {
      this.lastHousekeepingAt = now;
      try {
        cleanedRateLimits = await cleanupExpiredRateLimits(referenceNow);
        if (cleanedRateLimits > 0) {
          logger.info("Housekeeping purged expired rate limit rows", { cleanedRateLimits }, "worker");
        }
      } catch (err) {
        logger.error("Housekeeping cleanup error", err, undefined, "worker");
      }
    }

    return {
      planned: plannedResult,
      delivered: deliveredResult,
      cleanedRateLimits,
    };
  }

  /**
   * Starts the continuous background polling loop.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isStopping = false;

    logger.info(
      "Notification worker started",
      {
        workerId: this.workerId,
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
      },
      "worker"
    );

    const loop = async () => {
      if (!this.isRunning || this.isStopping) return;

      try {
        const result = await this.runOnce();
        // If there was substantial active work, poll more aggressively; otherwise sleep pollIntervalMs
        const hadActiveWork = result.planned.claimed > 0 || result.delivered.claimed > 0;
        const nextDelay = hadActiveWork ? Math.min(1000, this.pollIntervalMs) : this.pollIntervalMs;

        if (this.isRunning && !this.isStopping) {
          this.cycleTimeout = setTimeout(loop, nextDelay);
        }
      } catch (err) {
        logger.error("Unhandled error in worker cycle", err, { workerId: this.workerId }, "worker");
        if (this.isRunning && !this.isStopping) {
          this.cycleTimeout = setTimeout(loop, this.pollIntervalMs);
        }
      }
    };

    // Begin loop immediately
    void loop();
  }

  /**
   * Initiates graceful shutdown:
   * Stops accepting new loop iterations, cancels pending timer, drains database pool.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isStopping = true;
    this.isRunning = false;

    if (this.cycleTimeout) {
      clearTimeout(this.cycleTimeout);
      this.cycleTimeout = undefined;
    }

    logger.info("Notification worker gracefully stopping...", { workerId: this.workerId }, "worker");
    await closeDatabasePool();
    logger.info("Notification worker stopped cleanly", { workerId: this.workerId }, "worker");
  }
}
