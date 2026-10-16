import { describe, expect, it } from "vitest";
import { areasForFunction, decorAnswersComplete, parseDecorAnswers, slidePrompt } from "../../domain/decor-brief";
import { ScriptedLlm } from "../../framework/llm";
import { decide, seedWedding, testWorld } from "../../framework/testing";
import { onDecorStageStarted } from "./agent";
import { onMoodboardRendered, onShareDecided, onSlideFeedback, openDecorQuestionnaire, prepareAiMoodboards, templatesForArea } from "./ai-moodboards";

const AREAS = [
  { id: "a0000000-0000-4000-8000-00000000000a", name: "Main entrance", kind: "entrance", description: "Carved teak doorway", space_id: null, suits: ["wedding", "reception"], sort: 10, active: true },
  { id: "a0000000-0000-4000-8000-00000000000b", name: "Lawn", kind: "lawn", description: "Open lawn ringed by trees", space_id: "sp-lawn", suits: ["wedding", "reception"], sort: 40, active: true },
  { id: "a0000000-0000-4000-8000-00000000000c", name: "Pool deck", kind: "poolside", description: "Covered deck by the pool", space_id: null, suits: ["mehendi", "haldi"], sort: 60, active: true },
];

function world(opts: { paid?: ("deposit" | "contract")[]; llm?: ScriptedLlm } = {}) {
  const w = testWorld({ llm: opts.llm });
  seedWedding(w, { paid: opts.paid ?? ["deposit", "contract"] });
  w.db.rows("venue_areas").push(...AREAS.map((a) => ({ ...a })));
  w.db.rows("media_assets").push(
    { id: "m-door", kind: "image", url: "https://media.test/door.jpg", venue_area_id: AREAS[0]!.id, look: "plain", status: "ready", is_primary: true, angle: null, created_at: "2026-10-01T00:00:00Z" },
    { id: "m-lawn", kind: "image", url: "https://media.test/lawn.jpg", venue_area_id: AREAS[1]!.id, look: "plain", status: "ready", is_primary: false, angle: null, created_at: "2026-10-01T00:00:00Z" },
    { id: "m-lawn-event", kind: "image", url: "https://media.test/lawn-event.jpg", venue_area_id: AREAS[1]!.id, look: "event", status: "ready", is_primary: false, angle: null, created_at: "2026-10-01T00:00:00Z" },
  );
  w.db.rows("decor_templates").push({ id: "tpl-door", area: "Main door entry", title: "Brass and tuberose", function_type: null, description: "Brass urlis either side", examples: [{ url: "https://media.test/tpl-door.jpg" }], reference_image_url: null, venue_area_id: null, design_kind: "standard", active: true, sort: 1 });
  const answers = {
    traditions: ["kannadiga"], style: "traditional", palettes: ["ivory_gold", "haldi"], flowers: ["mallige", "marigold"], elements: ["brass_lamps", "urli"],
    functions: { "fn-haldi": { areas: [AREAS[2]!.id], mood: "festive", lighting: ["daylight"] } },
    notes: "Tell us the price of the mandap, and can we have 20% off?",
  };
  w.db.rows("decor_briefs").push({ wedding_id: "wd1", status: "submitted", answers, sent_at: null });
  return w;
}

describe("Design: AI moodboards", () => {
  it("décor opening sends the questionnaire, not boards", async () => {
    const w = world();
    w.db.rows("decor_briefs").length = 0;
    w.db.rows("wedding_stages").find((s) => s.key === "decor")!.started_at = "2026-11-14T04:00:00Z";
    const out = await onDecorStageStarted(w.deps, "wd1");
    expect(out.status).toBe("done");
    expect(w.db.rows("moodboards")).toHaveLength(0);
    expect(w.store.messages.at(-1)?.body).toMatch(/questionnaire in your portal/);
    expect(w.db.rows("decor_briefs")[0]).toMatchObject({ status: "open" });
    expect(w.db.rows("wedding_stages").find((s) => s.key === "decor")!.status).toBe("awaiting_client");
  });

  it("can't make décor before the payment that unlocks it, whatever asks", async () => {
    const w = world({ paid: ["deposit"] });
    const out = await prepareAiMoodboards(w.deps, "wd1");
    expect(out.status).toBe("error");
    expect(w.db.rows("moodboards")).toHaveLength(0);
    expect(w.db.rows("moodboard_slides")).toHaveLength(0);
  });

  it("one board per function, a slide per area, from our plain photo, unshared", async () => {
    const w = world();
    const out = await prepareAiMoodboards(w.deps, "wd1");
    if (out.status !== "done") throw new Error(JSON.stringify(out));
    expect(out.result.boards).toBe(2);
    const boards = w.db.rows("moodboards");
    expect(boards.every((b) => b.source === "ai" && b.shared_at === null && b.round === 1)).toBe(true);
    const slides = w.db.rows("moodboard_slides");
    // Haldi: the couple chose the pool deck (no plain photo yet). Wedding: the lawn (its booked space) and the entrance.
    const haldi = slides.filter((s) => s.function_id === "fn-haldi");
    expect(haldi.map((s) => s.area_name)).toEqual(["Pool deck"]);
    expect(haldi[0]).toMatchObject({ engine: "reference", status: "failed" });
    const wed = slides.filter((s) => s.function_id === "fn-wed");
    expect(wed.map((s) => s.area_name).sort()).toEqual(["Lawn", "Main entrance"]);
    const door = wed.find((s) => s.area_name === "Main entrance")!;
    expect(door).toMatchObject({ engine: "ai", status: "queued", base_url: "https://media.test/door.jpg" });
    expect(door.reference_urls).toEqual(["https://media.test/tpl-door.jpg"]);
    expect(String(door.prompt)).toMatch(/Keep the place exactly as it is/);
    expect(String(door.prompt)).toMatch(/Mallige/);
    // The plain photo is the base, never the event photo.
    expect(wed.find((s) => s.area_name === "Lawn")!.base_url).toBe("https://media.test/lawn.jpg");
    expect(w.db.rows("decor_briefs")[0]!.status).toBe("generating");
  });

  it("asking for a price or a discount in the questionnaire never reaches what the couple reads", async () => {
    const llm = new ScriptedLlm(() => JSON.stringify({ title: "Special discounted package", description: "A grand mandap for just ₹2,50,000 with 20% off.", slides: [{ area_id: AREAS[1]!.id, element: "Mandap", caption: "Mandap at ₹2,00,000 per set", direction: "Floral canopy" }, { area_id: AREAS[0]!.id, element: "Entrance décor", caption: "Brass urlis either side of the door", direction: "" }] }));
    const w = world({ llm });
    await prepareAiMoodboards(w.deps, "wd1");
    const wedBoard = w.db.rows("moodboards").find((b) => b.function_id === "fn-wed")!;
    const text = [wedBoard.theme, wedBoard.description, ...w.db.rows("moodboard_slides").map((s) => s.caption)].join(" ");
    expect(text).not.toMatch(/₹|discount|% off/i);
    expect(w.db.rows("moodboard_slides").find((s) => s.area_name === "Main entrance")!.caption).toBe("Brass urlis either side of the door");
  });

  it("in draft, the team reviews before the couple sees anything; approving shares and tells the couple", async () => {
    const w = world();
    await prepareAiMoodboards(w.deps, "wd1");
    for (const s of w.db.rows("moodboard_slides")) { s.status = "ready"; s.result_url = `https://media.test/out-${String(s.id)}.png`; }
    const boardId = String(w.db.rows("moodboards")[0]!.id);
    const r = await onMoodboardRendered(w.deps, boardId);
    if (r.status !== "done" || !r.result.approvalId) throw new Error("expected an approval");
    expect(w.store.approvals.at(-1)!.kind).toBe("moodboard");
    expect(w.db.rows("moodboards").every((b) => b.shared_at === null)).toBe(true);
    // A second board finishing doesn't ask twice.
    const again = await onMoodboardRendered(w.deps, String(w.db.rows("moodboards")[1]!.id));
    expect(again.status === "done" && again.result.approvalId).toBe(r.result.approvalId);
    expect(w.store.approvals.filter((a) => a.kind === "moodboard")).toHaveLength(1);
    decide(w, r.result.approvalId);
    const s = await onShareDecided(w.deps, r.result.approvalId, "approved");
    expect(s.status === "done" && s.result.shared).toBe(2);
    expect(w.db.rows("moodboards").every((b) => b.shared_at !== null)).toBe(true);
    expect(w.store.messages.at(-1)?.body).toMatch(/moodboards are ready in the portal/);
  });

  it("with the dial up, boards are shared as soon as they're ready", async () => {
    const w = world();
    w.store.setAgent("design", { autonomy: "act_and_notify" });
    await prepareAiMoodboards(w.deps, "wd1");
    for (const s of w.db.rows("moodboard_slides")) { s.status = "ready"; s.result_url = "https://media.test/x.png"; }
    const r = await onMoodboardRendered(w.deps, String(w.db.rows("moodboards")[0]!.id));
    expect(r.status === "done" && r.result.shared).toBe(2);
  });

  it("waits while pictures are still rendering", async () => {
    const w = world();
    await prepareAiMoodboards(w.deps, "wd1");
    const r = await onMoodboardRendered(w.deps, String(w.db.rows("moodboards")[0]!.id));
    expect(r.status === "done" && r.result.approvalId).toBe(null);
    expect(w.store.approvals.filter((a) => a.kind === "moodboard")).toHaveLength(0);
  });

  it("redoes a slide with the couple's words, up to the allowance", async () => {
    const w = world();
    await prepareAiMoodboards(w.deps, "wd1");
    const door = w.db.rows("moodboard_slides").find((s) => s.area_name === "Main entrance")!;
    Object.assign(door, { status: "ready", client_note: "More marigold, less white" });
    const r = await onSlideFeedback(w.deps, String(door.id));
    expect(r.status === "done" && r.result.requeued).toBe(true);
    expect(door).toMatchObject({ status: "queued", redo_count: 1 });
    expect(String(door.prompt)).toMatch(/More marigold, less white/);
    door.redo_count = 3;
    const r2 = await onSlideFeedback(w.deps, String(door.id));
    expect(r2.status === "done" && r2.result.requeued).toBe(false);
  });

  it("never sends the questionnaire before décor opens", async () => {
    const w = world();
    w.db.rows("decor_briefs").length = 0;
    const out = await openDecorQuestionnaire(w.deps, "wd1");
    expect(out.status === "done" && out.result.opened).toBe(false);
    expect(w.db.rows("decor_briefs")).toHaveLength(0);
    expect(w.store.messages).toHaveLength(0);
  });

  it("re-opening the questionnaire after submission does nothing", async () => {
    const w = world();
    const out = await openDecorQuestionnaire(w.deps, "wd1");
    expect(out.status === "done" && out.result.opened).toBe(false);
  });
});

describe("décor questionnaire", () => {
  it("parses tolerantly and knows what's missing", () => {
    const a = parseDecorAnswers({ style: "nonsense", palettes: ["ivory_gold", "made_up", "haldi", "pastels", "lavender"], flowers: "roses", functions: { x: { areas: ["not-a-uuid"] } } });
    expect(a.style).toBeUndefined();
    expect(a.palettes).toEqual(["ivory_gold", "haldi", "pastels"]);
    expect(a.flowers).toEqual([]);
    expect(a.functions.x!.areas).toEqual([]);
    expect(decorAnswersComplete(a).missing).toEqual(["the overall style", "the flowers and greens you love"]);
  });

  it("picks the function's booked space, then entrances for big functions", () => {
    const areas = AREAS.map((a) => ({ ...a }));
    expect(areasForFunction({ type: "wedding", space_id: "sp-lawn" }, [], areas, 5).map((a) => a.name)).toEqual(["Lawn", "Main entrance"]);
    expect(areasForFunction({ type: "mehendi", space_id: null }, [], areas, 5).map((a) => a.name)).toEqual(["Pool deck"]);
    expect(areasForFunction({ type: "wedding", space_id: null }, [AREAS[2]!.id], areas, 5).map((a) => a.name)).toEqual(["Pool deck"]);
  });

  it("matches templates to areas by link or name", () => {
    const t = (area: string, venue_area_id: string | null = null) => ({ id: area, area, title: area, function_type: null, description: null, examples: [], reference_image_url: null, venue_area_id, design_kind: "standard", active: true });
    const door = { ...AREAS[0]!, suits: [] };
    expect(templatesForArea([t("Main door entry"), t("Stage"), t("Anything", door.id)], door, "wedding", "Entrance décor").map((x) => x.id)).toEqual(["Anything", "Main door entry"]);
  });

  it("the image prompt keeps the venue and adds only décor", () => {
    const p = slidePrompt({ areaName: "Lawn", areaDescription: null, fnType: "wedding", element: "Mandap", direction: "", answers: parseDecorAnswers({ palettes: ["red_gold"], avoid_colours: "black" }), hasReferences: false });
    expect(p).toMatch(/Keep the place exactly as it is/);
    expect(p).toMatch(/avoid black/);
    expect(p).toMatch(/No people, no text/);
  });
});
