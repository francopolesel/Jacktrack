import { describe, it, expect } from "vitest";
import { welcomeEmail, newEventEmail } from "./templates.js";

describe("email templates", () => {
  describe("welcomeEmail", () => {
    it("should generate HTML with the tracking number", () => {
      const tn = "1Z999AA10123456784";
      const html = welcomeEmail(tn);

      expect(html).toContain(tn);
      expect(html).toContain("JackTrack");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
    });

    it("should include a positive confirmation message", () => {
      const html = welcomeEmail("1Z999AA10123456784");

      expect(html).toContain("is being tracked");
      expect(html).toContain("You will receive");
    });
  });

  describe("newEventEmail", () => {
    it("should generate HTML with tracking number and events", () => {
      const tn = "1Z999AA10123456784";
      const events = [
        {
          location: "Shenzhen",
          description: "Package received at sorting facility",
          date: "2026-07-12T10:00:00Z",
        },
        {
          location: "Hong Kong",
          description: "Departed from facility",
          date: "2026-07-12T14:00:00Z",
        },
      ];

      const html = newEventEmail(tn, events);

      expect(html).toContain(tn);
      expect(html).toContain("Shenzhen");
      expect(html).toContain("Package received at sorting facility");
      expect(html).toContain("Hong Kong");
      expect(html).toContain("Departed from facility");
      expect(html).toContain("New tracking update");
      expect(html).toContain("<!DOCTYPE html>");
    });

    it("should handle an empty events array", () => {
      const tn = "1Z999AA10123456784";
      const html = newEventEmail(tn, []);

      expect(html).toContain(tn);
      expect(html).toContain("No event details");
    });

    it("should handle events without optional fields", () => {
      const tn = "1Z999AA10123456784";
      const events = [
        {
          location: undefined,
          description: "Package scanned",
          date: undefined,
        },
      ];

      const html = newEventEmail(tn, events);

      expect(html).toContain("Package scanned");
      // Should still produce valid HTML
      expect(html).toContain("<!DOCTYPE html>");
    });
  });
});
