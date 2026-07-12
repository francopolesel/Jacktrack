import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { TrackClient } from "./tracking/client.js";
import { TrackingService } from "./tracking/service.js";
import { Scheduler } from "./scheduler/index.js";
import { ResendClient } from "./email/client.js";
import { createApp } from "./app.js";

// Initialize dependencies
const trackClient = new TrackClient(config.SEVENTEEN_TRACK_API_KEY, config.SEVENTEEN_TRACK_API_URL);
const trackingService = new TrackingService(trackClient);
const emailClient = new ResendClient(config.RESEND_API_KEY, config.FROM_EMAIL);
const scheduler = new Scheduler(trackingService, emailClient, config.FROM_EMAIL, config.POLL_INTERVAL_MS);
const app = createApp(trackingService);

// Start server
serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(`[JackTrack] Server running on http://localhost:${info.port}`);
  }
);

// Start scheduler (polling loop)
scheduler.start();
console.log(`[JackTrack] Scheduler started (interval: ${config.POLL_INTERVAL_MS}ms)`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[JackTrack] Shutting down...");
  scheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[JackTrack] Shutting down...");
  scheduler.stop();
  process.exit(0);
});
