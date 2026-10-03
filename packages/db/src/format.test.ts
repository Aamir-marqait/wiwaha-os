import { describe, expect, it } from "vitest";
import { addDays, normalisePhone, rupees, todayIST } from "./format";

describe("normalisePhone", () => {
  it.each([
    ["98450 12345", "+919845012345"],
    ["+91 98450-12345", "+919845012345"],
    ["09845012345", "+919845012345"],
    ["919845012345", "+919845012345"],
    ["0091 98450 12345", "+919845012345"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("%s → %s", (raw, out) => expect(normalisePhone(raw)).toBe(out));
  it.each(["", "12345", "5845012345", "abc"])("rejects %s", (raw) => expect(normalisePhone(raw)).toBeNull());
});

describe("money and dates", () => {
  it("formats paise as rupees", () => {
    expect(rupees(3_500_000_00, { compact: true })).toBe("₹35 L");
    expect(rupees(12_345_00)).toContain("12,345");
  });
  it("uses India's calendar day", () => {
    expect(todayIST(new Date("2026-10-03T20:00:00Z"))).toBe("2026-10-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
