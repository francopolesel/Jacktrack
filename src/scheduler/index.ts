import type { TrackingService } from "../tracking/service.js";
import type { IEmailClient } from "../email/client.js";
import { newEventEmail } from "../email/templates.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";

/**
 * In-process scheduler that polls 17Track for active trackings.
 * Uses setInterval with configurable interval, chunking (40/batch),
 * and 1s gaps between batches for rate limiting.
 */
export class Scheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly service: TrackingService;
  private readonly emailClient: IEmailClient;
  private readonly fromEmail: string;
  private readonly intervalMs: number;
  private readonly batchSize = 40;
  private readonly gapMs = 1000;

  constructor(
    service: TrackingService,
    emailClient: IEmailClient,
    fromEmail: string,
    intervalMs: number = 900000,
  ) {
    this.service = service;
    this.emailClient = emailClient;
    this.fromEmail = fromEmail;
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

      // Send emails for trackings with new events
      for (const [trackingId, events] of newEvents) {
        if (events.length === 0) continue;

        try {
          // Get tracking details for email
          const [tracking] = await db
            .select({ trackingNumber: schema.trackings.trackingNumber, email: schema.trackings.email })
            .from(schema.trackings)
            .where(eq(schema.trackings.id, trackingId));

          if (!tracking) {
            console.warn(`[Scheduler] Tracking #${trackingId} not found in DB`);
            continue;
          }

          const html = newEventEmail(tracking.trackingNumber, events);
          const result = await this.emailClient.send({
            to: tracking.email,
            subject: "New tracking update",
            html,
          });

          if (result.success) {
            console.log(`[Scheduler] Email sent for #${trackingId}: ${events.length} event(s) to ${tracking.email}`);
          } else {
            console.error(`[Scheduler] Failed to send email for #${trackingId}: ${result.error}`);
          }
        } catch (err) {
          console.error(`[Scheduler] Error processing notification for #${trackingId}:`, err);
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
