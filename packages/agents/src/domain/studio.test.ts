import { describe, expect, it } from "vitest";
import { allocateFormats, buildSlots, contactCueStart, groupWords, normalizeShots, parseOutline, spokenText, timeWordsEvenly, type ManifestEntry } from "./studio";

describe("calendar", () => {
  it("places posting days by preference (Sat, Fri, Wed first)", () => {
    // 2026-10-19 is a Monday.
    expect(buildSlots("2026-10-19", "2026-10-25", 3)).toEqual(["2026-10-21", "2026-10-23", "2026-10-24"]);
    expect(buildSlots("2026-10-19", "2026-11-01", 1)).toEqual(["2026-10-24", "2026-10-31"]);
  });
  it("turns a mix into an interleaved sequence", () => {
    const f = allocateFormats(10, { reel: 40, carousel: 40, single_post: 20 });
    expect(f.filter((x) => x === "reel")).toHaveLength(4);
    expect(f.filter((x) => x === "single_post")).toHaveLength(2);
    expect(f.slice(0, 3)).not.toEqual(["reel", "reel", "reel"]);
    expect(allocateFormats(3, {})).toEqual(["carousel", "carousel", "carousel"]);
  });
});

describe("carousel outline", () => {
  it("reads 'Slide N — Headline | support' lines", () => {
    expect(parseOutline("Slide 1 — Your wedding, your way | A private estate near the airport\nSlide 2 - Fifteen minutes from arrivals\n\n3. Call us | +91 9169935666")).toEqual([
      { headline: "Your wedding, your way", support: "A private estate near the airport" },
      { headline: "Fifteen minutes from arrivals", support: null },
      { headline: "Call us", support: "+91 9169935666" },
    ]);
  });
});

describe("reel voice", () => {
  it("never speaks the phone number, and keeps every other word", () => {
    expect(spokenText("Your family flies in.\nCall or WhatsApp us on +91 9169935666 #WiwahaWeddings 💍")).toBe("Your family flies in. Call or WhatsApp us on the number on your screen");
    expect(spokenText("Just 15 km from the airport.")).toBe("Just 15 kilometres from the airport.");
  });
  it("shows the number from the start of the CTA sentence", () => {
    const w = timeWordsEvenly("We have rooms for everyone. Call or WhatsApp us on the number on your screen.", 2.3);
    const start = contactCueStart(w)!;
    expect(start).toBe(w.find((x) => x.text === "Call")!.start);
    expect(contactCueStart(timeWordsEvenly("Wishing you a Diwali full of light.", 2.3))).toBeNull();
  });
  it("groups words into short cues that don't flicker", () => {
    const cues = groupWords(timeWordsEvenly("Your wedding, your way, at a private estate near Bengaluru.", 2.3));
    expect(cues[0]!.text).toBe("Your wedding,");
    expect(cues.every((c) => c.text.length <= 30)).toBe(true);
    for (let i = 0; i < cues.length - 1; i++) expect(cues[i]!.end).toBeLessThanOrEqual(cues[i + 1]!.start + 1e-9);
  });
});

describe("shot plan repair", () => {
  const m = new Map<string, ManifestEntry>([
    ["v1", { id: "v1", kind: "video", duration_seconds: 4, description: "Lawn at dusk", tags: [], folder: null, area: "Lawn", look: "event" }],
    ["p1", { id: "p1", kind: "image", duration_seconds: null, description: "Entrance", tags: [], folder: null, area: "Main entrance", look: "plain" }],
    ["p2", { id: "p2", kind: "image", duration_seconds: null, description: "Mandap", tags: [], folder: null, area: "Lawn", look: "decorated" }],
  ]);
  it("covers the voiceover exactly, with no gaps", () => {
    const s = normalizeShots([{ start: 0, end: 5, source: "library", asset_id: "v1", in_point: 3 }, { start: 5, end: 9, source: "library", asset_id: "p1" }, { start: 9, end: 20, source: "library", asset_id: "nope" }], 18, m, false);
    expect(s[0]!.start).toBe(0);
    expect(s.at(-1)!.end).toBe(18);
    for (let i = 0; i < s.length - 1; i++) expect(s[i]!.end).toBe(s[i + 1]!.start);
    // The clip starts early enough to fill the shot, or at 0 when the shot is longer than the clip.
    expect(s[0]!.in_point === 0 || s[0]!.in_point + (s[0]!.end - s[0]!.start) <= 4 + 1e-9).toBe(true);
    expect(s[2]!.asset_id).toBe("p2");
  });
  it("never uses AI for a shot when AI is off", () => {
    const s = normalizeShots([{ start: 0, end: 4, source: "ai", visual: "a mandap" }], 4, m, false);
    expect(s[0]).toMatchObject({ source: "library" });
  });
  it("varies the photo moves", () => {
    const s = normalizeShots([{ start: 0, end: 3, asset_id: "p1", motion: "in" }, { start: 3, end: 6, asset_id: "p2", motion: "in" }], 6, m, false);
    expect(s[1]!.motion).not.toBe(s[0]!.motion);
  });
});
