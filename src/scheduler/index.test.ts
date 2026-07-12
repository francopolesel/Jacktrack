import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./index.js";
import type { TrackingService } from "../tracking/service.js";

function createMockService(): TrackingService {
  return {
    checkTrackings: vi.fn().mockResolvedValue(new Map()),
    detectDelivery: vi.fn().mockResolvedValue([]),
    register: vi.fn(),
  } as unknown as TrackingService;
}

describe("Scheduler", () => {
  let service: TrackingService;
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    service = createMockService();
  });

  afterEach(() => {
    scheduler?.stop();
    vi.useRealTimers();
  });

  describe("start and stop", () => {
    it("should call checkAll immediately on start and then at the configured interval", () => {
      const intervalMs = 60000;
      scheduler = new Scheduler(service, intervalMs);

      const checkSpy = vi.spyOn(scheduler as any, "checkAll");

      scheduler.start();

      // checkAll should have been called immediately on start
      expect(checkSpy).toHaveBeenCalledTimes(1);

      // Advance time by interval
      vi.advanceTimersByTime(intervalMs);

      // Should have been called again
      expect(checkSpy).toHaveBeenCalledTimes(2);
    });

    it("should stop polling when stop() is called", () => {
      scheduler = new Scheduler(service, 60000);

      const checkSpy = vi.spyOn(scheduler as any, "checkAll");

      scheduler.start();
      expect(checkSpy).toHaveBeenCalledTimes(1); // immediate call

      scheduler.stop();

      // Clear any remaining timers
      vi.advanceTimersByTime(60000);

      // Should still only have been called once (the immediate call)
      expect(checkSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw if stop is called without start", () => {
      scheduler = new Scheduler(service, 60000);
      expect(() => scheduler.stop()).not.toThrow();
    });

    it("should not throw if start is called multiple times", () => {
      scheduler = new Scheduler(service, 60000);
      scheduler.start();
      expect(() => scheduler.start()).not.toThrow();
      scheduler.stop();
    });
  });

  describe("chunkArray", () => {
    it("should split an array into chunks of the specified size", () => {
      scheduler = new Scheduler(service, 60000);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const chunks = (scheduler as any).chunkArray(arr, 3);
      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });

    it("should return a single chunk if array is smaller than chunk size", () => {
      scheduler = new Scheduler(service, 60000);
      const arr = [1, 2, 3];
      const chunks = (scheduler as any).chunkArray(arr, 5);
      expect(chunks).toEqual([[1, 2, 3]]);
    });

    it("should return empty array for empty input", () => {
      scheduler = new Scheduler(service, 60000);
      const chunks = (scheduler as any).chunkArray([], 5);
      expect(chunks).toEqual([]);
    });

    it("should handle chunk size of 1", () => {
      scheduler = new Scheduler(service, 60000);
      const chunks = (scheduler as any).chunkArray([1, 2, 3], 1);
      expect(chunks).toEqual([[1], [2], [3]]);
    });

    it("should use the configured batch size of 40", () => {
      scheduler = new Scheduler(service, 60000);
      const items = Array.from({ length: 95 }, (_, i) => i);
      const chunks = (scheduler as any).chunkArray(items, 40);
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toHaveLength(40);
      expect(chunks[1]).toHaveLength(40);
      expect(chunks[2]).toHaveLength(15);
    });
  });

  describe("sleep", () => {
    it("should resolve after the specified delay", () => {
      scheduler = new Scheduler(service, 60000);
      const sleepPromise = (scheduler as any).sleep(1000);

      vi.advanceTimersByTime(1000);

      return expect(sleepPromise).resolves.toBeUndefined();
    });
  });
});
