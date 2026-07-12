import { createHash } from "node:crypto";
import { db, schema } from "../db/index.js";
import { eq, and, inArray } from "drizzle-orm";
import type { ITrackingClient, TrackingInfo } from "./types.js";
import type { TrackingEvent } from "./types.js";

export interface TrackingRecord {
  id: number;
  trackingNumber: string;
  carrier: string;
  email: string;
  status: "active" | "delivered" | "error";
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface RegisterOutput {
  success: boolean;
  tracking?: TrackingRecord;
  error?: string;
}

export interface EmailNotification {
  trackingId: number;
  trackingNumber: string;
  email: string;
  events: Array<{
    eventId: number;
    location?: string;
    description?: string;
    date?: string;
  }>;
}

/**
 * Business logic for tracking operations.
 * Depends on ITrackingClient (swappable adapter) and Drizzle ORM.
 */
export class TrackingService {
  constructor(private readonly client: ITrackingClient) {}

  /**
   * Register a new tracking number for monitoring.
   * 1. Calls 17Track API to register the number
   * 2. On success, persists to SQLite
   * 3. Returns the tracking record or error
   */
  async register(trackingNumber: string, email: string): Promise<RegisterOutput> {
    // First, call 17Track to register
    const registerResult = await this.client.register(trackingNumber, email);

    if (!registerResult.success) {
      return {
        success: false,
        error: registerResult.error ?? "Failed to register with tracking provider",
      };
    }

    // Persist to database
    try {
      const [record] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber,
          email,
          status: "active",
        })
        .returning();

      return {
        success: true,
        tracking: {
          id: record.id,
          trackingNumber: record.trackingNumber,
          carrier: record.carrier,
          email: record.email,
          status: record.status as TrackingRecord["status"],
          lastCheckedAt: record.lastCheckedAt ?? null,
          createdAt: record.createdAt,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Database error";
      // Check if it's a unique constraint violation (duplicate tracking+email)
      if (message.includes("UNIQUE") || message.includes("unique") || message.includes("duplicate")) {
        return {
          success: false,
          error: "This tracking number is already being monitored for this email",
        };
      }
      return {
        success: false,
        error: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * Check all active trackings for new events.
   * Returns a map of trackingId → new events that should trigger notifications.
   *
   * This is the core polling logic called by the scheduler.
   */
  async checkTrackings(): Promise<Map<number, EmailNotification["events"]>> {
    // 1. Fetch all active trackings
    const activeTrackings = (await db
      .select()
      .from(schema.trackings)
      .where(eq(schema.trackings.status, "active"))) as TrackingRecord[];

    if (activeTrackings.length === 0) {
      return new Map();
    }

    // 2. Query 17Track for all active numbers
    const numbers = activeTrackings.map((t) => t.trackingNumber);
    let trackInfo: Map<string, TrackingInfo>;

    try {
      trackInfo = await this.client.getTrackInfo(numbers);
    } catch {
      // API failure — return empty results, scheduler will retry
      return new Map();
    }

    if (trackInfo.size === 0) {
      return new Map();
    }

    // 3. For each tracking, diff events by hash and persist new ones
    const newEventsByTracking = new Map<number, EmailNotification["events"]>();

    for (const tracking of activeTrackings) {
      const info = trackInfo.get(tracking.trackingNumber);
      if (!info) {
        // This tracking didn't come back from 17Track — skip
        continue;
      }

      // Build event hashes for returned events
      const returnedEvents = (info.events ?? []).map((e) => ({
        ...e,
        hash: computeEventHash(e),
      }));

      if (returnedEvents.length === 0) {
        // No events returned — just update last_checked_at
        await this.updateLastChecked(tracking.id);
        continue;
      }

      // 4. Check which events already exist in DB
      const existingHashes = await this.getExistingEventHashes(tracking.id);
      const newEvents = returnedEvents.filter((e) => !existingHashes.has(e.hash));

      // 5. Persist new events
      const persistedIds: number[] = [];
      for (const event of newEvents) {
        const [inserted] = await db
          .insert(schema.trackingEvents)
          .values({
            trackingId: tracking.id,
            eventLocation: event.location ?? null,
            eventDescription: event.description ?? null,
            eventDate: event.date ?? null,
            translatedDescription: event.translatedDescription ?? null,
            eventHash: event.hash,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          persistedIds.push(inserted.id);
        }
      }

      if (persistedIds.length > 0) {
        newEventsByTracking.set(tracking.id, newEvents.map((e, i) => ({
          eventId: persistedIds[i],
          location: e.location,
          description: e.description,
          date: e.date,
        })));
      }

      // 6. Update last_checked_at
      await this.updateLastChecked(tracking.id);

      // 7. Record sync log
      await this.recordSyncLog(tracking.id, true, newEvents.length);
    }

    return newEventsByTracking;
  }

  /**
   * Detect which trackings have been delivered and update their status.
   * Returns an array of tracking IDs that were marked as delivered.
   */
  async detectDelivery(
    trackings: TrackingRecord[],
    infoMap: Map<string, TrackingInfo>,
  ): Promise<number[]> {
    const deliveredIds: number[] = [];

    for (const tracking of trackings) {
      const info = infoMap.get(tracking.trackingNumber);
      if (info?.status === "delivered") {
        await db
          .update(schema.trackings)
          .set({ status: "delivered" })
          .where(eq(schema.trackings.id, tracking.id));

        deliveredIds.push(tracking.id);
      }
    }

    return deliveredIds;
  }

  private async getExistingEventHashes(trackingId: number): Promise<Set<string>> {
    const existing = await db
      .select({ hash: schema.trackingEvents.eventHash })
      .from(schema.trackingEvents)
      .where(eq(schema.trackingEvents.trackingId, trackingId))
      .all();

    return new Set(existing.map((r) => r.hash));
  }

  private async updateLastChecked(trackingId: number): Promise<void> {
    await db
      .update(schema.trackings)
      .set({ lastCheckedAt: new Date().toISOString() })
      .where(eq(schema.trackings.id, trackingId));
  }

  private async recordSyncLog(
    trackingId: number,
    success: boolean,
    eventsFound: number,
    errorMessage?: string,
  ): Promise<void> {
    await db.insert(schema.syncLog).values({
      trackingId,
      success,
      eventsFound,
      errorMessage: errorMessage ?? null,
    });
  }
}

/**
 * Compute a SHA256 hash for deduplication.
 * Uses location, description, and date as raw material.
 */
export function computeEventHash(event: { location?: string; description?: string; date?: string }): string {
  const raw = `${event.location ?? ""}|${event.description ?? ""}|${event.date ?? ""}`;
  return createHash("sha256").update(raw, "utf-8").digest("hex");
}
