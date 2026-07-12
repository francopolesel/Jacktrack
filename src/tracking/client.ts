import type { ITrackingClient, TrackingInfo, TrackingEvent, RegisterResult } from "./types.js";

export interface TrackClientOptions {
  apiKey: string;
  apiUrl?: string;
}

/**
 * 17Track REST API v2.4 adapter.
 *
 * Uses native fetch (Node 22+) — no extra HTTP dependency.
 * Implements ITrackingClient for swappability.
 */
export class TrackClient implements ITrackingClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl ?? "https://api.17track.net/v2.4";
  }

  async register(trackingNumber: string, email?: string): Promise<RegisterResult> {
    try {
      const body: Record<string, unknown> = {
        tracking_number: trackingNumber,
        translation_mode: "UseThirdPartyServices",
        lang: "en",
      };
      if (email) {
        body.email = email;
      }

      const response = await fetch(`${this.apiUrl}/tracking/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as {
        code: number;
        message?: string;
        data?: {
          track?: Array<{
            number: string;
            status_code?: string;
            error?: { message?: string };
          }>;
        };
      };

      if (data.code !== 0 || !data.data?.track?.[0]) {
        const errorMsg =
          data.data?.track?.[0]?.error?.message ??
          data.message ??
          "Registration failed";
        return {
          success: false,
          trackingNumber,
          error: errorMsg,
        };
      }

      return {
        success: true,
        trackingNumber,
      };
    } catch (err) {
      return {
        success: false,
        trackingNumber,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async getTrackInfo(numbers: string[]): Promise<Map<string, TrackingInfo>> {
    try {
      const response = await fetch(`${this.apiUrl}/tracking/gettrackinfo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tracking_numbers: numbers }),
      });

      if (!response.ok) {
        return new Map();
      }

      const data = await response.json() as {
        code: number;
        message?: string;
        data?: {
          track?: Record<
            string,
            {
              number?: string;
              carrier?: string;
              status_code?: string;
              events?: Array<{
                event_location?: string;
                event_description?: string;
                event_date?: string;
                event_translated_description?: string;
              }>;
            }
          >;
        };
      };

      if (data.code !== 0 || !data.data?.track) {
        return new Map();
      }

      const results = new Map<string, TrackingInfo>();

      for (const [num, trackData] of Object.entries(data.data.track)) {
        const status = mapStatus(trackData.status_code);
        const events: TrackingEvent[] = (trackData.events ?? []).map((e) => ({
          location: e.event_location ?? undefined,
          description: e.event_translated_description || e.event_description || undefined,
          date: e.event_date ?? undefined,
          translatedDescription: e.event_translated_description ?? undefined,
          rawDescription: e.event_description ?? undefined,
        }));

        results.set(num, {
          trackingNumber: trackData.number ?? num,
          carrier: trackData.carrier ?? undefined,
          status,
          events,
        });
      }

      return results;
    } catch {
      return new Map();
    }
  }
}

function mapStatus(code?: string): TrackingInfo["status"] {
  if (!code) return "unknown";
  const lower = code.toLowerCase();
  if (lower === "delivered") return "delivered";
  if (lower === "exception") return "exception";
  if (lower === "active" || lower === "in_transit" || lower === "pending") return "active";
  return "unknown";
}
