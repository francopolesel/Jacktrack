import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { TrackingService } from "../tracking/service.js";

const registerSchema = z.object({
  tracking_number: z
    .string()
    .min(8, "Tracking number must be 8-40 alphanumeric characters")
    .max(40, "Tracking number must be 8-40 alphanumeric characters")
    .regex(/^[a-zA-Z0-9]+$/, "Tracking number must be 8-40 alphanumeric characters"),
  email: z.string().email("Please enter a valid email address"),
});

export function createRouter(trackingService: TrackingService): Hono {
  const app = new Hono();

  // GET / — render the registration form
  app.get("/", (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JackTrack — Package Tracking</title>
  <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJialowU1qB6KebOY8f6UBp7qM6FV7pGGA9I9iS" crossorigin="anonymous"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .container { max-width: 480px; width: 100%; padding: 24px; }
    .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 28px; color: #18181b; margin-bottom: 4px; }
    p.subtitle { font-size: 14px; color: #71717a; margin-bottom: 24px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 14px; font-weight: 500; color: #18181b; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; font-size: 16px; border: 1px solid #d4d4d8; border-radius: 8px; outline: none; }
    input:focus { border-color: #18181b; box-shadow: 0 0 0 2px rgba(24,24,27,0.1); }
    button { width: 100%; padding: 12px; background: #18181b; color: #fff; font-size: 16px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; }
    button:hover { background: #27272a; }
    .error { color: #dc2626; font-size: 14px; margin-top: 6px; }
    .success { color: #16a34a; font-size: 14px; margin-top: 12px; padding: 12px; background: #f0fdf4; border-radius: 8px; }
    .server-error { color: #dc2626; font-size: 14px; margin-top: 12px; padding: 12px; background: #fef2f2; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>JackTrack</h1>
      <p class="subtitle">Track any package, from any carrier.</p>
      <form hx-post="/track" hx-target="#result" hx-swap="innerHTML">
        <div class="form-group">
          <label for="tracking_number">Tracking Number</label>
          <input type="text" id="tracking_number" name="tracking_number" placeholder="e.g. 1Z999AA10123456784" required>
        </div>
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required>
        </div>
        <button type="submit">Start Tracking</button>
      </form>
      <div id="result"></div>
    </div>
  </div>
</body>
</html>`);
  });

  // POST /track — register a tracking number
  app.post(
    "/track",
    zValidator("form", registerSchema, (result, c) => {
      if (!result.success) {
        const firstError = result.error.issues[0];
        const field = firstError?.path[0] === "tracking_number" ? "tracking_number" : "email";
        const message =
          firstError?.message ??
          (field === "tracking_number"
            ? "Tracking number must be 8-40 alphanumeric characters"
            : "Please enter a valid email address");
        return c.html(
          `<div class="server-error">${escapeHtml(message)}</div>`,
          422
        );
      }
    }),
    async (c) => {
      const { tracking_number, email } = c.req.valid("form");

      const result = await trackingService.register(tracking_number, email);

      if (!result.success) {
        const errorMsg = result.error ?? "Something went wrong. Please try again.";
        return c.html(`<div class="server-error">${escapeHtml(errorMsg)}</div>`, 422);
      }

      return c.html(
        `<div class="success">✅ Tracking started for <strong>${escapeHtml(tracking_number)}</strong>. You'll receive updates at ${escapeHtml(email)}.</div>`
      );
    }
  );

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
