import { describe, expect, it } from "vitest";
import { timeWordsEvenly } from "../../domain/studio";
import { ScriptedLlm } from "../../framework/llm";
import { testWorld } from "../../framework/testing";
import { describeMediaAsset, directStudioVoice, planStudioCalendar, planStudioDeck, planStudioReel, studioWeek, writeStudioScript } from "./studio";

const BRAND = { id: 1, profile: { brand_name: "WIWAHA by Praman", hashtags: ["#WiwahaWeddings", "#WiwahaByPraman"], voice: "Warm and reassuring" } };
const photo = (id: string, look: string, description: string) => ({ id, kind: "image", url: `https://media.test/${id}.jpg`, thumb_url: null, duration_ms: null, title: description, description, tags: [], look, venue_area_id: null, folder_id: null, status: "ready", width: 1600, height: 1200, created_at: "2026-10-01T00:00:00Z" });

function world(llm?: ScriptedLlm) {
  const w = testWorld({ llm });
  w.db.rows("studio_brand").push({ ...BRAND });
  w.db.rows("media_assets").push(photo("p-lawn", "event", "Reception on the lawn at night"), photo("p-door", "plain", "The carved main door"), photo("p-mandap", "decorated", "Floral mandap on the lawn"));
  return w;
}
const item = (w: ReturnType<typeof world>, over: Record<string, unknown>) => {
  const row = { id: "it1", content_type: "carousel", title: "Airport", brief: "Why couples flying family in choose us", pillar: "Feature focus", hook: null, script: null, caption: null, hashtags: [], options: {}, status: "drafting", change_count: 0, scheduled_for: null, plan_id: null, ...over };
  w.db.rows("studio_items").push(row);
  return row;
};

describe("Content Studio: scripts", () => {
  it("offline, writes an on-brand script with the CTA number from the policy book", async () => {
    const w = world();
    const it1 = item(w, {});
    const out = await writeStudioScript(w.deps, "it1");
    expect(out.status === "done" && out.result.source).toBe("template");
    expect(it1.status).toBe("draft");
    expect(String(it1.script)).toMatch(/^Slide 1 — /);
    expect(String(it1.script)).toContain("+91 9169935666");
    expect(it1.hashtags).toContain("#WiwahaWeddings");
  });

  it("a brief asking for a discount or prices never becomes the post", async () => {
    const llm = new ScriptedLlm(() => JSON.stringify({ title: "Festive offer", hook: "Book now and get 20% off!", script: "Slide 1 — 20% off this season | Packages from ₹25 lakhs", caption: "Special discounted package for October bookings.", hashtags: ["#Offer"] }));
    const w = world(llm);
    const it1 = item(w, { brief: "Announce 20% off and tell people our package price" });
    await writeStudioScript(w.deps, "it1");
    expect(`${it1.script} ${it1.caption} ${it1.hook}`).not.toMatch(/₹|% off|discount/i);
  });

  it("a requested change is applied and counted", async () => {
    const llm = new ScriptedLlm(() => JSON.stringify({ title: "Rooms for everyone", hook: "Where will everyone stay?", script: "Slide 1 — Where will everyone stay?\nSlide 2 — Call or WhatsApp us | +91 9169935666", caption: "Thirty rooms on the estate.\n\nCall or WhatsApp us on +91 9169935666", hashtags: ["WiwahaWeddings"] }));
    const w = world(llm);
    const it1 = item(w, { script: "Slide 1 — Old", status: "draft" });
    await writeStudioScript(w.deps, "it1", "Make it about rooms");
    expect(it1).toMatchObject({ title: "Rooms for everyone", change_count: 1, hashtags: ["#WiwahaWeddings"] });
    expect(llm.calls[0]!.prompt).toMatch(/NOTE FROM THE TEAM: Make it about rooms/);
  });
});

describe("Content Studio: calendar", () => {
  it("plans every slot, then queues a script for each", async () => {
    const w = world();
    w.db.rows("studio_plans").push({ id: "pl1", start_on: "2026-10-19", end_on: "2026-11-01", posts_per_week: 3, mix: { reel: 50, carousel: 50 }, pillars: ["Venue showcase", "Planning tips"], notes: null, status: "planning" });
    const out = await planStudioCalendar(w.deps, "pl1");
    expect(out.status === "done" && out.result.items).toBe(6);
    const items = w.db.rows("studio_items");
    expect(items.filter((i) => i.content_type === "reel")).toHaveLength(3);
    expect(items.every((i) => i.status === "drafting" && i.plan_id === "pl1")).toBe(true);
    expect(w.db.rows("agent_tasks").filter((t) => t.kind === "studio_script")).toHaveLength(6);
    expect(w.db.rows("studio_plans")[0]!.status).toBe("ready");
    const again = await planStudioCalendar(w.deps, "pl1");
    expect(again.status === "done" && again.result.items).toBe(0);
  });

  it("plans next week once", async () => {
    const w = world();
    const a = await studioWeek(w.deps);
    expect(a.status === "done" && a.result.planId).toBeTruthy();
    const b = await studioWeek(w.deps);
    expect(b.status === "done" && b.result.planId).toBe(null);
    expect(w.db.rows("agent_tasks").filter((t) => t.kind === "studio_plan")).toHaveLength(1);
  });
});

describe("Content Studio: carousels and reels", () => {
  it("offline deck: real photos for the content slides, a typographic CTA last", async () => {
    const w = world();
    item(w, { script: "Slide 1 — Your family lands, we take it from there\nSlide 2 — Rooms on the estate | Thirty rooms, sixty soon\nSlide 3 — Check your date | +91 9169935666", status: "approved" });
    const out = await planStudioDeck(w.deps, "it1");
    if (out.status !== "done") throw new Error(JSON.stringify(out));
    const s = out.result.slides;
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({ role: "hook", asset_id: "p-lawn", layout: "photo" });
    expect(s[2]).toMatchObject({ role: "cta", asset_id: null, layout: "type" });
  });

  it("the model can't make up a venue picture or reuse a photo", async () => {
    const llm = new ScriptedLlm(() => JSON.stringify({ slides: [
      { role: "hook", headline: "Your wedding, your way", asset_id: "p-lawn", layout: "photo" },
      { role: "content", headline: "Rooms on the estate", asset_id: "p-lawn", ai_visual: null, layout: "photo" },
      { role: "cta", headline: "Check your date", support: "+91 9169935666", asset_id: "not-a-photo", layout: "photo" },
    ] }));
    const w = world(llm);
    item(w, { script: "Slide 1 — A\nSlide 2 — B\nSlide 3 — C", status: "approved" });
    const out = await planStudioDeck(w.deps, "it1");
    if (out.status !== "done") throw new Error(JSON.stringify(out));
    expect(out.result.slides.map((x) => x.asset_id)).toEqual(["p-lawn", null, null]);
    expect(out.result.slides[2]!.layout).toBe("type");
  });

  it("the phone number is never spoken in a reel", async () => {
    const llm = new ScriptedLlm(() => JSON.stringify({ tts_text: "[warmly] Your family flies in. Call or WhatsApp us on +91 9169935666", stability: 0.5 }));
    const w = world(llm);
    item(w, { content_type: "reel", script: "Your family flies in. Call or WhatsApp us on +91 9169935666", status: "approved" });
    const out = await directStudioVoice(w.deps, "it1");
    if (out.status !== "done") throw new Error("expected done");
    expect(out.result.text).toBe("Your family flies in. Call or WhatsApp us on the number on your screen");
  });

  it("reel shots come from the library and cover the voiceover", async () => {
    const w = world();
    item(w, { content_type: "reel", script: "x", status: "approved" });
    const words = timeWordsEvenly("Your wedding, your way. Fifteen minutes from the airport. Thirty rooms on the estate. Call or WhatsApp us on the number on your screen.", 2.3);
    const total = words.at(-1)!.end + 0.4;
    const out = await planStudioReel(w.deps, "it1", words, total, false);
    if (out.status !== "done") throw new Error(JSON.stringify(out));
    expect(out.result.shots.every((s) => s.source === "library")).toBe(true);
    expect(out.result.shots[0]!.start).toBe(0);
    expect(out.result.shots.at(-1)!.end).toBeCloseTo(total, 2);
    expect(out.result.music).toMatch(/instrumental/i);
  });

  it("an empty library and no AI: the reel can't be planned, and says why", async () => {
    const w = world();
    w.db.rows("media_assets").length = 0;
    item(w, { content_type: "reel", script: "x", status: "approved" });
    const out = await planStudioReel(w.deps, "it1", timeWordsEvenly("Hello there.", 2.3), 2, false);
    expect(out.status === "error" && out.error).toMatch(/library has no ready photos/);
  });

  it("describes a photo from what's in it, without overriding the team", async () => {
    const llm = new ScriptedLlm((req) => { expect(req.images).toEqual(["https://media.test/p-door.jpg"]); return JSON.stringify({ title: "Carved teak main door", description: "The estate's carved main door under a white portico, morning light.", tags: ["Entrance", "door"], look: "plain" }); });
    const w = world(llm);
    const a = w.db.rows("media_assets").find((x) => x.id === "p-door")!;
    Object.assign(a, { title: null, look: "other" });
    await describeMediaAsset(w.deps, "p-door");
    expect(a).toMatchObject({ title: "Carved teak main door", look: "plain", described_by: "ai" });
    expect(a.tags).toEqual(["entrance", "door"]);
    a.described_by = "staff"; a.description = "Ours";
    await describeMediaAsset(w.deps, "p-door");
    expect(a.description).toBe("Ours");
  });
});
