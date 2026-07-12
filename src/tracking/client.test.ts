import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { TrackClient } from "./client.js";
import type { RegisterResult, TrackingInfo, TrackingEvent } from "./types.js";

// We test the adapter's fetch interaction using a mocked global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const API_KEY = "test-api-key-123";
const API_URL = "https://api.17track.net/v2.4";

beforeEach(() => {
  vi.clearAllMocks();
});

function createClient(): TrackClient {
  return new TrackClient(API_KEY, API_URL);
}

function mockRegisterResponse(success: boolean, trackingNumber: string, error?: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: success ? 0 : 1,
      message: error ?? (success ? "Success" : "Unknown error"),
      data: {
        track: [
          {
            number: trackingNumber,
            status_code: success ? "Success" : "Error",
            ...(error ? { error: { message: error } } : {}),
          },
        ],
      },
    }),
  } as Response;
}

function mockTrackInfoResponse(results: Map<string, TrackingInfo>) {
  const trackData: Record<string, unknown> = {};
  for (const [num, info] of results) {
    trackData[num] = {
      number: num,
      carrier: info.carrier,
      status_code: info.status === "delivered" ? "Delivered" : info.status === "exception" ? "Exception" : "Active",
      events: info.events.map((e: TrackingEvent) => ({
        event_location: e.location ?? "",
        event_description: e.description ?? "",
        event_date: e.date ?? "",
        event_translated_description: e.translatedDescription ?? "",
      })),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 0,
      data: {
        track: trackData,
      },
    }),
  } as Response;
}

describe("TrackClient", () => {
  describe("register", () => {
    it("should send a POST request to 17Track and return success result", async () => {
      const tn = "1Z999AA10123456784";
      mockFetch.mockResolvedValueOnce(mockRegisterResponse(true, tn));

      const client = createClient();
      const result = await client.register(tn, "user@example.com");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toBe(`${API_URL}/tracking/register`);
      const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(callOpts.body as string);
      expect(body).toMatchObject({
        tracking_number: tn,
        translation_mode: "UseThirdPartyServices",
        lang: "en",
      });
      expect(body.email).toBe("user@example.com");
      expect(callOpts.headers).toMatchObject({
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      });
      expect(result).toEqual({ success: true, trackingNumber: tn });
    });

    it("should return success even without email", async () => {
      const tn = "1Z999AA10123456784";
      mockFetch.mockResolvedValueOnce(mockRegisterResponse(true, tn));

      const client = createClient();
      const result = await client.register(tn);

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.email).toBeUndefined();
      expect(result).toEqual({ success: true, trackingNumber: tn });
    });

    it("should return error when API responds with failure code", async () => {
      const tn = "INVALID";
      mockFetch.mockResolvedValueOnce(mockRegisterResponse(false, tn, "Invalid tracking number"));

      const client = createClient();
      const result = await client.register(tn);

      expect(result).toEqual({
        success: false,
        trackingNumber: tn,
        error: "Invalid tracking number",
      });
    });

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      const client = createClient();
      const result = await client.register("1Z999AA10123456784");

      expect(result).toEqual({
        success: false,
        trackingNumber: "1Z999AA10123456784",
        error: "Network failure",
      });
    });
  });

  describe("getTrackInfo", () => {
    it("should send a POST request with tracking numbers and return results map", async () => {
      const tn1 = "1Z999AA10123456784";
      const tn2 = "1Z999AA10123456785";
      const info = new Map<string, TrackingInfo>();
      info.set(tn1, {
        trackingNumber: tn1,
        carrier: "UPS",
        status: "active",
        events: [
          { location: "Shenzhen", description: "Package received", date: "2026-07-10T10:00:00Z" },
        ],
      });
      info.set(tn2, {
        trackingNumber: tn2,
        carrier: "FedEx",
        status: "delivered",
        events: [],
      });
      mockFetch.mockResolvedValueOnce(mockTrackInfoResponse(info));

      const client = createClient();
      const result = await client.getTrackInfo([tn1, tn2]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toBe(`${API_URL}/tracking/gettrackinfo`);
      const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(callOpts.body as string);
      expect(body.tracking_numbers).toEqual([tn1, tn2]);
      expect(callOpts.headers).toMatchObject({
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      });

      expect(result.size).toBe(2);
      expect(result.get(tn1)?.carrier).toBe("UPS");
      expect(result.get(tn1)?.events).toHaveLength(1);
      expect(result.get(tn1)?.events[0].location).toBe("Shenzhen");
      expect(result.get(tn2)?.status).toBe("delivered");
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 1, message: "Rate limit exceeded" }),
      } as Response);

      const client = createClient();
      const result = await client.getTrackInfo(["1Z999AA10123456784"]);

      expect(result.size).toBe(0);
    });

    it("should handle HTTP errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      const client = createClient();
      const result = await client.getTrackInfo(["1Z999AA10123456784"]);

      expect(result.size).toBe(0);
    });
  });
});
