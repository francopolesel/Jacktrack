import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

/**
 * Integration tests for the database layer.
 * Uses an in-memory SQLite database for isolation.
 */
describe("Database Integration", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    // Create in-memory SQLite database
    const sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Create tables from schema
    const tables = [
      `CREATE TABLE IF NOT EXISTS trackings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_number TEXT NOT NULL,
        carrier TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'delivered', 'error')),
        last_checked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS tracking_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_id INTEGER NOT NULL REFERENCES trackings(id) ON DELETE CASCADE,
        event_location TEXT,
        event_description TEXT,
        event_date TEXT,
        translated_description TEXT,
        event_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sent_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_id INTEGER NOT NULL REFERENCES trackings(id) ON DELETE CASCADE,
        event_ids TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_id INTEGER NOT NULL REFERENCES trackings(id) ON DELETE CASCADE,
        checked_at TEXT NOT NULL DEFAULT (datetime('now')),
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT,
        events_found INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_email ON trackings(tracking_number, email)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_event_hash ON tracking_events(tracking_id, event_hash)`,
    ];

    for (const sqlStmt of tables) {
      db.run(sql.raw(sqlStmt));
    }
  });

  beforeEach(async () => {
    // Clean all tables between tests
    db.delete(schema.trackings).execute();
  });

  describe("trackings CRUD", () => {
    it("should insert and select a tracking record", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "1Z999AA10123456784",
          carrier: "UPS",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      expect(tracking.id).toBeGreaterThan(0);
      expect(tracking.trackingNumber).toBe("1Z999AA10123456784");
      expect(tracking.email).toBe("user@example.com");
      expect(tracking.status).toBe("active");
      expect(tracking.createdAt).toBeTruthy();
    });

    it("should enforce unique constraint on tracking_number + email", async () => {
      await db.insert(schema.trackings).values({
        trackingNumber: "1Z999AA10123456784",
        email: "user@example.com",
        status: "active",
      });

      await expect(
        db.insert(schema.trackings).values({
          trackingNumber: "1Z999AA10123456784",
          email: "user@example.com",
          status: "active",
        })
      ).rejects.toThrow();
    });

    it("should allow same tracking number with different email", async () => {
      await db.insert(schema.trackings).values({
        trackingNumber: "1Z999AA10123456784",
        email: "user@example.com",
        status: "active",
      });

      await expect(
        db.insert(schema.trackings).values({
          trackingNumber: "1Z999AA10123456784",
          email: "other@example.com",
          status: "active",
        })
      ).resolves.toBeTruthy();
    });

    it("should select only active trackings", async () => {
      await db.insert(schema.trackings).values({
        trackingNumber: "TN001",
        email: "a@example.com",
        status: "active",
      });
      await db.insert(schema.trackings).values({
        trackingNumber: "TN002",
        email: "b@example.com",
        status: "delivered",
      });
      await db.insert(schema.trackings).values({
        trackingNumber: "TN003",
        email: "c@example.com",
        status: "active",
      });

      const active = await db
        .select()
        .from(schema.trackings)
        .where(sql`status = 'active'`);

      expect(active).toHaveLength(2);
      expect(active.map((t: any) => t.trackingNumber).sort()).toEqual(["TN001", "TN003"]);
    });

    it("should update tracking status", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "1Z999AA10123456784",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      await db
        .update(schema.trackings)
        .set({ status: "delivered" })
        .where(sql`id = ${tracking.id}`);

      const [updated] = await db
        .select()
        .from(schema.trackings)
        .where(sql`id = ${tracking.id}`);

      expect(updated.status).toBe("delivered");
    });
  });

  describe("tracking_events CRUD", () => {
    it("should insert and select events for a tracking", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "TN001",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      const [event] = await db
        .insert(schema.trackingEvents)
        .values({
          trackingId: tracking.id,
          eventLocation: "Shenzhen",
          eventDescription: "Package received",
          eventDate: "2026-07-12T10:00:00Z",
          eventHash: "abc123hash",
        })
        .returning();

      expect(event.id).toBeGreaterThan(0);
      expect(event.eventLocation).toBe("Shenzhen");
      expect(event.eventDescription).toBe("Package received");
      expect(event.eventHash).toBe("abc123hash");
    });

    it("should enforce unique constraint on (tracking_id, event_hash)", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "TN001",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      await db.insert(schema.trackingEvents).values({
        trackingId: tracking.id,
        eventHash: "duplicatehash",
      });

      await expect(
        db.insert(schema.trackingEvents).values({
          trackingId: tracking.id,
          eventHash: "duplicatehash",
        })
      ).rejects.toThrow();
    });

    it("should cascade delete events when tracking is deleted", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "TN001",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      await db.insert(schema.trackingEvents).values({
        trackingId: tracking.id,
        eventHash: "hash1",
      });
      await db.insert(schema.trackingEvents).values({
        trackingId: tracking.id,
        eventHash: "hash2",
      });

      // Delete tracking
      await db.delete(schema.trackings).where(sql`id = ${tracking.id}`);

      const events = await db
        .select()
        .from(schema.trackingEvents)
        .where(sql`tracking_id = ${tracking.id}`);

      expect(events).toHaveLength(0);
    });
  });

  describe("sent_emails CRUD", () => {
    it("should insert and select sent email records", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "TN001",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      const [emailRecord] = await db
        .insert(schema.sentEmails)
        .values({
          trackingId: tracking.id,
          eventIds: JSON.stringify([1, 2, 3]),
        })
        .returning();

      expect(emailRecord.id).toBeGreaterThan(0);
      expect(JSON.parse(emailRecord.eventIds)).toEqual([1, 2, 3]);
      expect(emailRecord.sentAt).toBeTruthy();
    });
  });

  describe("sync_log CRUD", () => {
    it("should insert and select sync log records", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "TN001",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      const [log] = await db
        .insert(schema.syncLog)
        .values({
          trackingId: tracking.id,
          success: true,
          eventsFound: 3,
        })
        .returning();

      expect(log.id).toBeGreaterThan(0);
      expect(log.success).toBe(true);
      expect(log.eventsFound).toBe(3);
    });

    it("should store error messages for failed syncs", async () => {
      const [tracking] = await db
        .insert(schema.trackings)
        .values({
          trackingNumber: "TN001",
          email: "user@example.com",
          status: "active",
        })
        .returning();

      const [log] = await db
        .insert(schema.syncLog)
        .values({
          trackingId: tracking.id,
          success: false,
          eventsFound: 0,
          errorMessage: "API timeout",
        })
        .returning();

      expect(log.success).toBe(false);
      expect(log.errorMessage).toBe("API timeout");
    });
  });
});
