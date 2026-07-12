import { pgTable, serial, text, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const trackings = pgTable(
  "trackings",
  {
    id: serial("id").primaryKey(),
    trackingNumber: text("tracking_number").notNull(),
    carrier: text("carrier").notNull().default(""),
    email: text("email").notNull(),
    status: text("status", { enum: ["active", "delivered", "error"] })
      .notNull()
      .default("active"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    trackingEmailIdx: uniqueIndex("idx_tracking_email").on(
      table.trackingNumber,
      table.email,
    ),
  }),
);

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: serial("id").primaryKey(),
    trackingId: integer("tracking_id")
      .notNull()
      .references(() => trackings.id, { onDelete: "cascade" }),
    eventLocation: text("event_location"),
    eventDescription: text("event_description"),
    eventDate: text("event_date"),
    translatedDescription: text("translated_description"),
    eventHash: text("event_hash").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    trackingEventHashIdx: uniqueIndex("idx_tracking_event_hash").on(
      table.trackingId,
      table.eventHash,
    ),
  }),
);

export const sentEmails = pgTable("sent_emails", {
  id: serial("id").primaryKey(),
  trackingId: integer("tracking_id")
    .notNull()
    .references(() => trackings.id, { onDelete: "cascade" }),
  eventIds: text("event_ids").notNull(), // JSON array of event IDs
  sentAt: text("sent_at")
    .notNull()
    .default(sql`now()`),
});

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  trackingId: integer("tracking_id")
    .notNull()
    .references(() => trackings.id, { onDelete: "cascade" }),
  checkedAt: text("checked_at")
    .notNull()
    .default(sql`now()`),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  eventsFound: integer("events_found").notNull().default(0),
});
