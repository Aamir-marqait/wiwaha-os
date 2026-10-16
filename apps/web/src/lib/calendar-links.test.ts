import { describe, expect, it } from "vitest";
import { googleCalendarLink } from "./calendar-links";

describe("Google Calendar links", () => {
  it("times a visit in UTC with its length", () => {
    const u = new URL(googleCalendarLink({ title: "Site visit: Meera", start: "2026-10-20T05:30:00.000Z", minutes: 90 }));
    expect(u.searchParams.get("dates")).toBe("20261020T053000Z/20261020T070000Z");
    expect(u.searchParams.get("ctz")).toBe("Asia/Kolkata");
  });
  it("makes a wedding an all-day event through its last day", () => {
    const u = new URL(googleCalendarLink({ title: "Ananya & Rohan", start: "2027-02-13", end: "2027-02-15", allDay: true }));
    expect(u.searchParams.get("dates")).toBe("20270213/20270216");
  });
});
