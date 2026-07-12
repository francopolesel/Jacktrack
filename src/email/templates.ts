/**
 * Email template functions for JackTrack notifications.
 * Returns raw HTML strings — no JSX or external template engine needed.
 */

export interface EventData {
  location?: string;
  description?: string;
  date?: string;
}

/**
 * Welcome email sent when a user registers a new tracking number.
 */
export function welcomeEmail(trackingNumber: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tracking Started — JackTrack</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <tr>
      <td style="background-color: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="margin: 0 0 8px; font-size: 24px; color: #18181b;">JackTrack</h1>
        <p style="margin: 0 0 24px; font-size: 16px; color: #52525b;">Package tracking made simple</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 0 0 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #18181b;">Tracking Started ✅</h2>
        <p style="margin: 0 0 8px; font-size: 16px; color: #52525b;">
          Your package <strong style="color: #18181b;">${escapeHtml(trackingNumber)}</strong> is being tracked.
        </p>
        <p style="margin: 0 0 24px; font-size: 16px; color: #52525b;">
          You will receive email notifications when new tracking events are detected.
        </p>
        <p style="margin: 0; font-size: 14px; color: #a1a1aa;">
          — The JackTrack Team
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * New tracking event notification email.
 * Includes ALL new events for a tracking in a SINGLE email.
 */
export function newEventEmail(trackingNumber: string, events: EventData[]): string {
  const eventRows =
    events.length > 0
      ? events
          .map(
            (e) => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e4e4e7; vertical-align: top; width: 33%;">
              <span style="font-size: 14px; color: #52525b;">${e.date ? escapeHtml(formatDate(e.date)) : "—"}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e4e4e7; vertical-align: top; width: 25%;">
              <span style="font-size: 14px; color: #52525b;">${e.location ? escapeHtml(e.location) : "—"}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e4e4e7; vertical-align: top;">
              <span style="font-size: 14px; color: #18181b;">${e.description ? escapeHtml(e.description) : "—"}</span>
            </td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #a1a1aa; font-size: 14px;">No event details available.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New tracking update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <tr>
      <td style="background-color: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="margin: 0 0 8px; font-size: 24px; color: #18181b;">JackTrack</h1>
        <p style="margin: 0 0 24px; font-size: 16px; color: #52525b;">Package tracking made simple</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 0 0 24px;">
        <h2 style="margin: 0 0 8px; font-size: 18px; color: #18181b;">New tracking update</h2>
        <p style="margin: 0 0 24px; font-size: 16px; color: #52525b;">
          New events for <strong style="color: #18181b;">${escapeHtml(trackingNumber)}</strong>:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f4f4f5;">
              <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #71717a; border-bottom: 2px solid #d4d4d8;">Date</th>
              <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #71717a; border-bottom: 2px solid #d4d4d8;">Location</th>
              <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #71717a; border-bottom: 2px solid #d4d4d8;">Event</th>
            </tr>
          </thead>
          <tbody>${eventRows}</tbody>
        </table>
        <p style="margin: 24px 0 0; font-size: 14px; color: #a1a1aa;">
          — The JackTrack Team
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoDate;
  }
}
