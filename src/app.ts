import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { TrackingService } from "./tracking/service.js";
import { createRouter } from "./routes/index.js";

export function createApp(trackingService: TrackingService): Hono {
  const app = new Hono();

  // Mount routes
  const router = createRouter(trackingService);
  app.route("/", router);

  // Global error handler
  app.onError((err, c) => {
    console.error("[App] Unhandled error:", err);

    if (err instanceof HTTPException) {
      return c.html(
        `<div class="server-error">${escapeHtml(err.message)}</div>`,
        err.status
      );
    }

    return c.html(
      `<div class="server-error">Something went wrong. Please try again.</div>`,
      500
    );
  });

  // 404 handler
  app.notFound((c) => {
    return c.html(
      `<div style="text-align:center;padding:48px;font-family:sans-serif;">
        <h1>404</h1>
        <p>Page not found.</p>
        <a href="/">Go home</a>
      </div>`,
      404
    );
  });

  return app;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
