import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const trackings = sqliteTable(
  "trackings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    trackingNumber: text("tracking_number").notNull(),
    carrier: text("carrier").notNull().default(""),
    email: text("email").notNull(),
    status: text("status", { enum: ["active", "delivered", "error"] })
      .notNull()
      .default("active"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at")
      .notNull()
      .default("(datetime('now'))"),
  },
  (table) => ({
    trackingEmailIdx: uniqueIndex("idx_tracking_email").on(
      table.trackingNumber,
      table.email
    ),
  })
);

export const trackingEvents = sqliteTable(
  "tracking_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
      .default("(datetime('now'))"),
  },
  (table) => ({
    trackingEventHashIdx: uniqueIndex("idx_tracking_event_hash").on(
      table.trackingId,
      table.eventHash
    ),
  })
);

export const sentEmails = sqliteTable("sent_emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackingId: integer("tracking_id")
    .notNull()
    .references(() => trackings.id, { onDelete: "cascade" }),
  eventIds: text("event_ids").notNull(), // JSON array of event IDs
  sentAt: text("sent_at")
    .notNull()
    .default("(datetime('now'))"),
});

export const syncLog = sqliteTable("sync_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackingId: integer("tracking_id")
    .notNull()
    .references(() => trackings.id, { onDelete: "cascade" }),
  checkedAt: text("checked_at")
    .notNull()
    .default("(datetime('now'))"),
  success: integer("success", { mode: "boolean" }).notNull().default(true),
  errorMessage: text("error_message"),
  eventsFound: integer("events_found").notNull().default(0),
});
