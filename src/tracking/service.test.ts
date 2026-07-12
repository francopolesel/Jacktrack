import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrackingService } from "./service.js";
import type { ITrackingClient, TrackingInfo, RegisterResult } from "./types.js";
import type { Mock } from "vitest";

// Mock db module — use vi.hoisted to handle vitest's hoisted mock factory
const { mockDb, mockSchema } = vi.hoisted(() => {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockSchema = {
    trackings: {
      id: "id",
      trackingNumber: "tracking_number",
      email: "email",
      status: "status",
      lastCheckedAt: "last_checked_at",
      createdAt: "created_at",
    },
    trackingEvents: {
      id: "id",
      trackingId: "tracking_id",
      eventHash: "event_hash",
      eventLocation: "event_location",
      eventDescription: "event_description",
      eventDate: "event_date",
      translatedDescription: "translated_description",
      createdAt: "created_at",
    },
    sentEmails: {
      id: "id",
      trackingId: "tracking_id",
      eventIds: "event_ids",
      sentAt: "sent_at",
    },
    syncLog: {
      id: "id",
      trackingId: "tracking_id",
      checkedAt: "checked_at",
      success: "success",
      errorMessage: "error_message",
      eventsFound: "events_found",
    },
  };

  return { mockDb, mockSchema };
});

vi.mock("../db/index.js", () => ({
  db: mockDb,
  schema: mockSchema,
}));

function createMockClient(): ITrackingClient {
  return {
    register: vi.fn() as Mock,
    getTrackInfo: vi.fn() as Mock,
  };
}

function mockSelectChain(returnValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
    all: vi.fn().mockResolvedValue(returnValue),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function mockInsertChain(returnValue: unknown) {
  // Support .values().onConflictDoNothing().returning() chain
  const onConflictChain = {
    returning: vi.fn().mockResolvedValue(returnValue),
  };
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    onConflictDoNothing: vi.fn().mockReturnValue(onConflictChain),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

describe("TrackingService", () => {
  let client: ReturnType<typeof createMockClient>;
  let service: TrackingService;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient() as unknown as ReturnType<typeof createMockClient>;
    service = new TrackingService(client as ITrackingClient);

    // Default mock: db.update().set().where() resolves
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockDb.update.mockReturnValue(updateChain);

    // Default mock: db.insert().values().onConflictDoNothing().returning()
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 999 }]),
      }),
    };
    mockDb.insert.mockReturnValue(insertChain);
  });

  describe("register", () => {
    it("should persist a tracking and return the record on success", async () => {
      const tn = "1Z999AA10123456784";
      const email = "user@example.com";

      (client.register as Mock).mockResolvedValueOnce({
        success: true,
        trackingNumber: tn,
      });

      const insertedRecord = {
        id: 1,
        trackingNumber: tn,
        carrier: "UPS",
        email,
        status: "active",
        lastCheckedAt: null,
        createdAt: "2026-07-12T12:00:00.000Z",
      };

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([insertedRecord]),
      };
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.register(tn, email);

      expect(client.register).toHaveBeenCalledWith(tn, email);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingNumber: tn,
          email,
          status: "active",
        })
      );

      expect(result).toEqual({
        success: true,
        tracking: insertedRecord,
      });
    });

    it("should return error if 17Track registration fails", async () => {
      const tn = "1Z999AA10123456784";
      const email = "user@example.com";

      (client.register as Mock).mockResolvedValueOnce({
        success: false,
        trackingNumber: tn,
        error: "Invalid tracking number",
      });

      const result = await service.register(tn, email);

      expect(result).toEqual({
        success: false,
        error: "Invalid tracking number",
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("should handle duplicate tracking+email gracefully", async () => {
      const tn = "1Z999AA10123456784";
      const email = "user@example.com";

      (client.register as Mock).mockResolvedValueOnce({
        success: true,
        trackingNumber: tn,
      });

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error("UNIQUE constraint failed")),
      };
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.register(tn, email);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already being monitored");
    });
  });

  describe("checkTrackings", () => {
    it("should fetch active trackings, query 17Track, and return new events", async () => {
      const activeTrackings = [
        {
          id: 1,
          trackingNumber: "1Z999AA10123456784",
          carrier: "UPS",
          email: "user@example.com",
          status: "active" as const,
          lastCheckedAt: "2026-07-12T10:00:00Z",
          createdAt: "2026-07-12T09:00:00Z",
        },
        {
          id: 2,
          trackingNumber: "1Z999AA10123456785",
          carrier: "FedEx",
          email: "other@example.com",
          status: "active" as const,
          lastCheckedAt: "2026-07-12T10:00:00Z",
          createdAt: "2026-07-12T09:00:00Z",
        },
      ];

      // Mock DB select for active trackings
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(activeTrackings),
      };
      mockDb.select.mockReturnValueOnce(selectChain);

      // Mock 17Track response
      const trackInfo = new Map<string, TrackingInfo>();
      trackInfo.set("1Z999AA10123456784", {
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
        status: "active",
        events: [
          {
            location: "Shenzhen",
            description: "Package received at sorting facility",
            date: "2026-07-12T11:00:00Z",
          },
        ],
      });
      trackInfo.set("1Z999AA10123456785", {
        trackingNumber: "1Z999AA10123456785",
        carrier: "FedEx",
        status: "active",
        events: [],
      });

      (client.getTrackInfo as Mock).mockResolvedValueOnce(trackInfo);

      // Mock existing events query — returns empty (no existing events)
      const existingEventsChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(existingEventsChain);

      // Mock insert for the new event
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10 }]),
        }),
      };
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.checkTrackings();

      expect(client.getTrackInfo).toHaveBeenCalledWith([
        "1Z999AA10123456784",
        "1Z999AA10123456785",
      ]);

      // Only tracking 1 had events; tracking 2 had 0 events so it's omitted from the result
      expect(result.size).toBe(1);
      const eventsForTn1 = result.get(1);
      expect(eventsForTn1).toHaveLength(1);
      expect(eventsForTn1![0].description).toBe("Package received at sorting facility");
      expect(result.get(2)).toBeUndefined();
    });

    it("should detect delivery status and mark tracking as delivered", async () => {
      const activeTrackings = [
        {
          id: 1,
          trackingNumber: "1Z999AA10123456784",
          carrier: "UPS",
          email: "user@example.com",
          status: "active" as const,
          lastCheckedAt: "2026-07-12T10:00:00Z",
          createdAt: "2026-07-12T09:00:00Z",
        },
      ];

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(activeTrackings),
      };
      mockDb.select.mockReturnValueOnce(selectChain);

      const trackInfo = new Map<string, TrackingInfo>();
      trackInfo.set("1Z999AA10123456784", {
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
        status: "delivered",
        events: [
          {
            location: "New York",
            description: "Package delivered",
            date: "2026-07-12T14:00:00Z",
          },
        ],
      });

      (client.getTrackInfo as Mock).mockResolvedValueOnce(trackInfo);

      // No existing events
      const existingEventsChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(existingEventsChain);

      // Mock event insert
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 20 }]),
        }),
      };
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.checkTrackings();

      expect(result.get(1)).toHaveLength(1);
    });

    it("should handle API errors for individual trackings without breaking the batch", async () => {
      const activeTrackings = [
        {
          id: 1,
          trackingNumber: "1Z999AA10123456784",
          carrier: "UPS",
          email: "user@example.com",
          status: "active" as const,
          lastCheckedAt: null,
          createdAt: "2026-07-12T09:00:00Z",
        },
      ];

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(activeTrackings),
      };
      mockDb.select.mockReturnValueOnce(selectChain);

      (client.getTrackInfo as Mock).mockRejectedValueOnce(new Error("API timeout"));

      const result = await service.checkTrackings();

      expect(result.size).toBe(0);
    });
  });

  describe("detectDelivery", () => {
    it("should mark a tracking as delivered when status is delivered", async () => {
      const trackings = [
        { id: 1, trackingNumber: "1Z999AA10123456784", email: "user@example.com", status: "active" as const },
        { id: 2, trackingNumber: "1Z999AA10123456785", email: "other@example.com", status: "active" as const },
      ];
      const info = new Map<string, TrackingInfo>();
      info.set("1Z999AA10123456784", {
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
        status: "delivered",
        events: [],
      });
      info.set("1Z999AA10123456785", {
        trackingNumber: "1Z999AA10123456785",
        carrier: "FedEx",
        status: "active",
        events: [],
      });

      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(updateChain);

      const delivered = await service.detectDelivery(trackings, info);

      expect(delivered).toEqual([1]);
      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({ status: "delivered" });
    });

    it("should return empty array when no trackings are delivered", async () => {
      const trackings = [
        { id: 1, trackingNumber: "1Z999AA10123456784", email: "user@example.com", status: "active" as const },
      ];
      const info = new Map<string, TrackingInfo>();
      info.set("1Z999AA10123456784", {
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
        status: "active",
        events: [],
      });

      const delivered = await service.detectDelivery(trackings, info);

      expect(delivered).toEqual([]);
    });
  });
});
