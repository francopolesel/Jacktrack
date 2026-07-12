import type { TrackingService } from "../tracking/service.js";

/**
 * In-process scheduler that polls 17Track for active trackings.
 * Uses setInterval with configurable interval, chunking (40/batch),
 * and 1s gaps between batches for rate limiting.
 */
export class Scheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly service: TrackingService;
  private readonly intervalMs: number;
  private readonly batchSize = 40;
  private readonly gapMs = 1000;

  constructor(service: TrackingService, intervalMs: number = 900000) {
    this.service = service;
    this.intervalMs = intervalMs;
  }

  /**
   * Start the polling loop.
   * Does a single initial check, then polls at the configured interval.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Run first check immediately on startup (catches up missed events)
    this.checkAll().catch((err) => {
      console.error("[Scheduler] Initial check failed:", err);
    });

    // Then poll at the configured interval
    this.intervalId = setInterval(() => {
      this.checkAll().catch((err) => {
        console.error("[Scheduler] Poll check failed:", err);
      });
    }, this.intervalMs);
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }

  /**
   * Check all active trackings.
   * Called by the scheduler and exposed for testing.
   */
  async checkAll(): Promise<void> {
    try {
      const newEvents = await this.service.checkTrackings();

      // Process notifications for trackings with new events
      for (const [trackingId, events] of newEvents) {
        if (events.length > 0) {
          console.log(`[Scheduler] Tracking #${trackingId}: ${events.length} new event(s)`);
        }
      }
    } catch (err) {
      console.error("[Scheduler] checkAll error:", err);
    }
  }

  /**
   * Split an array into chunks of the specified size.
   * Used for batching tracking numbers (40 per API call).
   */
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep for the given number of milliseconds.
   * Used for rate limiting between batches.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
